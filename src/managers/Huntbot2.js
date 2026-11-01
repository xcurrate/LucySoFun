const axios = require('axios');
const CONSTANTS = require('../constants');
const log = require('../../logger');
const { accountPrefix, randomInt } = require('../utils');
const TooEz = require('./TooEz');

const DEFAULTS = { enabled: false, channelId: '', duration: '1D', sellAnimals: false, upgradeEnabled: false, upgradeGain: '' };
const DURATION_PATTERN = /^\d+[MHD]$/i;
const GAIN_PATTERN = /^[A-Za-z0-9_-]+$/;
const RETURN_TIME_PATTERN = /AKU AKAN KEMBALI DALAM\s+(.+?)\s+DENGAN\b/i;
const DM_DONE_TEXT = 'huntbot sudah selesai berburu hewan silahkan gunakan command lucy autohunt untuk mengambil hasilnya!';

function normalizeSettings(raw = {}) {
    const inputDuration = String(raw.duration || DEFAULTS.duration).trim().toUpperCase();
    const duration = DURATION_PATTERN.test(inputDuration) ? inputDuration : DEFAULTS.duration;
    const rawGain = String(raw.upgradeGain || '').trim();
    const upgradeGain = GAIN_PATTERN.test(rawGain) ? rawGain : '';
    return {
        enabled: raw.enabled === true,
        channelId: String(raw.channelId || '').trim(),
        duration,
        sellAnimals: raw.sellAnimals === true,
        upgradeEnabled: raw.upgradeEnabled === true && !!upgradeGain,
        upgradeGain
    };
}
function cleanText(value) {
    return String(value || '').replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, ' ').replace(/\s+/g, ' ').trim();
}
function collectStrings(node, output = []) {
    if (node == null) return output;
    if (typeof node === 'string') { output.push(node); return output; }
    if (Array.isArray(node)) { for (const item of node) collectStrings(item, output); return output; }
    if (typeof node === 'object') for (const [key, value] of Object.entries(node)) {
        if (typeof value === 'string' && ['content','title','description','name','value','label','text','url','custom_id','customId'].includes(key)) output.push(value);
        else if (value && typeof value === 'object') collectStrings(value, output);
    }
    return output;
}
function getMessageText(msg) { return cleanText([msg?.content || '', ...collectStrings(msg?.components || []), ...collectStrings(msg?.embeds || [])].join('\n')); }
function findButton(node, customId) {
    if (!node || typeof node !== 'object') return null;
    if ((node.custom_id || node.customId) === customId) return node;
    for (const child of Array.isArray(node) ? node : Object.values(node)) { const found = findButton(child, customId); if (found) return found; }
    return null;
}
function extractImageUrl(msg) {
    const candidates = [];
    for (const attachment of (msg?.attachments?.values?.() || [])) if (attachment?.url) candidates.push(attachment.url);
    candidates.push(...collectStrings(msg?.components || []), ...collectStrings(msg?.embeds || []), String(msg?.content || ''));
    const isImageUrl = url => /\.(png|jpe?g|webp)(?:\?|$)/i.test(url) || /cdn\.discordapp\.com\/attachments\//i.test(url);
    for (const candidate of candidates) {
        const targets = [...String(candidate).matchAll(/\]\((https?:\/\/[^)\s]+)\)/gi)].map(match => match[1].replace(/&amp;/g, '&'));
        for (const url of targets.reverse()) if (isImageUrl(url)) return url;
    }
    for (const candidate of candidates) for (const raw of (String(candidate).match(/https?:\/\/[^\s<>\])"']+/gi) || [])) {
        const url = raw.replace(/[),.;]+$/g, '').replace(/&amp;/g, '&');
        if (isImageUrl(url)) return url;
    }
    return null;
}
function parseReturnTime(text) { return cleanText(text).match(RETURN_TIME_PATTERN)?.[1]?.trim() || null; }

module.exports = function createHuntbot2Manager(state) {
    const handled = new Set(), timers = new Set();
    let pendingAction = null;
    const prefix = () => accountPrefix(state) + '🤖 Huntbot2: ';
    const settings = () => normalizeSettings(state.config?.settings?.huntbot2);
    const markHandled = msg => {
        if (!msg?.id) return false;
        if (handled.has(msg.id)) return true;
        handled.add(msg.id);
        if (handled.size > 1500) handled.delete(handled.values().next().value);
        return false;
    };
    const getChannel = async () => {
        const id = settings().channelId;
        if (!id || !state.client?.isReady()) return null;
        return state.client.channels.cache.get(id) || await state.client.channels.fetch(id).catch(() => null);
    };
    const sendCommand = async command => {
        const channel = await getChannel();
        if (!channel || typeof channel.send !== 'function') {
            log.error(prefix() + 'Channel ID belum diatur atau channel tidak dapat diakses.');
            return false;
        }
        try { await channel.send(command); log.info(prefix() + 'Terkirim: ' + command); return true; }
        catch (error) { log.error(prefix() + 'Gagal mengirim "' + command + '": ' + (error.message || error)); return false; }
    };
    const schedule = (delayMs, callback) => {
        const timer = setTimeout(async () => {
            timers.delete(timer);
            if (!settings().enabled) return;
            try { await callback(); }
            catch (error) { log.error(prefix() + 'Aksi terjadwal gagal: ' + (error.message || error)); }
        }, delayMs);
        timers.add(timer);
        return timer;
    };
    const scheduleRetryHunt = reason => {
        log.warn(prefix() + reason + ' Coba ulang otomatis dalam 10 menit dengan "lhb 1D".');
        schedule(10 * 60 * 1000, async () => {
            await sendCommand('lhb 1D');
        });
    };
    const scheduleHunt = (delayMs = randomInt(2000, 3000), fixedDuration = null) => {
        schedule(delayMs, async () => {
            await sendCommand('lhb ' + (fixedDuration || settings().duration));
            pendingAction = null;
        });
    };
    const clickConfirm = async (msg, customId, label) => {
        const button = findButton(msg?.components || [], customId);
        if (!button || button.disabled === true) { log.warn(prefix() + 'Tombol konfirmasi ' + customId + ' tidak ditemukan/aktif.'); return false; }
        try {
            await msg.clickButton(customId);
            log.success(prefix() + 'Konfirmasi ' + label + ' diklik (' + customId + ').');
            const currentSettings = settings();
            if (customId === 'sac_confirm' && currentSettings.upgradeEnabled && currentSettings.upgradeGain) {
                schedule(2000, async () => {
                    const sent = await sendCommand('lucy upgrade ' + settings().upgradeGain + ' all');
                    if (sent) scheduleHunt(2000, '1D');
                    else pendingAction = null;
                });
            } else {
                scheduleHunt(randomInt(2000, 3000));
            }
            return true;
        } catch (error) { log.error(prefix() + 'Gagal klik tombol ' + customId + ': ' + (error.message || error)); return false; }
    };
    return {
        async handle(msg) {
            const cfg = settings();
            if (!cfg.enabled || !msg || !msg.author || msg.author.id === state.client?.user?.id) return false;
            if (String(msg.author.id) !== CONSTANTS.LUCY_BOT_ID) return false;
            const text = getMessageText(msg), lower = text.toLowerCase();
            if (!text) return false;

            const myName = (msg.guild?.members?.me?.displayName || msg.client?.user?.displayName || msg.client?.user?.username || '').toLowerCase();

            if ((!msg.guild || msg.channel?.type === 'DM' || msg.channel?.type === 1) && lower.includes('selesai berburu')) {
                if (markHandled(msg)) return false;
                await sendCommand('lucy hb');
                log.success(prefix() + 'DM selesai berburu terdeteksi; perintah lucy hb dikirim.');
                return true;
            }

            // Batasi semua proses di bawah ini hanya untuk channelId yang sudah diatur
            if (!cfg.channelId || msg.channel?.id !== cfg.channelId) return false;

            if (lower.includes(myName) && lower.includes('password salah')) {
                if (markHandled(msg)) return false;
                scheduleRetryHunt('Password salah terdeteksi.');
                return true;
            }
            if (lower.includes(myName) && lower.includes('ini passwordmu')) {
                if (markHandled(msg)) return false;
                const imageUrl = extractImageUrl(msg);
                if (!imageUrl) {
                    scheduleRetryHunt('URL gambar password tidak ditemukan.');
                    return false;
                }
                try {
                    const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: 8 * 1024 * 1024 });
                    const password = TooEz.decodeBuffer(Buffer.from(response.data));
                    if (!password) {
                        scheduleRetryHunt('Password dari gambar gagal dikenali TooEz.');
                        return false;
                    }
                    log.success(prefix() + 'Password gambar berhasil dibaca.');
                    await sendCommand('lhb ' + settings().duration + ' ' + password);
                    return true;
                } catch (error) {
                    scheduleRetryHunt('Gagal mengambil/membaca gambar password: ' + (error.message || error) + '.');
                    return false;
                }
            }
            if (lower.includes('konfirmasi pengorbanan rank')) {
                if (markHandled(msg)) return false;
                if (cfg.sellAnimals) { log.info(prefix() + 'Mode jual aktif; konfirmasi sacrifice diabaikan.'); return false; }
                return clickConfirm(msg, 'sac_confirm', 'pengorbanan');
            }
            if (lower.includes('konfirmasi jual rank')) {
                if (markHandled(msg)) return false;
                if (!cfg.sellAnimals) { log.info(prefix() + 'Mode sacrifice aktif; konfirmasi jual diabaikan.'); return false; }
                return clickConfirm(msg, 'sell_confirm', 'penjualan');
            }
            if (lower.includes('beep boop. aku kembali')) {
                if (markHandled(msg)) return false;
                if (cfg.sellAnimals) {
                    pendingAction = 'sell';
                    if (!await sendCommand('lsell all')) pendingAction = null;
                    log.info(prefix() + 'Huntbot kembali; mode jual aktif, sacrifice dilewati.');
                } else {
                    pendingAction = 'sacrifice';
                    if (!await sendCommand('lsac all')) pendingAction = null;
                    log.info(prefix() + 'Huntbot kembali; mengirim lsac all.');
                }
                return true;
            }
            if (lower.includes('aku akan kembali dalam')) {
                if (markHandled(msg)) return false;
                log.info(prefix() + 'Waktu kembali: ' + (parseReturnTime(text) || 'tidak terdeteksi'));
                return true;
            }
            if (lower.includes(myName) && lower.includes('huntbot') && lower.includes('saya akan berburu untukmu tuan')) {
                if (markHandled(msg)) return false;
                log.info(prefix() + 'Lucy Huntbot siap berburu.');
                return true;
            }
            if (lower.includes(myName) && lower.includes('huntbot') && lower.includes('huntbot sedang berburu')) {
                if (markHandled(msg)) return false;
                log.info(prefix() + 'Huntbot sedang berburu.');
                return true;
            }
            return false;
        },
        stop() { for (const timer of timers) clearTimeout(timer); timers.clear(); handled.clear(); pendingAction = null; },
        getStatus() { return { settings: settings(), pendingAction, scheduledActions: timers.size }; }
    };
};
module.exports.normalizeSettings = normalizeSettings;
module.exports.parseReturnTime = parseReturnTime;
module.exports.extractImageUrl = extractImageUrl;
module.exports.findButton = findButton;
