const { randomInt, normalizeSendCount } = require('../utils');

const CUSTOM_SLOT_COUNT = 3;
const FIXED_COMMANDS = [
    { key: 'lb', text: 'lb' },
    { key: 'lh', text: 'lh' }
];
const TOTAL_SLOT_COUNT = CUSTOM_SLOT_COUNT + FIXED_COMMANDS.length;
const DEFAULT_DELAY_MS = 5000;

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

const normalizeFixedCommand = (settings = {}, fallbackMs = DEFAULT_DELAY_MS) => {
    const range = normalizeDelayRange(settings, fallbackMs);
    return {
        delayMs: range.delayMinMs,
        delayMinMs: range.delayMinMs,
        delayMaxMs: range.delayMaxMs,
        count: normalizeSendCount(settings.count),
        channelId: String(settings.channelId || ''),
        enabled: settings.enabled === true
    };
};

const normalizeOtherCommands = (commands, fallbackMs = DEFAULT_DELAY_MS) => {
    const list = Array.isArray(commands) ? commands : [];
    return Array.from({ length: CUSTOM_SLOT_COUNT }, (_, index) => normalizeCustomCommand(list[index] || {}, fallbackMs));
};

// Command Tetap (lb + lh) adalah SATU UNIT: keduanya menyala/berhenti bersama
// dan lh mewarisi channel/delay/count dari leader (lb) saat kosong.
const normalizeFixedCommands = (fixedCommands = {}, fallbackMs = DEFAULT_DELAY_MS) => {
    const source = fixedCommands && typeof fixedCommands === 'object' ? fixedCommands : {};
    const out = {};
    // Jika salah satu slot masih enabled (dari config lama), pasangan dianggap aktif.
    const pairEnabled = FIXED_COMMANDS.some(({ key }) => source[key]?.enabled === true);
    FIXED_COMMANDS.forEach(({ key }) => {
        out[key] = normalizeFixedCommand(source[key] || {}, fallbackMs);
        out[key].enabled = pairEnabled;
    });
    // Unit: follower lh mengikuti leader lb (channel & delay) jika miliknya kosong.
    const lb = out.lb;
    const lh = out.lh;
    if (lb.channelId && !lh.channelId) {
        lh.channelId = lb.channelId;
        lh.delayMs = lb.delayMs;
        lh.delayMinMs = lb.delayMinMs;
        lh.delayMaxMs = lb.delayMaxMs;
        lh.count = lb.count;
    }
    return out;
};

// Slot 0..2 = custom (bisa diedit), slot 3..4 = command tetap lh/lb.
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
    FIXED_COMMANDS.forEach((fixed, offset) => {
        const index = CUSTOM_SLOT_COUNT + offset;
        const settings = config.fixedCommands?.[fixed.key];
        slots.push({
            index,
            key: `fixed${fixed.key}`,
            label: `Other Command ${index + 1}`,
            fixed: fixed.key,
            text: fixed.text,
            command: settings ? { ...settings, text: fixed.text } : null
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
    if (typeof index === 'string') {
        const slot = getCommandSlot(config, index);
        const command = config.otherCommands?.[slot?.index];
        if (slot && slot.fixed) {
            // Command Tetap = satu unit: ubah enabled kedua slot (lb & lh) sekaligus.
            FIXED_COMMANDS.forEach(({ key }) => {
                if (config.fixedCommands?.[key]) config.fixedCommands[key].enabled = enabled;
            });
        } else if (command) command.enabled = enabled;
        return;
    }
    if (index < CUSTOM_SLOT_COUNT) {
        const command = config.otherCommands?.[index];
        if (command) command.enabled = enabled;
        return;
    }
    const key = FIXED_COMMANDS[index - CUSTOM_SLOT_COUNT]?.key;
    if (key && config.fixedCommands?.[key]) {
        FIXED_COMMANDS.forEach(({ key: k }) => {
            if (config.fixedCommands?.[k]) config.fixedCommands[k].enabled = enabled;
        });
    }
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

module.exports = {
    CUSTOM_SLOT_COUNT,
    TOTAL_SLOT_COUNT,
    FIXED_COMMANDS,
    DEFAULT_DELAY_MS,
    normalizeDelayRange,
    normalizeCustomCommand,
    normalizeFixedCommand,
    normalizeOtherCommands,
    normalizeFixedCommands,
    getCommandSlots,
    getCommandSlot,
    setSlotEnabled,
    resolveDelayMs
};
