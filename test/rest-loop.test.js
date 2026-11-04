const test = require('node:test');
const assert = require('node:assert/strict');

const createLoopManager = require('../src/managers/loop');
const createCommandSender = require('../src/managers/command');
const createAdventureManager = require('../src/managers/adventure');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function setupOther(command) {
    const sent = [];
    const state = {
        config: { otherCommands: [{ text: '!test', channelId: '123', delayMs: 5, enabled: true, ...command }] },
        loops: {},
        nextAt: {},
        otherCommandDelays: {}
    };
    const loopManager = createLoopManager(state, { async send(cmd) { sent.push(cmd); return true; } });
    return { state, loopManager, sent };
}

test('Custom Command Lucy with empty count (0) keeps sending until stopped', async () => {
    const { state, loopManager, sent } = setupOther({ count: 0 });
    assert.equal(loopManager.startOtherCommand(0), true);
    await wait(80);
    assert.ok(sent.length >= 4, `sent ${sent.length}`);
    assert.equal(state.config.otherCommands[0].enabled, true);

    loopManager.stopOtherCommand(0);
    const stoppedAt = sent.length;
    await wait(30);
    assert.equal(sent.length, stoppedAt);
});

test('Custom Command Lucy with a number still stops after that many sends', async () => {
    const { state, loopManager, sent } = setupOther({ count: 3 });
    loopManager.startOtherCommand(0);
    await wait(80);
    assert.equal(sent.length, 3);
    assert.equal(state.config.otherCommands[0].enabled, false);
});

test('rest pauses Lucy command delays (even without captcha) and resumes the remaining sends', async () => {
    const { state, loopManager, sent } = setupOther({ count: 3, delayMs: 40 });
    loopManager.startOtherCommand(0);
    await wait(5);
    assert.equal(sent.length, 1);

    state.rest = { active: true };
    loopManager.pauseOtherCommandDelays({ reason: 'rest' });
    await wait(80);
    assert.equal(sent.length, 1, 'nothing is sent while resting');

    state.rest.active = false;
    loopManager.resumeOtherCommandDelays({ reason: 'rest' });
    await wait(130);
    assert.equal(sent.length, 3);
    assert.equal(state.config.otherCommands[0].enabled, false);
});

test('starting a Lucy command during rest waits until rest ends', async () => {
    const { state, loopManager, sent } = setupOther({ count: 0 });
    state.rest = { active: true };
    loopManager.startOtherCommand(0);
    await wait(30);
    assert.equal(sent.length, 0);
    state.rest.active = false;
    loopManager.resumeOtherCommandDelays({ reason: 'rest' });
    await wait(10);
    assert.ok(sent.length >= 1);
    loopManager.stopOtherCommand(0);
});

test('command sender blocks commands during rest', async () => {
    const state = {
        rest: { active: true },
        config: { botStatus: { running: true, paused: false } },
        client: { isReady() { throw new Error('must not reach the client'); } }
    };
    const sender = createCommandSender(state, {});
    assert.equal(await sender.send('wh', 'Hunt'), false);
});

test('Auto Adventure started during rest is deferred until rest ends', async () => {
    const sent = [];
    const state = { rest: { active: true } };
    const adventure = createAdventureManager(state, {
        getAdventureSettings: () => ({ enabled: true, targetId: 't', channelId: 'c', guildId: 'g' })
    }, { async send(cmd) { sent.push(cmd); return true; } });
    assert.equal(await adventure.start({ restart: true }), false);
    assert.equal(state.adventureResumeAfterRest, true);
    assert.deepEqual(sent, []);
});

test('Monster Catcher pauses all Lucy command delays with remaining delay saved', async () => {
    const { state, loopManager, sent } = setupOther({ count: 3, delayMs: 40 });
    loopManager.startOtherCommand(0);
    await wait(5);
    assert.equal(sent.length, 1);

    loopManager.pauseMonsterCatch();
    await wait(80);
    assert.equal(sent.length, 1, 'nothing is sent while Monster Catcher is active');
    assert.ok(state.monsterCatchPaused, true);

    loopManager.resumeMonsterCatch();
    await wait(130);
    assert.equal(sent.length, 3);
    assert.equal(state.monsterCatchPaused, false);
});

test('command sender blocks commands during Monster Catcher but allows monster DM sends', async () => {
    const reachedClient = [];
    const state = {
        monsterCatchPaused: true,
        config: { botStatus: { running: true, paused: false } },
        client: {
            isReady: () => true,
            channels: { cache: new Map() }
        },
        activeChannelId: ''
    };
    const channelManager = { updateActive: async () => false };
    const sender = createCommandSender(state, channelManager);
    assert.equal(await sender.send('wh', 'Hunt'), false, 'blocked by monster catch gate before reaching channels');

    // With allowDuringMonsterCatch the gate is bypassed: a target channel ID is supplied so
    // channelManager.updateActive() is NOT needed (requestedChannelId set), and the DM channel exists.
    state.client.channels.cache.set('dm-1', { id: 'dm-1', sendTyping: async () => {}, send: async () => { reachedClient.push('ABC123'); } });
    const ok = await sender.send('ABC123', 'Monster Catcher', 'dm-1', { allowDuringMonsterCatch: true });
    assert.equal(ok, true, 'monster DM send is allowed while catch paused');
    assert.deepEqual(reachedClient, ['ABC123']);
});
