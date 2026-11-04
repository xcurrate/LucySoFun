const { normalizeBoss2Settings } = require('../../managers/boss2');
const { normalizeGemsSettings } = require('../../managers/gems');
const { normalizeRestSettings } = require('../../managers/rest');
const { normalizeSettings: normalizeHuntbot2Settings } = require('../../managers/Huntbot2');
const { normalizeMonsterCatcherSettings } = require('../../managers/monsterCatcher');
const { normalizeSendCount } = require('../../utils');
const { normalizeOtherCommands, normalizeFixedCommands, setSlotEnabled } = require('../../managers/commandSlots');
module.exports = function createConfigManager({ configPath, fileService, CONSTANTS }) {
    return {
    get() {
        return fileService.readJson(configPath);
    },

    save(config) {
        return fileService.writeJson(configPath, config);
    },

    // Menghapus properti khusus OwO tanpa merusak properti Lucy.
    dropOwOConfig(config) {
        const settings = config.settings || {};
        delete config.tiketandhb;
        delete config.huntbot;
        delete config.captcha;
        delete config.autosolver;
        delete config.macrodroidId;
        delete settings.twoCaptchaKey;
        delete settings.control;
        delete settings.boss;
        delete settings.huntbot;
        delete settings.channelRotation;
        delete settings.battle;
        delete settings.hunt;
        delete settings.pray;
        delete settings.custom;
        delete settings.text1;
        delete settings.text2;
        if (settings.messageFilter) delete settings.messageFilter.debugOnlyOwO;
        delete config.delays;
        if (Array.isArray(config.otherCommands)) {
            config.otherCommands = config.otherCommands.map(command => {
                if (!command) return command;
                const cleaned = { ...command };
                delete cleaned.captchaEnabled;
                return cleaned;
            });
        }
        return config;
    },

    ensureShape(config) {
        config.port = config.port || CONSTANTS.DEFAULT_PORT;
        config.botStatus = config.botStatus || { running: false, paused: false };
        config.channels = Array.isArray(config.channels) ? config.channels : [];
        config.maxLogLines = config.maxLogLines || CONSTANTS.MAX_LOG_LINES;

        config.settings = config.settings || {};
        config.safety = config.safety || { cctv: false };
        config.multiAccount = config.multiAccount || { enabled: true, maxAccounts: 0 };
        config.multiAccount.enabled = config.multiAccount.enabled !== false;
        config.multiAccount.maxAccounts = Math.max(0, Math.min(4, parseInt(config.multiAccount.maxAccounts, 10) || 0));

        config.settings.lucyControl = config.settings.lucyControl || { start: 'lucy start', pause: 'lucy pause', allowIds: [] };
        config.settings.boss2 = normalizeBoss2Settings(config.settings.boss2);
        config.settings.gems = normalizeGemsSettings(config.settings.gems);
        config.settings.huntbot2 = normalizeHuntbot2Settings(config.settings.huntbot2);
        config.settings.monsterCatcher = normalizeMonsterCatcherSettings(config.settings.monsterCatcher);
        config.settings.rest = normalizeRestSettings(config.settings.rest);
        config.settings.adventure = config.settings.adventure || { enabled: false, channelId: '', guildId: '' };
        delete config.settings.adventure.targetId;
        config.settings.messageFilter = config.settings.messageFilter || { enabled: true, channelIds: [], guildIds: [], debug: false };
        delete config.settings.messageFilter.debugOnlyOwO;
        config.settings.messageDebug = config.settings.messageDebug || { enabled: false, targetId: '', channelId: '', guildId: '' };
        config.settings.debug2 = config.settings.debug2 === true;
        config.settings.telegram = config.settings.telegram || { token: "", chatId: "" };
        config.settings.voice = config.settings.voice || { enabled: false, channelId: "" };
        config.otherCommands = normalizeOtherCommands(config.otherCommands);
        config.fixedCommands = normalizeFixedCommands(config.fixedCommands);

        // Bersihkan properti OwO yang masih tersisa dari profile lama.
        this.dropOwOConfig(config);

        return config;
    },

    applySave(config, body) {
        config.token = body.token || config.token;
        config.port = this.toInt(body.port, config.port);
        config.multiAccount = config.multiAccount || {};
        config.multiAccount.enabled = true;
        config.multiAccount.maxAccounts = Math.max(0, Math.min(4, this.toInt(body.maxAccounts, config.multiAccount.maxAccounts || 0)));

        const channels = [body.chan1, body.chan2, body.chan3]
            .filter(ch => ch && String(ch).trim() !== '')
            .map(ch => String(ch).trim());
        config.channels = channels;

        const readSeconds = (value, fallbackMs) => {
            const fallbackSec = Math.max(0, Math.floor((Number(fallbackMs) || 0) / 1000));
            return Math.max(0, this.toInt(value, fallbackSec)) * 1000;
        };

        config.otherCommands = [0, 1, 2].map(index => {
            const current = config.otherCommands[index] || {};
            const slot = index + 1;
            const minMs = readSeconds(body[`other${slot}DelayMin`] ?? body[`other${slot}Delay`], current.delayMinMs ?? current.delayMs);
            const maxMs = readSeconds(body[`other${slot}DelayMax`] ?? body[`other${slot}Delay`], current.delayMaxMs ?? current.delayMinMs ?? current.delayMs);
            return {
                text: String(body[`other${slot}Text`] || '').trim(),
                delayMs: Math.min(minMs, maxMs),
                delayMinMs: Math.min(minMs, maxMs),
                delayMaxMs: Math.max(minMs, maxMs),
                count: normalizeSendCount(body[`other${slot}Count`], normalizeSendCount(current.count)),
                channelId: String(body[`other${slot}Channel`] || '').trim(),
                enabled: current.enabled === true
            };
        });

        // Command Tetap (lb & lh) adalah SATU UNIT: teks terkunci; channel & delay
        // diatur satu set dan disinkronkan ke kedua slot.
        const previousFixed = config.fixedCommands || {};
        const configCount = normalizeSendCount(body.other4Count, normalizeSendCount(previousFixed.lb?.count));
        const min4 = readSeconds(body.other4DelayMin ?? body.other4Delay, previousFixed.lb?.delayMinMs ?? previousFixed.lb?.delayMs);
        const max4 = readSeconds(body.other4DelayMax ?? body.other4Delay, previousFixed.lb?.delayMaxMs ?? previousFixed.lb?.delayMinMs ?? previousFixed.lb?.delayMs);
        const pairChannel = String(body.other4Channel || '').trim();
        const pairEnabled = previousFixed.lb?.enabled === true || previousFixed.lh?.enabled === true;
        const pair = {
            delayMs: Math.min(min4, max4),
            delayMinMs: Math.min(min4, max4),
            delayMaxMs: Math.max(min4, max4),
            count: configCount,
            channelId: pairChannel,
            enabled: pairEnabled
        };
        config.fixedCommands = { lb: { ...pair }, lh: { ...pair } };

        config.settings.telegram.token = body.tgToken || '';
        config.settings.telegram.chatId = body.tgChat || '';

        config.maxLogLines = this.toInt(body.maxLogLines, 15);
        config.settings.autoResume = this.toBool(body.autoResume);

        config.settings.lucyControl = {
            start: String(body.lucyCtrlStart || '').trim() || 'lucy start',
            pause: String(body.lucyCtrlPause || '').trim() || 'lucy pause',
            allowIds: this.toArray(body.lucyCtrlAllowIds)
        };

        config.settings.boss2 = normalizeBoss2Settings({
            enabled: this.toBool(body.boss2Enabled),
            allowedGuilds: this.toArray(body.boss2Guilds),
            channelIds: this.toArray(body.boss2ChannelIds),
            appearText: body.boss2AppearText,
            defeatedText: body.boss2DefeatedText,
            buttonId: body.boss2ButtonId,
            fightsPerBoss: body.boss2FightsPerBoss,
            delayMinMs: body.boss2DelayMin,
            delayMaxMs: body.boss2DelayMax,
            ticketStatusChannelId: body.boss2TicketStatusChannelId,
            ticketStatusCommand: 'lboss t'
        });

        config.settings.gems = normalizeGemsSettings({
            ...config.settings.gems,
            enabled: this.toBool(body.gemsEnabled),
            channelId: body.gemsChannelId,
            accountName: body.gemsAccountName,
            triggerText: body.gemsTriggerText,
            inventoryCommand: body.gemsInventoryCommand,
            lootboxTypes: body.gemsLootboxTypesPresent ? (Array.isArray(body.gemsLootboxTypes) ? body.gemsLootboxTypes : (body.gemsLootboxTypes ? [body.gemsLootboxTypes] : [])) : config.settings.gems.lootboxTypes,
            lootboxPriority: body.gemsLootboxPriority || config.settings.gems.lootboxPriority,
            selectedTiers: body.gemsTierPresent ? (Array.isArray(body.gemsTier) ? body.gemsTier.filter(Boolean) : (body.gemsTier ? [body.gemsTier] : [])) : config.settings.gems.selectedTiers,
            useSpecialGems: body.gemsUseSpecialPresent ? this.toBool(body.gemsUseSpecial) : config.settings.gems.useSpecialGems,
            tierPriority: body.gemsTierPriority || config.settings.gems.tierPriority,
            lootboxItem: body.gemsLootboxItem === undefined ? config.settings.gems.lootboxItem : body.gemsLootboxItem,
            lootboxCommand: body.gemsLootboxCommand === undefined ? config.settings.gems.lootboxCommand : body.gemsLootboxCommand,
            requiredGems: body.gemsRequired === undefined ? config.settings.gems.requiredGems : body.gemsRequired,
            optionalGems: body.gemsOptional === undefined ? config.settings.gems.optionalGems : body.gemsOptional,
            useCommand: body.gemsUseCommand === undefined ? config.settings.gems.useCommand : body.gemsUseCommand,
            recheckMinutes: body.gemsRecheckMinutes,
            delayMinMs: body.gemsDelayMin,
            delayMaxMs: body.gemsDelayMax
        });

        const restHours = parseFloat(String(body.restBudgetHours ?? '').replace(',', '.'));
        config.settings.rest = normalizeRestSettings({
            schedule: {
                enabled: this.toBool(body.restScheduleEnabled),
                start: body.restScheduleStart,
                end: body.restScheduleEnd
            },
            budget: {
                enabled: this.toBool(body.restBudgetEnabled),
                maxMinutes: Number.isFinite(restHours) ? Math.round(restHours * 60) : config.settings.rest?.budget?.maxMinutes,
                minSessionMinutes: body.restBudgetMinSession,
                maxSessionMinutes: body.restBudgetMaxSession
            }
        });

        config.settings.adventure.channelId = String(body.adventureChannelId || '').trim();
        config.settings.adventure.guildId = String(body.adventureGuildId || '').trim();

        config.settings.messageFilter.enabled = this.toBool(body.mfEnabled);
        config.settings.messageFilter.channelIds = this.toArray(body.mfChannelIds);
        config.settings.messageFilter.guildIds = this.toArray(body.mfGuildIds);
        config.settings.messageFilter.debug = this.toBool(body.mfDebug);

        config.settings.messageDebug.enabled = this.toBool(body.messageDebugEnabled);
        config.settings.messageDebug.targetId = String(body.messageDebugTargetId || '').trim();
        config.settings.messageDebug.channelId = String(body.messageDebugChannelId || '').trim();
        config.settings.messageDebug.guildId = String(body.messageDebugGuildId || '').trim();
        config.settings.debug2 = this.toBool(body.debug2Enabled);

        config.settings.voice.enabled = this.toBool(body.voiceEnabled);
        config.settings.voice.channelId = body.voiceChannelId || '';

        config.settings.huntbot2 = normalizeHuntbot2Settings({
            ...config.settings.huntbot2,
            enabled: this.toBool(body.hb2Enabled),
            channelId: String(body.hb2ChannelId || '').trim(),
            duration: body.hb2Duration || config.settings.huntbot2?.duration || '1D',
            sellAnimals: this.toBool(body.hb2SellAnimals),
            upgradeEnabled: this.toBool(body.hb2UpgradeEnabled),
            upgradeGain: String(body.hb2UpgradeGain || '').trim()
        });
        config.settings.monsterCatcher = normalizeMonsterCatcherSettings({
            ...config.settings.monsterCatcher,
            enabled: this.toBool(body.mcEnabled),
            autoPauseLoops: this.toBool(body.mcAutoPauseLoops),
            retryWaitMs: Math.max(0, this.toInt(body.mcRetryWaitSec, 60) * 1000),
            maxRetries: Math.max(0, this.toInt(body.mcMaxRetries, 5)),
            dmChannelId: String(body.mcDmChannelId || '').trim()
        });

        config.safety.cctv = this.toBool(body.cctvEnabled);

        return config;
    },

    applyAction(config, action) {
        switch (action) {
            case 'adventureStart':
                config.settings.adventure.enabled = true;
                break;
            case 'adventureStop':
                config.settings.adventure.enabled = false;
                break;
            case 'start':
                config.botStatus.running = true;
                config.botStatus.paused = false;
                break;
            case 'pause':
                config.botStatus.paused = true;
                config.botStatus.running = false;
                break;
            default: {
                const match = /^other(Command)?(Start|Stop)([1-5])$/.exec(String(action || ''));
                if (match) {
                    setSlotEnabled(config, Number(match[3]) - 1, match[2] === 'Start');
                }
            }
        }
        return config;
    },

    toInt(value, fallback = 0) {
        const num = parseInt(value, 10);
        return Number.isFinite(num) ? num : fallback;
    },

    toBool(value) {
        return !!value;
    },

    toArray(value) {
        if (!value) return [];
        return value.split(',').map(s => s.trim()).filter(Boolean);
    },

    computeStatus(config) {
        const isPaused = !!config.botStatus?.paused;
        const isRunning = !!config.botStatus?.running;

        let statusText = '⏹ OFFLINE';
        let statusClass = 'offline';

        if (isRunning) {
            statusText = isPaused ? '⏸ PAUSED' : '▶ RUNNING';
            statusClass = isPaused ? 'paused' : 'running';
        }

        return { statusText, statusClass };
    }
    };
};
