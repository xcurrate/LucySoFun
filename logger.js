const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
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
const LOG_FILE_DIR = constants.LOG_FILE_DIR || 'logs';
const LOG_FILE_MAX_LINES = constants.LOG_FILE_MAX_LINES || 1000;
const LOG_FILE_PREFIX = 'log_';
const LOG_FILE_SUFFIX = '.txt';
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

    if (Array.isArray(entry.accountIds) && entry.accountIds.length) {
        entry.accountIds.forEach(id => appendAccountLog(id, entry.plainLine));
    }
}

// --- LOG FILE PER AKUN ---
// Setiap baris yang menyebut sebuah akun juga ditulis ke logs/log_<accountId>.txt
// supaya riwayat per akun bisa ditelusuri. Jumlah baris dibatasi (ring buffer)
// agar file tidak tumbuh tanpa batas; nilainya bisa diubah dari dashboard.
let logFileMaxLines = LOG_FILE_MAX_LINES;
const LOG_DIR = path.isAbsolute(LOG_FILE_DIR) ? LOG_FILE_DIR : path.join(__dirname, LOG_FILE_DIR);
const SAFE_ACCOUNT_ID = /^[A-Za-z0-9._-]+$/;

function getLogFilePath(accountId) {
    const id = String(accountId || '').trim();
    if (!id || !SAFE_ACCOUNT_ID.test(id)) return null;
    return path.join(LOG_DIR, `${LOG_FILE_PREFIX}${id}${LOG_FILE_SUFFIX}`);
}

function trimLogFile(filePath, keep) {
    try {
        const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(line => line.length > 0);
        if (lines.length > keep) {
            fs.writeFileSync(filePath, lines.slice(-keep).join('\n') + '\n', 'utf8');
        }
    } catch { /* file mungkin belum ada */ }
}

function appendAccountLog(accountId, plainLine) {
    const filePath = getLogFilePath(accountId);
    if (!filePath) return;
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        let existing = 0;
        try {
            existing = fs.readFileSync(filePath, 'utf8').split('\n').filter(line => line.length > 0).length;
        } catch { /* file baru */ }
        fs.appendFileSync(filePath, plainLine + '\n', 'utf8');
        if (existing + 1 > logFileMaxLines) trimLogFile(filePath, logFileMaxLines);
    } catch { /* gagal tulis log file tidak boleh menghentikan bot */ }
}

function readAccountLog(accountId, limit) {
    const filePath = getLogFilePath(accountId);
    if (!filePath) return [];
    try {
        const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(line => line.length > 0);
        const cap = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : undefined;
        return cap ? lines.slice(-cap) : lines;
    } catch {
        return [];
    }
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
    getRecent: (options = {}) => filterEntries(options).map(entry => entry.plainLine),
    // Log file per akun (.txt) untuk ditelusuri/diunduh dari dashboard.
    getAccountLog: (accountId, limit) => readAccountLog(accountId, limit),
    getLogFilePath,
    getLogDir: () => LOG_DIR,
    getLogFileMaxLines: () => logFileMaxLines,
    setLogFileMaxLines: (value) => {
        const next = parseInt(value, 10);
        if (Number.isFinite(next) && next > 0) logFileMaxLines = next;
    },
    LOG_FILE_SUFFIX
};
