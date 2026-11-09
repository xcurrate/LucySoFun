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

    // Command Tetap lh+lb adalah SATU UNIT: selalu dikirim berpasangan.
    // - Unit dimulai pada slot lb (leader); setiap iterasi: lb -> (typing) -> lh -> tunggu
    // - Tersedia hanya jika salah satu slot masih menyalakan; enabled selalu sinkron.
    _getRotation() {
        const lb = getCommandSlot(state.config, 3);
        const lh = getCommandSlot(state.config, 4);
        const lbOk = lb?.command?.enabled && lb.command.text?.trim() && lb.command.channelId?.trim();
        const lhOk = lh?.command?.enabled && lh.command.text?.trim() && lh.command.channelId?.trim();
        if (!lbOk && !lhOk) return null;
        return [
            { slot: lb, pairWith: lh },
            { slot: lh }
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
        const leader = getCommandSlot(state.config, 3);
        const follower = getCommandSlot(state.config, 4);
        const leaderCommand = leader?.command;
        const PairKey = 'fixedlb';
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
            if (!leaderCommand?.enabled || !leaderCommand.text?.trim() || !leaderCommand.channelId?.trim()) return;
            const infinite = !(Number(leaderCommand.count) > 0);
            const sendsLeft = infinite
                ? Infinity
                : Math.max(1, Number.isFinite(Number(remaining)) && Number(remaining) > 0 ? Number(remaining) : Number(leaderCommand.count));
            if (state.monsterCatchPaused || state.rest?.active) {
                this._scheduleOtherCommandDelay(leaderIndex, sendsLeft, 0);
                return;
            }

            // lb -> (jeda mengetik) -> lh
            let lbOk = false;
            try {
                lbOk = await commandSender.send(
                    leaderCommand.text.trim(),
                    'Other Command 4', leaderCommand.channelId.trim()
                );
            } catch (error) {
                log.error(`${accountPrefix(state)}❌ Gagal ${leader.text} : ${error.message || error}`);
            }

            const followerCommand = follower?.command;
            let lhOk = false;
            // lh dikirim HANYA setelah lb benar-benar terkirim dan kondisi masih aman.
            if (lbOk
                && !state.monsterCatchPaused
                && !state.rest?.active
                && followerCommand?.enabled
                && followerCommand.text?.trim()
                && followerCommand.channelId?.trim()) {
                await wait(randomInt(250, 600)); // jeda "sedang mengetik" alami
                try {
                    lhOk = await commandSender.send(
                        followerCommand.text.trim(),
                        'Other Command 5', followerCommand.channelId.trim()
                    );
                } catch (error) {
                    log.error(`${accountPrefix(state)}❌ Gagal ${follower.text} : ${error.message || error}`);
                }
            }

            if (!leaderCommand.enabled) return;

            if (!lbOk && !lhOk) {
                this._scheduleOtherCommandDelay(leaderIndex, sendsLeft, resolveDelayMs(leaderCommand));
            } else if (sendsLeft > 1) {
                this._scheduleOtherCommandDelay(leaderIndex, infinite ? Infinity : sendsLeft - 1, resolveDelayMs(leaderCommand));
            } else {
                state.loops[PairKey] = null;
                setSlotEnabled(state.config, Number(leaderIndex), false);
                setSlotEnabled(state.config, Number(leaderIndex) + 1, false);
                if (typeof state.persistConfig === 'function') state.persistConfig();
                log.info(`${accountPrefix(state)}✅ Pair ${leader.text}+${follower.text} selesai (${leaderCommand.count} pengiriman).`);
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
        // START di follower lh mengarah ke leader lb; keduanya selalu satu unit.
        const lbSlot = getCommandSlot(state.config, 3);
        const lhSlot = getCommandSlot(state.config, 4);
        if (Number(index) === lhSlot?.index) {
            return this.startOtherCommand(lbSlot.index, initialDelayMs, options);
        }
        if (Number(index) === lbSlot?.index) {
            const lbCmd = lbSlot?.command;
            const lhCmd = lhSlot?.command;
            if (!lbCmd?.enabled || !lbCmd.text?.trim() || !lbCmd.channelId?.trim()) {
                if (!lhCmd?.enabled || !lhCmd.text?.trim() || !lhCmd.channelId?.trim()) return false;
                // Normalisasi menjaga keduanya sinkron; jika data lama tidak sinkron,
                // pakai data lh untuk leader agar pair tetap jalan (bukan lh saja).
                state.config.fixedCommands.lb = {
                    ...state.config.fixedCommands.lb,
                    text: 'lb',
                    channelId: lhCmd.channelId,
                    delayMinMs: lhCmd.delayMinMs,
                    delayMaxMs: lhCmd.delayMaxMs,
                    count: lhCmd.count,
                    enabled: true
                };
            }
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
        // STOP pada salah satu slot pasangan lh+lb menghentikan keduanya.
        if (Number(index) === 3 || Number(index) === 4) {
            if (getCommandSlot(state.config, 3)?.command?.enabled || getCommandSlot(state.config, 4)?.command?.enabled) {
                this.clearOtherCommandTimers(3);
                this.clearOtherCommandTimers(4);
                setSlotEnabled(state.config, 3, false);
                setSlotEnabled(state.config, 4, false);
                if (typeof state.persistConfig === 'function') state.persistConfig();
                log.info(`${accountPrefix(state)}⏹️ Pasangan lh+lb dihentikan.`);
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
        // Command Tetap (lb/lh) adalah SATU UNIT: cukup mulai sekali lewat leader
        // (index 3) supaya `startOtherCommand` menjalankan recovery channel-nya.
        // Kalau tiap slot diperiksa sendiri di sini, unit yang channel lb-nya kosong
        // tapi lh-nya terisi (atau key lb tidak ada) akan lolos tanpa pernah jalan —
        // tombol kartu tetap jalan karena lewat `startOtherCommand`, tapi START ALL
        // dan kontrol Lucy (yang memanggil startAll) tidak. Lihat _getRotation().
        const rotation = this._getRotation();
        const fixedStartIndex = rotation ? rotation[0].slot.index : null;

        // Mulai slot secara bertahap (bukan serempak) agar tidak mengirim beruntun
        // ketika resume setelah emergency pause.
        let staggerMs = 0;
        let position = 0;
        slots.forEach(slot => {
            const command = slot.command;
            if (slot.fixed) {
                // Unit lb/lh hanya dimulai sekali, dari leader.
                if (slot.index !== fixedStartIndex) return;
            } else if (!command?.enabled || !command.text?.trim() || !command.channelId?.trim()) {
                return;
            }
            this.startOtherCommand(slot.index, staggerMs + position * 500, { skipIfRunning: true });
            staggerMs += Math.max(500, resolveDelayMs(command));
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
