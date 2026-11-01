const CONSTANTS = require('../constants');
const log = require('../../logger');
const { sleep, randomInt, accountPrefix } = require('../utils');
const { sendWithCooldownRetry } = require('../services/cooldownHandler');
const statsService = require('../services/stats');

module.exports = (state, channelManager, emergencyHandler) => ({
    async send(cmd, type = '', targetChannelId = '', options = {}) {
        const allowDuringCaptcha = options.allowDuringCaptcha === true;
        const allowWhilePaused = options.allowWhilePaused === true;
        if (state.hasActiveCaptcha && !allowDuringCaptcha) {
            log.warn(`${accountPrefix(state)}⚠️ Command [${cmd}] ditahan: CAPTCHA sedang aktif.`);
            return false;
        }
        if (state.rest?.active && options.allowDuringRest !== true) {
            log.info(`${accountPrefix(state)}😴 Command [${cmd}] ditahan: sedang istirahat.`);
            return false;
        }
        if ((state.config.botStatus.paused || !state.config.botStatus.running) && !state.isStartupReadyRoutine && !allowWhilePaused) return false;
        if (!state.client?.isReady()) return false;

        const requestedChannelId = String(targetChannelId || '').trim();
        if (!requestedChannelId && !state.activeChannelId && !channelManager.updateActive()) return false;

        const channel = state.client.channels.cache.get(requestedChannelId || state.activeChannelId);
        if (!channel) return false;

        await channel.sendTyping();
        await sleep(randomInt(CONSTANTS.MIN_TYPING_DELAY, CONSTANTS.MAX_TYPING_DELAY));

        if (state.hasActiveCaptcha && !allowDuringCaptcha) {
            log.warn(`${accountPrefix(state)}⚠️ Command [${cmd}] dibatalkan setelah typing: CAPTCHA sedang aktif.`);
            return false;
        }

        if (state.hasActiveCaptcha && !allowDuringCaptcha) return false;

        // Aktifkan timeout sebelum pengiriman agar balasan Lucy yang ditunggu helper
        // tetap dapat membersihkan timeout yang sudah ada.
        if (type === 'Battle' || type === 'Hunt') {
            this.setResponseTimeout(type);
        } else if (String(type).startsWith('Other Command')) {
            state.lastLucyCommandChannelId = channel.id;
            this.setLucyResponseTimeout(type);
        }

        const sent = await sendWithCooldownRetry(channel, cmd, {
            state,
            feature: type || 'Command',
            timeoutMs: 5 * 60 * 1000,
            responseTimeoutMs: CONSTANTS.RESPONSE_TIMEOUT_MS
        });

        if (!sent) {
            if (type === 'Battle' || type === 'Hunt') this.clearResponseTimeout();
            else if (String(type).startsWith('Other Command')) this.clearLucyResponseTimeout();
            return false;
        }

        statsService.recordCommand(state, cmd, type);
        log.info(`${accountPrefix(state)}📨 Sent: ${cmd} [${type}]`);
        return true;
    },

    setResponseTimeout(type) {
        if (state.responseTimeout) {
            log.warn(`${accountPrefix(state)}⏳ Timeout already active, skipping new timeout for ${type}`);
            return;
        }

        state.responseTimeout = setTimeout(() => {
            log.error(`${accountPrefix(state)}⛔ TIMEOUT 40s - No response from OwO for ${type}`);
            emergencyHandler.pause('TIMEOUT 40s (OwO No Response)');
        }, CONSTANTS.RESPONSE_TIMEOUT_MS);

        log.info(`${accountPrefix(state)}⏲️ Response timeout set for ${type}: ${CONSTANTS.RESPONSE_TIMEOUT_MS / 1000}s`);
    },

    clearResponseTimeout() {
        if (state.responseTimeout) {
            clearTimeout(state.responseTimeout);
            state.responseTimeout = null;
            log.info(`${accountPrefix(state)}✅ Response timeout cleared - OwO responded in time`);
        }
    },

    setLucyResponseTimeout(type) {
        if (state.lucyResponseTimeout) {
            log.warn(`${accountPrefix(state)}⏳ Timeout Lucy masih aktif; timeout baru untuk ${type} dilewati.`);
            return;
        }

        // Dengarkan hanya balasan dari bot Lucy; pesan OwO tidak boleh membatalkan timeout ini.
        if (state.client?.on && state.lucyMessageTimeoutClient !== state.client) {
            state.lucyMessageTimeoutListener = (msg) => {
                if (String(msg?.author?.id || '') === CONSTANTS.LUCY_BOT_ID) {
                    this.clearLucyResponseTimeout();
                }
            };
            state.client.on('message', state.lucyMessageTimeoutListener);
            state.lucyMessageTimeoutClient = state.client;
        }

        state.lucyResponseTimeout = setTimeout(() => {
            state.lucyResponseTimeout = null;
            log.error(`${accountPrefix(state)}⛔ TIMEOUT ${CONSTANTS.RESPONSE_TIMEOUT_MS / 1000}s - Tidak ada respons dari Lucy untuk ${type}.`);
            emergencyHandler.pause(`TIMEOUT ${CONSTANTS.RESPONSE_TIMEOUT_MS / 1000}s (Lucy No Response)`);
        }, CONSTANTS.RESPONSE_TIMEOUT_MS);

        log.info(`${accountPrefix(state)}⏲️ Lucy response timeout aktif untuk ${type}: ${CONSTANTS.RESPONSE_TIMEOUT_MS / 1000}s`);
    },

    clearLucyResponseTimeout() {
        if (state.lucyResponseTimeout) {
            clearTimeout(state.lucyResponseTimeout);
            state.lucyResponseTimeout = null;
            log.info(`${accountPrefix(state)}✅ Timeout Lucy dibatalkan: respons dari bot Lucy diterima.`);
        }
    }
});
