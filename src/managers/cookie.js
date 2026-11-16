const log = require('../../logger');
const { accountPrefix } = require('../utils');
const { getPrimaryCommandChannelId } = require('./commandSlots');
const { msUntilNextMidnightWib, wibDateKey, scheduleDaily } = require('./dailySchedule');

const DEFAULT_COMMAND = 'lucy rep';

// "Send Cookie": kirim `lucy rep` ke target terpilih. Opsi ping menentukan
// apakah target di-tag (<@id>) atau hanya id mentah.
const normalizeCookieSettings = (raw = {}) => ({
    enabled: raw.enabled === true,
    // Slot channel sendiri; bila kosong, cookie memakai channel command utama.
    channelId: String(raw.channelId || '').trim(),
    targetId: String(raw.targetId || '').replace(/[^0-9]/g, ''),
    ping: raw.ping === true,
    command: String(raw.command || DEFAULT_COMMAND).trim() || DEFAULT_COMMAND,
    lastRunDate: String(raw.lastRunDate || '').trim()
});

// target kosong -> hanya command; ping -> command <@id>; no ping -> command <id>.
const buildCookieCommand = (settings = {}) => {
    const command = String(settings.command || DEFAULT_COMMAND).trim() || DEFAULT_COMMAND;
    const targetId = String(settings.targetId || '').replace(/[^0-9]/g, '');
    if (!targetId) return command;
    return settings.ping === true ? `${command} <@${targetId}>` : `${command} ${targetId}`;
};

module.exports = function createCookieManager(state, configManager, commandSender) {
    const settings = () => (configManager.getCookieSettings
        ? configManager.getCookieSettings()
        : normalizeCookieSettings(state.config?.settings?.cookie));
    const prefix = () => accountPrefix(state) + '🍪 Cookie: ';
    // Channel khusus cookie bila diisi; jika kosong, ikut channel command utama
    // (Custom Commands / Command Tetap).
    const resolveChannelId = () => settings().channelId
        || getPrimaryCommandChannelId(state.config)
        || String(state.lastLucyCommandChannelId || '').trim();

    state.cookie = state.cookie || { lastRunAt: 0, nextRunAt: 0, timer: null };
    if (typeof state.cookie.startupSent !== 'boolean') state.cookie.startupSent = false;

    const clearTimer = () => {
        if (state.cookie.timer) clearTimeout(state.cookie.timer);
        state.cookie.timer = null;
    };

    const runCookie = async ({ reason = 'manual' } = {}) => {
        const cfg = settings();
        const channelId = resolveChannelId();
        if (!cfg.enabled || !channelId) {
            log.warn(prefix() + 'Aksi dilewati: fitur nonaktif atau channel command belum diatur.');
            return false;
        }
        if (!state.client?.isReady()) {
            log.warn(prefix() + 'Aksi dilewati: client Discord belum siap.');
            return false;
        }
        const status = state.config?.botStatus || {};
        if (status.paused || !status.running) {
            log.warn(prefix() + 'Aksi dilewati: akun sedang pause/stop.');
            return false;
        }

        const command = buildCookieCommand(cfg);
        const sent = await commandSender.send(command, 'Cookie', channelId);
        if (sent) {
            state.cookie.lastRunAt = Date.now();
            state.config.settings.cookie = { ...(state.config.settings.cookie || {}), lastRunDate: wibDateKey() };
            if (typeof state.persistConfig === 'function') state.persistConfig();
            log.success(prefix() + `Perintah "${command}" dikirim ke channel ${channelId} (${reason}).`);
        } else {
            log.warn(prefix() + `Gagal mengirim "${command}" ke channel ${channelId}.`);
        }
        return sent;
    };

    const scheduleNext = () => {
        const delay = scheduleDaily({
            state,
            key: 'cookie',
            isActive: () => settings().enabled,
            onError: (error) => log.error(prefix() + 'Aksi cookie gagal: ' + (error.message || error)),
            onFire: async () => {
                if (settings().lastRunDate === wibDateKey()) return;
                await runCookie({ reason: 'jadwal 00:00 WIB' });
            }
        });
        log.info(prefix() + `Aksi cookie dijadwalkan pukul 00:00 WIB (dalam ${Math.round(delay / 60000)} menit).`);
    };

    return {
        // Rutinitas startup: kirim sekali per sesi login, lalu pasang jadwal 00:00 WIB.
        start() {
            const cfg = settings();
            if (!cfg.enabled) {
                log.info(prefix() + 'Fitur nonaktif; penjadwal cookie tidak dijalankan.');
                return false;
            }
            const status = state.config?.botStatus || {};
            if (status.paused || !status.running) {
                log.info(prefix() + 'Akun belum berjalan; penjadwal cookie ditunda.');
                return false;
            }
            const channelId = resolveChannelId();
            if (!channelId) {
                log.warn(prefix() + 'Channel command utama belum diatur; penjadwal cookie tidak dijalankan.');
                return false;
            }

            if (!state.cookie.startupSent) {
                state.cookie.startupSent = true;
                log.info(prefix() + 'Rutinitas startup: mengirim cookie ke channel ' + channelId + '.');
                runCookie({ reason: 'startup' }).catch(error => log.error(prefix() + 'Aksi cookie startup gagal: ' + (error.message || error)));
            }
            scheduleNext();
            return true;
        },

        markClientReady() {
            state.cookie.startupSent = false;
        },

        stop() {
            clearTimer();
            state.cookie.nextRunAt = 0;
        },

        runNow() {
            return runCookie({ reason: 'manual' });
        },

        getStatus() {
            const cfg = settings();
            return {
                enabled: cfg.enabled,
                channelId: resolveChannelId(),
                channelSlotId: cfg.channelId,
                targetId: cfg.targetId,
                ping: cfg.ping,
                command: cfg.command,
                lastRunDate: cfg.lastRunDate,
                nextRunAt: state.cookie.nextRunAt,
                lastRunAt: state.cookie.lastRunAt
            };
        }
    };
};

module.exports.normalizeCookieSettings = normalizeCookieSettings;
module.exports.buildCookieCommand = buildCookieCommand;
module.exports.DEFAULT_COMMAND = DEFAULT_COMMAND;
