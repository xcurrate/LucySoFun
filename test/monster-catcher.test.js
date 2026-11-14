const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const createMonsterCatcherManager = require('../src/managers/monsterCatcher');
const TooEz2 = require('../src/managers/TooEz2');
const { normalizeMonsterCatcherSettings, messageText, extractImageUrl, parseWaitTimeMs, CONSTANTS } = createMonsterCatcherManager;
const LUCY_ID = CONSTANTS?.SENSOR_TRIGGER_TEXT ? '1438615298012872817' : require('../src/constants').LUCY_BOT_ID;

function setup({ config = {}, decoder = () => 'ABC123', downloader = async () => Buffer.from('fake-png') } = {}) {
    const state = {
        client: { isReady: () => true, user: { id: 'me' } },
        config: {
            settings: {
                monsterCatcher: normalizeMonsterCatcherSettings({
                    enabled: true,
                    autoPauseLoops: true,
                    retryWaitMs: 60000,
                    maxRetries: 5,
                    ...config
                })
            }
        }
    };
    const sent = [];
    const commandSender = {
        send: async (cmd, type, channelId) => {
            sent.push({ cmd, type, channelId });
            return true;
        }
    };
    const loopEpoch = { paused: false, resumed: false, pauses: 0, resumes: 0 };
    const loopManager = {
        pauseMonsterCatch: () => { loopEpoch.paused = true; loopEpoch.pauses += 1; },
        resumeMonsterCatch: () => { loopEpoch.resumed = true; loopEpoch.resumes += 1; }
    };
    const manager = createMonsterCatcherManager(
        state,
        { getMonsterCatcherSettings: () => normalizeMonsterCatcherSettings(state.config.settings.monsterCatcher) },
        loopManager,
        commandSender,
        { decoder, downloader }
    );
    return { state, manager, sent, loopEpoch };
}

const DM_CHANNEL_ID = '1557002545556230195';
const sensorMessage = (overrides = {}) => ({
    id: `msg-${Math.random()}`,
    content: '⚠️ Beep Boop. Apa kamu manusia sungguhan? Balas DM ini dengan **6 karakter pada gambar**',
    attachments: { values: () => [] },
    components: [],
    embeds: [],
    channel: { id: DM_CHANNEL_ID, type: 'DM' },
    author: { id: LUCY_ID },
    guild: null,
    ...overrides
});

function withImage(overrides = {}) {
    return sensorMessage({
        content: '⚠️ Beep Boop. Apa kamu manusia sungguhan? Balas DM ini dengan **6 karakter pada gambar**\nhttps://cdn.discordapp.com/attachments/123/abc/monster.png?ex=1&is=1',
        attachments: { values: () => [{ url: 'https://cdn.discordapp.com/attachments/123/abc/monster.png?ex=1' }] },
        ...overrides
    });
}

test('normalizeMonsterCatcherSettings fills defaults and coerces values', () => {
    const defaults = normalizeMonsterCatcherSettings(undefined);
    assert.deepEqual(defaults, { enabled: false, autoPauseLoops: true, retryWaitMs: 60000, maxRetries: 0, dmChannelId: DM_CHANNEL_ID });

    assert.deepEqual(normalizeMonsterCatcherSettings({ enabled: true, autoPauseLoops: false, maxRetries: 3 }), {
        enabled: true, autoPauseLoops: false, retryWaitMs: 60000, maxRetries: 3, dmChannelId: DM_CHANNEL_ID
    });
    assert.equal(normalizeMonsterCatcherSettings({ retryWaitMs: -5 }).retryWaitMs, 60000);
    assert.equal(normalizeMonsterCatcherSettings({ retryWaitMs: 20000 }).retryWaitMs, 20000);
    assert.equal(normalizeMonsterCatcherSettings({ dmChannelId: '  888  ' }).dmChannelId, '888');
});

test('messageText strips invisible characters and lowercases', () => {
    const text = messageText({ content: 'Ketik\u200B 6 karakter\u200C pada gambar\uFEFF', components: [], embeds: [] });
    assert.equal(text, 'ketik 6 karakter pada gambar');
    assert.equal(text.includes('\u200B'), false);
});

test('extractImageUrl finds Discord attachment URL from content and attachments', () => {
    const fromAttachments = extractImageUrl({ content: '', attachments: { values: () => [{ url: 'https://cdn.discordapp.com/attachments/1/2/m.png?ex=1' }] }, components: [], embeds: [] });
    assert.equal(fromAttachments, 'https://cdn.discordapp.com/attachments/1/2/m.png?ex=1');

    const fromContent = extractImageUrl({ content: 'pic: https://cdn.discordapp.com/attachments/9/8/monster.png?wo=1', attachments: { values: () => [] }, components: [], embeds: [] });
    assert.equal(fromContent, 'https://cdn.discordapp.com/attachments/9/8/monster.png?wo=1');

    const fromEmbed = extractImageUrl({ content: '', attachments: { values: () => [] }, components: [], embeds: [{ image: { url: 'https://media.example.com/a.png?x=1' } }] });
    assert.equal(fromEmbed, 'https://media.example.com/a.png?x=1');
});

test('parseWaitTimeMs understands menit/detik', () => {
    assert.equal(parseWaitTimeMs('⌛ Monster perlu diperbarui. Tunggu sekitar 1 menit lalu kirim'), 60000);
    assert.equal(parseWaitTimeMs('Wait ~20 detik'), 20000);
    assert.equal(parseWaitTimeMs('no wait info'), 0);
});

test('sensor trigger pauses loops, decodes image, sends code to DM Lucy', async () => {
    const decoded = [];
    const { manager, sent, loopEpoch } = setup({ decoder: buffer => { decoded.push(buffer); return 'X1K2P3'; } });
    const msg = withImage();

    const handled = await manager.handle(msg);
    assert.equal(handled, true);
    assert.equal(loopEpoch.paused, true, 'loops must pause on sensor trigger');
    assert.equal(decoded.length, 1);
    assert.equal(sent.some(s => s.cmd === 'X1K2P3' && s.channelId === DM_CHANNEL_ID), true, 'recognized code must be sent to the DM channel');
});

test('done confirmation resumes loops and ends the catch', async () => {
    const { manager, loopEpoch, sent } = setup({ decoder: () => 'ABC123' });
    await manager.handle(withImage());

    const done = sensorMessage({ content: '✅ Terima kasih, catch selesai', id: 'done-1' });
    const handled = await manager.handle(done);
    assert.equal(handled, true);
    assert.equal(loopEpoch.resumed, true, 'loops must resume after catch selesai');
    assert.equal(manager.getStatus().status, 'IDLE');
    assert.equal(manager.getStatus().active, false);
    assert.equal(sent.filter(s => s.cmd === 'ABC123').length, 1, 'sensor must not reprocess');
});

test('mismatch triggers "ulang", waits for refresh, and re-requests a new sensor', async () => {
    const { manager, sent, loopEpoch } = setup({ decoder: () => 'ABC123' });
    await manager.handle(withImage({ id: 'sensor-1' }));

    // Lucy replies "belum cocok"
    const mismatch = sensorMessage({ content: '❌ Monsternya belum cocok', id: 'mismatch-1' });
    await manager.handle(mismatch);
    assert.equal(sent.some(s => s.cmd === 'ulang'), true);
    assert.equal(manager.getStatus().status, 'WAITING_RETRY');
    assert.equal(loopEpoch.paused, true, 'loops remain paused during retry');

    // Lucy sends refresh notice: wait ~1 menit
    const refresh = sensorMessage({ content: '⌛ Monster perlu diperbarui. Tunggu sekitar 1 menit lalu kirim', id: 'refresh-1' });
    await manager.handle(refresh);
    assert.equal(manager.getStatus().phase, 'awaitingNewSensor');
});

test('only messages from Lucy bot are processed', async () => {
    const { manager, sent, loopEpoch } = setup({ decoder: () => 'ABC123' });
    const msg = withImage({ author: { id: 'someone-else' } });
    const handled = await manager.handle(msg);
    assert.equal(handled, false);
    assert.equal(loopEpoch.paused, false);
    assert.equal(sent.length, 0);
});

test('manager creation without injected downloader does not crash (TDZ regression)', async () => {
    const state = {
        client: { isReady: () => true, user: { id: 'me' } },
        config: { settings: { monsterCatcher: normalizeMonsterCatcherSettings({ enabled: true, autoPauseLoops: false }) } }
    };
    const cfg = { getMonsterCatcherSettings: () => normalizeMonsterCatcherSettings(state.config.settings.monsterCatcher) };
    // Tidak menyuntikkan options.downloader — memakai default downloadImage.
    const manager = createMonsterCatcherManager(state, cfg, {}, { send: async () => false });
    assert.ok(manager, 'manager must be created without referencing downloadImage at init');
    assert.equal(manager.getStatus().enabled, true);
});

test('sensor from a different DM channel than configured is ignored', async () => {
    const { manager, sent, loopEpoch } = setup({});
    const foreignChannel = withImage({ channel: { id: 'other-channel', type: 'DM' } });
    const handled = await manager.handle(foreignChannel);
    assert.equal(handled, false, 'sensor from a channel other than the configured Lucy DM must be ignored');
    assert.equal(sent.length, 0);
    assert.equal(loopEpoch.paused, false);
});

test('getStatus reports the configured DM channel ID', async () => {
    const { manager } = setup({});
    assert.equal(manager.getStatus().dmChannelId, DM_CHANNEL_ID);
});

test('disabled manager ignores messages', async () => {
    const { manager, sent, loopEpoch } = setup({ config: { enabled: false } });
    const handled = await manager.handle(withImage());
    assert.equal(handled, false);
    assert.equal(loopEpoch.paused, false);
    assert.equal(sent.length, 0);
});

test('non-DM messages are ignored', async () => {
    const { manager, sent, loopEpoch } = setup({ decoder: () => 'ABC123' });
    const msg = withImage({ guild: { id: 'g-1' }, channel: { id: 'c-1', type: 0 } });
    const handled = await manager.handle(msg);
    assert.equal(handled, false);
    assert.equal(loopEpoch.paused, false);
    assert.equal(sent.length, 0);
});

test('duplicate sensor message is not processed twice', async () => {
    const { manager, sent, loopEpoch } = setup({ decoder: () => 'ABC123' });
    const msg = withImage({ id: 'same-id' });
    await manager.handle(msg);
    await manager.handle(msg);
    assert.equal(sent.filter(s => s.cmd === 'ABC123').length, 1);
    assert.equal(loopEpoch.pauses, 1);
});

test('stop() resumes loops and resets state when paused', async () => {
    const { manager, loopEpoch } = setup({ decoder: () => 'ABC123' });
    await manager.handle(withImage());
    assert.equal(loopEpoch.paused, true);
    manager.stop();
    assert.equal(loopEpoch.resumed, true);
    assert.equal(manager.getStatus().status, 'IDLE');
});

test('new sensor while catching is processed without re-pausing', async () => {
    const { manager, sent, loopEpoch } = setup({ decoder: () => 'ABC123' });
    await manager.handle(withImage({ id: 's1' }));
    // Sensor kedua saat masih aktif
    await manager.handle(withImage({ id: 's2' }));
    assert.equal(sent.filter(s => s.cmd === 'ABC123').length, 2);
    assert.equal(loopEpoch.pauses, 1, 'pause only once per catch');
});

test('full retry cycle: mismatch -> ulang -> refresh -> new sensor -> done', async () => {
    const { state, manager, sent, loopEpoch } = setup({ decoder: () => 'ABC123' });

    // Sensor pertama -> decode -> kirim kode
    await manager.handle(withImage({ id: 'sensor-1' }));
    assert.equal(sent.filter(s => s.cmd === 'ABC123').length, 1);

    // Lucy: tidak cocok -> kirim "ulang"
    await manager.handle(sensorMessage({ content: '❌ Monsternya belum cocok', id: 'mism-1' }));
    assert.equal(sent.filter(s => s.cmd === 'ulang').length, 1);

    // Lucy: minta tunggu 1 menit -> timer retry diset
    await manager.handle(sensorMessage({ content: '⌛ Monster perlu diperbarui. Tunggu sekitar 1 menit lalu kirim', id: 'refresh-1' }));
    assert.equal(manager.getStatus().phase, 'awaitingNewSensor');
    assert.ok(state.monsterCatcher.retryTimer, 'retry timer must be scheduled');

    // Timer berjalan: mengirim "ulang" lagi untuk sensor baru
    await new Promise(resolve => state.monsterCatcher.retryTimer._onTimeout ? (state.monsterCatcher.retryTimer._onTimeout(), resolve()) : resolve());
    assert.equal(sent.filter(s => s.cmd === 'ulang').length, 2);

    // Sensor baru -> decode -> kirim kode
    await manager.handle(withImage({ id: 'sensor-2' }));
    assert.equal(sent.filter(s => s.cmd === 'ABC123').length, 2);

    // Konfirmasi selesai -> resume loop
    await manager.handle(sensorMessage({ content: '✅ Terima kasih, catch selesai', id: 'done-2' }));
    assert.equal(loopEpoch.resumed, true);
    assert.equal(manager.getStatus().status, 'IDLE');
    assert.equal(manager.getStatus().active, false);
});

// Fixture dari captcha nyata Lucy (PNG, seperti yang diunduh monsterCatcher).
// Captcha #2 berisi dua huruf G yang dulu salah dibaca jadi 6.
test('sensor decodes real captcha images end to end', async () => {
    const cases = [
        { file: 'monster-captcha-1.png', code: 'MZCQ6L' },
        { file: 'monster-captcha-2.png', code: '4VGWGR' }
    ];
    for (const { file, code } of cases) {
        const buffer = fs.readFileSync(path.join(__dirname, 'fixtures', file));
        const { manager, sent } = setup({ decoder: b => TooEz2.decodeBuffer(b), downloader: async () => buffer });
        const handled = await manager.handle(withImage());
        assert.equal(handled, true);
        assert.ok(sent.some(s => s.cmd === code && s.channelId === DM_CHANNEL_ID), `${file} harus terbaca ${code}`);
    }
});