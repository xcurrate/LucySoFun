// Penjadwalan harian bersama (Lucy Daily & Send Cookie): target 00:00 WIB.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Jarak (ms) menuju tengah malam berikutnya menurut WIB (UTC+7), terlepas
// dari zona waktu mesin. 00:00 WIB = 17:00 UTC hari sebelumnya.
const msUntilNextMidnightWib = (now = Date.now()) => {
    const wibNow = now + WIB_OFFSET_MS;
    const nextMidnight = (Math.floor(wibNow / DAY_MS) + 1) * DAY_MS;
    return nextMidnight - wibNow;
};

// Tanggal WIB (YYYY-MM-DD) untuk `now`. Dipakai agar aksi harian hanya
// berjalan sekali per hari meski bot beberapa kali restart.
const wibDateKey = (now = Date.now()) => new Date(now + WIB_OFFSET_MS).toISOString().slice(0, 10);

// Arm timer harian: kirim `onFire` pada 00:00 WIB berikutnya, lalu ulangi.
// `isActive` dipakai agar timer tidak jalan saat fitur dimatikan.
const scheduleDaily = ({ onFire, isActive, state, key = 'daily', onError = () => {} }) => {
    const clear = () => {
        if (state[key]?.timer) clearTimeout(state[key].timer);
        state[key].timer = null;
    };
    clear();
    const delay = msUntilNextMidnightWib();
    state[key].nextRunAt = Date.now() + delay;
    state[key].timer = setTimeout(async () => {
        state[key].timer = null;
        try { await onFire(); }
        catch (error) { onError(error); }
        if (isActive()) scheduleDaily({ onFire, isActive, state, key, onError });
    }, delay);
    if (typeof state[key].timer.unref === 'function') state[key].timer.unref();
    return delay;
};

module.exports = { WIB_OFFSET_MS, DAY_MS, msUntilNextMidnightWib, wibDateKey, scheduleDaily };
