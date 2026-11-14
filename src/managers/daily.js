const CONSTANTS = require('../constants');
const log = require('../../logger');
const { accountPrefix, removeInvisibleChars, sleep } = require('../utils');

const DEFAULT_COMMAND = 'lucy daily';
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const STREAK_PATTERN = /streak harianmu\s+(\d+)\s+hari/i;

const normalizeDailySettings = (raw = {}) => ({
    enabled: raw.enabled === true,
    channelId: String(raw.channelId || '').trim(),
    command: String(raw.command || DEFAULT_COMMAND).trim() || DEFAULT_COMMAND
});

// Jarak (ms) menuju tengah malam berikutnya menurut WIB (UTC+7), terlepas
// dari zona waktu mesin. 00:00 WIB = 17:00 UTC hari sebelumnya.
const msUntilNextMidnightWib = (now = Date.now()) => {
    const wibNow = now + WIB_OFFSET_MS;
    const nextMidnight = (Math.floor(wibNow / DAY_MS) + 1) * DAY_MS;
    return nextMidnight - wibNow;
};

const collectEmbedTexts = (msg) => (msg?.embeds || []).flatMap(embed => [
    embed?.author?.name,
    embed?.title,
    embed?.description,
    embed?.footer?.text,
    ...(embed?.fields || []).flatMap(field => [field.name, field.value])
]);

// Tombol "ambil/klaim daily" bila Lucy menyertakannya di balasan.
const DAILY_BUTTON_PATTERN = /(daily|klaim|claim|ambil|hadiah|reward)/i;
const findDailyButton = (msg) => {
    const buttons = (msg?.components || []).flatMap(row => row?.components || []);
    return buttons.find(button => {
        if (!button || button.disabled === true) return false;
        const customId = String(button.custom_id || button.customId || '');
        const label = String(button.label || '');
        return DAILY_BUTTON_PATTERN.test(customId) || DAILY_BUTTON_PATTERN.test(label);
    }) || null;
};

const messageText = (msg) => removeInvisibleChars([
    msg?.content || '',
    ...collectEmbedTexts(msg)
].filter(Boolean).join('\n'));

// Balasan daily Lucy memuat nama server dan "streak harianmu xx hari!".
const parseDailyResponse = (msg) => {
    const text = messageText(msg);
    const match = text.match(STREAK_PATTERN);
    if (!match) return null;

    let server = '';
    const bold = text.match(/\*\*([^*\n]+)\*\*/);
    if (bold) server = bold[1].trim();
    if (!server) {
        const embed = (msg?.embeds || []).find(item => item?.author?.name || item?.title);
        server = String(embed?.author?.name || embed?.title || '').trim();
    }

    return { server, days: parseInt(match[1], 10), text: text.trim() };
};

module.exports = function createDailyManager(state, configManager, commandSender, options = {}) {
    const pollMs = Math.max(10, Number(options.pollMs) || 1000);
    const settings = () => (configManager.getDailySettings
        ? configManager.getDailySettings()
        : normalizeDailySettings(state.config?.settings?.daily));
    const prefix = () => accountPrefix(state) + '🗓️ Daily: ';

    state.daily = state.daily || { lastRunAt: 0, lastResult: null, nextRunAt: 0, timer: null };

    const clearTimer = () => {
        if (state.daily.timer) clearTimeout(state.daily.timer);
        state.daily.timer = null;
    };

    const runDaily = async () => {
        const cfg = settings();
        const channelId = cfg.channelId || String(state.lastLucyCommandChannelId || '').trim();
        if (!cfg.enabled || !channelId) {
            log.warn(prefix() + 'Aksi daily dilewati: fitur nonaktif atau channel belum diatur.');
            return false;
        }
        if (!state.client?.isReady()) {
            log.warn(prefix() + 'Aksi daily dilewati: client Discord belum siap.');
            return false;
        }
        const status = state.config?.botStatus || {};
        if (status.paused || !status.running) {
            log.warn(prefix() + 'Aksi daily dilewati: akun sedang pause/stop.');
            return false;
        }

        const sent = await commandSender.send(cfg.command, 'Daily', channelId);
        if (sent) {
            state.daily.lastRunAt = Date.now();
            log.success(prefix() + `Perintah "${cfg.command}" dikirim ke channel ${channelId}.`);
        } else {
            log.warn(prefix() + `Gagal mengirim "${cfg.command}" ke channel ${channelId}.`);
        }
        return sent;
    };

    const scheduleNext = () => {
        clearTimer();
        const delay = msUntilNextMidnightWib();
        state.daily.nextRunAt = Date.now() + delay;
        state.daily.timer = setTimeout(async () => {
            state.daily.timer = null;
            try { await runDaily(); }
            catch (error) { log.error(prefix() + 'Aksi daily gagal: ' + (error.message || error)); }
            if (settings().enabled) scheduleNext();
        }, delay);
        if (typeof state.daily.timer.unref === 'function') state.daily.timer.unref();
        log.info(prefix() + `Aksi daily dijadwalkan pukul 00:00 WIB (dalam ${Math.round(delay / 60000)} menit).`);
    };

    return {
        // Deteksi balasan Lucy yang memuat nama server + "streak harianmu xx hari!".
        async handle(msg) {
            const cfg = settings();
            if (!cfg.enabled || !msg) return false;
            if (String(msg.author?.id || '') !== CONSTANTS.LUCY_BOT_ID) return false;

            const channelId = cfg.channelId || String(state.lastLucyCommandChannelId || '').trim();
            if (channelId && String(msg.channel?.id || msg.channelId || '') !== channelId) return false;

            const parsed = parseDailyResponse(msg);
            if (!parsed) return false;

            state.daily.lastResult = { ...parsed, at: Date.now() };
            log.success(prefix() + `Server "${parsed.server || 'tidak terdeteksi'}" · streak harian ${parsed.days} hari.`);

            // Aksi daily: klik tombol klaim bila Lucy menyertakannya.
            const button = findDailyButton(msg);
            if (button) {
                const customId = button.custom_id || button.customId;
                try {
                    if (typeof msg.clickButton === 'function') await msg.clickButton(customId);
                    else if (typeof button.click === 'function') await button.click();
                    log.success(prefix() + 'Tombol daily diklik (' + customId + ').');
                } catch (error) {
                    log.error(prefix() + 'Gagal klik tombol daily: ' + (error.message || error));
                }
            }
            return true;
        },

        start() {
            const cfg = settings();
            if (!cfg.enabled) {
                log.info(prefix() + 'Fitur nonaktif; penjadwal daily tidak dijalankan.');
                return false;
            }
            // Aksi daily hanya relevan saat akun berjalan (bukan pause/stop).
            const status = state.config?.botStatus || {};
            if (status.paused || !status.running) {
                log.info(prefix() + 'Akun belum berjalan; penjadwal daily ditunda.');
                return false;
            }
            if (!cfg.channelId && !state.lastLucyCommandChannelId) {
                log.warn(prefix() + 'Channel commands belum diatur; penjadwal daily tidak dijalankan.');
                return false;
            }
            scheduleNext();
            return true;
        },

        stop() {
            clearTimer();
            state.daily.nextRunAt = 0;
        },

        runNow() {
            return runDaily();
        },

        getStatus() {
            const cfg = settings();
            return {
                enabled: cfg.enabled,
                channelId: cfg.channelId,
                command: cfg.command,
                nextRunAt: state.daily.nextRunAt,
                lastRunAt: state.daily.lastRunAt,
                lastResult: state.daily.lastResult
            };
        }
    };
};

module.exports.normalizeDailySettings = normalizeDailySettings;
module.exports.msUntilNextMidnightWib = msUntilNextMidnightWib;
module.exports.parseDailyResponse = parseDailyResponse;
module.exports.findDailyButton = findDailyButton;
module.exports.messageText = messageText;
module.exports.DEFAULT_COMMAND = DEFAULT_COMMAND;
