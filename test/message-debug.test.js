const test = require('node:test');
const assert = require('node:assert/strict');

const createMessageHandler = require('../src/managers/message');

function createHandler(messageDebug) {
    const state = {
        client: { isReady: () => true, user: { id: 'self' } },
        config: { settings: { messageDebug }, safety: {} },
        messageDebugEntries: []
    };
    const handler = createMessageHandler(
        state,
        { getLucyControlCommands: () => ({ startCmd: 'lucy start', pauseCmd: 'lucy pause', allowIds: [] }) },
        {}, {}, {}, {}, {}, null, null, {}, {}, {}
    );
    return { state, handler };
}

test('Message Debug captures component messages and retains their raw button JSON', () => {
    const { state, handler } = createHandler({ enabled: true, targetId: 'user-1', channelId: 'channel-1', guildId: 'guild-1' });
    const components = [{ type: 1, components: [{ type: 2, custom_id: 'guildboss_fight', label: 'Fight' }] }];
    const captured = handler.captureMessageDebug({
        id: 'message-1',
        content: '',
        author: { id: 'user-1', username: 'test-user', toJSON() { return { id: this.id, username: this.username }; } },
        channel: { id: 'channel-1' },
        guild: { id: 'guild-1' },
        embeds: [],
        components,
        attachments: new Map()
    });

    assert.equal(captured, true);
    assert.equal(state.messageDebugEntries.length, 1);
    assert.equal(state.messageDebugEntries[0].messageType, 'components');
    assert.deepEqual(state.messageDebugEntries[0].message.components, components);
});

test('Message Debug ignores a message that does not match configured filters', () => {
    const { state, handler } = createHandler({ enabled: true, targetId: 'user-1', channelId: '', guildId: '' });
    const captured = handler.captureMessageDebug({
        id: 'message-2',
        content: 'hello',
        author: { id: 'another-user' },
        channel: { id: 'channel-1' },
        embeds: [],
        components: []
    });

    assert.equal(captured, false);
    assert.deepEqual(state.messageDebugEntries, []);
});
