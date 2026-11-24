const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const createBoss2Manager = require('../src/managers/boss2');
const {
    normalizeBoss2Settings,
    parseRaidMessage,
    parseTicketConfirmation,
    parseTicketStatusMessage,
    findRewardImage,
    evaluateRewardGate
} = createBoss2Manager;

const ENDS_AT = Math.floor(Date.now() / 1000) + 600;
const NEXT_SPAWN = Math.floor(Date.now() / 1000) + 3600;
const LUCY_ID = '1438615298012872817';

const appearComponents = ({ disabled = false } = {}) => [{
    type: 17,
    components: [
        { type: 10, content: '## <:lucy_think:1550898966130852032> Guild Boss Telah Muncul!' },
        { type: 14, spacing: 1, divider: true },
        { type: 10, content: `⏳ Berakhir <t:${ENDS_AT}:R>\n⚔ **0** fighter • ☠ **0** damage diberikan\n-# Fight kamu: 0/3 • Damage kamu: 0` },
        { type: 1, components: [{ type: 2, custom_id: 'raid:fight', label: 'Fight!', style: 4, disabled }] }
    ]
}];

const globalAppearComponents = ({ disabled = false, fightsUsed = 0 } = {}) => [{
    type: 17,
    components: [
        { type: 10, content: '## <:lucy_think:1550898966130852032> Global Raid Boss Telah Muncul!' },
        { type: 14, spacing: 1, divider: true },
        { type: 10, content: `⏳ Berakhir <t:${ENDS_AT}:R>\n⚔ **26** fighter • ☠ **541,809** damage diberikan\n-# Fight kamu: ${fightsUsed}/3 • Damage kamu: 14,139` },
        { type: 1, components: [{ type: 2, custom_id: 'raid:fight', label: 'Fight!', style: 4, disabled }] }
    ]
}];

const globalEndedComponents = (text) => [{
    type: 17,
    components: [
        { type: 10, content: `## <:lucy_yay:1550898994111058040> ${text}` },
        { type: 14, spacing: 1, divider: true },
        { type: 10, content: '-# <:skull_dim:1> Dikalahkan 18 jam yang lalu • <:fighter_dim:1> **20** fighter • <:skull_dim:1> **467,464** total damage' },
        { type: 1, components: [{ type: 2, custom_id: 'raid:fight', label: 'Fight!', style: 3, disabled: true }] }
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

function setup(settings = {}, deps = {}) {
    const state = {
        config: { settings: { boss2: { enabled: true, delayMinMs: 0, delayMaxMs: 0, ...settings } } },
        client: { user: { id: 'self-account' } }
    };
    const manager = createBoss2Manager(state, {
        getBoss2Settings: () => normalizeBoss2Settings(state.config.settings.boss2)
    }, deps);
    return { state, manager };
}

const REWARD_URL = 'https://cdn.discordapp.com/attachments/1/2/rewards.png';
const REWARD_FIXTURE = 'boss-reward-1.png';

const rewardGate = (targets = {}) => ({
    rewardGate: {
        enabled: true,
        targetMode: 'any',
        targets: {
            weaponShards: 0,
            weaponCrate: 0,
            bossCrate: 0,
            fabledLootbox: 0,
            experience: 0,
            ...targets
        }
    }
});

// Hanya I/O gambar yang diganti; OCR dan evaluasi target memakai kode nyata.
const rewardImageDeps = (fixture = REWARD_FIXTURE) => ({
    downloadImage: async () => fs.readFileSync(path.join(__dirname, 'fixtures', fixture))
});

function rewardComponents({ url = REWARD_URL, disabled = false } = {}) {
    const components = appearComponents({ disabled });
    components[0].components.splice(
        3,
        0,
        { type: 10, content: '## Hadiah' },
        { type: 12, items: [{ media: { url } }] }
    );
    return components;
}

function createMessage(components, overrides = {}) {
    const clicks = [];
    const msg = {
        id: 'raid-msg-1',
        guildId: 'guild-1',
        channel: { id: 'channel-1' },
        author: { id: LUCY_ID },
        content: '',
        embeds: [],
        components,
        clickButton: async (id) => { clicks.push(id); },
        ...overrides
    };
    return { msg, clicks };
}

test('normalizeBoss2Settings fills defaults and clamps values', () => {
    const settings = normalizeBoss2Settings({ enabled: true, channelIds: 'a, b', fightsPerBoss: '9', delayMinMs: '500', delayMaxMs: '100' });
    assert.equal(settings.enabled, true);
    assert.deepEqual(settings.channelIds, ['a', 'b']);
    assert.equal(settings.allowedGuilds, undefined);
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

test('Auto Boss2 fights when the boss appears and stops after the configured fights', async () => {
    const { manager, state } = setup();
    const { msg, clicks } = createMessage(appearComponents());

    assert.equal(await manager.handle(msg), 'fought');
    assert.deepEqual(clicks, ['raid:fight', 'raid:fight', 'raid:fight']);
    const raid = manager.getRaidState('guild-1');
    assert.equal(raid.status, 'active');

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
    // Boss baru yang di-post ulang sebelum jam spawn di-skip (gate timestamp).
    assert.equal(await manager.handle(nextAppear.msg), 'premature-skip');
    assert.equal(nextAppear.clicks.length, 0);
    manager.stop();
});

test('Auto Boss2 does not fight when disabled, filtered out, or button is disabled', async () => {
    const disabled = setup({ enabled: false });
    const a = createMessage(appearComponents());
    assert.equal(await disabled.manager.handle(a.msg), null);

    const filtered = setup({ channelIds: ['other-channel'] });
    const b = createMessage(appearComponents());
    assert.equal(await filtered.manager.handle(b.msg), null);

    const enabled = setup();
    const c = createMessage(appearComponents({ disabled: true }));
    assert.equal(await enabled.manager.handle(c.msg), 'ended');

    assert.deepEqual([...a.clicks, ...b.clicks, ...c.clicks], []);
});


test('parseRaidMessage detects Global Raid Boss messages', () => {
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
    assert.equal(info.isAppear, true);
    assert.equal(info.isDefeated, false);
    assert.equal(info.nextSpawnAt, null);
});

test('parseTicketStatusMessage reads both Guild and Global ticket balances', () => {
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
    assert.deepEqual({ left: status.guild.left, max: status.guild.max }, { left: 2, max: 3 });
    assert.deepEqual({ left: status.global.left, max: status.global.max }, { left: 1, max: 3 });
});

test('Boss2 ignores Global Boss when globalEnabled is false', async () => {
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
    assert.equal(await manager.handle(globalDefeated.msg), null);
    assert.equal(manager.getRaidState('guild-1', 'guild').status, 'ended');
    assert.equal(manager.getRaidState('guild-1', 'global'), null);
    manager.stop();
});

// Menjalankan satu siklus Fight sampai tiket diputuskan. Saldo `guildLeft`/
// `globalLeft` hanya dipakai sebagai fallback channel privat; prompt ephemeral
// selalu diprioritaskan.
async function runTicketScenario({
    guildLeft, globalLeft, fightsPerBoss = 1, repeatPrompt = false, ticketText,
    fightsDoneBeforePrompt = 0, kind = 'guild', globalEnabled = kind === 'global',
    globalChannelIds = []
} = {}) {
    const state = {
        config: {
            settings: {
                boss2: {
                    enabled: true, delayMinMs: 0, delayMaxMs: 0,
                    fightsPerBoss, minTicketLeft: 1, ticketStatusChannelId: 'private-1',
                    globalEnabled, globalChannelIds
                }
            }
        },
        client: { user: { id: 'self-account' } }
    };
    const manager = createBoss2Manager(state, { getBoss2Settings: () => normalizeBoss2Settings(state.config.settings.boss2) });

    const privateSends = [];
    state.client.channels = {
        fetch: async () => ({
            id: 'private-1',
            send: async (cmd) => {
                privateSends.push(cmd);
                await manager.handle({
                    id: 'status-1', channel: { id: 'private-1' }, author: { id: LUCY_ID }, createdTimestamp: Date.now(),
                    components: [{
                        type: 17,
                        components: [
                            { type: 10, content: '## 🎟 Ticket Boss Guild' },
                            { type: 10, content: `**me**, kamu punya **${guildLeft}**/**3** boss ticket!` },
                            { type: 14, divider: true },
                            { type: 10, content: '## 🎟 Ticket Boss Global' },
                            { type: 10, content: `**me**, kamu punya **${globalLeft}**/**3** boss ticket!` }
                        ]
                    }]
                });
            }
        })
    };

    const fightClicks = [];
    const ticketClicks = [];
    const repeatText = '### <@me>, kamu sudah melawan boss ini!\n'
        + 'Yakin mau pakai 1 boss ticket lagi?\n'
        + 'Kamu cuma punya **2**/**3** ticket: <:bticket:1><:bticket:1><:bticket_transparent:2>';
    const promptText = ticketText ?? (repeatPrompt ? repeatText : '**me**, kamu punya **1**/**3** boss ticket!');
    let ticketSeq = 0;
    const appear = {
        id: kind === 'global' ? 'global-raid-msg-1' : 'raid-msg-1',
        guildId: 'guild-1',
        channel: { id: 'channel-1' },
        author: { id: LUCY_ID },
        components: kind === 'global' ? globalAppearComponents() : appearComponents(),
        clickButton: async (id) => {
            fightClicks.push(id);
            if (id !== 'raid:fight') return;
            ticketSeq += 1;
            const raid = manager.getRaidState('guild-1', kind);
            if (raid && fightsDoneBeforePrompt > 0) raid.fightsDone = fightsDoneBeforePrompt;
            await manager.handle({
                id: `ticket-${ticketSeq}`, guildId: 'guild-1', channel: { id: 'channel-1' }, author: { id: LUCY_ID },
                components: [{
                    type: 17,
                    components: [
                        { type: 10, content: promptText },
                        { type: 1, components: [
                            { type: 2, custom_id: 'raid:ticket:yes' },
                            { type: 2, custom_id: 'raid:ticket:no' }
                        ] }
                    ]
                }],
                clickButton: async (ticketId) => ticketClicks.push(ticketId)
            });
        }
    };

    await manager.handle(appear);
    manager.stop();
    return { fightClicks, ticketClicks, privateSends, manager };
}

test('Boss2 accepts the ticket from the ephemeral count without lboss t', async () => {
    const { privateSends, ticketClicks } = await runTicketScenario({
        guildLeft: 0, globalLeft: 0,
        ticketText: '**me**, kamu punya **2**/**3** boss ticket!'
    });
    assert.deepEqual(privateSends, [], 'Angka prompt harus dipakai tanpa lboss t');
    assert.ok(ticketClicks.includes('raid:ticket:yes'));
    assert.ok(!ticketClicks.includes('raid:ticket:no'));
});

test('Boss2 rejects the ticket from the ephemeral count without lboss t', async () => {
    const { privateSends, ticketClicks } = await runTicketScenario({
        guildLeft: 3, globalLeft: 3,
        ticketText: '**me**, kamu punya **0**/**3** boss ticket!'
    });
    assert.deepEqual(privateSends, [], 'Angka prompt 0/3 harus langsung menolak');
    assert.ok(ticketClicks.includes('raid:ticket:no'));
    assert.ok(!ticketClicks.includes('raid:ticket:yes'));
});

test('Boss2 falls back to the private Guild balance when the prompt has no count', async () => {
    const { privateSends, ticketClicks } = await runTicketScenario({
        guildLeft: 2, globalLeft: 0,
        ticketText: '**me**, kamu punya boss ticket!'
    });
    assert.deepEqual(privateSends, ['lboss t']);
    assert.ok(ticketClicks.includes('raid:ticket:yes'));
});

test('Boss2 fallback rejects when only the Global balance has tickets', async () => {
    const { privateSends, ticketClicks } = await runTicketScenario({
        guildLeft: 0, globalLeft: 2,
        ticketText: '**me**, kamu punya boss ticket!'
    });
    assert.deepEqual(privateSends, ['lboss t']);
    assert.ok(ticketClicks.includes('raid:ticket:no'));
    assert.ok(!ticketClicks.includes('raid:ticket:yes'));
});

test('parseTicketConfirmation marks the repeat-fight offer but not a hard stop', () => {
    const settings = normalizeBoss2Settings({});
    const message = (content) => ({
        components: [{
            type: 17,
            components: [
                { type: 10, content },
                { type: 1, components: [
                    { type: 2, custom_id: 'raid:ticket:yes' },
                    { type: 2, custom_id: 'raid:ticket:no' }
                ] }
            ]
        }]
    });

    const repeat = parseTicketConfirmation(message('kamu sudah melawan boss ini! Yakin mau pakai 1 boss ticket lagi?'), settings);
    assert.equal(repeat.isAlreadyFought, true);
    assert.equal(repeat.isRepeatConfirmation, true);

    const hardStop = parseTicketConfirmation(message('kamu sudah melawan boss ini! Kamu tidak bisa fight lagi.'), settings);
    assert.equal(hardStop.isAlreadyFought, true);
    assert.equal(hardStop.isRepeatConfirmation, false);
});

test('Boss2 uses the ephemeral count for a repeat-fight offer', async () => {
    const { privateSends, ticketClicks } = await runTicketScenario({
        guildLeft: 0, globalLeft: 0, fightsPerBoss: 2, repeatPrompt: true, fightsDoneBeforePrompt: 1
    });
    assert.deepEqual(privateSends, [], 'Prompt repeat berisi angka; lboss t tidak diperlukan');
    assert.ok(ticketClicks.includes('raid:ticket:yes'), 'Fight ulang harus diterima saat tiket cukup');
    assert.ok(!ticketClicks.includes('raid:ticket:no'));
});

test('Boss2 rejects a repeat-fight offer from the ephemeral count when target reached', async () => {
    const { privateSends, ticketClicks } = await runTicketScenario({
        guildLeft: 2, globalLeft: 0, fightsPerBoss: 1, repeatPrompt: true, fightsDoneBeforePrompt: 1
    });
    assert.deepEqual(privateSends, []);
    assert.ok(ticketClicks.includes('raid:ticket:no'), 'Target fight sudah tercapai → Nggak');
});

test('Boss2 falls back to the private balance for a repeat-fight offer without a count', async () => {
    const { privateSends, ticketClicks } = await runTicketScenario({
        guildLeft: 0, globalLeft: 2, fightsPerBoss: 2,
        ticketText: '### <@me>, kamu sudah melawan boss ini!\nYakin mau pakai 1 boss ticket lagi?\nKamu punya boss ticket.'
    });
    assert.deepEqual(privateSends, ['lboss t']);
    assert.ok(ticketClicks.includes('raid:ticket:no'));
    assert.ok(!ticketClicks.includes('raid:ticket:yes'));
});

test('Boss2 keeps the hard reject for an already-fought prompt without a repeat offer', async () => {
    const { privateSends, ticketClicks } = await runTicketScenario({
        guildLeft: 2, globalLeft: 0, fightsPerBoss: 2,
        ticketText: '### <@me>, kamu sudah melawan boss ini!\nKamu tidak bisa fight lagi.'
    });
    assert.deepEqual(privateSends, [], 'Hard stop tidak perlu cek channel privat');
    assert.deepEqual(ticketClicks, ['raid:ticket:no']);
});

test('Boss2 uses the ephemeral count for Global Boss without lboss t', async () => {
    const { privateSends, ticketClicks } = await runTicketScenario({
        kind: 'global', globalEnabled: true, guildLeft: 0, globalLeft: 0,
        ticketText: '**me**, kamu punya **2**/**3** boss ticket!'
    });
    assert.deepEqual(privateSends, []);
    assert.ok(ticketClicks.includes('raid:ticket:yes'));
});

test('Boss2 falls back to the Global private balance when prompt has no count', async () => {
    const { privateSends, ticketClicks } = await runTicketScenario({
        kind: 'global', globalEnabled: true, guildLeft: 3, globalLeft: 1,
        ticketText: '**me**, kamu punya boss ticket!'
    });
    assert.deepEqual(privateSends, ['lboss t']);
    assert.ok(ticketClicks.includes('raid:ticket:yes'));
});

test('Boss2 ignores Global Boss when globalEnabled is false', async () => {
    const { manager } = setup();
    const { msg } = createMessage(globalAppearComponents(), { id: 'global-disabled' });
    assert.equal(await manager.handle(msg), null);
    assert.equal(manager.getRaidState('guild-1', 'global'), null);
    manager.stop();
});

test('Boss2 accepts a new Global spawn after waiting-defeat', async () => {
    const state = {
        config: { settings: { boss2: { enabled: true, globalEnabled: true, delayMinMs: 0, delayMaxMs: 0, fightsPerBoss: 1 } } },
        client: { user: { id: 'self-account' } }
    };
    const manager = createBoss2Manager(state, { getBoss2Settings: () => normalizeBoss2Settings(state.config.settings.boss2) });
    const clickWithTicket = (left) => async (id) => {
        if (id !== 'raid:fight') return;
        await manager.handle({
            id: `ticket-${left}`, guildId: 'guild-1', channel: { id: 'channel-1' }, author: { id: LUCY_ID },
            components: [{ type: 17, components: [
                { type: 10, content: `**me**, kamu punya **${left}**/**3** boss ticket!` },
                { type: 1, components: [
                    { type: 2, custom_id: 'raid:ticket:yes' },
                    { type: 2, custom_id: 'raid:ticket:no' }
                ] }
            ] }],
            clickButton: async () => {}
        });
    };

    const first = createMessage(globalAppearComponents(), { id: 'global-1', clickButton: clickWithTicket(0) });
    await manager.handle(first.msg);
    assert.equal(manager.getRaidState('guild-1', 'global').status, 'waiting-defeat');

    const second = createMessage(globalAppearComponents(), { id: 'global-2', clickButton: clickWithTicket(1) });
    await manager.handle(second.msg);
    const raid = manager.getRaidState('guild-1', 'global');
    assert.equal(raid.messageId, 'global-2');
    assert.equal(raid.status, 'active');
    manager.stop();
});

test('parseRaidMessage uses hardcoded Guild/Global triggers even when custom text is wrong', () => {
    const settings = normalizeBoss2Settings({ appearText: 'Salah', defeatedText: 'Salah' });
    const parse = (components) => parseRaidMessage({ content: '', embeds: [], components }, settings);
    assert.equal(parse(appearComponents()).kind, 'guild');
    assert.equal(parse(appearComponents()).isAppear, true);
    assert.equal(parse(globalAppearComponents()).kind, 'global');
    assert.equal(parse(globalAppearComponents()).isAppear, true);
    assert.equal(parse(defeatedComponents()).isDefeated, true);
    assert.equal(parse(globalEndedComponents('Global Raid Boss Telah Dikalahkan!')).kind, 'global');
    assert.equal(parse(globalEndedComponents('Global Raid Boss Telah Dikalahkan!')).isDefeated, true);
    assert.equal(parse(globalEndedComponents('Global Raid Boss Kabur!')).isEscaped, true);
});

test('normalizeBoss2Settings fills reward gate defaults and clamps targets', () => {
    const defaults = normalizeBoss2Settings({});
    assert.deepEqual(defaults.rewardGate, {
        enabled: false,
        targetMode: 'any',
        targets: { weaponShards: 0, weaponCrate: 0, bossCrate: 0, fabledLootbox: 0, experience: 0 }
    });

    const gate = normalizeBoss2Settings({
        rewardGate: { enabled: true, targets: { weaponShards: '250', experience: -5 } }
    }).rewardGate;
    assert.equal(gate.enabled, true);
    assert.equal(gate.targetMode, 'any');
    assert.equal(gate.targets.weaponShards, 250);
    assert.equal(gate.targets.experience, 0);
});

test('findRewardImage only accepts the image after the Hadiah heading', () => {
    const raidImage = 'https://cdn.discordapp.com/attachments/1/2/raid.png';
    const message = {
        components: [{
            type: 17,
            components: [
                { type: 10, content: '## Guild Boss Telah Muncul!' },
                { type: 12, items: [{ media: { url: raidImage } }] },
                { type: 10, content: '## Hadiah' },
                { type: 12, items: [{ media: { url: REWARD_URL } }] }
            ]
        }]
    };
    assert.equal(findRewardImage(message), REWARD_URL);

    const withoutHeading = {
        components: [{ type: 17, components: [{ type: 12, items: [{ media: { url: REWARD_URL } }] }] }]
    };
    assert.equal(findRewardImage(withoutHeading), null);
});

test('findRewardImage falls back to a PNG attachment and rejects non-Discord URLs', () => {
    const withAttachment = { attachments: [{ url: REWARD_URL, contentType: 'image/png', name: 'rewards.png' }] };
    assert.equal(findRewardImage(withAttachment), REWARD_URL);
    assert.equal(findRewardImage({ attachments: [{ url: 'https://example.com/rewards.png', contentType: 'image/png' }] }), null);

    const bossArt = 'https://cdn.discordapp.com/attachments/1/2/raid.png';
    const mixed = {
        attachments: [
            { url: bossArt, contentType: 'image/png', name: 'raid.png' },
            { url: REWARD_URL, contentType: 'image/png', name: 'rewards.png' }
        ]
    };
    assert.equal(findRewardImage(mixed), REWARD_URL);
    assert.equal(findRewardImage({
        attachments: [
            { url: bossArt, contentType: 'image/png', name: 'raid.png' },
            { url: REWARD_URL, contentType: 'image/png', name: 'unknown.png' }
        ]
    }), null);
});

test('evaluateRewardGate uses ANY: one matched category is enough', () => {
    const settings = normalizeBoss2Settings(rewardGate({ weaponShards: 200, experience: 999999 }));
    const rewards = { weaponShards: 241, weaponCrate: 9, bossCrate: 7, fabledLootbox: 4, experience: 281092 };
    const met = evaluateRewardGate(rewards, settings);
    assert.equal(met.passed, true);
    assert.deepEqual(met.matched.map(([key]) => key), ['weaponShards']);

    const missed = evaluateRewardGate({ ...rewards, weaponShards: 199 }, settings);
    assert.equal(missed.passed, false);
    assert.equal(missed.reason, 'below-target');
});

test('Auto Boss2 fights when at least one reward target is met', async () => {
    const { manager } = setup(rewardGate({ weaponShards: 200, experience: 999999 }), rewardImageDeps());
    const { msg, clicks } = createMessage(rewardComponents());

    assert.equal(await manager.handle(msg), 'fought');
    assert.deepEqual(clicks, ['raid:fight', 'raid:fight', 'raid:fight']);
    manager.stop();
});

test('Auto Boss2 skips Fight when no reward target is met', async () => {
    const { manager } = setup(rewardGate({ weaponShards: 300, experience: 999999 }), rewardImageDeps());
    const { msg, clicks } = createMessage(rewardComponents());

    assert.equal(await manager.handle(msg), 'reward-skip');
    assert.deepEqual(clicks, []);
    const raid = manager.getRaidState('guild-1');
    assert.equal(raid.status, 'active');
    assert.equal(raid.fightsDone, 0);
    manager.stop();
});

test('Auto Boss2 skips Fight when the boss message has no reward image', async () => {
    let downloads = 0;
    const { manager } = setup(rewardGate({ weaponShards: 1 }), {
        downloadImage: async () => { downloads += 1; return Buffer.alloc(0); }
    });
    const { msg, clicks } = createMessage(appearComponents());

    assert.equal(await manager.handle(msg), 'reward-skip');
    assert.deepEqual(clicks, []);
    assert.equal(downloads, 0);
    manager.stop();
});

test('Auto Boss2 skips Fight when the reward image cannot be decoded', async () => {
    const { manager } = setup(rewardGate({ weaponShards: 1 }), {
        downloadImage: async () => Buffer.from('bukan png')
    });
    const { msg, clicks } = createMessage(rewardComponents());

    assert.equal(await manager.handle(msg), 'reward-skip');
    assert.deepEqual(clicks, []);
    manager.stop();
});

test('Auto Boss2 allows Fight when the reward gate is enabled but has no targets', async () => {
    let downloads = 0;
    const { manager } = setup(rewardGate(), {
        downloadImage: async () => { downloads += 1; return Buffer.alloc(0); }
    });
    const { msg, clicks } = createMessage(appearComponents());

    assert.equal(await manager.handle(msg), 'fought');
    assert.equal(clicks.length, 3);
    assert.equal(downloads, 0);
    manager.stop();
});

test('Auto Boss2 keeps its old Fight behavior when the reward gate is disabled', async () => {
    let downloads = 0;
    const { manager } = setup({}, {
        downloadImage: async () => { downloads += 1; return Buffer.alloc(0); }
    });
    const { msg, clicks } = createMessage(rewardComponents());

    assert.equal(await manager.handle(msg), 'fought');
    assert.deepEqual(clicks, ['raid:fight', 'raid:fight', 'raid:fight']);
    assert.equal(downloads, 0);
    manager.stop();
});

test('Auto Boss2 still tracks the defeated message after a reward skip', async () => {
    const { manager } = setup(rewardGate({ weaponShards: 300 }), rewardImageDeps());
    const appear = createMessage(rewardComponents());
    assert.equal(await manager.handle(appear.msg), 'reward-skip');

    const defeated = createMessage(defeatedComponents());
    assert.equal(await manager.handle(defeated.msg), 'ended');
    const raid = manager.getRaidState('guild-1');
    assert.equal(raid.status, 'ended');
    assert.equal(raid.nextSpawnAt, NEXT_SPAWN * 1000);
    manager.stop();
});

test('Auto Boss2 accepts a reward image attachment as the gate source', async () => {
    const { manager } = setup(rewardGate({ weaponShards: 200 }), rewardImageDeps());
    const { msg, clicks } = createMessage(appearComponents(), {
        attachments: [{ url: REWARD_URL, contentType: 'image/png', name: 'rewards.png' }]
    });

    assert.equal(await manager.handle(msg), 'fought');
    assert.equal(clicks.length, 3);
    manager.stop();
});
