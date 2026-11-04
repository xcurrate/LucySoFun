const test = require('node:test');
const assert = require('node:assert/strict');

const CONSTANTS = require('../src/constants');
const createCommandSender = require('../src/managers/command');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const LUCY_ID = CONSTANTS.LUCY_BOT_ID;
const SELF_USERNAME = 'Tester';

function createSender({ timeoutMs = 300 } = {}) {
    const original = CONSTANTS.RESPONSE_TIMEOUT_MS;
    CONSTANTS.RESPONSE_TIMEOUT_MS = timeoutMs;

    let emit = null;
    let pausedReason = null;

    const state = {
        accountId: 'acc-test',
        accountUsername: SELF_USERNAME,
        config: { botStatus: { running: true, paused: false }, otherCommands: [] },
        nextAt: {},
        loops: {},
        otherCommandDelays: {},
        rest: { active: false },
        monsterCatchPaused: false,
        activeChannelId: 'c1',
        client: {
            isReady: () => true,
            user: { id: 'self', username: SELF_USERNAME, tag: `${SELF_USERNAME}#0001` },
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

    const lucyMsg = (over = {}) => ({
        author: { id: LUCY_ID },
        channel: { id: 'c1' },
        content: '',
        embeds: [],
        createdTimestamp: Date.now(),
        ...over
    });

    return {
        state,
        sender,
        lucyMsg,
        get emit() { return emit; },
        get pausedReason() { return pausedReason; },
        restore: () => { CONSTANTS.RESPONSE_TIMEOUT_MS = original; }
    };
}

test('Lucy message containing our server nickname cancels the 40s timeout', async () => {
    const ctx = createSender();
    const { state, sender, restore } = ctx;
    try {
        await sender.send('!minta', 'Other Command 1', 'c1');
        assert.ok(state.lucyResponseTimeout, 'timeout armed after send');

        ctx.emit(ctx.lucyMsg({ content: `öh kamu **${SELF_USERNAME}**! ada minta?` }));
        await wait(20);
        assert.equal(state.lucyResponseTimeout, null, 'nickname in message clears the timeout');
        assert.equal(state.config.botStatus.paused, false);
    } finally {
        if (state.lucyResponseTimeout) clearTimeout(state.lucyResponseTimeout);
        restore();
    }
});

test('Lucy embed containing our account username cancels the timeout', async () => {
    const ctx = createSender();
    const { state, sender, restore } = ctx;
    try {
        await sender.send('!minta', 'Other Command 1', 'c1');
        assert.ok(state.lucyResponseTimeout, 'timeout armed');

        ctx.emit(ctx.lucyMsg({ embeds: [{ description: `Inventory ${SELF_USERNAME}` }] }));
        await wait(20);
        assert.equal(state.lucyResponseTimeout, null, 'username in embed clears the timeout');
    } finally {
        if (state.lucyResponseTimeout) clearTimeout(state.lucyResponseTimeout);
        restore();
    }
});

test('Lucy message in another channel does NOT cancel the timeout', async () => {
    const ctx = createSender();
    const { state, sender, restore } = ctx;
    try {
        await sender.send('!minta', 'Other Command 1', 'c1');
        assert.ok(state.lucyResponseTimeout, 'timeout armed');

        ctx.emit(ctx.lucyMsg({ channel: { id: 'channel-lain' }, content: SELF_USERNAME }));
        await wait(20);
        assert.ok(state.lucyResponseTimeout, 'timeout still armed: wrong channel');
    } finally {
        if (state.lucyResponseTimeout) clearTimeout(state.lucyResponseTimeout);
        restore();
    }
});

test('Lucy message without our username does NOT cancel the timeout', async () => {
    const ctx = createSender();
    const { state, sender, restore } = ctx;
    try {
        await sender.send('!minta', 'Other Command 1', 'c1');
        assert.ok(state.lucyResponseTimeout, 'timeout armed');

        ctx.emit(ctx.lucyMsg({ content: 'hai teman-teman semua!' }));
        await wait(20);
        assert.ok(state.lucyResponseTimeout, 'timeout still armed: no username in message');
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
