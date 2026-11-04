const axios = require('axios');
const CONSTANTS = require('../constants');
const log = require('../../logger');
const { removeInvisibleChars, accountPrefix, sleep } = require('../utils');

// Nama pengenalan gambar (neo3.js) yang diintegrasikan di root proyek.
const neo3 = require('../../neo3');

const SENSOR_TRIGGER_TEXT = 'ketik 6 karakter';
const DONE_TRIGGER_TEXT = 'terima kasih';
const MISMATCH_TRIGGER_TEXT = 'belum cocok';
const REFRESH_TRIGGER_TEXT = 'perlu diperbarui';

const STATUS = {
    IDLE: 'IDLE',
    PAUSED: 'PAUSED',
    PROCESSING: 'PROCESSING',
    WAITING_RETRY: 'WAITING_RETRY',
    RESUMING: 'RESUMING'
};

const PHASE = {
    IDLE: 'idle',
    AWAITING_VERDICT: 'awaitingVerdict',
    AWAITING_REFRESH: 'awaitingRefresh',
    AWAITING_NEW_SENSOR: 'awaitingNewSensor'
};

const toNonNegativeInt = (value, fallback) => {
    const num = parseInt(value, 10);
    return Number.isFinite(num) && num >= 0 ? num : fallback;
};

const DEFAULT_LUCY_DM_CHANNEL_ID = '1557002545556230195';

const normalizeMonsterCatcherSettings = (raw = {}) => ({
    enabled: raw.enabled === true,
    autoPauseLoops: raw.autoPauseLoops !== false,
    retryWaitMs: Math.max(1000, toNonNegativeInt(raw.retryWaitMs, 60000)),
    maxRetries: toNonNegativeInt(raw.maxRetries, 0),
    // Channel DM khusus Bot Lucy. Diambil dari pesan sensor secara dinamis;
    // setting ini menjadi pembatas eksplisit + fallback tujuan reply.
    dmChannelId: String(raw.dmChannelId || DEFAULT_LUCY_DM_CHANNEL_ID).trim()
});

// Kumpulkan teks dari komponen/embed seperti manager Lucy lain.
const collectTexts = (node, texts = []) => {
    if (!node || typeof node !== 'object') return texts;
    for (const [key, value] of Object.entries(node)) {
        if (typeof value === 'string' && ['content', 'title', 'description', 'name', 'value', 'label', 'text', 'url'].includes(key)) texts.push(value);
        else if (value && typeof value === 'object') collectTexts(value, texts);
    }
    return texts;
};

const extractImageUrl = (msg) => {
    const candidates = [];
    for (const attachment of (msg?.attachments?.values?.() || [])) if (attachment?.url) candidates.push(attachment.url);
    candidates.push(msg?.content || '');
    candidates.push(...collectTexts(msg?.components || []));
    for (const embed of (msg?.embeds || [])) candidates.push(embed.url || '', embed.thumbnail?.url || '', embed.image?.url || '');
    const isImageUrl = (url) => /\.(png|jpe?g|webp)(?:\?.*)?$/i.test(url) || /cdn\.discordapp\.com\/attachments\//i.test(url);
    for (const candidate of candidates) {
        for (const raw of (String(candidate).match(/https?:\/\/[^\s<>\])"']+/gi) || [])) {
            const url = raw.replace(/[),.;]+$/g, '').replace(/&amp;/g, '&');
            if (isImageUrl(url)) return url;
        }
    }
    return null;
};

const messageText = (msg) => removeInvisibleChars([
    msg?.content || '',
    ...collectTexts(msg?.components || []),
    ...collectTexts(msg?.embeds || [])
].join('\n')).toLowerCase();

const parseWaitTimeMs = (text) => {
    if (!text) return 0;
    const seconds = text.match(/(\d+)\s*detik/i);
    if (seconds) return Math.max(1000, parseInt(seconds[1], 10) * 1000);
    const minutes = text.match(/(\d+)\s*menit/i);
    if (minutes) return Math.max(1000, parseInt(minutes[1], 10) * 60000);
    const ts = text.match(/<t:(\d+)(?::[a-zA-Z])?>/i);
    if (ts) {
        const remainingMs = parseInt(ts[1], 10) * 1000 - Date.now();
        if (remainingMs > 0) return remainingMs;
    }
    return 0;
};

module.exports = function createMonsterCatcherManager(state, configManager, loopManager, commandSender, options = {}) {
    const decoder = options.decoder || (buffer => neo3.decodeBuffer(buffer));
    // `downloadImage` dideklarasikan dengan `const` di bawah; gunakan akses
    // lambat agar const di atas tidak mengevaluasi binding pada TDZ saat init.
    const getDownloader = () => options.downloader || downloadImage;
    const mc = state.monsterCatcher = state.monsterCatcher || {
        active: false,
        processing: false,
        status: STATUS.IDLE,
        phase: PHASE.IDLE,
        retryCount: 0,
        channelId: '',
        lastCode: null,
        lastTriggerAt: 0,
        retryTimer: null,
        processedMessageIds: new Set(),
        history: []
    };

    const settings = () => (configManager.getMonsterCatcherSettings
        ? configManager.getMonsterCatcherSettings()
        : normalizeMonsterCatcherSettings(state.config?.settings?.monsterCatcher));

    const prefix = () => `${accountPrefix(state)}🐾 Monster Catcher: `;

    const markHandled = (msg) => {
        if (!msg?.id) return false;
        if (mc.processedMessageIds.has(msg.id)) return true;
        mc.processedMessageIds.add(msg.id);
        if (mc.processedMessageIds.size > 1500) mc.processedMessageIds.delete(mc.processedMessageIds.values().next().value);
        return false;
    };

    const clearRetryTimer = () => {
        if (mc.retryTimer) clearTimeout(mc.retryTimer);
        mc.retryTimer = null;
    };

    // Channel DM tujuan: prioritaskan channel pesan sensor terakhir, lalu setting eksplisit.
    const resolveDmChannelId = () => mc.channelId || settings().dmChannelId || '';

    const getDmChannel = async (msg = null) => {
        const channelId = resolveDmChannelId() || msg?.channel?.id || '';
        if (!channelId || !state.client?.isReady()) return null;
        return state.client.channels.cache.get(channelId) || state.client.channels.fetch(channelId).catch(() => null);
    };

    const sendDm = async (text) => {
        if (!state.client?.isReady()) return false;
        if (commandSender?.send) {
            return commandSender.send(text, 'Monster Catcher', resolveDmChannelId(), {
                allowWhilePaused: true,
                allowDuringMonsterCatch: true,
                allowDuringRest: true
            });
        }
        const channel = await getDmChannel();
        if (!channel || typeof channel.send !== 'function') return false;
        try {
            await channel.send(text);
            return true;
        } catch (error) {
            log.error(`${prefix()}Gagal mengirim ke DM Lucy: ${error.message}`);
            return false;
        }
    };

    const downloadImage = async (url) => {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 20000,
            maxContentLength: 8 * 1024 * 1024
        });
        return Buffer.from(response.data);
    };

    const recordHistory = (entry) => {
        mc.history.unshift({ at: Date.now(), ...entry });
        if (mc.history.length > 50) mc.history.length = 50;
    };

    const pauseLoops = () => {
        if (!settings().autoPauseLoops) return;
        if (mc.active) return;
        mc.active = true;
        if (loopManager && typeof loopManager.pauseMonsterCatch === 'function') {
            loopManager.pauseMonsterCatch();
        } else if (loopManager && typeof loopManager.stopAll === 'function') {
            loopManager.stopAll();
        }
        log.warn(`${prefix()}Semua loop command djeda; sisa delay tersimpan.`);
    };

    const resumeLoops = () => {
        if (!settings().autoPauseLoops) return;
        if (!mc.active) return;
        if (loopManager && typeof loopManager.resumeMonsterCatch === 'function') {
            loopManager.resumeMonsterCatch();
        }
        mc.active = false;
        log.success(`${prefix()}Loops dilanjutkan dengan sisa delay masing-masing.`);
    };

    const beginCatch = async (msg) => {
        mc.status = STATUS.PAUSED;
        mc.channelId = String(msg.channel?.id || msg.channelId || '');
        mc.lastTriggerAt = Date.now();
        pauseLoops();
        return processSensor(msg);
    };

    const processSensor = async (msg) => {
        const imageUrl = extractImageUrl(msg);
        if (!imageUrl) {
            log.warn(`${prefix()}URL gambar sensor tidak ditemukan.`);
            startRetry();
            return false;
        }

        mc.status = STATUS.PROCESSING;
        mc.processing = true;
        clearRetryTimer();
        try {
            log.info(`${prefix()}Mengunduh sensor: ${imageUrl}`);
            const buffer = await getDownloader()(imageUrl);
            log.info(`${prefix()}Memproses gambar dengan neo3.js...`);
            const code = decoder(buffer);
            if (!code) {
                log.warn(`${prefix()}neo3.js tidak mengenali gambar sensor.`);
                recordHistory({ type: 'decode-failed', url: imageUrl });
                startRetry();
                return false;
            }
            mc.lastCode = code;
            mc.phase = PHASE.AWAITING_VERDICT;
            recordHistory({ type: 'code', code, url: imageUrl });
            log.success(`${prefix()}Kode terdeteksi: ${code}. Mengirim ke DM Lucy...`);
            const sent = await sendDm(code);
            if (!sent) {
                startRetry();
                return false;
            }
            return true;
        } catch (error) {
            log.error(`${prefix()}Gagal memproses sensor: ${error.message}`);
            recordHistory({ type: 'error', message: error.message });
            startRetry();
            return false;
        } finally {
            mc.processing = false;
        }
    };

    const startRetry = async () => {
        mc.retryCount += 1;
        const maxRetries = settings().maxRetries;
        if (maxRetries > 0 && mc.retryCount > maxRetries) {
            log.error(`${prefix()}Batas percobaan tercapai (${maxRetries}). Menghentikan proses & melanjutkan loop.`);
            recordHistory({ type: 'gave-up', retryCount: mc.retryCount });
            await finishCatch({ stopped: true });
            return 'gave-up';
        }
        mc.status = STATUS.WAITING_RETRY;
        mc.phase = PHASE.AWAITING_REFRESH;
        log.warn(`${prefix()}Sensor gagal/belum cocok (percobaan ${mc.retryCount}). Mengirim "ulang"...`);
        await sleep(850);
        await sendDm('ulang');
        return 'retry';
    };

    const handleRefreshNotice = (msg) => {
        const text = messageText(msg);
        const waitMs = parseWaitTimeMs(text) || settings().retryWaitMs;
        mc.status = STATUS.WAITING_RETRY;
        mc.phase = PHASE.AWAITING_NEW_SENSOR;
        clearRetryTimer();
        log.info(`${prefix()}Lucy minta menunggu ${Math.round(waitMs / 1000)} detik sebelum sensor baru.`);
        recordHistory({ type: 'refresh', waitMs });
        mc.retryTimer = setTimeout(async () => {
            mc.retryTimer = null;
            log.info(`${prefix()}Waktu tunggu selesai; kirim "ulang" untuk sensor baru.`);
            await sendDm('ulang');
        }, waitMs);
        if (typeof mc.retryTimer.unref === 'function') mc.retryTimer.unref();
        return 'waiting';
    };

    const finishCatch = async (reason = {}) => {
        clearRetryTimer();
        mc.status = STATUS.RESUMING;
        recordHistory({ type: 'done', ...reason });
        resumeLoops();
        mc.status = STATUS.IDLE;
        mc.phase = PHASE.IDLE;
        mc.retryCount = 0;
        mc.lastCode = null;
        mc.channelId = '';
        log.success(`${prefix()}Proses catch selesai; loop kembali normal.`);
        return true;
    };

    async function handle(msg) {
        const cfg = settings();
        if (!cfg.enabled || !msg || !state.client?.isReady()) return false;
        if (String(msg.author?.id || '') !== CONSTANTS.LUCY_BOT_ID) return false;

        const isDM = !msg.guild || msg.channel?.type === 'DM' || msg.channel?.type === 1;
        if (!isDM) return false;

        const text = messageText(msg);
        if (!text) return false;

        // Sensor baru saat tidak ada catch berjalan: hanya terima dari channel DM Lucy yang dikonfigurasi.
        const incomingChannelId = String(msg.channel?.id || msg.channelId || '');
        if (!mc.active && text.includes(SENSOR_TRIGGER_TEXT) && cfg.dmChannelId && incomingChannelId && incomingChannelId !== cfg.dmChannelId) {
            log.info(`${prefix()}Sensor Lucy dari channel lain diabaikan (${incomingChannelId} ≠ ${cfg.dmChannelId}).`);
            return false;
        }
        if (mc.active && !mc.channelId && incomingChannelId) mc.channelId = incomingChannelId;

        // Konfirmasi selesai selalu diproses, apapun statusnya.
        if (text.includes(DONE_TRIGGER_TEXT)) {
            if (markHandled(msg)) return false;
            await finishCatch({ confirmed: true });
            return true;
        }

        if (text.includes(MISMATCH_TRIGGER_TEXT)) {
            if (mc.active && !markHandled(msg)) {
                await startRetry();
                return true;
            }
            return false;
        }

        if (text.includes(REFRESH_TRIGGER_TEXT)) {
            if (mc.active && mc.status === STATUS.WAITING_RETRY && !markHandled(msg)) {
                await handleRefreshNotice(msg);
                return true;
            }
            return false;
        }

        if (text.includes(SENSOR_TRIGGER_TEXT)) {
            const imageUrl = extractImageUrl(msg);
            if (!imageUrl) return false;
            if (markHandled(msg)) return false;
            if (mc.active) {
                return processSensor(msg);
            }
            return beginCatch(msg);
        }

        return false;
    }

    return {
        handle,

        async start() {
            // Mon catcher pasif: tidak ada timer startup. DM Lucy langsung diproses di handle().
        },

        stop() {
            clearRetryTimer();
            if (mc.active && loopManager && typeof loopManager.resumeMonsterCatch === 'function') {
                loopManager.resumeMonsterCatch();
                mc.active = false;
            }
            mc.status = STATUS.IDLE;
            mc.phase = PHASE.IDLE;
        },

        getStatus() {
            return {
                enabled: settings().enabled,
                autoPauseLoops: settings().autoPauseLoops,
                retryWaitMs: settings().retryWaitMs,
                maxRetries: settings().maxRetries,
                dmChannelId: resolveDmChannelId(),
                status: mc.status,
                phase: mc.phase,
                active: !!mc.active,
                processing: !!mc.processing,
                retryCount: mc.retryCount,
                lastCode: mc.lastCode,
                lastTriggerAt: mc.lastTriggerAt,
                channelId: mc.channelId,
                history: mc.history.slice(0, 10)
            };
        }
    };
};

module.exports.normalizeMonsterCatcherSettings = normalizeMonsterCatcherSettings;
module.exports.extractImageUrl = extractImageUrl;
module.exports.messageText = messageText;
module.exports.parseWaitTimeMs = parseWaitTimeMs;
module.exports.CONSTANTS = { SENSOR_TRIGGER_TEXT, DONE_TRIGGER_TEXT, MISMATCH_TRIGGER_TEXT, REFRESH_TRIGGER_TEXT, STATUS, PHASE };
