const CONSTANTS = require('../constants');
const log = require('../../logger');
const { sleep, randomInt, accountPrefix } = require('../utils');
const statsService = require('../services/stats');

module.exports = (state, emergencyHandler) => ({
    async runLucyAction(action, options = {}) {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        // Aksi "idleOnly" (mis. rutinitas lhb Huntbot2) menunggu antrian diam dulu,
        // supaya command utama (Custom Command, Adventure, Gems, ...) tetap
        // didahulukan; setelah itu barulah masuk antrian normal (berurutan).
        if (options.idleOnly) await this.waitForLucyQueueIdle(options.idleMs, options.maxWaitMs);
        const previous = state.lucyActionQueue || Promise.resolve();
        let release;
        state.lucyActionQueue = new Promise(resolve => { release = resolve; });
        state.lucyActionPending = Number(state.lucyActionPending || 0) + 1;
        await previous;
        try {
            const remaining = (state.lucyCooldownUntil || 0) - Date.now();
            if (remaining > 0) await wait(remaining + 1500);
            if (!options.skipRetry) state.lucyCooldownLastAction = action;
            return await action();
        } finally {
            state.lucyActionPending = Math.max(0, Number(state.lucyActionPending || 0) - 1);
            release();
        }
    },

    // Menunggu antrian aksi Lucy kosong selama `idleMs` berturut-turut. Dipakai
    // aksi prioritas rendah agar tidak menyerobot command utama yang sedang jalan.
    waitForLucyQueueIdle(idleMs = 800, maxWaitMs = 90000) {
        const grace = Math.max(0, Number(idleMs) || 0);
        const deadline = Date.now() + Math.max(0, Number(maxWaitMs) || 0);
        return new Promise(resolve => {
            let quietSince = null;
            const tick = () => {
                if (Number(state.lucyActionPending || 0) === 0) {
                    if (quietSince === null) quietSince = Date.now();
                    if (Date.now() - quietSince >= grace) return resolve(true);
                } else {
                    quietSince = null;
                }
                if (Date.now() >= deadline) return resolve(false);
                setTimeout(tick, 250);
            };
            tick();
        });
    },

    async handleLucyCooldownMessage(msg) {
        if (String(msg?.author?.id || '') !== CONSTANTS.LUCY_BOT_ID) return false;
        const embeds = (msg.embeds || []).flatMap(embed => [embed.title, embed.description, ...(embed.fields || []).flatMap(field => [field.name, field.value])]);
        const components = msg.components || [];
        const text = [msg.content || '', ...embeds, JSON.stringify(components)].join('\n');
        const match = text.match(/Pelan-pelan dan coba lagi command-nya\s*<t:(\d+):R>/i);
        if (!match) return false;
        const timestamp = Number(match[1]) * 1000;
        const remaining = timestamp - Date.now();
        if (!Number.isFinite(timestamp) || remaining <= 0) return false;
        state.lucyCooldownUntil = Math.max(state.lucyCooldownUntil || 0, timestamp);
        if (state.lucyCooldownTimer) clearTimeout(state.lucyCooldownTimer);
        const retryAction = state.lucyCooldownLastAction;
        if (typeof retryAction === 'function') {
            const delay = Math.max(0, state.lucyCooldownUntil - Date.now()) + 1500;
            log.warn(`${accountPrefix(state)}⏱️ Lucy cooldown terdeteksi. Mengulang aksi setelah ${Math.ceil(delay / 1000)} detik.`);
            state.lucyCooldownTimer = setTimeout(async () => {
                state.lucyCooldownTimer = null;
                try {
                    await this.runLucyAction(retryAction);
                } catch (error) {
                    log.error(`${accountPrefix(state)}❌ Retry aksi Lucy gagal: ${error.message || error}`);
                }
            }, delay);
        }
        return true;
    },

    async send(cmd, type = '', targetChannelId = '', options = {}) {
        const sendAction = () => this.sendRaw(cmd, type, targetChannelId, options);
        // Pair Command Tetap (lb/lh): harus berurutan dalam antrian aksi Lucy agar
        // tidak bertabrakan dengan Adventure/Gems; TANPA retry cooldown (agar tidak
        // mengirim duplikat lh saat Lucy meminta "pelan-pelan").
        if (type === 'Other Command 4' || type === 'Other Command 5') {
            return this.runLucyAction(sendAction, { skipRetry: true });
        }
        if (/^(Adventure|Gems|Daily)/i.test(String(type))) return this.runLucyAction(sendAction);
        // Huntbot2 berbagi antrian aksi Lucy yang sama. Rutinitas startup lhb
        // (idleOnly) menunggu antrian diam dulu agar command utama diprioritaskan,
        // lalu tetap berurutan; tanpa retry cooldown agar lhb tidak terkirim ganda.
        if (String(type) === 'Huntbot2') {
            return this.runLucyAction(sendAction, options.idleOnly
                ? { idleOnly: true, idleMs: options.idleMs, maxWaitMs: options.maxWaitMs, skipRetry: true }
                : {});
        }
        return sendAction();
    },

    async sendRaw(cmd, type = '', targetChannelId = '', options = {}) {
        const allowWhilePaused = options.allowWhilePaused === true;
        if (state.monsterCatchPaused && options.allowDuringMonsterCatch !== true) {
            log.warn(`${accountPrefix(state)}🐾 Command [${cmd}] ditahan: Monster Catcher sedang aktif.`);
            return false;
        }
        if (state.rest?.active && options.allowDuringRest !== true) {
            log.info(`${accountPrefix(state)}😴 Command [${cmd}] ditahan: sedang istirahat.`);
            return false;
        }
        if ((state.config.botStatus.paused || !state.config.botStatus.running) && !state.isStartupReadyRoutine && !allowWhilePaused) return false;
        if (!state.client?.isReady()) return false;

        const requestedChannelId = String(targetChannelId || '').trim();
        if (!requestedChannelId) return false;

        const channel = state.client.channels.cache.get(requestedChannelId);
        if (!channel) return false;

        await channel.sendTyping();
        await sleep(randomInt(CONSTANTS.MIN_TYPING_DELAY, CONSTANTS.MAX_TYPING_DELAY));

        const maxRetries = 2;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await channel.send(cmd);
                statsService.recordCommand(state, cmd, type);
                log.info(`${accountPrefix(state)}📨 Sent: ${cmd} [${type}]`);

                if (String(type).startsWith('Other Command')) {
                    // Simpan channel yang dipakai Custom Command agar recovery linv mengecek server yang sama.
                    state.lastLucyCommandChannelId = channel.id;
                    // Timer 40s: jika Lucy tidak merespons, emergency pause akun ini
                    // lalu probe linv tiap 10 menit akan melanjutkan slot yang sama.
                    this.setLucyResponseTimeout(type);
                }
                return true;
            } catch (e) {
                lastError = e;

                const isRateLimit = e.code === 429 || (e.message && e.message.toLowerCase().includes('rate limit'));
                const isNetworkError = e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || e.message?.includes('fetch');

                if (attempt < maxRetries && (isRateLimit || isNetworkError)) {
                    const delay = 1500 * attempt;
                    log.warn(`${accountPrefix(state)}⚠️ Gagal kirim command [${cmd}] (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms... (${e.message})`);
                    await sleep(delay);
                    continue;
                }

                log.error(`${accountPrefix(state)}❌ Gagal mengirim command [${cmd}] [${type}] setelah ${attempt} percobaan: ${e.message}`, {
                    code: e.code,
                    status: e.status,
                    command: cmd,
                    type: type,
                    stack: e.stack?.split('\n').slice(0, 5).join('\n')
                });
                break;
            }
        }

        return false;
    },

    setLucyResponseTimeout(type) {
        if (state.lucyResponseTimeout) {
            log.warn(`${accountPrefix(state)}⏳ Timeout Lucy masih aktif; timeout baru untuk ${type} dilewati.`);
            return;
        }

        // Respons yang valid: pesan dari Lucy di channel aktif yang memuat
        // username akun ini (nickname per-server), baik di teks maupun embed.
        // Pesan Lucy lain (chat orang lain, notifikasi, dll.) tidak membatalkan.
        if (state.client?.on && state.lucyMessageTimeoutClient !== state.client) {
            state.lucyMessageTimeoutListener = (msg) => {
                if (String(msg?.author?.id || '') !== CONSTANTS.LUCY_BOT_ID) return;
                const commandChannelId = String(state.lastLucyCommandChannelId || '');
                if (commandChannelId && String(msg.channel?.id || '') !== commandChannelId) return;

                const text = this.messageTextOf(msg);
                const matchesOwnUsername = this.getOwnServerUsername(msg).some(username => text.includes(username));
                if (matchesOwnUsername) this.clearLucyResponseTimeout();
            };
            state.client.on('messageCreate', state.lucyMessageTimeoutListener);
            state.lucyMessageTimeoutClient = state.client;
        }

        state.lucyResponseTimeout = setTimeout(() => {
            state.lucyResponseTimeout = null;
            log.error(`${accountPrefix(state)}⛔ TIMEOUT ${CONSTANTS.RESPONSE_TIMEOUT_MS / 1000}s - Tidak ada respons dari Lucy untuk ${type}.`);
            if (emergencyHandler?.pause) {
                emergencyHandler.pause(`TIMEOUT ${CONSTANTS.RESPONSE_TIMEOUT_MS / 1000}s (Lucy No Response)`);
            }
        }, CONSTANTS.RESPONSE_TIMEOUT_MS);

        log.info(`${accountPrefix(state)}⏲️ Lucy response timeout aktif untuk ${type}: ${CONSTANTS.RESPONSE_TIMEOUT_MS / 1000}s`);
    },

    clearLucyResponseTimeout() {
        if (state.lucyResponseTimeout) {
            clearTimeout(state.lucyResponseTimeout);
            state.lucyResponseTimeout = null;
            log.info(`${accountPrefix(state)}✅ Timeout Lucy dibatalkan: respons dari bot Lucy diterima.`);
        }
    },

    messageTextOf(msg) {
        const parts = [msg.content || ''];
        for (const embed of msg.embeds || []) {
            parts.push(embed.author?.name || '', embed.title || '', embed.description || '', embed.footer?.text || '');
            for (const field of embed.fields || []) parts.push(field.name || '', field.value || '');
        }
        return parts.join('\n').toLowerCase();
    },

    getOwnServerUsername(msg) {
        const memberName = msg.guild?.members?.me?.displayName;
        const username = state.client?.user?.username;
        const tag = state.client?.user?.tag;
        return [memberName, username, tag, state.accountUsername]
            .map(value => String(value || '').trim().toLowerCase())
            .filter(Boolean);
    }
});
