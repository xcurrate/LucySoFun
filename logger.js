const chalk = require('chalk');
const constants = require('./src/constants');

// --- FUNGSI HELPER WIB ---
const getWIBDate = () => {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
};

const formatWIB = () => {
    const d = getWIBDate();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `[${hh}:${mm}:${ss}]`;
};

const INTERNAL_MAX_LINES = 800;
const TERMINAL_MAX_LINES = constants.MAX_LOG_LINES || 20;
const MAX_MESSAGE_LENGTH = 260;
const ACCOUNT_PATTERN = /\[account:([^\]\s]+)(?:\s+user:([^\]]+))?\]/g;
const IMPORTANT_KEYWORDS = [
    'login sukses',
    'token invalid',
    'tidak ada token',
    'bot started',
    'tiket habis',
    'tiket terupdate',
    'config',
    'profil',
    'akun paralel',
    'connect/login',
    'melanjutkan loop',
    'menjeda akun',
    'huntbot returned',
    'huntbot started',
    'huntbot auto mode',
    'gagal',
    'error'
];

// --- LOG BUFFER ---
const entries = [];
const logBuffer = [];
const plainLogBuffer = [];

function compactMessage(msg) {
    const text = String(msg ?? '').replace(/\s+/g, ' ').trim();
    if (text.length <= MAX_MESSAGE_LENGTH) return text;
    return `${text.slice(0, MAX_MESSAGE_LENGTH - 1)}…`;
}

function extractAccountIds(line) {
    const ids = new Set();
    let match;
    ACCOUNT_PATTERN.lastIndex = 0;
    while ((match = ACCOUNT_PATTERN.exec(line))) {
        ids.add(match[1]);
    }
    return Array.from(ids);
}

function hideAccountIds(line) {
    return String(line || '').replace(ACCOUNT_PATTERN, (_match, _accountId, username) => {
        const safeName = username ? String(username).trim() : '';
        return safeName ? `[account:${safeName}]` : '[account]';
    });
}

function isImportantLine(levelPlain, plainLine) {
    if (levelPlain !== '[INFO]') return true;
    const lower = String(plainLine || '').toLowerCase();
    return IMPORTANT_KEYWORDS.some(keyword => lower.includes(keyword));
}

function pushLogLine(entry) {
    entries.push(entry);
    logBuffer.push(entry.coloredLine);
    plainLogBuffer.push(entry.plainLine);

    while (entries.length > INTERNAL_MAX_LINES) entries.shift();
    while (logBuffer.length > TERMINAL_MAX_LINES) logBuffer.shift();
    while (plainLogBuffer.length > INTERNAL_MAX_LINES) plainLogBuffer.shift();
}

// --- RENDER TERMINAL ---
function render() {
    console.clear();
    console.log(logBuffer.join('\n'));
}

function filterEntries(options = {}) {
    const accountId = options.accountId ? String(options.accountId).trim() : '';
    const globalOnly = options.globalOnly === true;
    const limit = Number.isFinite(Number(options.limit)) && Number(options.limit) > 0
        ? Number(options.limit)
        : INTERNAL_MAX_LINES;

    let filtered = entries;
    if (accountId) {
        const accountPrefix = `[account:${accountId}]`;
        filtered = entries.filter(entry =>
            entry.accountIds.includes(accountId) ||
            entry.rawPlainLine?.includes(accountPrefix) ||
            entry.rawPlainLine?.includes(accountId)
        );
    } else if (globalOnly) {
        filtered = entries.filter(entry => entry.important);
    }

    return filtered.slice(-limit);
}

// --- LOGGING CORE ---
function write(levelPlain, levelColored, msg) {
    const timeStr = formatWIB();
    const compact = compactMessage(msg);
    const rawPlainLine = `${timeStr} ${levelPlain} ${compact}`;
    const safeCompact = hideAccountIds(compact);

    // simpan versi berwarna untuk terminal tanpa menampilkan ID akun
    const coloredLine = `${chalk.gray(timeStr)} ${levelColored} ${safeCompact}`;

    // simpan versi plain untuk dashboard tanpa menampilkan ID akun
    const plainLine = `${timeStr} ${levelPlain} ${safeCompact}`;

    pushLogLine({
        timeStr,
        level: levelPlain,
        coloredLine,
        plainLine,
        rawPlainLine,
        accountIds: extractAccountIds(rawPlainLine),
        important: isImportantLine(levelPlain, plainLine)
    });

    render();
}

// --- EXPORT ---
module.exports = {
    info: (msg) => write('[INFO]', chalk.blue('[INFO]'), msg),
    warn: (msg) => write('[WARN]', chalk.yellow('[WARN]'), msg),
    error: (msg) => write('[ERR]', chalk.red('[ERR]'), msg),
    success: (msg) => write('[OK]', chalk.green('[OK]'), msg),
    getRecent: (options = {}) => filterEntries(options).map(entry => entry.plainLine)
};
