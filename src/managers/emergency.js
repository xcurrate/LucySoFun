const CONSTANTS = require('../constants');
const log = require('../../logger');
const { accountPrefix } = require('../utils');
const statsService = require('../services/stats');

const RECOVERY_PROBE_INTERVAL_MS = 10 * 60 * 1000;

module.exports = (state, configManager, loopManager, channelManager, telegramService) => {
    const clearRecoveryProbe = () => {
        if (state.emergencyRecoveryTimer) {
            clearInterval(state.emergencyRecoveryTimer);
            state.emergencyRecoveryTimer = null;
        }
        if (state.emergencyRecoveryListener && state.emergencyRecoveryClient) {
            state.emergencyRecoveryClient.removeListener('messageCreate', state.emergencyRecoveryListener);
        }
        state.emergencyRecoveryListener = null;
        state.emergencyRecoveryClient = null;
        state.emergencyRecoveryPending = null;
    };

    const getOwnServerUsername = (msg) => {
        const memberName = msg.guild?.members?.me?.displayName;
        const username = state.client?.user?.username;
        const tag = state.client?.user?.tag;
        return [memberName, username, tag, state.accountUsername]
            .map(value => String(value || '').trim().toLowerCase())
            .filter(Boolean);
    };

    const messageText = (msg) => {
        const parts = [msg.content || ''];
        for (const embed of msg.embeds || []) {
            parts.push(embed.author?.name || '', embed.title || '', embed.description || '', embed.footer?.text || '');
            for (const field of embed.fields || []) parts.push(field.name || '', field.value || '');
        }
        return parts.join('\n').toLowerCase();
    };

    const resumeAfterRecovery = () => {
        state.emergencyRecoveryActive = false;
        clearRecoveryProbe();
        state.config.botStatus.paused = false;
        state.config.botStatus.running = true;
        statsService.syncBotUptime(state);
        configManager.save();
        log.success(`${accountPrefix(state)}✅ Respons linv Lucy cocok dengan username akun; melanjutkan sesi yang terkena emergency pause.`);
        if (loopManager && typeof loopManager.startAll === 'function') loopManager.startAll();
        if (channelManager && typeof channelManager.updateActive === 'function') channelManager.updateActive();
        telegramService?.send?.(`✅ <b>Bot Resumed</b>\nAlasan: respons <code>linv</code> Lucy berisi username akun ini.`);
    };

    const sendRecoveryProbe = async () => {
        if (!state.emergencyRecoveryActive) return;
        if (!state.client?.isReady()) {
            log.warn(`${accountPrefix(state)}⏳ Recovery check linv ditunda: client Discord belum siap.`);
            return;
        }

        const channelId = String(state.lastLucyCommandChannelId || state.activeChannelId || '').trim();
        const channel = channelId ? state.client.channels.cache.get(channelId) : null;
        if (!channel || typeof channel.send !== 'function') {
            log.warn(`${accountPrefix(state)}⚠️ Recovery check linv dilewati: channel aktif tidak tersedia.`);
            return;
        }

        try {
            state.emergencyRecoveryPending = {
                channelId: channel.id,
                requestedAt: Date.now()
            };
            await channel.send('linv');
            log.info(`${accountPrefix(state)}🔎 Recovery check: mengirim linv untuk memastikan Lucy sudah merespons.`);
        } catch (error) {
            state.emergencyRecoveryPending = null;
            log.warn(`${accountPrefix(state)}⚠️ Gagal mengirim linv untuk recovery: ${error.message}`);
        }
    };

    const ensureRecoveryListener = () => {
        if (!state.client?.on || state.emergencyRecoveryClient === state.client) return;
        if (state.emergencyRecoveryListener && state.emergencyRecoveryClient) {
            state.emergencyRecoveryClient.removeListener('messageCreate', state.emergencyRecoveryListener);
        }

        state.emergencyRecoveryListener = (msg) => {
            const pending = state.emergencyRecoveryPending;
            if (!state.emergencyRecoveryActive || !pending) return;
            if (String(msg.author?.id || '') !== CONSTANTS.LUCY_BOT_ID) return;
            if (String(msg.channel?.id || '') !== pending.channelId) return;
            if (Number(msg.createdTimestamp || 0) < pending.requestedAt) return;

            const text = messageText(msg);
            const matchesOwnUsername = getOwnServerUsername(msg).some(username => text.includes(username));
            if (matchesOwnUsername) resumeAfterRecovery();
        };
        state.client.on('messageCreate', state.emergencyRecoveryListener);
        state.emergencyRecoveryClient = state.client;
    };

    return {
        pause(reason) {
            log.error(`${accountPrefix(state)}⛔ ${reason} -> PAUSE.`);
            state.config.botStatus.paused = true;
            state.config.botStatus.running = false;
            statsService.syncBotUptime(state);
            configManager.save();

            if (loopManager && typeof loopManager.stopAll === 'function') {
                loopManager.stopAll();
            } else {
                log.warn(`${accountPrefix(state)}loopManager not available, skipping stopAll`);
            }

            // Recovery probing only verifies Lucy availability; it does not run normal bot commands.
            state.emergencyRecoveryActive = true;
            ensureRecoveryListener();
            if (!state.emergencyRecoveryTimer) {
                state.emergencyRecoveryTimer = setInterval(() => {
                    // Jika pengguna sudah menyalakan bot secara manual, hentikan recovery otomatis.
                    if (state.config.botStatus?.running === true && state.config.botStatus?.paused !== true) {
                        state.emergencyRecoveryActive = false;
                        clearRecoveryProbe();
                        return;
                    }
                    ensureRecoveryListener();
                    sendRecoveryProbe();
                }, RECOVERY_PROBE_INTERVAL_MS);
                log.info(`${accountPrefix(state)}🕒 Recovery check linv dijadwalkan setiap 10 menit selama emergency pause.`);
            }

            telegramService.send(`⛔ <b>Bot Paused</b>\nAlasan: ${reason}`);
        },

        // Dipakai Control Lucy: melanjutkan akun yang terjeda emergency/timeout
        // secara manual, tanpa menunggu recovery linv.
        resume() {
            state.emergencyRecoveryActive = false;
            clearRecoveryProbe();
            state.config.botStatus.paused = false;
            state.config.botStatus.running = true;
            statsService.syncBotUptime(state);
            configManager.save();
            log.success(`${accountPrefix(state)}✅ Bot dilanjutkan manual melalui Control Lucy.`);
            if (loopManager && typeof loopManager.startAll === 'function') loopManager.startAll();
            if (channelManager && typeof channelManager.updateActive === 'function') channelManager.updateActive();
            telegramService?.send?.(`✅ <b>Bot Resumed</b>\nAlasan: Control Lucy (start).`);
        }
    };
};
