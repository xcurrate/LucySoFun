const test = require('node:test');
const assert = require('node:assert/strict');
const Huntbot2 = require('../src/managers/Huntbot2');
const LUCY_ID = require('../src/constants').LUCY_BOT_ID;

function setup({ config = {}, ready = true } = {}) {
    const sent = [];
    const channel = { send: async (cmd) => { sent.push({ cmd, via: 'channel' }); return {}; } };
    const state = {
        client: {
            isReady: () => ready,
            user: { id: 'me', username: 'neozen', displayName: 'neozen' },
            channels: { cache: { get: () => channel }, fetch: async () => null }
        },
        config: {
            botStatus: { running: true, paused: false },
            settings: {
                huntbot2: Huntbot2.normalizeSettings({ enabled: true, channelId: 'hb-chan', duration: '1D', ...config })
            }
        }
    };
    const commandSender = {
        send: async (cmd, type, channelId, options) => {
            sent.push({ cmd, type, channelId, options, via: 'sender' });
            return true;
        }
    };
    const manager = Huntbot2(state, commandSender);
    return { state, manager, sent };
}

test('normalizes Huntbot2 settings, free-form duration, and upgrade options', () => {
    assert.deepEqual(Huntbot2.normalizeSettings({ enabled: true, channelId: '123', duration: '5m', sellAnimals: true, upgradeEnabled: true, upgradeGain: '2D' }), {
        enabled: true, channelId: '123', duration: '5M', sellAnimals: true, upgradeEnabled: true, upgradeGain: '2D'
    });
    assert.equal(Huntbot2.normalizeSettings({ duration: '3D' }).duration, '3D');
    assert.equal(Huntbot2.normalizeSettings({ duration: 'not-a-duration' }).duration, '1D');
    assert.equal(Huntbot2.normalizeSettings({ upgradeEnabled: true, upgradeGain: 'invalid gain' }).upgradeEnabled, false);
});
test('parses Lucy Huntbot return time', () => {
    assert.equal(Huntbot2.parseReturnTime('BEEP BOOP. dzula AKU AKAN KEMBALI DALAM 1M DENGAN 1 HEWAN'), '1M');
});
test('extracts image URL embedded in component text', () => {
    const msg = { content: '', attachments: { values: () => [] }, components: [{ components: [{ content: '[gambar](https://cdn.discordapp.com/attachments/123/abc.png?x=1)' }] }] };
    assert.equal(Huntbot2.extractImageUrl(msg), 'https://cdn.discordapp.com/attachments/123/abc.png?x=1');
});
test('finds confirmation button by custom id', () => {
    assert.deepEqual(Huntbot2.findButton([{ components: [{ custom_id: 'sac_confirm', disabled: false }] }], 'sac_confirm'), { custom_id: 'sac_confirm', disabled: false });
});

const lucyMessage = (content, overrides = {}) => ({
    id: `msg-${Math.random()}`,
    content,
    embeds: [],
    components: [],
    channel: { id: 'hb-chan' },
    guild: { members: { me: { displayName: 'neozen' } } },
    author: { id: LUCY_ID },
    ...overrides
});

test('trigger "siap berburu" memulai siklus lhb sesuai durasi', async () => {
    const { manager, sent } = setup({ config: { duration: '1D' } });
    const handled = await manager.handle(lucyMessage('Huntbot siap berburu, Tuan neozen!'));
    assert.equal(handled, true);

    // Pengiriman lhb dijadwalkan (bukan langsung), jadi tunggu timer-nya.
    await new Promise(resolve => setTimeout(resolve, 1700));
    assert.ok(sent.some(item => item.cmd === 'lhb 1D'), 'expected lhb 1D to be sent');
});

test('trigger "siap berburu" mengabaikan channel lain dan fitur nonaktif', async () => {
    const wrongChannel = setup();
    assert.equal(await wrongChannel.manager.handle(lucyMessage('siap berburu', { channel: { id: 'other' } })), false);

    const disabled = setup({ config: { enabled: false } });
    assert.equal(await disabled.manager.handle(lucyMessage('siap berburu')), false);
});

test('rutinitas startup mengirim lhb walau akun pause', async () => {
    const { manager, sent, state } = setup();
    state.config.botStatus = { running: false, paused: true };
    assert.equal(manager.start({ delayMs: 0 }), true);
    await new Promise(resolve => setTimeout(resolve, 50));
    const startupSend = sent.find(item => item.cmd === 'lhb 1D' && item.via === 'sender');
    assert.ok(startupSend, 'expected startup lhb via commandSender');
    assert.equal(startupSend.options?.allowWhilePaused, true);
    assert.equal(startupSend.options?.idleOnly, true, 'startup lhb should yield to main commands');
    assert.equal(startupSend.type, 'Huntbot2');
    assert.equal(startupSend.channelId, 'hb-chan');
});

test('rutinitas startup dilewati saat fitur nonaktif atau channel kosong', () => {
    assert.equal(setup({ config: { enabled: false } }).manager.start({ delayMs: 0 }), false);
    assert.equal(setup({ config: { channelId: '' } }).manager.start({ delayMs: 0 }), false);
});
