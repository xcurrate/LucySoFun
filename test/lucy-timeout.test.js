const test = require('node:test');
const assert = require('node:assert/strict');

const CONSTANTS = require('../src/constants');
const createCommandSender = require('../src/managers/command');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function createSender({ timeoutMs = 300 } = {}) {
    const original = CONSTANTS.RESPONSE_TIMEOUT_MS;
    CONSTANTS.RESPONSE_TIMEOUT_MS = timeoutMs;

    let emit = null;
    let pausedReason = null;

    const state = {
        accountId: 'acc-test',
        config: { botStatus: { running: true, paused: false }, otherCommands: [] },
        nextAt: {},
        loops: {},
        otherCommandDelays: {},
        rest: { active: false },
        monsterCatchPaused: false,
        activeChannelId: 'c1',
        client: {
            isReady: () => true,
            user: { id: 'self', username: 'Tester', tag: 'Tester#0001' },
            channels: { cache: new Map() },
            guilds: { cache: new Map() },
            on: (evt, fn) => { if (evt === 'messageCreate') emit = fn; },
            removeListener: () => {}
        },
        persistConfig: () => {}
    };
    state.client.channels.cache.set('c1', {
        id: 'c1',
        sendTyping: async () => {},
        send: async () => {}
    });

    const emergencyHandler = { pause: (reason) => { pausedReason = reason; } };
    const sender = createCommandSender(state, {}, emergencyHandler);

    return {
        state,
        sender,
        get emit() { return emit; },
        get pausedReason() { return pausedReason; },
        restore: () => { CONSTANTS.RESPONSE_TIMEOUT_MS = original; }
    };
}

test('Lucy response cancels the 40s timeout for Other Command', async () => {
    const ctx = createSender();
    const { state, sender, restore } = ctx;
    try {
        await sender.send('!minta', 'Other Command 1', 'c1');
        assert.ok(state.lucyResponseTimeout, 'timeout should be armed after send');

        ctx.emit({ author: { id: CONSTANTS.LUCY_BOT_ID }, channel: { id: 'c1' }, content: 'oke' });
        await wait(20);
        assert.equal(state.lucyResponseTimeout, null, 'Lucy message clears the timeout');
        assert.equal(state.config.botStatus.paused, false, 'no pause when Lucy replied');
    } finally {
        if (state.lucyResponseTimeout) clearTimeout(state.lucyResponseTimeout);
        restore();
    }
});

test('no Lucy response within timeout pauses only this account', async () => {
    const ctx = createSender({ timeoutMs: 150 });
    const { state, sender, restore } = ctx;
    try {
        await sender.send('!minta', 'Other Command 1', 'c1');
        assert.ok(state.lucyResponseTimeout, 'timeout armed');
        await wait(300);
        assert.equal(ctx.pausedReason, 'TIMEOUT 0.15s (Lucy No Response)', 'emergency pause fires');
        assert.equal(state.lucyResponseTimeout, null, 'timeout cleared after firing');
    } finally {
        restore();
    }
});

test('Other Command timeout does not register a Lucy retry action', async () => {
    const { state, sender, restore } = createSender();
    try {
        await sender.send('!minta', 'Other Command 1', 'c1');
        assert.equal(state.lucyCooldownLastAction, undefined);
    } finally {
        if (state.lucyResponseTimeout) clearTimeout(state.lucyResponseTimeout);
        restore();
    }
});
