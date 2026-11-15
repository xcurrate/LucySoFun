const test = require('node:test');
const assert = require('node:assert/strict');

const createCookieManager = require('../src/managers/cookie');
const { normalizeCookieSettings, buildCookieCommand, DEFAULT_COMMAND } = createCookieManager;

function setup({ config = {}, running = true, customCommands = null } = {}) {
    const state = {
        client: { isReady: () => true, user: { id: 'me' } },
        config: {
            botStatus: { running, paused: !running },
            settings: {
                cookie: normalizeCookieSettings({ enabled: true, ...config })
            },
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
    const manager = createCookieManager(
        state,
        { getCookieSettings: () => normalizeCookieSettings(state.config.settings.cookie) },
        commandSender
    );
    return { state, manager, sent };
}

test('normalizeCookieSettings strips non-digits from target and defaults', () => {
    assert.deepEqual(normalizeCookieSettings(undefined), {
        enabled: false, targetId: '', ping: false, command: DEFAULT_COMMAND, lastRunDate: ''
    });
    assert.deepEqual(normalizeCookieSettings({ enabled: true, targetId: '<@1587263872638888>', ping: true }), {
        enabled: true, targetId: '1587263872638888', ping: true, command: DEFAULT_COMMAND, lastRunDate: ''
    });
    assert.equal(normalizeCookieSettings({ command: '   ' }).command, DEFAULT_COMMAND);
});

test('buildCookieCommand handles empty target, no ping, and ping', () => {
    assert.equal(buildCookieCommand({ command: 'lucy rep', targetId: '', ping: false }), 'lucy rep');
    assert.equal(buildCookieCommand({ command: 'lucy rep', targetId: '16721362135728277', ping: false }), 'lucy rep 16721362135728277');
    assert.equal(buildCookieCommand({ command: 'lucy rep', targetId: '1587263872638888', ping: true }), 'lucy rep <@1587263872638888>');
});

test('runNow sends the cookie command to the primary command channel', async () => {
    const { manager, sent, state } = setup({ config: { targetId: '1587263872638888', ping: false } });
    assert.equal(await manager.runNow(), true);
    assert.deepEqual(sent, [{ cmd: 'lucy rep 1587263872638888', type: 'Cookie', channelId: 'chan-1' }]);
    assert.ok(state.cookie.lastRunAt > 0);
});

test('runNow uses ping format and falls back to the last command channel', async () => {
    const { manager, sent, state } = setup({
        config: { targetId: '1587263872638888', ping: true },
        customCommands: []
    });
    state.lastLucyCommandChannelId = 'chan-last';
    assert.equal(await manager.runNow(), true);
    assert.equal(sent[0].cmd, 'lucy rep <@1587263872638888>');
    assert.equal(sent[0].channelId, 'chan-last');

    const paused = setup({ running: false });
    assert.equal(await paused.manager.runNow(), false);
});

test('start sends cookie once at startup then schedules 00:00 WIB', async () => {
    const { manager, sent, state } = setup();
    assert.equal(manager.start(), true);
    assert.ok(state.cookie.timer);
    assert.ok(state.cookie.nextRunAt > Date.now());
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, 'Cookie');
    // Start kedua tidak mengirim ulang; sesi baru boleh mengirim lagi.
    manager.start();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sent.length, 1);
    manager.markClientReady();
    manager.start();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sent.length, 2);
    manager.stop();
    assert.equal(state.cookie.timer, null);
    assert.equal(state.cookie.nextRunAt, 0);
});

test('start is a no-op when disabled, not running, or channel unknown', () => {
    assert.equal(setup({ config: { enabled: false } }).manager.start(), false);
    assert.equal(setup({ running: false }).manager.start(), false);
    assert.equal(setup({ customCommands: [] }).manager.start(), false);
});
