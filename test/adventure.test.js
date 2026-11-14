const test = require('node:test');
const assert = require('node:assert/strict');

const createAdventureManager = require('../src/managers/adventure');
const CONSTANTS = require('../src/constants');

const settings = {
    enabled: true,
    targetId: 'target-id',
    channelId: 'channel-id'
};

const createManager = () => {
    const state = { config: { botStatus: { running: true, paused: false } } };
    const sent = [];
    const manager = createAdventureManager(
        state,
        { getAdventureSettings: () => settings },
        {
            send: async (...args) => { sent.push(args); return true; },
            runLucyAction: async (action) => action()
        }
    );
    return { state, sent, manager };
};

const targetMessage = (overrides = {}) => ({
    author: { id: CONSTANTS.LUCY_BOT_ID },
    channel: { id: 'channel-id' },
    guild: { id: 'guild-id' },
    content: 'Sylvaris',
    components: [],
    ...overrides
});

test('Auto Adventure only handles the configured channel', async () => {
    const { manager, state } = createManager();

    const handled = await manager.handle(targetMessage({ channel: { id: 'different-channel' } }));

    assert.equal(handled, false);
    assert.equal(state.adventureTimer, undefined);

    // Guild tidak lagi dipakai sebagai filter: channel yang cocok tetap diproses.
    const sameChannelOtherGuild = await manager.handle(targetMessage({ guild: { id: 'another-guild' } }));
    assert.equal(sameChannelOtherGuild, true);
    manager.stop();
});

test('Auto Adventure explores Sylvaris and schedules the next Ladv command', async () => {
    const { manager, state } = createManager();
    const clicks = [];

    const handled = await manager.handle(targetMessage({
        components: [{ components: [{ custom_id: 'adv:explore', disabled: false }] }],
        clickButton: async id => clicks.push(id)
    }));

    assert.equal(handled, true);
    assert.deepEqual(clicks, ['adv:explore']);
    assert.ok(state.adventureTimer);
    manager.stop();
});

test('Auto Adventure pauses until manually restarted when Adventure Map is shown', async () => {
    const { manager, state } = createManager();

    const handled = await manager.handle(targetMessage({ content: '🗺️ Adventure Map' }));

    assert.equal(handled, true);
    assert.equal(state.adventurePaused, true);
    assert.equal(state.adventureTimer, null);
});

test('Auto Adventure starts by sending Ladv to its configured channel', async () => {
    const { manager, sent } = createManager();

    const started = await manager.start();

    assert.equal(started, true);
    assert.deepEqual(sent, [['ladv', 'Adventure', 'channel-id']]);
    manager.stop();
});
