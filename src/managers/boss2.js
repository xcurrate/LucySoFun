const CONSTANTS = require('../constants');
const log = require('../../logger');
const { safeJsonStringify, removeInvisibleChars, accountPrefix, randomInt } = require('../utils');

const MAX_TIMER_MS = 2147483647;
const TEXT_KEYS = new Set(['content', 'title', 'description', 'name', 'value', 'label', 'text']);
const TICKET_LEFT_REGEX = /punya\s*\*{0,2}(\d+)\*{0,2}\s*\/\s*\*{0,2}(\d+)\*{0,2}\s*ticket/i;

const REWARD_IMAGE_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
const REWARD_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const REWARD_DOWNLOAD_TIMEOUT_MS = 12000;
const REWARD_CHECK_CACHE_LIMIT = 200;

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

const normalizeRewardGate = (raw = {}, defaults = {}) => {
    const rawTargets = raw.targets || {};
    const defaultTargets = defaults.targets || {};
    const target = (key) => Math.max(0, toNonNegativeInt(rawTargets[key], toNonNegativeInt(defaultTargets[key], 0)));
    return {
        enabled: raw.enabled === true,
        // 'any' = minimal satu target terpenuhi. 'all' disiapkan untuk config
        // manual, tetapi dashboard memakai 'any'.
        targetMode: raw.targetMode === 'all' ? 'all' : 'any',
        targets: {
            weaponShards: target('weaponShards'),
            weaponCrate: target('weaponCrate'),
            bossCrate: target('bossCrate'),
            fabledLootbox: target('fabledLootbox'),
            experience: target('experience')
        }
    };
};

const normalizeBoss2Settings = (raw = {}) => {
    const defaults = CONSTANTS.BOSS2_DEFAULTS;
    const delayMinMs = toNonNegativeInt(raw.delayMinMs, defaults.delayMinMs);
    return {
        enabled: raw.enabled === true,
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
        rewardGate: normalizeRewardGate(raw.rewardGate, defaults.rewardGate)
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

const isRewardImageUrl = (value) => {
    if (typeof value !== 'string') return false;
    try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase();
        return url.protocol === 'https:'
            && (REWARD_IMAGE_HOSTS.has(host) || host.endsWith('.discordapp.net'));
    } catch {
        return false;
    }
};

// Gambar reward ada di komponen V2 type 12 setelah heading "## Hadiah".
// Fallback: lampiran PNG pada pesan boss yang sama.
const findRewardImage = (msg) => {
    const components = toPlainData(msg?.components) || [];
    for (const container of components) {
        if (Number(container?.type) !== 17) continue;
        let hasRewardHeading = false;
        let imageUrl = null;
        const seen = new Set();
        const walk = (node) => {
            if (!node || typeof node !== 'object' || seen.has(node) || imageUrl) return;
            seen.add(node);
            if (Array.isArray(node)) {
                for (const child of node) walk(child);
                return;
            }
            const type = Number(node.type);
            if (type === 10) {
                const text = removeInvisibleChars([node.content, node.text, node.title]
                    .filter(value => typeof value === 'string').join(' '));
                if (/##\s*Hadiah\b/i.test(text)) hasRewardHeading = true;
            }
            if (type === 12 && hasRewardHeading) {
                const candidate = node.items?.[0]?.media?.url || node.media?.url;
                if (isRewardImageUrl(candidate)) {
                    imageUrl = candidate;
                    return;
                }
            }
            for (const child of Object.values(node)) {
                if (child && typeof child === 'object') walk(child);
            }
        };
        walk(container);
        if (imageUrl) return imageUrl;
    }

    const attachments = msg?.attachments;
    const list = Array.isArray(attachments)
        ? attachments
        : (typeof attachments?.values === 'function' ? [...attachments.values()] : []);
    const images = list.map(attachment => {
        const contentType = String(attachment?.contentType || '').toLowerCase();
        const name = String(attachment?.name || attachment?.filename || '').toLowerCase();
        const url = attachment?.url || attachment?.proxyURL || attachment?.proxy_url;
        const isPng = contentType === 'image/png' || name.endsWith('.png');
        return isPng && isRewardImageUrl(url) ? { url, name } : null;
    }).filter(Boolean);

    // Beberapa lampiran (mis. gambar boss + reward): hanya pilih yang jelas
    // bernama reward, atau bila hanya ada satu PNG.
    const namedReward = images.find(image => /reward|hadiah/i.test(image.name));
    if (namedReward) return namedReward.url;
    return images.length === 1 ? images[0].url : null;
};

const defaultDownloadImage = async (url) => {
    if (!isRewardImageUrl(url)) throw new Error('URL gambar reward tidak diizinkan.');
    if (typeof fetch !== 'function') throw new Error('fetch tidak tersedia untuk mengunduh gambar reward.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REWARD_DOWNLOAD_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            redirect: 'error',
            headers: { Accept: 'image/png' }
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (type !== 'image/png') throw new Error('Format reward tidak didukung: ' + (type || 'unknown') + ' (hanya PNG).');
        const declared = Number(response.headers.get('content-length') || 0);
        if (declared > REWARD_IMAGE_MAX_BYTES) throw new Error('Gambar reward melebihi batas 8 MB.');
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length || bytes.length > REWARD_IMAGE_MAX_BYTES) throw new Error('Ukuran gambar reward tidak valid.');
        return bytes;
    } finally {
        clearTimeout(timer);
    }
};

const evaluateRewardGate = (rewards, settings) => {
    const gate = settings?.rewardGate || {};
    const targets = gate.targets || {};
    const configured = Object.entries(targets).filter(([, value]) => Number.isFinite(value) && value > 0);
    const matched = configured.filter(([key, target]) => Number.isFinite(rewards?.[key]) && rewards[key] >= target);
    const passed = configured.length === 0
        ? true
        : (gate.targetMode === 'all' ? matched.length === configured.length : matched.length > 0);
    return {
        passed,
        configured,
        matched,
        reason: configured.length === 0 ? 'no-targets' : (passed ? 'matched' : 'below-target')
    };
};

const formatRewardSummary = (rewards, targets) => Object.keys(targets || {}).map(key => {
    const value = rewards?.[key];
    const target = targets[key];
    return `${key}=${Number.isFinite(value) ? value : '?'}${target > 0 ? '/' + target : ''}`;
}).join(' ');

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

    const isAppear = lowerText.includes(settings.appearText.toLowerCase());
    const isDefeated = lowerText.includes(settings.defeatedText.toLowerCase());
    const isEscaped = lowerText.includes('guild boss kabur');
    const kind = isAppear || isDefeated || isEscaped ? 'guild' : null;
    return {
        kind,
        isAppear,
        isDefeated,
        isEscaped,
        button,
        buttonActive: !!button && button.disabled !== true,
        endsAt: parseDiscordTimestamp(text, 'berakhir'),
        fightsUsed: Number((text.match(/Fight kamu:\s*(\d+)\s*\//i) || [])[1] || 0),
        fightsMax: Number((text.match(/Fight kamu:\s*\d+\s*\/\s*(\d+)/i) || [])[1] || 0),
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
        // Lucy memakai teks "sudah melawan boss ini" juga untuk menawarkan
        // fight ulang ("Yakin mau pakai 1 boss ticket lagi?"). Itu bukan
        // penolakan keras, jadi harus dicek tiketnya lewat channel privat.
        isRepeatConfirmation: /pakai\s+\d+\s+boss\s+ticket\s+lagi/i.test(lowerText),
        yesActive: !!yes && yes.disabled !== true,
        noActive:  !!no  && no.disabled !== true,
        ticketLeft: match ? parseInt(match[1], 10) : null,
        ticketMax:  match ? parseInt(match[2], 10) : null,
        text
    };
};

const parseTicketStatusMessage = msg => {
    const components = toPlainData(msg.components) || [];
    const text = removeInvisibleChars([msg.content || '', ...collectTexts(components)].join('\n'));
    const heading = text.search(/Ticket\s+Boss\s+Guild/i);
    if (heading < 0) return { guild: null };
    const next = text.slice(heading + 1).search(/Ticket\s+Boss\s+(?:Guild|Global)/i);
    const section = text.slice(heading, next >= 0 ? heading + 1 + next : undefined);
    const match = section.match(/punya\s*\*{0,2}(\d+)\*{0,2}\s*\/\s*\*{0,2}(\d+)\*{0,2}\s*boss\s*ticket/i);
    return { guild: match ? { left: Number(match[1]), max: Number(match[2]), checkedAt: Date.now() } : null };
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

const createBoss2Manager = (state, configManager, deps = {}) => {
    state.boss2Raids = state.boss2Raids || new Map();
    state.boss2Timers = state.boss2Timers || new Set();
    state.boss2RewardChecks = state.boss2RewardChecks || new Map();

    // Diinjeksi oleh test; runtime memakai implementasi nyata.
    const readRewards = typeof deps.readRewards === 'function'
        ? deps.readRewards
        : require('./rewardOCR').readRewards;
    const downloadImage = typeof deps.downloadImage === 'function'
        ? deps.downloadImage
        : defaultDownloadImage;

    const prefix = (kind = 'guild') => `${accountPrefix(state)}🐲 Auto Boss2: `;
    const raidKey = (key, kind = 'guild') => `${key}:${kind}`;
    const pendingTicketContexts = [];
    let ticketStatusRequest = null;
    const requestTicketStatus = async settings => {
        const channelId = String(settings.ticketStatusChannelId || '').trim();
        if (!channelId) {
            log.warn(prefix() + 'Channel privat pemeriksaan tiket belum dikonfigurasi; konfirmasi akan ditolak demi keamanan.');
            return null;
        }
        if (ticketStatusRequest?.channelId === channelId) return ticketStatusRequest.promise;

        let resolveRequest;
        const promise = new Promise(resolve => { resolveRequest = resolve; });
        const request = {
            channelId,
            startedAt: Date.now(),
            promise,
            resolve(status) {
                clearTimeout(request.timeout);
                if (ticketStatusRequest === request) ticketStatusRequest = null;
                resolveRequest(status);
            },
            timeout: null
        };
        request.timeout = setTimeout(() => {
            if (ticketStatusRequest === request) ticketStatusRequest = null;
            resolveRequest(null);
        }, 10000);
        ticketStatusRequest = request;

        try {
            const channel = await state.client?.channels?.fetch?.(channelId);
            if (!channel?.send) throw new Error('Channel privat tiket tidak tersedia atau tidak dapat dikirimi pesan');
            await channel.send(settings.ticketStatusCommand || 'lboss t');
            log.info(prefix() + 'Meminta status tiket terbaru melalui channel privat.');
        } catch (error) {
            log.warn(prefix() + 'Gagal meminta status tiket: ' + (error.message || error));
            request.resolve(null);
        }
        return promise;
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
                messageId: null, channelId: null, key, kind, status: 'idle',
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
            // Channel ID Discord unik global, jadi filter guild tidak diperlukan.
            if (settings.channelIds.length > 0 && !settings.channelIds.includes(msg.channel?.id)) return false;
            return true;
        },

        // ── REWARD GATE ────────────────────────────────────────────
        // Fight hanya boleh diklik bila reward pada gambar boss memenuhi
        // target. Gambar tidak ada / OCR gagal = Fight dilewati (fail-closed).
        async checkRewardGate(msg, settings) {
            const gate = settings.rewardGate;
            if (!gate?.enabled) return { passed: true, reason: 'disabled', configured: [], matched: [] };

            const configuredTargets = Object.values(gate.targets || {}).filter(value => Number.isFinite(value) && value > 0);
            if (!configuredTargets.length) {
                log.warn(prefix() + '🎯 Reward gate aktif tetapi belum ada target; Fight diizinkan.');
                return { passed: true, reason: 'no-targets', configured: [], matched: [] };
            }

            const url = findRewardImage(msg);
            if (!url) {
                log.warn(prefix() + '🚫 Reward gate: gambar reward tidak ditemukan → Fight dilewati.');
                return { passed: false, reason: 'no-image', configured: [], matched: [] };
            }

            const cacheKey = `${msg.id || 'no-id'}:${url}`;
            const cached = state.boss2RewardChecks.get(cacheKey);
            if (cached) {
                log.info(`${prefix()}🎯 Reward gate (cache): ${cached.passed ? 'lolos' : 'gagal'} (${cached.reason}).`);
                return cached;
            }

            try {
                const bytes = await downloadImage(url);
                const rewards = await readRewards(bytes);
                const result = evaluateRewardGate(rewards, settings);
                const entry = { ...result, rewards, url, checkedAt: Date.now() };
                state.boss2RewardChecks.set(cacheKey, entry);
                if (state.boss2RewardChecks.size > REWARD_CHECK_CACHE_LIMIT) {
                    state.boss2RewardChecks.delete(state.boss2RewardChecks.keys().next().value);
                }

                const summary = formatRewardSummary(rewards, gate.targets);
                if (result.passed) {
                    log.success(`${prefix()}🎯 Reward gate lolos (${gate.targetMode.toUpperCase()}): ${summary}`);
                } else {
                    log.warn(`${prefix()}🚫 Reward gate gagal (${gate.targetMode.toUpperCase()}): ${summary} → Fight dilewati.`);
                }
                return entry;
            } catch (error) {
                log.warn(`${prefix()}🚫 Reward gate: gagal membaca reward (${error.message || error}) → Fight dilewati.`);
                return {
                    passed: false,
                    reason: 'ocr-error',
                    configured: [],
                    matched: [],
                    error: String(error.message || error)
                };
            }
        },

        // ── DISPATCHER ─────────────────────────────────────────────
        async handle(msg) {
            const settings = configManager.getBoss2Settings();
            if (!settings.enabled) return null;
            if (ticketStatusRequest &&
                String(msg.channel?.id || msg.channelId || '') === ticketStatusRequest.channelId &&
                String(msg.author?.id || '') === CONSTANTS.LUCY_BOT_ID &&
                (!msg.createdTimestamp || msg.createdTimestamp >= ticketStatusRequest.startedAt)) {
                const status = parseTicketStatusMessage(msg);
                if (status.guild) {
                    log.info(prefix() + 'Status tiket privat diterima: Guild ' + status.guild.left + '/' + status.guild.max + '.');
                    ticketStatusRequest.resolve(status);
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
            if (!info.kind) return null;
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
            }

            if (raid.status !== 'active') return null;

            if (raid.fightsDone >= settings.fightsPerBoss) {
                log.info(`${prefix()}Target boss ini tercapai (${raid.fightsDone}/${settings.fightsPerBoss}). Tunggu defeated.`);
                return 'maxed';
            }

            if (raid.fighting) return null;
            const reward = await this.checkRewardGate(msg, settings);
            if (!reward.passed) return 'reward-skip';

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
                    while ((Date.now() < deadline || raid.awaitingTicketStatus) && canContinue()) {
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
            if (!context) {
                log.warn(prefix() + 'Konfirmasi tiket tidak memiliki konteks Fight yang cocok; pesan diabaikan agar tidak salah memakai tiket.');
                return 'ticket-unmatched';
            }
            const kind = context.kind;
            const raid = context.raid;

            if (raid.lastTicketActionMessageId === msg.id) return null;
            raid.lastTicketActionMessageId = msg.id;

            // KASUS A — "sudah melawan boss ini" TANPA tawaran fight ulang
            // → Nggak + stop. Kalau Lucy menawarkan "pakai 1 boss ticket lagi",
            // lanjut ke KASUS C agar saldo tiket Guild dicek dari channel privat.
            if (ticket.isAlreadyFought && !ticket.isRepeatConfirmation) {
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

            // KASUS C — ambil inventaris terbaru dari channel privat.
            // Prompt konfirmasi tidak menyebut jenis boss, jadi angka di prompt tidak
            // boleh dipakai. Saldo tiket Guild diambil dari channel privat.
            if (ticket.isRepeatConfirmation) {
                log.info(`${prefix(kind)}🎫 Lucy menawarkan fight ulang; cek tiket Guild di channel privat.`);
            }
            raid.awaitingTicketStatus = true;
            let inventory = null;
            try {
                inventory = await requestTicketStatus(settings);
            } finally {
                raid.awaitingTicketStatus = false;
            }
            if (raid.status !== 'active') {
                if (ticket.noActive) {
                    try { await msg.clickButton(settings.ticketNoId); } catch (_) {}
                }
                raid.awaitingTicketAfterFight = false;
                raid.ticketLastDecision = 'no';
                return 'ticket-stale';
            }
            const currentTicketLeft = inventory?.guild?.left ?? null;
            const currentTicketMax = inventory?.guild?.max ?? null;
            if (currentTicketLeft === null) {
                log.warn(`${prefix(kind)}Status tiket Guild tidak tersedia/timeout; memilih Nggak agar tidak memakai tiket yang salah.`);
                if (ticket.noActive) {
                    try { await msg.clickButton(settings.ticketNoId); } catch (err) {
                        log.error(`${prefix(kind)}Gagal menolak konfirmasi tanpa status tiket: ${err.message || err}`);
                    }
                }
                raid.awaitingTicketAfterFight = false;
                raid.ticketLastDecision = 'no';
                raid.status = 'waiting-defeat';
                return 'ticket-status-unavailable';
            }

            const foughtThisBoss = raid.fightsDone;
            const willFight = foughtThisBoss + 1;
            const canFightMore = willFight <= settings.fightsPerBoss;
            const enoughTicket = currentTicketLeft >= settings.minTicketLeft;
            const shouldAccept = canFightMore && enoughTicket && ticket.yesActive;
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
            const channelId = String(msg.channel?.id || msg.channelId || '');
            const pendingIndex = pendingTicketContexts.findIndex(item => !channelId || !item.channelId || item.channelId === channelId);
            const pendingContext = pendingIndex >= 0 ? pendingTicketContexts.splice(pendingIndex, 1)[0] : null;
            const kind = 'guild';
            const raid = pendingContext?.raid || getRaid(key, kind);

            if (raid.status === 'limit' && raid.limitResetAt === limit.resetAt && raid.limitTimer) {
                return 'limit-already-handled';
            }

            const remaining = limit.resetAt - Date.now();
            if (remaining <= 0) {
                log.warn(`${prefix(kind)}Limit timestamp sudah lewat, skip.`);
                return 'limit-past';
            }

            cancel(raid.limitTimer);
            raid.status = 'limit';
            raid.limitResetAt = limit.resetAt;
            raid.limitMessageId = msg.id;
            raid.fighting = false;
            raid.awaitingTicketAfterFight = false;

            log.warn(`${prefix(kind)}🚫 Limit fight tercapai. Boss2 dijeda untuk jenis boss ini.`);
            log.info(`${prefix(kind)}⏰ Reset: ${formatWib(limit.resetAt)} WIB (${formatCountdown(limit.resetAt)})`);

            const onReset = () => {
                if (Date.now() < limit.resetAt - 1500) {
                    raid.limitTimer = schedule(onReset, limit.resetAt);
                    return;
                }
                raid.limitTimer = null;
                raid.limitResetAt = null;
                if (raid.status !== 'limit') return;

                log.success(`${prefix(kind)}⏰ Limit reset! Coba resume boss yang masih aktif.`);
                this.resumeAfterLimit(raid, settings).catch(err => {
                    log.error(`${prefix(kind)}Gagal resume: ${err.message}`);
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
                if (!info.isAppear || !info.buttonActive || (info.kind && info.kind !== raid.kind)) {
                    log.info(`${prefix()}Boss sudah selesai saat reset. Menunggu boss baru.`);
                    raid.status = 'idle';
                    return;
                }
                log.info(`${prefix()}⚔️ Boss masih aktif, resume fight.`);
                const reward = await this.checkRewardGate(msg, settings);
                if (!reward.passed) {
                    raid.status = 'idle';
                    log.info(`${prefix()}Reward gate gagal saat resume; menunggu boss baru.`);
                    return 'reward-skip';
                }
                raid.status = 'active';
                raid.fightsDone = 0;
                raid.ticketAtBossStart = null;
                raid.lastTicketActionMessageId = null;
                return this.fight(raid, msg, info, settings, raid.kind || 'guild', raid.key || msg.guildId || msg.channel?.id || 'dm');
            } catch (err) {
                log.warn(`${prefix()}Boss tidak bisa di-resume: ${err.message}`);
                raid.status = 'idle';
            }
        },

        // ── ENDED — simpan nextSpawnAt sebagai gate ────────────────
        handleEnded(key, kind, msg, info) {
            const raid = getRaid(key, kind);
            const wasActive = raid.status === 'active';
            const wasWaiting = raid.status === 'waiting-defeat';

            // Jangan override status 'limit'
            if (raid.status !== 'limit') {
                raid.status = 'ended';
            }
            raid.messageId = raid.messageId || msg.id;

            if (wasActive) {
                log.warn(`${prefix(kind)}Boss ${info.isDefeated ? 'telah dikalahkan' : info.isEscaped ? 'kabur' : 'selesai'}.`);
            } else if (wasWaiting) {
                log.info(`${prefix(kind)}Boss ${info.isDefeated ? 'telah dikalahkan' : info.isEscaped ? 'kabur' : 'selesai'}.`);
            }

            if (info.nextSpawnAt && info.nextSpawnAt !== raid.nextSpawnAt) {
                raid.nextSpawnAt = info.nextSpawnAt;
                log.info(`${prefix()}⏰ Boss baru: ${formatWib(info.nextSpawnAt)} WIB (${formatCountdown(info.nextSpawnAt)})`);
            }
        },

        stop() {
            for (const timer of state.boss2Timers) clearTimeout(timer);
            state.boss2Timers.clear();
            state.boss2RewardChecks.clear();
            if (ticketStatusRequest) ticketStatusRequest.resolve(null);
            pendingTicketContexts.length = 0;
            for (const raid of state.boss2Raids.values()) {
                raid.limitTimer = null;
                raid.limitResetAt = null;
                raid.awaitingTicketAfterFight = false;
                raid.awaitingTicketStatus = false;
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
createBoss2Manager.parseTicketStatusMessage = parseTicketStatusMessage;
createBoss2Manager.parseLimitMessage = parseLimitMessage;
createBoss2Manager.collectTexts = collectTexts;
createBoss2Manager.toPlainData = toPlainData;
createBoss2Manager.findRewardImage = findRewardImage;
createBoss2Manager.isRewardImageUrl = isRewardImageUrl;
createBoss2Manager.evaluateRewardGate = evaluateRewardGate;
createBoss2Manager.normalizeRewardGate = normalizeRewardGate;
module.exports = createBoss2Manager;
