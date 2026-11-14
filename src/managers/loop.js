const log = require('../../logger');
const { accountPrefix, randomInt } = require('../utils');
const {
    getCommandSlot,
    getCommandSlots,
    setSlotEnabled,
    resolveDelayMs
} = require('./commandSlots');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
module.exports = (state, commandSender) => ({
    slotAt(index) {
        return getCommandSlot(state.config, Number(index));
    },

    // Command Tetap lb+lh adalah SATU UNIT (seperti wh/wb): teks terkunci,
    // satu channel/delay/count/enabled. Unit dimulai pada slot lb (leader);
    // setiap iterasi: lb -> (typing) -> lh -> tunggu.
    _getRotation() {
        const fixed = state.config.fixedCommands;
        if (!fixed?.enabled || !fixed.channelId?.trim()) return null;
        return [
            { slot: getCommandSlot(state.config, 3), pairWith: getCommandSlot(state.config, 4) },
            { slot: getCommandSlot(state.config, 4) }
        ];
    },

    // Pastikan storage loop tersimpan di state runtime masing-masing akun.
    init() {
        state.nextAt = state.nextAt || {};
        state.loops = state.loops || {};
        state.isBusy = !!state.isBusy;
    },

    // Command Tetap lh+lb adalah SATU UNIT: urutan lb -> (typing) -> lh.
    // Kedua slot (index 3 & 4) mengarah ke leader pair (index 3 = lb).
    async otherCommand(index, remaining) {
        const isFixedSlot = Number(index) === 3 || Number(index) === 4;
        if (isFixedSlot && this._getRotation()) return this._otherCommandPair(3, remaining);

        if (isFixedSlot) {
            // Normalisasi seharusnya menjaga enabled sinkron; jika unit tak tersedia,
            // abaikan (jangan kirim lb/lh sendirian).
            return;
        }

        const slot = this.slotAt(index);
        const command = slot?.command;
        const key = slot?.key || `other${Number(index) + 1}`;
        state.otherCommandRunning = state.otherCommandRunning || {};
        state.otherCommandRunning[key] = true;
        try {
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
                    command.channelId.trim()
                );
            } catch (error) {
                log.error(`${accountPrefix(state)}❌ Gagal Other Command ${index + 1}: ${error.message || error}`);
            }

            if (!command.enabled) return;

            // Hanya command yang benar-benar terkirim yang mengurangi target pengiriman.
            if (!sent) {
                this._scheduleOtherCommandDelay(index, sendsLeft, resolveDelayMs(command));
            } else if (sendsLeft > 1) {
                this._scheduleOtherCommandDelay(index, infinite ? Infinity : sendsLeft - 1, resolveDelayMs(command));
            } else {
                state.loops[key] = null;
                setSlotEnabled(state.config, Number(index), false);
                if (typeof state.persistConfig === 'function') state.persistConfig();
                log.info(`${accountPrefix(state)}✅ ${slot?.label || `Other Command ${Number(index) + 1}`} selesai (${command.count} pengiriman).`);
            }
        } finally {
            state.otherCommandRunning[key] = false;
        }
    },

    async _otherCommandPair(leaderIndex, remaining) {
        const PairKey = 'fixedlb';
        const unit = state.config.fixedCommands;
        state.otherCommandRunning = state.otherCommandRunning || {};

        // lb & lh harus selalu terkirim berurutan sebagai SATU pasangan atomik,
        // persis seperti battle() mengirim wb lalu wh. Tanpa kunci ini, dua START
        // yang berdekatan (tombol/startAll/reconcile) saling menyisip dan
        // menghasilkan lh tanpa lb pendampingnya.
        while (state.fixedPairBusy) {
            await wait(0);
        }
        state.fixedPairBusy = true;
        state.otherCommandRunning[PairKey] = true;
        try {
            if (!unit?.enabled || !unit.channelId?.trim()) return;
            const infinite = !(Number(unit.count) > 0);
            const sendsLeft = infinite
                ? Infinity
                : Math.max(1, Number.isFinite(Number(remaining)) && Number(remaining) > 0 ? Number(remaining) : Number(unit.count));
            if (state.monsterCatchPaused || state.rest?.active) {
                this._scheduleOtherCommandDelay(leaderIndex, sendsLeft, 0);
                return;
            }

            const channelId = unit.channelId.trim();

            // lb -> (jeda mengetik) -> lh
            let lbOk = false;
            try {
                lbOk = await commandSender.send('lb', 'Other Command 4', channelId);
            } catch (error) {
                log.error(`${accountPrefix(state)}❌ Gagal lb : ${error.message || error}`);
            }

            let lhOk = false;
            // lh dikirim HANYA setelah lb benar-benar terkirim dan kondisi masih aman.
            if (lbOk && !state.monsterCatchPaused && !state.rest?.active) {
                await wait(randomInt(250, 600)); // jeda "sedang mengetik" alami
                try {
                    lhOk = await commandSender.send('lh', 'Other Command 5', channelId);
                } catch (error) {
                    log.error(`${accountPrefix(state)}❌ Gagal lh : ${error.message || error}`);
                }
            }

            if (!unit.enabled) return;

            if (!lbOk && !lhOk) {
                this._scheduleOtherCommandDelay(leaderIndex, sendsLeft, resolveDelayMs(unit));
            } else if (sendsLeft > 1) {
                this._scheduleOtherCommandDelay(leaderIndex, infinite ? Infinity : sendsLeft - 1, resolveDelayMs(unit));
            } else {
                state.loops[PairKey] = null;
                setSlotEnabled(state.config, leaderIndex, false);
                if (typeof state.persistConfig === 'function') state.persistConfig();
                log.info(`${accountPrefix(state)}✅ Pair lb+lh selesai (${unit.count} pengiriman).`);
            }
        } finally {
            state.otherCommandRunning[PairKey] = false;
            state.fixedPairBusy = false;
        }
    },

    _scheduleOtherCommandDelay(index, remaining, delayMs) {
        const slot = this.slotAt(index);
        const key = slot?.key || `other${Number(index) + 1}`;
        const command = slot?.command;
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

    startOtherCommand(index, initialDelayMs = 0, options = {}) {
        // START di slot mana pun dari unit lb/lh mengarah ke leader (index 3);
        // keduanya selalu satu unit dan satu konfigurasi.
        if (Number(index) === 4) {
            return this.startOtherCommand(3, initialDelayMs, options);
        }

        const slot = this.slotAt(index);
        const command = slot?.command;
        if (!command?.enabled || !command.text?.trim() || !command.channelId?.trim()) return false;

        const key = slot.key;
        const existing = state.otherCommandDelays?.[key];
        // Saat startAll dipanggil berulang, slot yang masih berjalan tidak di-restart
        // agar tidak memicu pengiriman beruntun.
        if (options.skipIfRunning && (existing?.timer || state.otherCommandRunning?.[key])) return true;

        if (existing?.timer) clearTimeout(existing.timer);
        if (state.otherCommandDelays) state.otherCommandDelays[key] = null;
        if (state.loops[key]) clearTimeout(state.loops[key]);
        state.loops[key] = null;

        const startMs = Math.max(0, Number(initialDelayMs) || 0);
        if (startMs > 0) {
            // Jeda awal per slot: mencegah semua command berangkat bersamaan saat resume.
            state.otherCommandDelays = state.otherCommandDelays || {};
            const delay = { index, remaining: command.count, remainingMs: startMs, startedAt: Date.now(), timer: null };
            state.otherCommandDelays[key] = delay;
            delay.timer = setTimeout(() => {
                if (state.otherCommandDelays?.[key] !== delay) return;
                state.otherCommandDelays[key] = null;
                if (state.monsterCatchPaused || state.rest?.active) {
                    this._scheduleOtherCommandDelay(index, command.count, resolveDelayMs(command));
                    return;
                }
                this.otherCommand(index, command.count);
            }, startMs);
            return true;
        }

        this.otherCommand(index, command.count);
        return true;
    },

    clearOtherCommandTimers(index) {
        const slot = this.slotAt(index);
        const key = slot?.key || `other${Number(index) + 1}`;
        const delay = state.otherCommandDelays?.[key];
        if (delay?.timer) clearTimeout(delay.timer);
        if (state.otherCommandDelays) state.otherCommandDelays[key] = null;
        if (state.loops[key]) clearTimeout(state.loops[key]);
        state.loops[key] = null;
        delete state.nextAt[key];
    },

    stopOtherCommand(index) {
        // STOP pada salah satu slot unit lb/lh menghentikan unitnya.
        if (Number(index) === 3 || Number(index) === 4) {
            if (state.config.fixedCommands?.enabled) {
                this.clearOtherCommandTimers(3);
                this.clearOtherCommandTimers(4);
                setSlotEnabled(state.config, 3, false);
                if (typeof state.persistConfig === 'function') state.persistConfig();
                log.info(`${accountPrefix(state)}⏹️ Command Tetap lb+lh dihentikan.`);
                return true;
            }
        }
        this.clearOtherCommandTimers(index);
        const slot = this.slotAt(index);
        setSlotEnabled(state.config, Number(index), false);
        if (typeof state.persistConfig === 'function') state.persistConfig();
        log.info(`${accountPrefix(state)}⏹️ ${slot?.label || `Other Command ${Number(index) + 1}`} dihentikan.`);
    },

    stopOtherCommands() {
        getCommandSlots(state.config).forEach(slot => this.stopOtherCommand(slot.index));
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
        const slots = getCommandSlots(state.config);
        slots.forEach(slot => this.clearOtherCommandTimers(slot.index));
        // Command Tetap (lb/lh) adalah SATU UNIT dengan SATU konfigurasi, jadi
        // cek `config.fixedCommands` sekali saja; kalau aktif, mulai lewat leader.
        const fixedActive = this._getRotation() !== null;

        // Mulai slot secara bertahap (bukan serempak) agar tidak mengirim beruntun
        // ketika resume setelah emergency pause. Jeda antar-slot harus KECIL dan
        // tetap: memakai delay penuh slot sebelumnya membuat slot terakhir
        // (mis. unit lb/lh) tertunda selama delay slot sebelumnya — kalau delay
        // custom besar, unit lb/lh praktis tidak pernah mulai.
        const START_STAGGER_MS = 500;
        let position = 0;
        slots.forEach(slot => {
            const command = slot.command;
            if (slot.fixed) {
                // Unit lb/lh hanya dimulai sekali, dari leader (index 3).
                if (slot.index !== 3 || !fixedActive) return;
            } else if (!command?.enabled || !command.text?.trim() || !command.channelId?.trim()) {
                return;
            }
            this.startOtherCommand(slot.index, position * START_STAGGER_MS, { skipIfRunning: true });
            position += 1;
        });

        log.success(`${accountPrefix(state)}🔄 Semua Custom Command Lucy dimulai / resume`);
        return true;
    },

    // stopAll: menghentikan semua loop tanpa men-disable slot, sehingga
    // emergency/resume (mis. recovery linv) bisa startAll kembali slot yang sama.
    stopAll() {
        getCommandSlots(state.config).forEach(slot => this.clearOtherCommandTimers(slot.index));
        if (state.lucyResponseTimeout) {
            clearTimeout(state.lucyResponseTimeout);
            state.lucyResponseTimeout = null;
        }
        if (state.responseTimeout) {
            clearTimeout(state.responseTimeout);
            state.responseTimeout = null;
        }
        log.info(`${accountPrefix(state)}⏹️ Semua loop dihentikan (slot tetap aktif).`);
    }
});
