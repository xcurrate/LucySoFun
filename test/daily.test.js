const test = require('node:test');
const assert = require('node:assert/strict');

const createDailyManager = require('../src/managers/daily');
const { normalizeDailySettings, msUntilNextMidnightWib, parseDailyResponse, DEFAULT_COMMAND } = createDailyManager;
const LUCY_ID = require('../src/constants').LUCY_BOT_ID;

function setup({ config = {}, running = true, customCommands = null } = {}) {
    const state = {
        client: { isReady: () => true, user: { id: 'me' } },
        config: {
            botStatus: { running, paused: !running },
            settings: {
                daily: normalizeDailySettings({ enabled: true, ...config })
            },
            // Channel mengikuti channel command utama.
            otherCommands: customCommands || [{ text: 'lrep', channelId: 'chan-1', enabled: true }]
        },
        persistConfig: () => {}
    };
    const sent = [];
    const commandSender = {
        send: async (cmd, type, channelId) => {
            sent.push({ cmd, type, channelId });
            return true;
        }
    };
    const manager = createDailyManager(
        state,
        { getDailySettings: () => normalizeDailySettings(state.config.settings.daily) },
        commandSender
    );
    return { state, manager, sent };
}

const dailyReply = (overrides = {}) => ({
    id: `msg-${Math.random()}`,
    content: '🌟 **Lucy** · Server **Aether**\nStreak harianmu 12 hari!',
    embeds: [],
    channel: { id: 'chan-1' },
    author: { id: LUCY_ID },
    guild: null,
    ...overrides
});

test('normalizeDailySettings fills defaults and coerces values', () => {
    assert.deepEqual(normalizeDailySettings(undefined), { enabled: false, command: DEFAULT_COMMAND, lastRunDate: '' });
    assert.deepEqual(normalizeDailySettings({ enabled: true, command: '  lucy daily  ' }), {
        enabled: true, command: 'lucy daily', lastRunDate: ''
    });
    assert.equal(normalizeDailySettings({ command: '   ' }).command, DEFAULT_COMMAND);
});

test('msUntilNextMidnightWib targets 00:00 WIB (17:00 UTC previous day)', () => {
    // 2024-01-01T00:00:00Z = 07:00 WIB → sisa 17 jam menuju 00:00 WIB berikutnya.
    const now = Date.UTC(2024, 0, 1, 0, 0, 0);
    assert.equal(msUntilNextMidnightWib(now), 17 * 60 * 60 * 1000);
    // Tepat 00:00 WIB → 24 jam penuh.
    const midnight = Date.UTC(2024, 0, 1, 17, 0, 0);
    assert.equal(msUntilNextMidnightWib(midnight), 24 * 60 * 60 * 1000);
});

test('parseDailyResponse reads the server name and daily streak', () => {
    const parsed = parseDailyResponse(dailyReply());
    assert.equal(parsed.days, 12);
    assert.equal(parsed.server, 'Lucy');
    assert.match(parsed.text, /streak harianmu 12 hari/i);
    assert.equal(parseDailyResponse({ content: 'halo biasa', embeds: [] }), null);
});

test('handle records the daily reply only from Lucy in the configured channel', async () => {
    const { manager, state } = setup();
    assert.equal(await manager.handle(dailyReply()), true);
    assert.equal(state.daily.lastResult.days, 12);

    // Bukan dari Lucy → diabaikan.
    assert.equal(await manager.handle(dailyReply({ author: { id: 'someone' } })), false);
    // Channel lain → diabaikan.
    assert.equal(await manager.handle(dailyReply({ channel: { id: 'other' } })), false);
    // Fitur nonaktif → diabaikan.
    state.config.settings.daily.enabled = false;
    assert.equal(await manager.handle(dailyReply()), false);
});

test('handle clicks a daily claim button when Lucy includes one', async () => {
    const { manager, state } = setup();
    let clicked = null;
    const reply = dailyReply({
        components: [{ components: [{ custom_id: 'daily_claim', label: 'Klaim', disabled: false }] }],
        clickButton: async (id) => { clicked = id; }
    });
    assert.equal(await manager.handle(reply), true);
    assert.equal(clicked, 'daily_claim');
    assert.equal(state.daily.lastResult.days, 12);
});

test('findDailyButton skips disabled or unrelated buttons', () => {
    const { findDailyButton } = createDailyManager;
    assert.equal(findDailyButton({ components: [{ components: [{ custom_id: 'other', label: 'Lain' }] }] }), null);
    assert.equal(findDailyButton({ components: [{ components: [{ custom_id: 'daily_claim', disabled: true }] }] }), null);
    const button = findDailyButton({ components: [{ components: [{ custom_id: 'daily_claim' }] }] });
    assert.equal(button.custom_id, 'daily_claim');
});

test('runNow sends the daily command to the primary command channel', async () => {
    const { manager, sent, state } = setup();
    assert.equal(await manager.runNow(), true);
    assert.deepEqual(sent, [{ cmd: 'lucy daily', type: 'Daily', channelId: 'chan-1' }]);
    assert.ok(state.daily.lastRunAt > 0);
});

test('runNow falls back to the last command channel and refuses when paused', async () => {
    // Tanpa Custom Command / Command Tetap ber-channel → pakai channel terakhir.
    const { manager, sent, state } = setup({ customCommands: [] });
    state.lastLucyCommandChannelId = 'chan-last';
    assert.equal(await manager.runNow(), true);
    assert.equal(sent[0].channelId, 'chan-last');

    const paused = setup({ running: false });
    assert.equal(await paused.manager.runNow(), false);
});

test('start sends daily once at startup then schedules 00:00 WIB', async () => {
    const { manager, sent, state } = setup();
    assert.equal(manager.start(), true);
    assert.ok(state.daily.timer);
    assert.ok(state.daily.nextRunAt > Date.now());
    // Rutinitas startup terkirim (async) sekali saja.
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, 'Daily');
    assert.equal(sent[0].channelId, 'chan-1');
    // Start kedua tidak mengirim ulang (satu per sesi login).
    manager.start();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sent.length, 1);
    // Sesi baru (login ulang) boleh mengirim lagi.
    manager.markClientReady();
    manager.start();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sent.length, 2);
    manager.stop();
    assert.equal(state.daily.timer, null);
    assert.equal(state.daily.nextRunAt, 0);
});

test('start is a no-op when disabled, not running, or channel unknown', () => {
    const disabled = setup({ config: { enabled: false } });
    assert.equal(disabled.manager.start(), false);
    assert.equal(disabled.state.daily.timer, null);

    const paused = setup({ running: false });
    assert.equal(paused.manager.start(), false);
    assert.equal(paused.state.daily.timer, null);

    const noChannel = setup({ customCommands: [] });
    assert.equal(noChannel.manager.start(), false);
    assert.equal(noChannel.state.daily.timer, null);
});

test('scheduled run is skipped when the day already ran (lastRunDate)', async () => {
    const { manager, state } = setup();
    const { wibDateKey } = require('../src/managers/dailySchedule');
    state.config.settings.daily = { ...state.config.settings.daily, lastRunDate: wibDateKey() };
    // start() tetap mengirim startup (belum startupSent), lalu jadwal berikutnya
    // tidak boleh dobel pada hari yang sama.
    manager.start();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.daily.startupSent, true);
    manager.stop();
});
