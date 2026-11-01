const CONSTANTS = require('../constants');
const log = require('../../logger');
const { sleep, randomInt, accountPrefix } = require('../utils');

const COOLDOWN_REGEX = /Pelan-pelan dan coba lagi command-nya\\s*<t:(\\d+):R>/i;
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_RESPONSE_TIMEOUT_MS = 40000;

function getMessageText(message) {
    const embeds = (message?.embeds || []).flatMap(embed => [
        embed.title,
        embed.description,
        ...(embed.fields || []).flatMap(field => [field.name, field.value])
    ]);
    return [message?.content || '', ...embeds].filter(Boolean).join('\\n');
}

async function runWithCooldownRetry(channel, action, options = {}) {
    if (!channel || typeof action !== 'function') return false;

    const startedAt = Date.now();
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    const maxRetries = Number.isInteger(options.maxRetries)
        ? Math.max(0, options.maxRetries)
        : DEFAULT_MAX_RETRIES;
    const responseTimeoutMs = Number.isFinite(options.responseTimeoutMs)
        ? Math.max(1000, options.responseTimeoutMs)
        : DEFAULT_RESPONSE_TIMEOUT_MS;
    const feature = options.feature || 'Lucy';
    const description = options.description || feature;
    const prefix = options.state ? accountPrefix(options.state) : '';
    const logEvent = (level, message) => {
        const method = typeof log[level] === 'function' ? log[level] : log.info;
        method(`${prefix}[${feature}] ${message}`);
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const remaining = timeoutMs - (Date.now() - startedAt);
        if (remaining <= 0) {
            logEvent('warn', `Timeout total tercapai; ${description} dibatalkan.`);
            return false;
        }

        // Collector dipasang sebelum aksi agar balasan cooldown Lucy tidak terlewat.
        let responsePromise = null;
        if (typeof channel.awaitMessages === 'function') {
            responsePromise = channel.awaitMessages(
                message => String(message?.author?.id || '') === CONSTANTS.LUCY_BOT_ID,
                {
                    max: 1,
                    time: Math.min(responseTimeoutMs, remaining),
                    errors: ['time']
                }
            ).then(messages => messages.first()).catch(() => null);
        }

        try {
            await action();
        } catch (error) {
            logEvent('error', `Gagal menjalankan ${description}: ${error.message || error}`);
            return false;
        }

        if (!responsePromise) return true;

        const response = await responsePromise;
        if (!response) {
            logEvent('info', `Tidak ada respons cooldown Lucy; ${description} dianggap berhasil.`);
            return true;
        }

        const match = getMessageText(response).match(COOLDOWN_REGEX);
        if (!match) return true;

        const cooldownAt = Number(match[1]) * 1000;
        const waitMs = cooldownAt - Date.now();
        if (!Number.isFinite(cooldownAt) || waitMs <= 0) {
            logEvent('warn', `Timestamp cooldown tidak valid/kedaluwarsa pada retry ${attempt + 1}.`);
            if (attempt >= maxRetries) return false;
            continue;
        }

        if (attempt >= maxRetries || waitMs + 2000 > timeoutMs - (Date.now() - startedAt)) {
            logEvent('warn', `Cooldown ${Math.ceil(waitMs / 1000)}s melewati batas retry/timeout.`);
            return false;
        }

        const bufferMs = randomInt(1000, 2000);
        logEvent('warn', `Cooldown ${Math.ceil(waitMs / 1000)}s; menunggu ${Math.ceil((waitMs + bufferMs) / 1000)}s sebelum retry ${attempt + 1}/${maxRetries}.`);
        await sleep(waitMs + bufferMs);
    }

    return false;
}

async function sendWithCooldownRetry(channel, command, options = {}) {
    if (!channel || typeof channel.send !== 'function') return false;
    return runWithCooldownRetry(channel, () => channel.send(command), {
        ...options,
        description: options.description || `command "${command}"`
    });
}

module.exports = { sendWithCooldownRetry, runWithCooldownRetry };
