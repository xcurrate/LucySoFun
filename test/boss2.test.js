const test = require('node:test');
const assert = require('node:assert/strict');

const createBoss2Manager = require('../src/managers/boss2');
const { normalizeBoss2Settings, parseRaidMessage, parseTicketStatusMessage } = createBoss2Manager;

const ENDS_AT = Math.floor(Date.now() / 1000) + 600;
const NEXT_SPAWN = Math.floor(Date.now() / 1000) + 3600;

const appearComponents = ({ disabled = false } = {}) => [{
    type: 17,
    components: [
        { type: 10, content: '## <:lucy_think:1550898966130852032> Guild Boss Telah Muncul!' },
        { type: 14, spacing: 1, divider: true },
        { type: 10, content: `⏳ Berakhir <t:${ENDS_AT}:R>\n⚔ **0** fighter • ☠ **0** damage diberikan\n-# Fight kamu: 0/3 • Damage kamu: 0` },
        { type: 1, components: [{ type: 2, custom_id: 'raid:fight', label: 'Fight!', style: 4, disabled }] }
    ]
}];

const RESET_AT = NEXT_SPAWN + 7200;

// Shape of a real "Guild Boss Telah Dikalahkan!" message (note the ⌛ icon and the extra reset timestamp).
const defeatedComponents = () => [{
    type: 17,
    components: [
        { type: 10, content: '## <:lucy_yay:1550898994111058040> Guild Boss Telah Dikalahkan!' },
        { type: 14, spacing: 1, divider: true },
        { type: 10, content: '## 10 Damage Terbesar\n1. `94,448` - **@xruntr** `⚔️⚔️⚔️`' },
        { type: 14, spacing: 1, divider: true },
        { type: 10, content: `☠ Dikalahkan 7 menit yang lalu\n⚔ **8** fighter • ☠ **296,465** damage diberikan\n⌛ Boss baru <t:${NEXT_SPAWN}:R>\n-# Fight kamu: 3/3 • Damage kamu: 29,763\n-# Limit fight reset <t:${RESET_AT}:R> (reset daily jam 12 malam).` },
        { type: 1, components: [{ type: 2, custom_id: 'raid:fight', label: 'Fight!', style: 4, disabled: true }] }
    ]
}];

function setup(settings = {}) {
    const state = { config: { settings: { boss2: { enabled: true, delayMinMs: 0, delayMaxMs: 0, ...settings } } } };
    const manager = createBoss2Manager(state, { getBoss2Settings: () => normalizeBoss2Settings(state.config.settings.boss2) });
    return { state, manager };
}

function createMessage(components, overrides = {}) {
    const clicks = [];
    const msg = {
        id: 'raid-msg-1',
        guildId: 'guild-1',
        channel: { id: 'channel-1' },
        author: { id: 'boss-bot' },
        content: '',
        embeds: [],
        components,
        clickButton: async (id) => { clicks.push(id); },
        ...overrides
    };
    return { msg, clicks };
}

test('normalizeBoss2Settings fills defaults and clamps values', () => {
    const settings = normalizeBoss2Settings({ enabled: true, allowedGuilds: 'a, b', fightsPerBoss: '9', delayMinMs: '500', delayMaxMs: '100' });
    assert.equal(settings.enabled, true);
    assert.deepEqual(settings.allowedGuilds, ['a', 'b']);
    assert.equal(settings.buttonId, 'raid:fight');
    assert.equal(settings.appearText, 'Guild Boss Telah Muncul');
    assert.equal(settings.fightsPerBoss, 3);
    assert.equal(settings.delayMaxMs, 500);
    assert.equal(normalizeBoss2Settings(undefined).enabled, false);
});

test('parseRaidMessage reads appear trigger, active button, end timestamp and fight count', () => {
    const info = parseRaidMessage({ content: '', embeds: [], components: appearComponents() }, normalizeBoss2Settings({}));
    assert.equal(info.isAppear, true);
    assert.equal(info.isDefeated, false);
    assert.equal(info.buttonActive, true);
    assert.equal(info.endsAt, ENDS_AT * 1000);
    assert.equal(info.nextSpawnAt, null);
    assert.equal(info.fightsUsed, 0);
    assert.equal(info.fightsMax, 3);
});

test('parseRaidMessage reads the real defeat message: next boss time, not the daily reset time', () => {
    const info = parseRaidMessage({ content: '', embeds: [], components: defeatedComponents() }, normalizeBoss2Settings({}));
    assert.equal(info.isAppear, false);
    assert.equal(info.isDefeated, true);
    assert.equal(info.buttonActive, false);
    assert.equal(info.nextSpawnAt, NEXT_SPAWN * 1000);
    assert.equal(info.endsAt, null);
    assert.equal(info.fightsUsed, 3);
});

test('Auto Boss2 defaults to 3 fights per boss with a 1 second delay', () => {
    const settings = normalizeBoss2Settings({});
    assert.equal(settings.fightsPerBoss, 3);
    assert.equal(settings.delayMinMs, 1000);
    assert.equal(settings.delayMaxMs, 1000);
});

test('Auto Boss2 fights when the boss appears and records the end time', async () => {
    const { manager, state } = setup();
    const { msg, clicks } = createMessage(appearComponents());

    assert.equal(await manager.handle(msg), 'fought');
    assert.deepEqual(clicks, ['raid:fight', 'raid:fight', 'raid:fight']);
    const raid = manager.getRaidState('guild-1');
    assert.equal(raid.status, 'active');
    assert.equal(raid.endsAt, ENDS_AT * 1000);

    await manager.handle(msg);
    assert.equal(clicks.length, 3);
    manager.stop();
    assert.equal(state.boss2Timers.size, 0);
});

test('Auto Boss2 uses the configured number of fights per boss', async () => {
    const { manager } = setup({ fightsPerBoss: 1 });
    const { msg, clicks } = createMessage(appearComponents());
    await manager.handle(msg);
    assert.equal(clicks.length, 1);
    manager.stop();
});

test('Auto Boss2 stops on defeat and records the next boss timestamp', async () => {
    const { manager } = setup();
    const appear = createMessage(appearComponents());
    await manager.handle(appear.msg);

    const defeated = createMessage(defeatedComponents());
    assert.equal(await manager.handle(defeated.msg), 'ended');
    assert.deepEqual(defeated.clicks, []);
    const raid = manager.getRaidState('guild-1');
    assert.equal(raid.status, 'ended');
    assert.equal(raid.nextSpawnAt, NEXT_SPAWN * 1000);

    const nextAppear = createMessage(appearComponents(), { id: 'raid-msg-2' });
    assert.equal(await manager.handle(nextAppear.msg), 'fought');
    assert.equal(nextAppear.clicks.length, 3);
    assert.equal(manager.getRaidState('guild-1').nextSpawnAt, null);
    manager.stop();
});

test('Auto Boss2 does not fight when disabled, filtered out, or button is disabled', async () => {
    const disabled = setup({ enabled: false });
    const a = createMessage(appearComponents());
    assert.equal(await disabled.manager.handle(a.msg), null);

    const filtered = setup({ botIds: ['other-bot'] });
    const b = createMessage(appearComponents());
    assert.equal(await filtered.manager.handle(b.msg), null);

    const enabled = setup();
    const c = createMessage(appearComponents({ disabled: true }));
    assert.equal(await enabled.manager.handle(c.msg), 'ended');

    assert.deepEqual([...a.clicks, ...b.clicks, ...c.clicks], []);
});


test('parseRaidMessage distinguishes Global Raid Boss and preserves its own lifecycle metadata', () => {
    const components = [{
        type: 17,
        components: [
            { type: 10, content: '## Global Raid Boss Telah Muncul!' },
            { type: 10, content: '⏳ Berakhir <t:' + ENDS_AT + ':R>\n⚔ **0** fighter\n-# Fight kamu: 2/3' },
            { type: 1, components: [{ type: 2, custom_id: 'raid:fight', disabled: false }] }
        ]
    }];
    const info = parseRaidMessage({ content: '', embeds: [], components }, normalizeBoss2Settings({}));
    assert.equal(info.kind, 'global');
    assert.equal(info.isGlobalAppear, true);
    assert.equal(info.isGuildAppear, false);
    assert.equal(info.buttonActive, true);
    assert.equal(info.endsAt, ENDS_AT * 1000);
    assert.equal(info.fightsUsed, 2);
    assert.equal(info.fightsMax, 3);
});

test('parseTicketStatusMessage reads Guild and Global ticket balances independently', () => {
    const status = parseTicketStatusMessage({
        content: '',
        components: [{
            type: 17,
            components: [
                { type: 10, content: '## 🎟 Ticket Boss Guild' },
                { type: 10, content: '**nnneozen**, kamu punya **2**/**3** boss ticket!\n-# Diisi ulang <t:1793638800:R>' },
                { type: 14, divider: true },
                { type: 10, content: '## 🎟 Ticket Boss Global' },
                { type: 10, content: '**nnneozen**, kamu punya **1**/**3** boss ticket!\n-# Diisi ulang <t:1793638800:R>' }
            ]
        }]
    });
    assert.equal(status.guild.left, 2);
    assert.equal(status.guild.max, 3);
    assert.equal(status.global.left, 1);
    assert.equal(status.global.max, 3);
});

test('Boss2 keeps Guild and Global boss state separate inside the same guild', async () => {
    const { manager } = setup();
    const guildDefeated = createMessage([{
        type: 17,
        components: [
            { type: 10, content: '## Guild Boss Telah Dikalahkan!' },
            { type: 1, components: [{ type: 2, custom_id: 'raid:fight', disabled: true }] }
        ]
    }], { author: { id: '1438615298012872817' } });
    const globalDefeated = createMessage([{
        type: 17,
        components: [
            { type: 10, content: '## Global Raid Boss Telah Dikalahkan!' },
            { type: 1, components: [{ type: 2, custom_id: 'raid:fight', disabled: true }] }
        ]
    }], { id: 'global-defeated', author: { id: '1438615298012872817' } });

    assert.equal(await manager.handle(guildDefeated.msg), 'ended');
    assert.equal(await manager.handle(globalDefeated.msg), 'ended');
    assert.equal(manager.getRaidState('guild-1', 'guild').status, 'ended');
    assert.equal(manager.getRaidState('guild-1', 'global').status, 'ended');
    assert.notEqual(manager.getRaidState('guild-1', 'guild'), manager.getRaidState('guild-1', 'global'));
    manager.stop();
});
