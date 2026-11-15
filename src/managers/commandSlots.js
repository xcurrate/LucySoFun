const { randomInt, normalizeSendCount } = require('../utils');
const { COOLDOWN_POLICY, SLOT_TIER } = require('../constants');
const { fixedDelayRange } = require('../tierPolicy');

const CUSTOM_SLOT_COUNT = 3;
// Command Tetap lb + lh = SATU UNIT (persis seperti wh/wb dulu): teks terkunci,
// satu channel, satu delay, satu count, satu flag enabled. Tidak ada konfigurasi
// per-slot, jadi tidak mungkin ada "lh kosong" / "lb kosong" yang berbeda.
const FIXED_PAIR = [
    { key: 'lb', text: 'lb', label: 'Command Tetap lb' },
    { key: 'lh', text: 'lh', label: 'Command Tetap lh' }
];
const TOTAL_SLOT_COUNT = CUSTOM_SLOT_COUNT + FIXED_PAIR.length;
// Default jeda Custom Commands. Batas bawah per tier ditangani tierPolicy.
const DEFAULT_DELAY_MS = COOLDOWN_POLICY.customDefaultMs;

const toDelayMs = (value, fallback) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(0, Math.round(num));
};

// Min dan max boleh sama; bila tertukar, ditukar otomatis.
const normalizeDelayRange = (command = {}, fallbackMs = DEFAULT_DELAY_MS) => {
    const legacy = toDelayMs(command.delayMs, fallbackMs);
    const min = toDelayMs(command.delayMinMs, legacy);
    const max = toDelayMs(command.delayMaxMs, min);
    return { delayMinMs: Math.min(min, max), delayMaxMs: Math.max(min, max) };
};

const normalizeCustomCommand = (command = {}, fallbackMs = DEFAULT_DELAY_MS) => {
    const range = normalizeDelayRange(command, fallbackMs);
    return {
        text: String(command.text || ''),
        delayMs: range.delayMinMs,
        delayMinMs: range.delayMinMs,
        delayMaxMs: range.delayMaxMs,
        count: normalizeSendCount(command.count),
        channelId: String(command.channelId || ''),
        enabled: command.enabled === true
    };
};

const normalizeOtherCommands = (commands, fallbackMs = DEFAULT_DELAY_MS) => {
    const list = Array.isArray(commands) ? commands : [];
    return Array.from({ length: CUSTOM_SLOT_COUNT }, (_, index) => normalizeCustomCommand(list[index] || {}, fallbackMs));
};

// SATU unit: { channelId, delayMinMs, delayMaxMs, count, enabled }. Bentuk lama
// ({ lb, lh } dengan channel terpisah) digabung saat dimuat supaya config lama
// tetap jalan tanpa perlu diubah manual.
const normalizeFixedCommands = (fixedCommands = {}, fallbackMs = DEFAULT_DELAY_MS) => {
    const source = fixedCommands && typeof fixedCommands === 'object' ? fixedCommands : {};
    const legacyPair = source.lb || source.lh;
    const merged = legacyPair
        ? {
            // lb adalah leader: nilai lb menang saat keduanya ada; lh mengisi yang kosong.
            ...(source.lh || {}),
            ...(source.lb || {}),
            channelId: source.lb?.channelId || source.lh?.channelId || '',
            enabled: source.lb?.enabled === true || source.lh?.enabled === true
        }
        : source;
    const range = normalizeDelayRange(merged, fallbackMs);
    return {
        delayMs: range.delayMinMs,
        delayMinMs: range.delayMinMs,
        delayMaxMs: range.delayMaxMs,
        count: normalizeSendCount(merged.count),
        channelId: String(merged.channelId || ''),
        enabled: merged.enabled === true
    };
};

// Command Tetap dikunci per tier: premium 15-16 dtk, reguler 17-20 dtk (tidak
// bisa kustom). Diterapkan saat config dimuat/dijalankan, bukan di normalizer,
// agar konfigurasi internal (mis. pengujian loop) tetap bisa memakai jeda kecil.
const lockFixedDelay = (config = {}, tier = SLOT_TIER.PREMIUM) => {
    if (config.fixedCommands) {
        const range = fixedDelayRange(tier);
        config.fixedCommands.delayMs = range.delayMinMs;
        config.fixedCommands.delayMinMs = range.delayMinMs;
        config.fixedCommands.delayMaxMs = range.delayMaxMs;
    }
    return config;
};

// Slot 0..2 = custom (bisa diedit), slot 3..4 = Command Tetap lb/lh (satu unit).
// Kedua slot membaca SATU sumber (config.fixedCommands) yang sama, jadi
// channel/delay/count-nya tidak mungkin berbeda.
const getCommandSlots = (config = {}) => {
    const slots = [];
    for (let index = 0; index < CUSTOM_SLOT_COUNT; index += 1) {
        slots.push({
            index,
            key: `other${index + 1}`,
            label: `Other Command ${index + 1}`,
            fixed: null,
            command: config.otherCommands?.[index] || null
        });
    }
    const fixed = config.fixedCommands || null;
    FIXED_PAIR.forEach((entry, offset) => {
        const index = CUSTOM_SLOT_COUNT + offset;
        slots.push({
            index,
            key: `fixed${entry.key}`,
            label: entry.label,
            fixed: entry.key,
            text: entry.text,
            command: fixed ? { ...fixed, text: entry.text } : null
        });
    });
    return slots;
};

// index bisa berupa angka slot (0..4) atau key ('fixedlb'/'fixedlh'/'other1').
const getCommandSlot = (config, index) => {
    if (typeof index === 'string') {
        const key = index.toLowerCase();
        return getCommandSlots(config).find(slot => slot.key === key) || null;
    }
    return getCommandSlots(config)[Number(index)] || null;
};

const setSlotEnabled = (config, index, enabled) => {
    const setFixed = () => {
        if (config.fixedCommands) config.fixedCommands.enabled = enabled;
    };
    if (typeof index === 'string') {
        const key = index.toLowerCase();
        if (key === 'fixedlb' || key === 'fixedlh') {
            setFixed();
            return;
        }
        const slot = getCommandSlot(config, key);
        const command = config.otherCommands?.[slot?.index];
        if (command) command.enabled = enabled;
        return;
    }
    if (Number(index) < CUSTOM_SLOT_COUNT) {
        const command = config.otherCommands?.[Number(index)];
        if (command) command.enabled = enabled;
        return;
    }
    // Command Tetap = satu unit: index 3 atau 4 sama-sama menyalakan unitnya.
    setFixed();
};

// Jeda acak dalam rentang min-max (inklusif).
const resolveDelayMs = (command = {}, fallbackMs = DEFAULT_DELAY_MS) => {
    const legacy = toDelayMs(command.delayMs, fallbackMs);
    const min = toDelayMs(command.delayMinMs, legacy);
    const max = toDelayMs(command.delayMaxMs, min);
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return lo === hi ? lo : randomInt(lo, hi);
};

// Channel command utama: dipakai fitur harian (Lucy Daily / Send Cookie) yang
// TIDAK punya slot channel sendiri. Urutan prioritas: Custom Command yang aktif
// dan punya channel -> Custom Command mana pun yang punya channel -> Command
// Tetap lb+lh (aktif dulu) -> ''. Fallback terakhir (channel command terakhir)
// ditangani pemanggil.
const getPrimaryCommandChannelId = (config = {}) => {
    const channelOf = (command) => String(command?.channelId || '').trim();
    const customs = Array.isArray(config.otherCommands) ? config.otherCommands : [];

    const enabledCustom = customs.find(command => command?.enabled === true && channelOf(command));
    if (enabledCustom) return channelOf(enabledCustom);

    const anyCustom = customs.find(command => channelOf(command));
    if (anyCustom) return channelOf(anyCustom);

    const fixed = config.fixedCommands;
    if (fixed?.enabled === true && channelOf(fixed)) return channelOf(fixed);
    return channelOf(fixed);
};

module.exports = {
    CUSTOM_SLOT_COUNT,
    TOTAL_SLOT_COUNT,
    FIXED_PAIR,
    DEFAULT_DELAY_MS,
    normalizeDelayRange,
    normalizeCustomCommand,
    normalizeOtherCommands,
    normalizeFixedCommands,
    lockFixedDelay,
    getCommandSlots,
    getCommandSlot,
    getPrimaryCommandChannelId,
    setSlotEnabled,
    resolveDelayMs
};
