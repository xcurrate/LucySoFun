const CONSTANTS = require('../constants');
const log = require('../../logger');
const { removeInvisibleChars, accountPrefix } = require('../utils');

const TEXT_KEYS = new Set(['content', 'title', 'description', 'name', 'value', 'label', 'text']);
const MAX_TIMER_MS = 2147483647;

const toPlain = value => {
    if (!value) return null;
    try {
        if (typeof value.toJSON === 'function') return value.toJSON();
        return JSON.parse(JSON.stringify(value));
    } catch { return null; }
};

const collectTexts = (node, out = []) => {
    if (!node || typeof node !== 'object') return out;
    for (const [key, value] of Object.entries(node)) {
        if (typeof value === 'string' && TEXT_KEYS.has(key)) out.push(value);
        else if (value && typeof value === 'object') collectTexts(value, out);
    }
    return out;
};

const findButton = (node, customId) => {
    if (!node || typeof node !== 'object') return null;
    if ((node.custom_id || node.customId) === customId) return node;
    for (const child of Array.isArray(node) ? node : Object.values(node)) {
        const found = findButton(child, customId);
        if (found) return found;
    }
    return null;
};

const parseTimestamp = (text, label) => {
    const match = text.match(new RegExp(label + '\\s*<t:(\\d+)(?::[a-z])?>', 'i'));
    return match ? Number(match[1]) * 1000 : null;
};

const parseLucyBossMessage = msg => {
    const components = toPlain(msg.components) || [];
    const embeds = toPlain(msg.embeds) || [];
    const text = removeInvisibleChars([msg.content || '', ...collectTexts(embeds), ...collectTexts(components)].join('\n'));
    const lower = text.toLowerCase();
    const button = findButton(components, 'raid:fight');
    return {
        text,
        isGuildAppear: lower.includes('guild boss telah muncul'),
        isGuildDefeated: lower.includes('guild boss telah dikalahkan'),
        isGuildEscaped: lower.includes('guild boss kabur'),
        isGlobalAppear: lower.includes('global raid boss telah muncul'),
        isGlobalDefeated: lower.includes('global raid boss telah dikalahkan'),
        isGlobalEscaped: lower.includes('global raid boss kabur'),
        button,
        buttonActive: !!button && button.disabled !== true,
        endsAt: parseTimestamp(text, 'berakhir')
    };
};

const parseTicket = msg => {
    const components = toPlain(msg.components) || [];
    const yes = findButton(components, 'raid:ticket:yes');
    const no = findButton(components, 'raid:ticket:no');
    if (!yes && !no) return null;
    const text = removeInvisibleChars([msg.content || '', ...collectTexts(components)].join('\n'));
    const ticket = text.match(/punya\s*\*{0,2}(\d+)\*{0,2}\s*\/\s*\*{0,2}(\d+)\*{0,2}\s*ticket/i);
    return {
        yesActive: !!yes && yes.disabled !== true,
        noActive: !!no && no.disabled !== true,
        ticketLeft: ticket ? Number(ticket[1]) : null,
        alreadyFought: /sudah melawan boss ini/i.test(text),
        text
    };
};

const normalizeSettings = raw => ({
    enabled: raw?.enabled === true,
    allowedGuilds: (Array.isArray(raw?.allowedGuilds) ? raw.allowedGuilds : String(raw?.allowedGuilds || '').split(',')).map(String).map(x => x.trim()).filter(Boolean),
    channelIds: (Array.isArray(raw?.channelIds) ? raw.channelIds : String(raw?.channelIds || '').split(',')).map(String).map(x => x.trim()).filter(Boolean),
    fightsPerBoss: Math.max(1, Math.min(20, Number.parseInt(raw?.fightsPerBoss, 10) || 3))
});

const createLucyBossLifecycleManager = (state, configManager) => {
    const kinds = ['guild', 'global'];
    const raids = { guild: new Map(), global: new Map() };
    const timers = { guild: new Set(), global: new Set() };
    const pendingTickets = [];
    let runtimeEnabled = false;

    const prefix = kind => `${accountPrefix(state)}${kind === 'guild' ? '👑 Guild Boss' : '🌐 Global Raid Boss'}: `;
    const settingsFor = kind => normalizeSettings(configManager.getLucyBossLifecycleSettings(kind));
    const keyFor = msg => String(msg.guildId || msg.guild?.id || msg.channel?.id || 'dm');
    const getRaid = (kind, key) => {
        if (!raids[kind].has(key)) raids[kind].set(key, {
            status: 'idle', fightsDone: 0, channelId: null, endsAt: null,
            expiryTimer: null, nextFightTimer: null, pending: false, lastHandledMessage: null,
            lastMessage: null, lastInfo: null
        });
        return raids[kind].get(key);
    };
    const clearTimer = (kind, raid) => {
        if (raid.expiryTimer) {
            clearTimeout(raid.expiryTimer);
            timers[kind].delete(raid.expiryTimer);
            raid.expiryTimer = null;
        }
    };
    const endRaid = (kind, raid, reason) => {
        clearTimer(kind, raid);
        if (raid.nextFightTimer) { clearTimeout(raid.nextFightTimer); timers[kind].delete(raid.nextFightTimer); raid.nextFightTimer = null; }
        raid.status = reason;
        raid.pending = false;
        raid.endsAt = null;
        raid.lastMessage = null;
        raid.lastInfo = null;
        for (let i = pendingTickets.length - 1; i >= 0; i--) {
            if (pendingTickets[i].raid === raid) pendingTickets.splice(i, 1);
        }
        log.info(`${prefix(kind)}Lifecycle berakhir: ${reason}.`);
    };
    const scheduleExpiry = (kind, raid, endsAt) => {
        clearTimer(kind, raid);
        if (!Number.isFinite(endsAt) || endsAt <= Date.now()) return;
        const expire = () => {
            timers[kind].delete(raid.expiryTimer);
            raid.expiryTimer = null;
            if (raid.status !== 'active' || raid.endsAt !== endsAt) return;
            if (Date.now() < endsAt) {
                scheduleExpiry(kind, raid, endsAt);
                return;
            }
            endRaid(kind, raid, 'expired');
        };
        raid.expiryTimer = setTimeout(expire, Math.min(MAX_TIMER_MS, endsAt - Date.now()));
        timers[kind].add(raid.expiryTimer);
    };

    const allowed = (msg, settings) => {
        if (String(msg.author?.id || '') !== CONSTANTS.LUCY_BOT_ID) return false;
        if (state.client?.user?.id && String(msg.author?.id) === String(state.client.user.id)) return false;
        if (settings.allowedGuilds.length && !settings.allowedGuilds.includes(String(msg.guildId || msg.guild?.id || ''))) return false;
        if (settings.channelIds.length && !settings.channelIds.includes(String(msg.channel?.id || msg.channelId || ''))) return false;
        return true;
    };

    const startFight = async (kind, key, raid, msg, info, settings) => {
        if (raid.status !== 'active' || raid.pending || raid.nextFightTimer || raid.fightsDone >= settings.fightsPerBoss) return;
        raid.pending = true;
        raid.lastMessage = msg;
        raid.lastInfo = info;
        raid.channelId = msg.channel?.id || msg.channelId || raid.channelId;
        pendingTickets.push({ kind, key, raid });
        try {
            await msg.clickButton(info.button.custom_id || info.button.customId);
            log.info(`${prefix(kind)}Klik Fight (${raid.fightsDone + 1}/${settings.fightsPerBoss}).`);
        } catch (error) {
            raid.pending = false;
            const index = pendingTickets.findIndex(item => item.raid === raid);
            if (index >= 0) pendingTickets.splice(index, 1);
            log.error(`${prefix(kind)}Gagal klik Fight: ${error.message || error}`);
        }
    };

    const handleTicket = async (msg, ticket) => {
        if (String(msg.author?.id || '') !== CONSTANTS.LUCY_BOT_ID) return null;
        const channelId = String(msg.channel?.id || msg.channelId || '');
        const contextualKind = /global raid boss/i.test(ticket.text) ? 'global'
            : /guild boss/i.test(ticket.text) ? 'guild' : null;
        let index = pendingTickets.findIndex(item =>
            (!contextualKind || item.kind === contextualKind) &&
            (!channelId || !item.raid.channelId || item.raid.channelId === channelId) &&
            item.raid.status === 'active' && item.raid.pending
        );
        if (index < 0) return null;
        const context = pendingTickets.splice(index, 1)[0];
        const { kind, raid } = context;
        const settings = settingsFor(kind);
        if (!settings.enabled) { raid.pending = false; return 'ticket-disabled'; }
        const accept = !ticket.alreadyFought && ticket.ticketLeft !== 0 &&
            raid.fightsDone < settings.fightsPerBoss && ticket.yesActive;
        const buttonId = accept ? 'raid:ticket:yes' : 'raid:ticket:no';
        try {
            if (accept || ticket.noActive) await msg.clickButton(buttonId);
        } catch (error) {
            log.error(`${prefix(kind)}Gagal memproses konfirmasi ticket: ${error.message || error}`);
            raid.pending = false;
            return 'ticket-error';
        }
        raid.pending = false;
        if (accept) {
            raid.fightsDone += 1;
            log.success(`${prefix(kind)}Ticket diterima (${raid.fightsDone}/${settings.fightsPerBoss}).`);
            if (raid.fightsDone < settings.fightsPerBoss && raid.status === 'active' && raid.lastMessage && raid.lastInfo?.buttonActive) {
                raid.nextFightTimer = setTimeout(() => {
                    timers[kind].delete(raid.nextFightTimer);
                    raid.nextFightTimer = null;
                    startFight(kind, context.key, raid, raid.lastMessage, raid.lastInfo, settings).catch(error =>
                        log.error(`${prefix(kind)}Gagal melanjutkan fight: ${error.message || error}`));
                }, 1000);
                timers[kind].add(raid.nextFightTimer);
            }
            return 'ticket-accepted';
        }
        log.info(`${prefix(kind)}Ticket ditolak; menunggu lifecycle boss berikutnya.`);
        return 'ticket-rejected';
    };

    return {
        handle: async msg => {
            if (!runtimeEnabled) return null;
            const ticket = parseTicket(msg);
            if (ticket) return handleTicket(msg, ticket);

            const info = parseLucyBossMessage(msg);
            for (const kind of kinds) {
                const settings = settingsFor(kind);
                if (!settings.enabled || !allowed(msg, settings)) continue;
                const isAppear = kind === 'guild' ? info.isGuildAppear : info.isGlobalAppear;
                const isDefeated = kind === 'guild' ? info.isGuildDefeated : info.isGlobalDefeated;
                const isEscaped = kind === 'guild' ? info.isGuildEscaped : info.isGlobalEscaped;
                if (!isAppear && !isDefeated && !isEscaped) continue;

                const key = keyFor(msg);
                const raid = getRaid(kind, key);
                if (isDefeated || isEscaped) {
                    endRaid(kind, raid, isDefeated ? 'defeated' : 'escaped');
                    return isDefeated ? 'defeated' : 'escaped';
                }
                if (isAppear && info.buttonActive) {
                    if (raid.status !== 'active') {
                        clearTimer(kind, raid);
                        Object.assign(raid, {
                            status: 'active', fightsDone: 0, pending: false,
                            channelId: msg.channel?.id || msg.channelId || null,
                            endsAt: info.endsAt || null, lastHandledMessage: null,
                            lastMessage: msg, lastInfo: info
                        });
                        if (info.endsAt) scheduleExpiry(kind, raid, info.endsAt);
                        log.success(`${prefix(kind)}Boss muncul.`);
                    }
                    if (raid.lastHandledMessage === msg.id) return 'duplicate';
                    raid.lastHandledMessage = msg.id || null;
                    await startFight(kind, key, raid, msg, info, settings);
                    return 'appear';
                }
            }
            return null;
        },
        getRaidState(kind, key) { return raids[kind]?.get(String(key)) || null; },
        setRunning(enabled) {
            runtimeEnabled = enabled === true;
            if (!runtimeEnabled) this.stop();
        },
        stop() {
            for (const kind of kinds) {
                for (const raid of raids[kind].values()) {
                    clearTimer(kind, raid);
                    if (raid.nextFightTimer) clearTimeout(raid.nextFightTimer);
                    raid.nextFightTimer = null;
                    raid.pending = false;
                }
                timers[kind].clear();
            }
            pendingTickets.length = 0;
        }
    };
};

module.exports = createLucyBossLifecycleManager;
module.exports.parseLucyBossMessage = parseLucyBossMessage;
module.exports.parseTicket = parseTicket;
module.exports.normalizeSettings = normalizeSettings;
