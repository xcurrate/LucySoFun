const log = require('../../logger');
const { randomInt, accountPrefix } = require('../utils');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
module.exports = (state, commandSender) => ({

    // Pastikan storage loop tersimpan di state runtime masing-masing akun.
    init() {
        state.nextAt = state.nextAt || {};
        state.loops = state.loops || {};
        state.isBusy = !!state.isBusy;
    },

    async otherCommand(index, remaining) {
        const command = state.config.otherCommands?.[index];
        const key = `other${index + 1}`;
        if (!command?.enabled || !command.text?.trim() || !command.channelId?.trim()) return;

        // count kosong/0 = infinite.
        const infinite = !(Number(command.count) > 0);
        const sendsLeft = infinite
            ? Infinity
            : Math.max(1, Number.isFinite(Number(remaining)) && Number(remaining) > 0 ? Number(remaining) : Number(command.count));
        if (state.monsterCatchPaused || state.rest?.active) {
            this._scheduleOtherCommandDelay(index, sendsLeft, 0);
            return;
        }

        let sent = false;
        try {
            sent = await commandSender.send(
                command.text.trim(),
                `Other Command ${index + 1}`,
                command.channelId.trim(),
                { allowWhilePaused: true }
            );
        } catch (error) {
            log.error(`${accountPrefix(state)}❌ Gagal Other Command ${index + 1}: ${error.message || error}`);
        }

        if (!command.enabled) return;

        // Hanya command yang benar-benar terkirim yang mengurangi target pengiriman.
        if (!sent) {
            this._scheduleOtherCommandDelay(index, sendsLeft, command.delayMs);
        } else if (sendsLeft > 1) {
            this._scheduleOtherCommandDelay(index, infinite ? Infinity : sendsLeft - 1, command.delayMs);
        } else {
            state.loops[key] = null;
            command.enabled = false;
            if (typeof state.persistConfig === 'function') state.persistConfig();
            log.info(`${accountPrefix(state)}✅ Other Command ${index + 1} selesai (${command.count} pengiriman).`);
        }
    },

    _scheduleOtherCommandDelay(index, remaining, delayMs) {
        const key = `other${index + 1}`;
        const command = state.config.otherCommands?.[index];
        if (!command?.enabled) return;

        state.otherCommandDelays = state.otherCommandDelays || {};
        const delay = {
            index,
            remaining,
            remainingMs: Math.max(0, Number(delayMs) || 0),
            startedAt: null,
            timer: null,
            restPaused: !!state.rest?.active,
            monsterPaused: !!state.monsterCatchPaused
        };
        state.otherCommandDelays[key] = delay;

        const resumeDelay = () => {
            if (state.otherCommandDelays?.[key] !== delay || !command.enabled) return;
            if (delay.restPaused || delay.monsterPaused) return;
            if (state.monsterCatchPaused) {
                delay.remainingMs = Math.max(0, Number(delay.remainingMs) || 0);
                return;
            }
            delay.startedAt = Date.now();
            delay.timer = setTimeout(() => {
                if (state.otherCommandDelays?.[key] !== delay || !command.enabled) return;
                state.otherCommandDelays[key] = null;
                state.loops[key] = null;
                this.otherCommand(index, remaining);
            }, delay.remainingMs);
            state.loops[key] = delay.timer;
            state.nextAt[key] = Date.now() + delay.remainingMs;
        };
        delay.resume = resumeDelay;
        resumeDelay();
    },

    pauseOtherCommandDelays({ reason = 'rest' } = {}) {
        const flag = reason === 'monster' ? 'monsterPaused' : 'restPaused';
        Object.entries(state.otherCommandDelays || {}).forEach(([key, delay]) => {
            if (!delay || delay[flag]) return;
            const wasRunning = !delay.restPaused && !delay.monsterPaused;
            delay[flag] = true;
            if (!wasRunning) return;
            if (delay.timer) clearTimeout(delay.timer);
            delay.timer = null;
            delay.remainingMs = Math.max(0, delay.remainingMs - (Date.now() - (delay.startedAt || Date.now())));
            delay.startedAt = null;
            state.loops[key] = null;
            delete state.nextAt[key];
        });
    },

    resumeOtherCommandDelays({ reason = 'rest' } = {}) {
        const flag = reason === 'monster' ? 'monsterPaused' : 'restPaused';
        Object.values(state.otherCommandDelays || {}).forEach(delay => {
            if (!delay?.[flag]) return;
            delay[flag] = false;
            if (!delay.restPaused && !delay.monsterPaused) delay.resume();
        });
    },

    // Monster Catcher: jeda seluruh loop command Lucy dengan menyimpan sisa delay.
    pauseMonsterCatch() {
        if (state.monsterCatchPaused) {
            log.info(`${accountPrefix(state)}🐾 Monster Catcher sudah menjeda loop; sisa delay tetap tersimpan.`);
            return;
        }
        state.monsterCatchPaused = true;
        this.pauseOtherCommandDelays({ reason: 'monster' });
        log.warn(`${accountPrefix(state)}🐾 MONSTER CATCHER aktif: seluruh loop command dijeda (sisa delay tersimpan).`);
    },

    resumeMonsterCatch() {
        if (!state.monsterCatchPaused) return;
        state.monsterCatchPaused = false;
        this.resumeOtherCommandDelays({ reason: 'monster' });
        log.success(`${accountPrefix(state)}🐾 Monster Catcher selesai: loop dilanjutkan dari sisa delay.`);
    },

    startOtherCommand(index) {
        const command = state.config.otherCommands?.[index];
        if (!command?.enabled || !command.text?.trim() || !command.channelId?.trim()) return false;

        const key = `other${index + 1}`;
        const delay = state.otherCommandDelays?.[key];
        if (delay?.timer) clearTimeout(delay.timer);
        if (state.otherCommandDelays) state.otherCommandDelays[key] = null;
        if (state.loops[key]) clearTimeout(state.loops[key]);
        state.loops[key] = null;
        this.otherCommand(index, command.count);
        return true;
    },

    clearOtherCommandTimers(index) {
        const key = `other${index + 1}`;
        const delay = state.otherCommandDelays?.[key];
        if (delay?.timer) clearTimeout(delay.timer);
        if (state.otherCommandDelays) state.otherCommandDelays[key] = null;
        if (state.loops[key]) clearTimeout(state.loops[key]);
        state.loops[key] = null;
        delete state.nextAt[key];
    },

    stopOtherCommand(index) {
        this.clearOtherCommandTimers(index);
        const command = state.config.otherCommands?.[index];
        if (command) command.enabled = false;
        if (typeof state.persistConfig === 'function') state.persistConfig();
        log.info(`${accountPrefix(state)}⏹️ Other Command ${index + 1} dihentikan.`);
    },

    stopOtherCommands() {
        (state.config.otherCommands || []).forEach((_, index) => this.stopOtherCommand(index));
    },

    // Start All: menjalankan seluruh Custom Command Lucy yang aktif.
    startAll() {
        this.init();

        if (state.rest?.active) {
            log.info(`${accountPrefix(state)}😴 Start loop ditunda: sedang istirahat.`);
            return false;
        }

        // Hentikan timer yang sedang berjalan tanpa menonaktifkan/menyimpan command,
        // lalu mulai ulang semua slot yang enabled.
        (state.config.otherCommands || []).forEach((_, index) => this.clearOtherCommandTimers(index));
        (state.config.otherCommands || []).forEach((command, index) => {
            if (command?.enabled && command.text?.trim() && command.channelId?.trim()) {
                this.startOtherCommand(index);
            }
        });

        log.success(`${accountPrefix(state)}🔄 Semua Custom Command Lucy dimulai / resume`);
        return true;
    },

    // stopAll: menghentikan semuanya (tidak menghapus sisa delay milik Monster Catcher).
    stopAll() {
        this.stopOtherCommands();
        if (state.responseTimeout) {
            clearTimeout(state.responseTimeout);
            state.responseTimeout = null;
        }
        log.info(`${accountPrefix(state)}⏹️ Semua loop dihentikan`);
    }
});
