const CONSTANTS = require('../constants');
const log = require('../../logger');
const { removeInvisibleChars, accountPrefix, randomInt } = require('../utils');
const { collectTexts, toPlainData } = require('./boss2');

const toIdList = (value) => (Array.isArray(value) ? value : String(value || '').split(/[\s,]+/))
    .map(item => String(item).trim())
    .filter(Boolean);

const toNonNegativeInt = (value, fallback) => {
    const num = parseInt(value, 10);
    return Number.isFinite(num) && num >= 0 ? num : fallback;
};

const toText = (value, fallback) => {
    const text = typeof value === 'string' ? value.trim() : '';
    return text || fallback;
};

const normalizeCode = (code) => {
    const digits = String(code).replace(/\D/g, '');
    return digits ? String(parseInt(digits, 10)) : '';
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeGemsSettings = (raw = {}) => {
    const defaults = CONSTANTS.GEMS_DEFAULTS;
    const delayMinMs = toNonNegativeInt(raw.delayMinMs, defaults.delayMinMs);
    const legacyRequired = toIdList(raw.requiredGems);
    const legacyOptional = toIdList(raw.optionalGems);
    const tiers = ['F', 'L', 'M', 'E', 'R', 'U', 'C'];
    const selectedTiers = Array.isArray(raw.selectedTiers)
        ? raw.selectedTiers.filter(tier => tiers.includes(tier))
        : (legacyRequired.length ? tiers.filter(tier => CONSTANTS.GEMS_TIERS[tier].main.every(code => legacyRequired.includes(code))) : [...defaults.selectedTiers]);
    const lootboxTypes = Array.isArray(raw.lootboxTypes)
        ? raw.lootboxTypes.filter(type => ['fable', 'normal'].includes(type))
        : (raw.lootboxItem === undefined && raw.lootboxCommand === undefined
            ? [...defaults.lootboxTypes]
            : [normalizeCode(raw.lootboxItem) === '50' ? 'normal' : 'fable']);
    return {
        enabled: raw.enabled === true,
        channelId: String(raw.channelId || '').trim(),
        accountName: String(raw.accountName || '').trim(),
        triggerText: toText(raw.triggerText, defaults.triggerText),
        inventoryCommand: toText(raw.inventoryCommand, defaults.inventoryCommand),
        lootboxTypes: lootboxTypes.length ? lootboxTypes : [],
        lootboxPriority: raw.lootboxPriority === 'normal' ? 'normal' : 'fable',
        selectedTiers: Array.isArray(raw.selectedTiers) ? selectedTiers : (selectedTiers.length ? selectedTiers : [...defaults.selectedTiers]),
        useSpecialGems: raw.useSpecialGems === undefined
            ? (raw.optionalGems === undefined ? defaults.useSpecialGems : legacyOptional.length > 0)
            : raw.useSpecialGems === true,
        tierPriority: raw.tierPriority === 'lowest' ? 'lowest' : 'highest',
        lootboxItem: toText(raw.lootboxItem, defaults.lootboxItem),
        lootboxCommand: toText(raw.lootboxCommand, defaults.lootboxCommand),
        requiredGems: legacyRequired.length ? legacyRequired : [...defaults.requiredGems],
        optionalGems: raw.optionalGems === undefined ? [...defaults.optionalGems] : legacyOptional,
        useCommand: toText(raw.useCommand, defaults.useCommand),
        recheckMinutes: Math.max(1, toNonNegativeInt(raw.recheckMinutes, defaults.recheckMinutes)),
        delayMinMs,
        delayMaxMs: Math.max(delayMinMs, toNonNegativeInt(raw.delayMaxMs, defaults.delayMaxMs)),
        lootboxWaitMs: toNonNegativeInt(raw.lootboxWaitMs, defaults.lootboxWaitMs),
        maxLootboxOpens: toNonNegativeInt(raw.maxLootboxOpens, defaults.maxLootboxOpens),
        inventoryTimeoutMs: toNonNegativeInt(raw.inventoryTimeoutMs, defaults.inventoryTimeoutMs)
    };
};

const messageText = (msg) => {
    const embeds = toPlainData(msg.embeds) || [];
    const components = toPlainData(msg.components) || [];
    return removeInvisibleChars([msg.content || '', ...collectTexts(embeds), ...collectTexts(components)].join('\n'));
};

const nameRegex = (name, before = '', after = '') =>
    new RegExp(`${before}${escapeRegex(name)}${after}(?![\\w.])`, 'i');

const isTriggerMessage = (text, settings, names) => {
    const plain = text.replace(/\*/g, '');
    if (!plain.toLowerCase().includes(settings.triggerText.replace(/\*/g, '').toLowerCase())) return false;
    return names.some(name => nameRegex(name, '\\|\\s*').test(plain));
};

const isInventoryMessage = (text, names) => {
    const plain = text.replace(/\*/g, '');
    return names.some(name => nameRegex(name, 'inventaris\\s+').test(plain));
};

const parseInventoryCodes = (text) => {
    const codes = new Set();
    for (const match of text.matchAll(/`\s*(\d+)\s*`/g)) codes.add(normalizeCode(match[1]));
    return codes;
};

const decideInventoryAction = (codes, settings, runtime = {}) => {
    const normalizedCodes = new Set([...codes].map(normalizeCode));
    const enabledBoxes = settings.lootboxTypes || ['fable'];
    const priority = settings.lootboxPriority === 'normal' ? ['normal', 'fable'] : ['fable', 'normal'];
    const sequence = priority.filter(type => enabledBoxes.includes(type));
    const nextBox = sequence.find(type => !runtime.completedLootboxes?.includes(type)
        && normalizedCodes.has(type === 'fable' ? '49' : '50')
        && (runtime.lootboxOpens || 0) < settings.maxLootboxOpens);
    if (nextBox) return { type: 'lootbox', lootboxType: nextBox, command: nextBox === 'fable' ? 'llb f all' : 'llb all' };
    const tiers = settings.tierPriority === 'lowest' ? [...settings.selectedTiers].reverse() : settings.selectedTiers;
    const tier = tiers.find(name => CONSTANTS.GEMS_TIERS[name]?.main.every(code => normalizedCodes.has(normalizeCode(code))));
    if (!tier) {
        const missing = tiers.length && CONSTANTS.GEMS_TIERS[tiers[0]]
            ? CONSTANTS.GEMS_TIERS[tiers[0]].main.filter(code => !normalizedCodes.has(normalizeCode(code)))
            : [...CONSTANTS.GEMS_DEFAULTS.requiredGems];
        return { type: 'missing', missing, noCompleteTier: true };
    }
    const tierConfig = CONSTANTS.GEMS_TIERS[tier];
    const items = [...tierConfig.main];
    if (settings.useSpecialGems && normalizedCodes.has(normalizeCode(tierConfig.special))) items.push(tierConfig.special);
    return { type: 'use', tier, items, command: `${settings.useCommand} ${items.join(' ')}` };
};

const createGemsManager = (state, configManager, commandSender) => {
    const gems = state.gems = state.gems || {
        awaitingInventory: false,
        awaitingSince: 0,
        channelId: '',
        lootboxOpens: 0,
        completedLootboxes: [],
        exhausted: false,
        recheckTimer: null,
        timers: new Set()
    };

    const prefix = () => `${accountPrefix(state)}💎 Auto Use Gems: `;
    const getSettings = () => configManager.getGemsSettings();

    const schedule = (callback, delayMs) => {
        const timer = setTimeout(() => {
            gems.timers.delete(timer);
            callback();
        }, Math.max(0, delayMs));
        gems.timers.add(timer);
        return timer;
    };

    const wait = (ms) => (ms > 0 ? new Promise(resolve => schedule(resolve, ms)) : Promise.resolve());

    const cancelRecheck = () => {
        if (!gems.recheckTimer) return;
        clearTimeout(gems.recheckTimer);
        gems.timers.delete(gems.recheckTimer);
        gems.recheckTimer = null;
    };

    return {
        getAccountNames(msg, settings = getSettings()) {
            if (settings.accountName) return [settings.accountName];
            const user = state.client?.user;
            return [...new Set([
                msg?.guild?.members?.me?.displayName,
                user?.globalName,
                user?.displayName,
                user?.username
            ].filter(Boolean).map(String))];
        },

        isAllowed(msg, settings) {
            const myId = state.client?.user?.id;
            const authorId = String(msg.author?.id || '');
            if (myId && authorId === myId) return false;
            if (authorId !== CONSTANTS.LUCY_BOT_ID) return false;
            if (settings.channelId && String(msg.channel?.id || msg.channelId || '') !== settings.channelId) return false;
            return true;
        },

        async handle(msg) {
            const settings = getSettings();
            if (!settings.enabled) {
                if (gems.recheckTimer || gems.awaitingInventory) this.stop();
                return null;
            }
            if (!msg || !this.isAllowed(msg, settings)) return null;
            if (state.rest?.active) return null;

            const text = messageText(msg);
            const names = this.getAccountNames(msg, settings);
            if (names.length === 0) return null;

            if (isTriggerMessage(text, settings, names)) {
                if (gems.exhausted && gems.recheckTimer) {
                    return 'paused';
                }
                if (gems.awaitingInventory && Date.now() - gems.awaitingSince <= settings.inventoryTimeoutMs) {
                    return 'pending';
                }
                log.info(`${prefix()}Gems habis terdeteksi. Cek inventaris...`);
                cancelRecheck();
                gems.lootboxOpens = 0;
                gems.completedLootboxes = [];
                gems.channelId = settings.channelId || msg.channel?.id || msg.channelId || '';
                await this.checkInventory(settings);
                return 'trigger';
            }

            if (gems.awaitingInventory && isInventoryMessage(text, names)) {
                if (Date.now() - gems.awaitingSince > settings.inventoryTimeoutMs) {
                    gems.awaitingInventory = false;
                    return null;
                }
                gems.awaitingInventory = false;
                return this.processInventory(text, settings);
            }
            return null;
        },

        async sendCommand(command, type, settings) {
            await wait(randomInt(settings.delayMinMs, settings.delayMaxMs));
            if (!getSettings().enabled) return false;
            return commandSender.send(command, type, gems.channelId || settings.channelId);
        },

        async checkInventory(settings = getSettings()) {
            if (!settings.enabled) return false;
            if (state.rest?.active) {
                gems.awaitingInventory = false;
                this.scheduleRecheck(settings);
                return false;
            }
            gems.awaitingInventory = true;
            gems.awaitingSince = Date.now();
            const sent = await this.sendCommand(settings.inventoryCommand, 'Gems Inventory', settings);
            gems.awaitingSince = Date.now();
            if (!sent) {
                gems.awaitingInventory = false;
                log.warn(`${prefix()}Gagal kirim "${settings.inventoryCommand}". Coba lagi dalam ${settings.recheckMinutes} menit.`);
                this.scheduleRecheck(settings);
            }
            return sent;
        },

        async processInventory(text, settings) {
            const action = decideInventoryAction(parseInventoryCodes(text), settings, gems);

            if (action.type === 'lootbox') {
                gems.lootboxOpens += 1;
                log.info(`${prefix()}Lootbox ${action.lootboxType === 'fable' ? 'Fable' : 'Biasa'} ditemukan. Jalankan ${action.command}...`);
                const sent = await this.sendCommand(action.command, 'Gems Lootbox', settings);
                if (!sent) {
                    this.scheduleRecheck(settings);
                    return 'lootbox';
                }
                gems.completedLootboxes = [...new Set([...(gems.completedLootboxes || []), action.lootboxType])];
                await wait(settings.lootboxWaitMs);
                await this.checkInventory(getSettings());
                return 'lootbox';
            }

            if (action.type === 'missing') {
                gems.exhausted = true;
                log.warn(`${prefix()}${action.noCompleteTier ? 'Tidak ada tier gems lengkap' : `Gems tidak lengkap (kurang: ${action.missing.join(', ')})`}. Trigger diabaikan, cek ulang tiap ${settings.recheckMinutes} menit.`);
                this.scheduleRecheck(settings);
                return 'missing';
            }

            const sent = await this.sendCommand(action.command, 'Gems Use', settings);
            if (sent) {
                cancelRecheck();
                gems.exhausted = false;
                log.success(`${prefix()}✅ Pakai gems tier ${action.tier}: ${action.items.join(' ')}. Menunggu gems habis lagi...`);
            } else {
                this.scheduleRecheck(settings);
            }
            return 'use';
        },

        scheduleRecheck(settings = getSettings()) {
            cancelRecheck();
            if (!settings.enabled) return;
            gems.recheckTimer = schedule(() => {
                gems.recheckTimer = null;
                const current = getSettings();
                if (!current.enabled) return;
                gems.lootboxOpens = 0;
                gems.completedLootboxes = [];
                this.checkInventory(current).catch(error => log.error(`${prefix()}Gagal cek inventaris: ${error.message || error}`));
            }, settings.recheckMinutes * 60000);
        },

        stop() {
            for (const timer of gems.timers) clearTimeout(timer);
            gems.timers.clear();
            gems.recheckTimer = null;
            gems.awaitingInventory = false;
            gems.exhausted = false;
            gems.lootboxOpens = 0;
            gems.completedLootboxes = [];
        }
    };
};

createGemsManager.normalizeGemsSettings = normalizeGemsSettings;
createGemsManager.parseInventoryCodes = parseInventoryCodes;
createGemsManager.decideInventoryAction = decideInventoryAction;
createGemsManager.isTriggerMessage = isTriggerMessage;
createGemsManager.isInventoryMessage = isInventoryMessage;
module.exports = createGemsManager;
            
