const CONSTANTS = require('../constants');
const log = require('../../logger');
const { safeJsonStringify, removeInvisibleChars, accountPrefix, randomInt } = require('../utils');

const MAX_TIMER_MS = 2147483647;
const TEXT_KEYS = new Set(['content', 'title', 'description', 'name', 'value', 'label', 'text']);
const TICKET_LEFT_REGEX = /punya\s*\*{0,2}(\d+)\*{0,2}\s*\/\s*\*{0,2}(\d+)\*{0,2}\s*ticket/i;

const toIdList = (value) => (Array.isArray(value) ? value : String(value || '').split(','))
    .map(item => String(item).trim())
    .filter(Boolean);

const toNonNegativeInt = (value, fallback) => {
    const num = parseInt(value, 10);
    return Number.isFinite(num) && num >= 0 ? num : fallback;
};

const toText = (value, fallback) => {
    const text = typeof value === 'string' ? value.trim() : '';
    return text || fallback;
};

const normalizeBoss2Settings = (raw = {}) => {
    const defaults = CONSTANTS.BOSS2_DEFAULTS;
    const delayMinMs = toNonNegativeInt(raw.delayMinMs, defaults.delayMinMs);
    return {
        enabled: raw.enabled === true,
        allowedGuilds: toIdList(raw.allowedGuilds),
        channelIds: toIdList(raw.channelIds),
        appearText: toText(raw.appearText, defaults.appearText),
        defeatedText: toText(raw.defeatedText, defaults.defeatedText),
        buttonId: toText(raw.buttonId, defaults.buttonId),
        fightsPerBoss: Math.min(defaults.maxFightsPerBoss, Math.max(1, toNonNegativeInt(raw.fightsPerBoss, defaults.fightsPerBoss))),
        delayMinMs,
        delayMaxMs: Math.max(delayMinMs, toNonNegativeInt(raw.delayMaxMs, defaults.delayMaxMs)),
        ticketYesId: toText(raw.ticketYesId, defaults.ticketYesId || 'raid:ticket:yes'),
        ticketNoId:  toText(raw.ticketNoId,  defaults.ticketNoId  || 'raid:ticket:no'),
        limitText:   toText(raw.limitText,   defaults.limitText   || 'limit fight'),
        minTicketLeft: Math.max(0, toNonNegativeInt(raw.minTicketLeft, defaults.minTicketLeft ?? 1)),
        ticketStatusChannelId: String(raw.ticketStatusChannelId || defaults.ticketStatusChannelId || '').trim(),
        ticketStatusCommand: toText(raw.ticketStatusCommand, defaults.ticketStatusCommand || 'lboss t'),
        globalAppearText: toText(raw.globalAppearText, defaults.globalAppearText || 'Global Raid Boss Telah Muncul'),
        globalDefeatedText: toText(raw.globalDefeatedText, defaults.globalDefeatedText || 'Global Raid Boss Telah Dikalahkan')
    };
};

const toPlainData = (value) => {
    if (!value) return null;
    try { return JSON.parse(safeJsonStringify(value) || 'null'); } catch { return null; }
};

const findButton = (node, targetId) => {
    if (!node || typeof node !== 'object') return null;
    if ((node.custom_id || node.customId) === targetId) return node;
    for (const child of Array.isArray(node) ? node : Object.values(node)) {
        const found = findButton(child, targetId);
        if (found) return found;
    }
    return null;
};

const collectTexts = (node, texts = []) => {
    if (!node || typeof node !== 'object') return texts;
    for (const [key, value] of Object.entries(node)) {
        if (typeof value === 'string' && TEXT_KEYS.has(key)) texts.push(value);
        else if (value && typeof value === 'object') collectTexts(value, texts);
    }
    return texts;
};

const parseDiscordTimestamp = (text, label) => {
    const match = text.match(new RegExp(`${label}\\s*<t:(\\d+)(?::[a-zA-Z])?>`, 'i'));
    return match ? parseInt(match[1], 10) * 1000 : null;
};

const parseRaidMessage = (msg, settings) => {
    const components = toPlainData(msg.components) || [];
    const embeds = toPlainData(msg.embeds) || [];
    const text = removeInvisibleChars([msg.content || '', ...collectTexts(embeds), ...collectTexts(components)].join('\n'));
    const lowerText = text.toLowerCase();
    const button = findButton(components, settings.buttonId);

    const isGlobalAppear = lowerText.includes(settings.globalAppearText.toLowerCase());
    const isGlobalDefeated = lowerText.includes(settings.globalDefeatedText.toLowerCase());
    const isGuildAppear = !isGlobalAppear && lowerText.includes(settings.appearText.toLowerCase());
    const isGuildDefeated = !isGlobalDefeated && lowerText.includes(settings.defeatedText.toLowerCase());
    const isGlobalEscaped = lowerText.includes('global raid boss kabur');
    const isGuildEscaped = !isGlobalEscaped && lowerText.includes('guild boss kabur');
    const kind = isGlobalAppear || isGlobalDefeated || isGlobalEscaped ? 'global'
        : isGuildAppear || isGuildDefeated || isGuildEscaped ? 'guild' : null;
    return {
        kind,
        isGuildAppear, isGuildDefeated, isGuildEscaped,
        isGlobalAppear, isGlobalDefeated, isGlobalEscaped,
        isAppear: kind === 'global' ? isGlobalAppear : isGuildAppear,
        isDefeated: kind === 'global' ? isGlobalDefeated : isGuildDefeated,
        isEscaped: kind === 'global' ? isGlobalEscaped : isGuildEscaped,
        button,
        buttonActive: !!button && button.disabled !== true,
        nextSpawnAt: parseDiscordTimestamp(text, 'boss\\s+baru')
    };
};

const parseTicketConfirmation = (msg, settings) => {
    const components = toPlainData(msg.components) || [];
    const yes = findButton(components, settings.ticketYesId);
    const no  = findButton(components, settings.ticketNoId);
    if (!yes && !no) return null;

    const text = removeInvisibleChars([msg.content || '', ...collectTexts(components)].join('\n'));
    const match = text.match(TICKET_LEFT_REGEX);
    const lowerText = text.toLowerCase();

    return {
        isTicket: true,
        isAlreadyFought: lowerText.includes('sudah melawan boss ini'),
        yesActive: !!yes && yes.disabled !== true,
        noActive:  !!no  && no.disabled !== true,
        ticketLeft: match ? parseInt(match[1], 10) : null,
        ticketMax:  match ? parseInt(match[2], 10) : null,
        text
    };
};

const parseLimitMessage = (msg, settings) => {
    const raw = String(msg.content || '');
    const lower = removeInvisibleChars(raw).toLowerCase();
    if (!lower.includes(settings.limitText.toLowerCase())) return null;
    if (!lower.includes('reset')) return null;

    const tsMatch = raw.match(/<t:(\d+)(?::[a-zA-Z])?>/);
    if (!tsMatch) return null;
    return { isLimit: true, resetAt: parseInt(tsMatch[1], 10) * 1000 };
};

const formatWib = (ts) => new Date(ts).toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit'
});

const formatCountdown = (ts) => {
    const diff = Math.max(0, ts - Date.now());
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return m >= 60 ? `${Math.floor(m / 60)}j ${m % 60}m` : `${m}m ${s}d`;
};

const createBoss2Manager = (state, configManager) => {
    state.boss2Raids = state.boss2Raids || new Map();
    state.boss2Timers = state.boss2Timers || new Set();

    const prefix = (kind = 'guild') => `${accountPrefix(state)}🐲 Auto Boss2${kind === 'global' ? ' [Global]' : ' [Guild]'}: `;
    const raidKey = (key, kind = 'guild') => `${key}:${kind}`;
    const pendingTicketContexts = [];
    const ticketStatus = state.boss2TicketStatus || (state.boss2TicketStatus = { guild: null, global: null });
    let lastTicketStatusRequest = 0;
    const kindEnabled = kind => kind !== 'global' || configManager.getLucyBossLifecycleSettings?.('global')?.enabled === true;
    const requestTicketStatus = async settings => {
        if (!settings.ticketStatusChannelId || Date.now() - lastTicketStatusRequest < 30000) return;
        lastTicketStatusRequest = Date.now();
        try {
            const channel = await state.client?.channels?.fetch?.(settings.ticketStatusChannelId);
            if (!channel?.send) throw new Error('Channel tiket tidak tersedia');
            await channel.send(settings.ticketStatusCommand || 'lboss t');
            log.info(prefix() + 'Meminta status tiket melalui channel privat.');
        } catch (error) {
            log.warn(prefix() + 'Gagal meminta status tiket: ' + (error.message || error));
        }
    };
    const parseTicketStatus = msg => {
        const components = toPlainData(msg.components) || [];
        const text = removeInvisibleChars([msg.content || '', ...collectTexts(components)].join('\\n'));
        const get = label => {
            const match = text.match(new RegExp('Ticket\\\\s+Boss\\\\s+' + label + '[\\\\s\\\\S]*?punya\\\\s*\\\\*{0,2}(\\\\d+)\\\\*{0,2}\\\\s*\\\\/\\\\s*\\\\*{0,2}(\\\\d+)\\\\*{0,2}', 'i'));
            return match ? { left: Number(match[1]), max: Number(match[2]), checkedAt: Date.now() } : null;
        };
        return { guild: get('Guild'), global: get('Global') };
    };

    const schedule = (callback, atMs) => {
        const delay = Math.min(MAX_TIMER_MS, Math.max(0, atMs - Date.now()));
        const timer = setTimeout(() => {
            state.boss2Timers.delete(timer);
            callback();
        }, delay);
        state.boss2Timers.add(timer);
        return timer;
    };

    const cancel = (timer) => {
        if (!timer) return;
        clearTimeout(timer);
        state.boss2Timers.delete(timer);
    };

    const wait = (ms) => new Promise(resolve => schedule(resolve, Date.now() + ms));

    const getRaid = (key, kind = 'guild') => {
        const id = raidKey(key, kind);
        if (!state.boss2Raids.has(id)) {
            state.boss2Raids.set(id, {
                messageId: null, channelId: null, status: 'idle',
                fightsDone: 0, ticketAtBossStart: null, fighting: false,
                lastTicketActionMessageId: null, ticketLastDecision: null,
                awaitingTicketAfterFight: false,
                nextSpawnAt: null,
                limitResetAt: null, limitTimer: null, limitMessageId: null
            });
        }
        const raid = state.boss2Raids.get(id);
        raid.kind = kind;
        return raid;
    };

    return {
        getRaidState(key, kind = 'guild') { return state.boss2Raids.get(raidKey(key, kind)) || null; },

        isAllowed(msg, settings) {
            const myId = state.client?.user?.id;
            const authorId = String(msg.author?.id || '');
            if (myId && authorId === myId) return false;
            if (authorId !== CONSTANTS.LUCY_BOT_ID) return false;
            if (settings.allowedGuilds.length > 0 && !settings.allowedGuilds.includes(msg.guildId)) return false;
            if (settings.channelIds.length > 0 && !settings.channelIds.includes(msg.channel?.id)) return false;
            return true;
        },

        // ── DISPATCHER ─────────────────────────────────────────────
        async handle(msg) {
            const settings = configManager.getBoss2Settings();
            if (!settings.enabled) return null;
            if (settings.ticketStatusChannelId && String(msg.channel?.id || msg.channelId || '') === settings.ticketStatusChannelId && String(msg.author?.id || '') === CONSTANTS.LUCY_BOT_ID) {
                const status = parseTicketStatus(msg);
                if (status.guild || status.global) {
                    if (status.guild) ticketStatus.guild = status.guild;
                    if (status.global) ticketStatus.global = status.global;
                    log.info(prefix() + 'Tiket diperbarui: Guild ' + (ticketStatus.guild?.left ?? '?') + '/' + (ticketStatus.guild?.max ?? '?') + ', Global ' + (ticketStatus.global?.left ?? '?') + '/' + (ticketStatus.global?.max ?? '?') + '.');
                    return 'ticket-status';
                }
            }
            if (!this.isAllowed(msg, settings)) return null;
            const key = msg.guildId || msg.channel?.id || 'dm';

            // JALUR 1 — Limit message (text-only)
            if (!msg.components?.length) {
                const limit = parseLimitMessage(msg, settings);
                if (limit) return this.handleLimitReached(msg, limit, settings);
                return null;
            }

            // JALUR 2 — Ticket confirmation (ephemeral)
            const ticket = parseTicketConfirmation(msg, settings);
            if (ticket) return this.handleTicketConfirmation(msg, ticket, settings);

            // JALUR 3 — Boss message
            const info = parseRaidMessage(msg, settings);
            if (!info.kind || !kindEnabled(info.kind)) return null;
            const kind = info.kind;
            const raid = getRaid(key, kind);

            // Saat limit, hanya track ended (jangan fight)
            if (raid.status === 'limit') {
                if (info.isDefeated || info.isEscaped || info.nextSpawnAt || (info.button && !info.buttonActive)) {
                    this.handleEnded(key, kind, msg, info);
                }
                return 'limit-cooldown';
            }

            if (info.isDefeated || info.isEscaped || info.nextSpawnAt || (info.button && !info.buttonActive)) {
                this.handleEnded(key, kind, msg, info);
                return 'ended';
            }

            if (info.isAppear && info.buttonActive) {
                return this.handleAppear(key, kind, msg, info, settings);
            }
            return null;
        },

        // ── APPEAR — gate nextSpawnAt dulu, baru fight ─────────────
        async handleAppear(key, kind, msg, info, settings) {
            const raid = getRaid(key, kind);
            const now = Date.now();

            // GATE 1 — masih tunggu defeated message (belum ada timestamp)
            if (raid.status === 'waiting-defeat' && !raid.nextSpawnAt) {
                log.info(`${prefix()}⏳ Menunggu defeated message, skip.`);
                return 'waiting-defeat-skip';
            }

            // GATE 2 — timestamp boss baru belum tiba → skip (repost dll)
            if (raid.nextSpawnAt && now < raid.nextSpawnAt) {
                log.info(`${prefix()}⏳ Boss baru dijadwalkan ${formatWib(raid.nextSpawnAt)} WIB, skip.`);
                return 'premature-skip';
            }

            const isNewRaid = raid.messageId !== msg.id || raid.status !== 'active';
            if (isNewRaid) {
                if (raid.nextSpawnAt && now >= raid.nextSpawnAt) {
                    log.info(`${prefix()}⏰ Timestamp boss baru tiba.`);
                }
                Object.assign(raid, {
                    messageId: msg.id,
                    channelId: msg.channel?.id || msg.channelId || null,
                    status: 'active',
                    fightsDone: 0,
                    ticketAtBossStart: null,
                    fighting: false,
                    nextSpawnAt: null,
                    lastTicketActionMessageId: null,
                    ticketLastDecision: null,
                    awaitingTicketAfterFight: false
                });
                log.success(`${prefix(kind)}Boss muncul di ${msg.guild?.name || key}!`);
                requestTicketStatus(settings).catch(() => {});
            }

            if (raid.status !== 'active') return null;

            if (raid.fightsDone >= settings.fightsPerBoss) {
                log.info(`${prefix()}Target boss ini tercapai (${raid.fightsDone}/${settings.fightsPerBoss}). Tunggu defeated.`);
                return 'maxed';
            }

            return this.fight(raid, msg, info, settings, kind, key);
        },

        // ── FIGHT — klik fight, tunggu ephemeral/ticket handler ────
        async fight(raid, msg, info, settings, kind = 'guild', key = msg.guildId || msg.channel?.id || 'dm') {
            if (raid.fighting) return null;
            raid.fighting = true;
            const messageId = msg.id;
            const target = settings.fightsPerBoss;

            const canContinue = () => raid.messageId === messageId
                && raid.status === 'active'
                && configManager.getBoss2Settings().enabled;

            try {
                while (raid.fightsDone < target && canContinue()) {
                    const delayMs = randomInt(settings.delayMinMs, settings.delayMaxMs);
                    if (delayMs > 0) await wait(delayMs);
                    if (!canContinue() || raid.fightsDone >= target) break;

                    const before = raid.fightsDone;
                    raid.awaitingTicketAfterFight = true;
                    raid.ticketLastDecision = null;

                    const pendingContext = { kind, key, raid, channelId: String(msg.channel?.id || msg.channelId || '') };
                    pendingTicketContexts.push(pendingContext);
                    try {
                        await msg.clickButton(info.button.custom_id || info.button.customId);
                        log.info(`${prefix(kind)}⚔️ Klik Fight (target #${before + 1})`);
                    } catch (err) {
                        raid.awaitingTicketAfterFight = false;
                        const pendingIndex = pendingTicketContexts.indexOf(pendingContext);
                        if (pendingIndex >= 0) pendingTicketContexts.splice(pendingIndex, 1);
                        log.error(`${prefix(kind)}Gagal klik Fight: ${err.message || err}`);
                        break;
                    }

                    // Tunggu max 5 detik: ephemeral (kalau ada) ATAU timeout = sukses langsung
                    const deadline = Date.now() + 5000;
                    while (Date.now() < deadline && canContinue()) {
                        if (!raid.awaitingTicketAfterFight) break;
                        await wait(200);
                    }

                    if (!canContinue()) break;

                    // Fight sukses langsung (tidak ada ephemeral)
                    if (raid.awaitingTicketAfterFight) {
                        raid.awaitingTicketAfterFight = false;
                        const pendingIndex = pendingTicketContexts.indexOf(pendingContext);
                        if (pendingIndex >= 0) pendingTicketContexts.splice(pendingIndex, 1);
                        raid.fightsDone = before + 1;
                        if (ticketStatus[kind]?.left > 0) ticketStatus[kind].left -= 1;
                        log.success(`${prefix(kind)}⚔️ Fight ${raid.fightsDone}/${target} (sukses langsung)`);
                    }

                    // Ephemeral bilang Nggak → stop
                    if (raid.ticketLastDecision === 'no') {
                        log.info(`${prefix()}🎫 Ticket ditolak, stop fight boss ini.`);
                        break;
                    }

                    if (raid.fightsDone <= before) {
                        log.warn(`${prefix()}Tidak ada progres, break loop.`);
                        break;
                    }
                }
            } finally {
                raid.awaitingTicketAfterFight = false;
                raid.fighting = false;
                for (let i = pendingTicketContexts.length - 1; i >= 0; i--) {
                    if (pendingTicketContexts[i].raid === raid) pendingTicketContexts.splice(i, 1);
                }
            }
            return 'fought';
        },

        // ── TICKET CONFIRMATION ────────────────────────────────────
        async handleTicketConfirmation(msg, ticket, settings) {
            const channelId = String(msg.channel?.id || msg.channelId || '');
            const pendingIndex = pendingTicketContexts.findIndex(item => !channelId || !item.channelId || item.channelId === channelId);
            const context = pendingIndex >= 0 ? pendingTicketContexts.splice(pendingIndex, 1)[0] : null;
            const key = context?.key || msg.guildId || msg.channel?.id || 'dm';
            const kind = context?.kind || 'guild';
            const raid = context?.raid || getRaid(key, kind);

            if (raid.lastTicketActionMessageId === msg.id) return null;
            raid.lastTicketActionMessageId = msg.id;

            // KASUS A — "sudah melawan boss ini" → SELALU Nggak + stop
            if (ticket.isAlreadyFought) {
                log.info(`${prefix(kind)}🎫 "sudah melawan boss ini" → Nggak ❌ (stop sampai boss defeated)`);
                try {
                    await msg.clickButton(settings.ticketNoId);
                } catch (err) {
                    log.error(`${prefix(kind)}Gagal klik Nggak: ${err.message || err}`);
                }
                raid.awaitingTicketAfterFight = false;
                raid.ticketLastDecision = 'no';
                raid.status = 'waiting-defeat';
                return 'ticket-rejected';
            }

            // KASUS B — status bukan active → Nggak
            if (raid.status !== 'active') {
                if (ticket.noActive) { try { await msg.clickButton(settings.ticketNoId); } catch (_) {} }
                raid.awaitingTicketAfterFight = false;
                raid.ticketLastDecision = 'no';
                return 'ticket-skipped';
            }

            // KASUS C — fallback berbasis sisa tiket
            const currentTicketLeft = ticket.ticketLeft ?? ticketStatus[kind]?.left ?? null;
            const currentTicketMax = ticket.ticketMax ?? ticketStatus[kind]?.max ?? null;
            if (raid.ticketAtBossStart === null && currentTicketLeft !== null) {
                raid.ticketAtBossStart = currentTicketLeft;
                log.info(`${prefix(kind)}🎫 Sisa tiket awal: ${currentTicketLeft}/${currentTicketMax ?? '?'}`);
            }
            const foughtThisBoss = raid.fightsDone;

            const willFight = foughtThisBoss + 1;
            const canFightMore = willFight <= settings.fightsPerBoss;
            const enoughTicket = currentTicketLeft === null
                ? true
                : currentTicketLeft >= settings.minTicketLeft;

            const shouldAccept = canFightMore && enoughTicket;
            const targetId = shouldAccept ? settings.ticketYesId : settings.ticketNoId;

            log.info(`${prefix(kind)}🎫 tiket ${currentTicketLeft ?? '?'}/${currentTicketMax ?? '?'} | ` +
                     `fightBoss=${foughtThisBoss}/${settings.fightsPerBoss} → ${shouldAccept ? 'Iya ✅' : 'Nggak ❌'}`);

            try { await msg.clickButton(targetId); }
            catch (err) {
                log.error(`${prefix(kind)}Gagal klik ${targetId}: ${err.message || err}`);
                raid.awaitingTicketAfterFight = false;
                raid.ticketLastDecision = 'no';
                return 'ticket-error';
            }

            raid.awaitingTicketAfterFight = false;
            raid.ticketLastDecision = shouldAccept ? 'yes' : 'no';

            if (shouldAccept) {
                raid.fightsDone = foughtThisBoss + 1;
                if (currentTicketLeft !== null) ticketStatus[kind] = { left: Math.max(0, currentTicketLeft - 1), max: currentTicketMax, checkedAt: Date.now() };
                log.success(`${prefix(kind)}⚔️ Fight ${raid.fightsDone}/${settings.fightsPerBoss} (via ticket)`);
                return 'ticket-accepted';
            }

            // Tiket tidak cukup → stop sampai defeated
            raid.status = 'waiting-defeat';
            return 'ticket-rejected';
        },

        // ── LIMIT — stop per-guild, jadwalkan resume ───────────────
        async handleLimitReached(msg, limit, settings) {
            const key = msg.guildId || msg.channel?.id || 'dm';
            const raid = getRaid(key);

            if (raid.status === 'limit' && raid.limitResetAt === limit.resetAt && raid.limitTimer) {
                return 'limit-already-handled';
            }

            const remaining = limit.resetAt - Date.now();
            if (remaining <= 0) {
                log.warn(`${prefix()}Limit timestamp sudah lewat, skip.`);
                return 'limit-past';
            }

            cancel(raid.limitTimer);
            raid.status = 'limit';
            raid.limitResetAt = limit.resetAt;
            raid.limitMessageId = msg.id;
            raid.fighting = false;
            raid.awaitingTicketAfterFight = false;

            log.warn(`${prefix()}🚫 Limit fight tercapai. Boss2 dijeda untuk guild ini.`);
            log.info(`${prefix()}⏰ Reset: ${formatWib(limit.resetAt)} WIB (${formatCountdown(limit.resetAt)})`);

            const onReset = () => {
                if (Date.now() < limit.resetAt - 1500) {
                    raid.limitTimer = schedule(onReset, limit.resetAt);
                    return;
                }
                raid.limitTimer = null;
                raid.limitResetAt = null;
                if (raid.status !== 'limit') return;

                log.success(`${prefix()}⏰ Limit reset! Coba resume boss yang masih aktif.`);
                this.resumeAfterLimit(raid, settings).catch(err => {
                    log.error(`${prefix()}Gagal resume: ${err.message}`);
                    if (raid.status === 'limit') raid.status = 'idle';
                });
            };
            raid.limitTimer = schedule(onReset, limit.resetAt);
            return 'limit';
        },

        async resumeAfterLimit(raid, settings) {
            if (!raid.messageId || !raid.channelId) {
                raid.status = 'idle';
                return;
            }
            try {
                const channel = await state.client.channels.fetch(raid.channelId);
                if (!channel) throw new Error('Channel tidak ditemukan');
                const msg = await channel.messages.fetch(raid.messageId);
                if (!msg) throw new Error('Pesan boss tidak ditemukan');

                const info = parseRaidMessage(msg, settings);
                if (!info.isAppear || !info.buttonActive) {
                    log.info(`${prefix()}Boss sudah selesai saat reset. Menunggu boss baru.`);
                    raid.status = 'idle';
                    return;
                }
                log.info(`${prefix()}⚔️ Boss masih aktif, resume fight.`);
                raid.status = 'active';
                raid.fightsDone = 0;
                raid.ticketAtBossStart = null;
                raid.lastTicketActionMessageId = null;
                return this.fight(raid, msg, info, settings);
            } catch (err) {
                log.warn(`${prefix()}Boss tidak bisa di-resume: ${err.message}`);
                raid.status = 'idle';
            }
        },

        // ── ENDED — simpan nextSpawnAt sebagai gate ────────────────
        handleEnded(key, msg, info) {
            const raid = getRaid(key);
            const wasActive = raid.status === 'active';
            const wasWaiting = raid.status === 'waiting-defeat';

            // Jangan override status 'limit'
            if (raid.status !== 'limit') {
                raid.status = 'ended';
            }
            raid.messageId = raid.messageId || msg.id;

            if (wasActive) {
                log.warn(`${prefix()}Boss ${info.isDefeated ? 'telah dikalahkan' : 'selesai'}.`);
            } else if (wasWaiting) {
                log.info(`${prefix()}Boss ${info.isDefeated ? 'telah dikalahkan' : 'selesai'}.`);
            }

            if (info.nextSpawnAt && info.nextSpawnAt !== raid.nextSpawnAt) {
                raid.nextSpawnAt = info.nextSpawnAt;
                log.info(`${prefix()}⏰ Boss baru: ${formatWib(info.nextSpawnAt)} WIB (${formatCountdown(info.nextSpawnAt)})`);
            }
        },

        stop() {
            for (const timer of state.boss2Timers) clearTimeout(timer);
            state.boss2Timers.clear();
            for (const raid of state.boss2Raids.values()) {
                raid.limitTimer = null;
                raid.limitResetAt = null;
                raid.awaitingTicketAfterFight = false;
                raid.nextSpawnAt = null;
                if (['active', 'limit', 'ended', 'waiting-defeat'].includes(raid.status)) {
                    raid.status = 'idle';
                }
            }
        }
    };
};

createBoss2Manager.normalizeBoss2Settings = normalizeBoss2Settings;
createBoss2Manager.parseRaidMessage = parseRaidMessage;
createBoss2Manager.parseTicketConfirmation = parseTicketConfirmation;
createBoss2Manager.parseLimitMessage = parseLimitMessage;
createBoss2Manager.collectTexts = collectTexts;
createBoss2Manager.toPlainData = toPlainData;
module.exports = createBoss2Manager;
