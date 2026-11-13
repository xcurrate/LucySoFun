const { Client } = require('discord.js-selfbot-v13');
const log = require('../../logger');
const { accountPrefix } = require('../utils');
const statsService = require('../services/stats');

module.exports = (state, configManager, messageHandler, telegramService, voiceManager, huntbot2Manager, dailyManager) => ({
    initialize() {
        if (state.client) {
            log.warn(`${accountPrefix(state)}🔄 Merestart sesi Discord...`);
            try {
                state.client.destroy();
            } catch (e) { }
            state.client = null;
        }

        state.client = new Client({ checkUpdate: false });

        state.client.on('ready', () => {
            state.accountUsername = state.client.user.tag || state.client.user.username || '';
            log.success(`${accountPrefix(state)}✅ Login Sukses: ${state.client.user.tag}`);
            telegramService.send(`🤖 <b>Bot Started</b>\nUser: ${state.client.user.tag}`);

            state.config.botStatus = state.config.botStatus || { running: false, paused: true };
            if (typeof state.config.botStatus.running !== 'boolean') state.config.botStatus.running = false;
            if (typeof state.config.botStatus.paused !== 'boolean') state.config.botStatus.paused = !state.config.botStatus.running;
            statsService.syncBotUptime(state);
            configManager.save();

            if (voiceManager && state.config.botStatus?.running === true && state.config.botStatus?.paused !== true) {
                voiceManager.joinConfigured('restart').catch(err => log.error(`${accountPrefix(state)}❌ Auto Join VC gagal: ${err.message}`));
            }

            // Rutinitas setiap bot baru startup: Huntbot2 mengirim lhb ke channel
            // huntbot2 (captcha ditangani lewat pesan Lucy), lalu siklus lhb diulang
            // saat Lucy mengirim "siap berburu". Daily hanya menjadwalkan 00:00 WIB.
            if (huntbot2Manager && typeof huntbot2Manager.start === 'function') {
                huntbot2Manager.start();
            }
            if (dailyManager && typeof dailyManager.start === 'function') {
                dailyManager.start();
            }
        });

        state.client.on('messageCreate', (msg) => messageHandler.handle(msg));
        state.client.on('messageUpdate', (_oldMsg, newMsg) => messageHandler.handleUpdate(newMsg));

        if (state.activeToken && state.activeToken.length > 20) {
            state.client.login(state.activeToken).catch(e => {
                log.error(`${accountPrefix(state)}❌ Token Invalid / Login Gagal: ${e.message}`);
            });
        } else {
            log.error(`${accountPrefix(state)}❌ Tidak ada token yang valid di config!`);
        }
    }
});
