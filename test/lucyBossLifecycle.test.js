const test = require('node:test');
const assert = require('node:assert/strict');

const createManager = require('../src/managers/lucyBossLifecycle');
const { parseLucyBossMessage, parseTicket } = createManager;

const LUCY_ID = '1438615298012872817';

const bossMessage = (kind, overrides = {}) => ({
    id: kind + '-message',
    guildId: 'guild-1',
    channel: { id: 'channel-1' },
    author: { id: LUCY_ID },
    content: '',
    embeds: [],
    components: [{
        type: 17,
        components: [
            { type: 10, content: kind === 'guild' ? '## Guild Boss Telah Muncul!' : '## Global Raid Boss Telah Muncul!' },
            { type: 10, content: '⏳ Berakhir <t:1999999999:R>' },
            { type: 1, components: [{ type: 2, custom_id: 'raid:fight', disabled: false }] }
        ]
    }],
    clicks: [],
    clickButton: async function(id) { this.clicks.push(id); },
    ...overrides
});

const ticketMessage = (overrides = {}) => ({
    id: 'ticket-prompt',
    guildId: 'guild-1',
    channel: { id: 'channel-1' },
    author: { id: LUCY_ID },
    content: 'Kamu punya **3** / **5** ticket.',
    components: [{
        type: 17,
        components: [{
            type: 1,
            components: [
                { type: 2, custom_id: 'raid:ticket:yes', disabled: false },
                { type: 2, custom_id: 'raid:ticket:no', disabled: false }
            ]
        }]
    }],
    clicks: [],
    clickButton: async function(id) { this.clicks.push(id); },
    ...overrides
});

function setup() {
    const state = {};
    const settings = {
        guild: { enabled: true, fightsPerBoss: 3 },
        global: { enabled: true, fightsPerBoss: 3 }
    };
    const manager = createManager(state, {
        getLucyBossLifecycleSettings: kind => settings[kind]
    });
    manager.setRunning(true);
    return { manager, settings };
}

test('parses nested Discord type 17/10/2 components without message content or embeds', () => {
    const parsed = parseLucyBossMessage(bossMessage('global'));
    assert.equal(parsed.isGlobalAppear, true);
    assert.equal(parsed.isGuildAppear, false);
    assert.equal(parsed.buttonActive, true);
    assert.equal(parsed.endsAt, 1999999999000);
});

test('keeps Guild Boss and Global Raid Boss lifecycle state independent', async () => {
    const { manager } = setup();
    const guild = bossMessage('guild');
    const global = bossMessage('global', { id: 'global-message' });

    assert.equal(await manager.handle(guild), 'appear');
    assert.equal(await manager.handle(global), 'appear');
    assert.equal(manager.getRaidState('guild', 'guild-1').status, 'active');
    assert.equal(manager.getRaidState('global', 'guild-1').status, 'active');
    assert.notEqual(manager.getRaidState('guild', 'guild-1'), manager.getRaidState('global', 'guild-1'));
    assert.deepEqual(guild.clicks, ['raid:fight']);
    assert.deepEqual(global.clicks, ['raid:fight']);
    manager.stop();
});

test('ticket confirmation is associated with the prior pending boss context', async () => {
    const { manager } = setup();
    const global = bossMessage('global');
    await manager.handle(global);

    const prompt = ticketMessage();
    assert.equal(parseTicket(prompt).ticketLeft, 3);
    assert.equal(await manager.handle(prompt), 'ticket-accepted');
    assert.deepEqual(prompt.clicks, ['raid:ticket:yes']);
    assert.equal(manager.getRaidState('global', 'guild-1').fightsDone, 1);
    manager.stop();
});

test('Global Raid Boss defeat ends immediately and clears its old expiry context', async () => {
    const { manager } = setup();
    const global = bossMessage('global');
    await manager.handle(global);
    const oldEndsAt = manager.getRaidState('global', 'guild-1').endsAt;
    assert.ok(oldEndsAt);

    const defeated = bossMessage('global', {
        id: 'global-defeated',
        components: [{ type: 17, components: [{ type: 10, content: 'Global Raid Boss Telah Dikalahkan!' }] }]
    });
    assert.equal(await manager.handle(defeated), 'defeated');
    const raid = manager.getRaidState('global', 'guild-1');
    assert.equal(raid.status, 'defeated');
    assert.equal(raid.endsAt, null);
    assert.equal(raid.expiryTimer, null);
    manager.stop();
});

test('Guild Boss escape ends only the Guild Boss lifecycle', async () => {
    const { manager } = setup();
    await manager.handle(bossMessage('guild'));
    await manager.handle(bossMessage('global', { id: 'global-message' }));

    const escaped = bossMessage('guild', {
        id: 'guild-escaped',
        components: [{ type: 17, components: [{ type: 10, content: 'GUILD BOSS KABUR!' }] }]
    });
    assert.equal(await manager.handle(escaped), 'escaped');
    assert.equal(manager.getRaidState('guild', 'guild-1').status, 'escaped');
    assert.equal(manager.getRaidState('global', 'guild-1').status, 'active');
    manager.stop();
});

test('duplicate boss message does not trigger a second fight click', async () => {
    const { manager } = setup();
    const msg = bossMessage('guild');
    await manager.handle(msg);
    assert.equal(await manager.handle(msg), 'duplicate');
    assert.deepEqual(msg.clicks, ['raid:fight']);
    manager.stop();
});
