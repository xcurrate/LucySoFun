const path = require('path');
const fs = require('fs');

const createTelegramService = require('../services/telegram');
const createMacrodroidService = require('../services/macrodroidService');
const createChannelManager = require('../managers/channel');
const createBoss2Manager = require('../managers/boss2');
const { normalizeBoss2Settings } = createBoss2Manager;
const createAdventureManager = require('../managers/adventure');
const createGemsManager = require('../managers/gems');
const { normalizeGemsSettings } = createGemsManager;
const createRestManager = require('../managers/rest');
const { normalizeRestSettings } = createRestManager;
const createCommandSender = require('../managers/command');
const createLoopManager = require('../managers/loop');
const createEmergencyHandler = require('../managers/emergency');
const createMessageHandler = require('../managers/message');
const createHuntbot2Manager = require('../managers/Huntbot2');
const createMonsterCatcherManager = require('../managers/monsterCatcher');
const { normalizeMonsterCatcherSettings } = createMonsterCatcherManager;
const createVoiceManager = require('../managers/voice');
const createClientManager = require('./client');
const log = require('../../logger');
const { accountPrefix, safeJsonStringify, normalizeSendCount } = require('../utils');

const getAccountIdFromToken = (token) => {
    if (!token || typeof token !== 'string') return 'default';
    try {
        const base64Id = token.split('.')[0];
        const padded = base64Id + '='.repeat((4 - base64Id.length % 4) % 4);
        const decodedId = Buffer.from(padded, 'base64').toString('utf8');
        return /^\d{17,20}$/.test(decodedId) ? decodedId : 'default';
    } catch {
        return 'default';
    }
};

// Menghapus properti konfigurasi khusus OwO tanpa menghapus konfigurasi Lucy.
const dropOwOConfig = (config = {}) => {
    delete config.settings?.boss;
    delete config.settings?.huntbot;
    delete config.settings?.channelRotation;
    delete config.settings?.control;
    delete config.settings?.battle;
    delete config.settings?.hunt;
    delete config.settings?.pray;
    delete config.settings?.custom;
    delete config.settings?.text1;
    delete config.settings?.text2;
    delete config.tiketandhb;
    delete config.huntbot;
    delete config.captcha;
    delete config.autosolver;
    delete config.macrodroidId;
    delete config.settings?.twoCaptchaKey;
    if (config.settings?.messageFilter) delete config.settings.messageFilter.debugOnlyOwO;
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
};

const ensureRuntimeShape = (config = {}) => {
    config.settings = config.settings || {};
    config.settings.voice = config.settings.voice || { enabled: false, channelId: '' };
    config.settings.lucyControl = config.settings.lucyControl || { start: 'lucy start', pause: 'lucy pause', allowIds: [] };
    config.settings.boss2 = normalizeBoss2Settings(config.settings.boss2);
    config.settings.gems = normalizeGemsSettings(config.settings.gems);
    config.settings.huntbot2 = createHuntbot2Manager.normalizeSettings(config.settings.huntbot2);
    config.settings.monsterCatcher = normalizeMonsterCatcherSettings(config.settings.monsterCatcher);
    config.settings.rest = normalizeRestSettings(config.settings.rest);
    config.settings.adventure = config.settings.adventure || { enabled: false, channelId: '', guildId: '' };
    delete config.settings.adventure.targetId;
    config.settings.messageFilter = config.settings.messageFilter || { enabled: true, channelIds: [], guildIds: [], debug: false };
    delete config.settings.messageFilter.debugOnlyOwO;
    config.settings.messageDebug = config.settings.messageDebug || { enabled: false, targetId: '', channelId: '', guildId: '' };
    config.settings.debug2 = config.settings.debug2 === true;
    config.settings.telegram = config.settings.telegram || { token: '', chatId: '' };
    config.otherCommands = Array.isArray(config.otherCommands) ? config.otherCommands : [];
    config.otherCommands = [0, 1, 2].map(index => {
        const command = config.otherCommands[index] || {};
        return {
            text: String(command.text || ''),
            delayMs: Math.max(0, parseInt(command.delayMs, 10) || 5000),
            count: normalizeSendCount(command.count),
            channelId: String(command.channelId || ''),
            enabled: command.enabled === true
        };
    });
    config.botStatus = config.botStatus || { running: false, paused: true };
    config.channels = Array.isArray(config.channels) ? config.channels : [];
    config.safety = config.safety || { cctv: false };
    return dropOwOConfig(config);
};

const createRuntimeState = ({ config, sharedStats }) => ({
    client: null,
    config: ensureRuntimeShape(config),
    activeToken: config.token || '',
    activeChannelId: null,
    adventureTimer: null,
    adventurePaused: false,
    adventureProcessing: false,
    adventureActive: false,
    accountUsername: '',
    isStartupReadyRoutine: false,
    startupReadyRoutineUntil: 0,
    isBusy: false,
    nextAt: {},
    otherCommandDelays: {},
    messageDebugEntries: [],
    emergencyRecoveryActive: false,
    emergencyRecoveryTimer: null,
    emergencyRecoveryListener: null,
    emergencyRecoveryClient: null,
    emergencyRecoveryPending: null,
    stats: sharedStats,
    loops: {}
});

const createRuntimeConfigManager = (state, filePath) => ({
    read() {
        try {
            return ensureRuntimeShape(JSON.parse(fs.readFileSync(filePath, 'utf8')));
        } catch {
            return state.config;
        }
    },

    save() {
        ensureRuntimeShape(state.config);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(state.config, null, 2));
    },

    getLucyControlCommands() {
        const ctrl = state.config.settings?.lucyControl || {};
        return {
            startCmd: String(ctrl.start || 'lucy start').trim().toLowerCase(),
            pauseCmd: String(ctrl.pause || 'lucy pause').trim().toLowerCase(),
            allowIds: Array.isArray(ctrl.allowIds) ? ctrl.allowIds.map(String) : []
        };
    },

    getBoss2Settings() {
        return normalizeBoss2Settings(state.config.settings?.boss2);
    },

    getGemsSettings() {
        return normalizeGemsSettings(state.config.settings?.gems);
    },

    getRestSettings() {
        return normalizeRestSettings(state.config.settings?.rest);
    },

    getMonsterCatcherSettings() {
        return normalizeMonsterCatcherSettings(state.config.settings?.monsterCatcher);
    },

    getAdventureSettings() {
        const adventure = state.config.settings?.adventure || {};
        return {
            enabled: adventure.enabled === true,
            channelId: String(adventure.channelId || '').trim(),
            guildId: String(adventure.guildId || '').trim()
        };
    },

    getValidChannels() {
        const channels = Array.isArray(state.config.channels) ? state.config.channels : [];
        return channels.filter(c => c && String(c).length > 5);
    },

    updateFromDisk() {
        const diskConfig = this.read();
        if (!diskConfig) return false;

        const previousToken = state.activeToken;
        const tokenChanged = diskConfig.token !== state.activeToken;
        const channelsChanged = safeJsonStringify(state.config.channels) !== safeJsonStringify(diskConfig.channels);
        const voiceChanged = safeJsonStringify(state.config.settings?.voice) !== safeJsonStringify(diskConfig.settings?.voice);
        const otherCommandsChanged = safeJsonStringify(state.config.otherCommands) !== safeJsonStringify(diskConfig.otherCommands);
        const wasPaused = state.config.botStatus?.paused;
        const wasRunning = state.config.botStatus?.running;
        const nowPaused = diskConfig.botStatus?.paused;
        const nowRunning = diskConfig.botStatus?.running;
        const statusChanged = wasPaused !== nowPaused || wasRunning !== nowRunning;

        state.config = diskConfig;
        return { tokenChanged, previousToken, channelsChanged, voiceChanged, otherCommandsChanged, statusChanged, wasPaused, wasRunning, nowPaused, nowRunning };
    }
});


module.exports = function createAccountRuntime({ config, filePath, sharedStats }) {
    const accountId = getAccountIdFromToken(config.token);
    const state = createRuntimeState({ config, sharedStats });
    state.accountId = accountId;
    const configManager = createRuntimeConfigManager(state, filePath);
    state.persistConfig = () => configManager.save();
    const telegramService = createTelegramService(state);
    const macrodroidService = createMacrodroidService(state);
    const channelManager = createChannelManager(state, configManager);
    const loopManagerWrapper = {
        stopAll: () => loopManager && loopManager.stopAll(),
        startAll: () => loopManager && loopManager.startAll()
    };
    const emergencyHandler = createEmergencyHandler(state, configManager, loopManagerWrapper, channelManager, telegramService);
    const commandSender = createCommandSender(state, channelManager, emergencyHandler);
    const boss2Manager = createBoss2Manager(state, configManager);
    const adventureManager = createAdventureManager(state, configManager, commandSender);
    const gemsManager = createGemsManager(state, configManager, commandSender);
    const loopManager = createLoopManager(state, commandSender);
    const voiceManager = createVoiceManager(state, configManager);
    const huntbot2Manager = createHuntbot2Manager(state, commandSender);
    const monsterCatcherManager = createMonsterCatcherManager(state, configManager, loopManager, commandSender);
    const messageHandler = createMessageHandler(
        state,
        configManager,
        loopManager,
        channelManager,
        telegramService,
        macrodroidService,
        commandSender,
        voiceManager,
        adventureManager,
        boss2Manager,
        gemsManager,
        huntbot2Manager,
        monsterCatcherManager
    );
    const clientManager = createClientManager(state, configManager, channelManager, messageHandler, telegramService, voiceManager);

    const otherCommandReadyWatchers = new Map();
    let runtimeRunning = false;
    let loopsActive = false;
    let loopConfigSignature = '';

    const hasEnabledLucyFeatures = () => {
        const settings = state.config.settings || {};
        return settings.boss2?.enabled === true
            || settings.gems?.enabled === true
            || settings.adventure?.enabled === true
            || settings.huntbot2?.enabled === true
            || settings.monsterCatcher?.enabled === true
            || (Array.isArray(state.config.otherCommands) && state.config.otherCommands.some(command => command?.enabled === true));
    };

    const getLoopConfigSignature = (nextConfig = state.config) => safeJsonStringify({
        otherCommands: nextConfig.otherCommands || []
    });

    const activateReadyRuntime = (source = 'start') => {
        if (!state.client?.isReady()) return false;
        if (state.rest?.active) return false;
        const nextLoopSignature = getLoopConfigSignature();
        if (!loopsActive || nextLoopSignature !== loopConfigSignature) {
            loopManager.startAll();
            loopConfigSignature = nextLoopSignature;
            loopsActive = true;
        }
        adventureManager.start().catch(error => log.error(`${accountPrefix(state)}❌ Auto Adventure gagal dimulai: ${error.message}`));
        return true;
    };

    const startLoopsWhenReady = () => {
        if (state.readyLoopWatcher) clearInterval(state.readyLoopWatcher);
        state.readyLoopWatcher = setInterval(() => {
            if (!state.config.botStatus?.running || state.config.botStatus?.paused) {
                clearInterval(state.readyLoopWatcher);
                state.readyLoopWatcher = null;
                return;
            }
            if (state.client?.isReady()) {
                activateReadyRuntime('ready');
                clearInterval(state.readyLoopWatcher);
                state.readyLoopWatcher = null;
            }
        }, 1000);
    };

    const restManager = createRestManager(state, configManager, {
        onStart() {
            loopManager.stopAll();
            loopManager.pauseOtherCommandDelays({ reason: 'rest' });
            state.adventureResumeAfterRest = state.adventureResumeAfterRest || !!state.adventureActive;
            adventureManager.stopTimer();
            state.adventureActive = false;
            telegramService.send(`😴 <b>Istirahat dimulai</b>`);
        },
        onEnd() {
            loopManager.resumeOtherCommandDelays({ reason: 'rest' });
            if (state.adventureResumeAfterRest) {
                state.adventureResumeAfterRest = false;
                if (configManager.getAdventureSettings().enabled) {
                    adventureManager.start({ restart: true }).catch(error => log.error(`${accountPrefix(state)}❌ Auto Adventure gagal dilanjutkan: ${error.message}`));
                }
            }
            if (runtimeRunning && state.client?.isReady()) {
                loopsActive = false;
                activateReadyRuntime('rest');
            }
            telegramService.send('▶️ <b>Istirahat selesai</b>\nLoop dilanjutkan.');
        }
    });

    const startOtherCommandWhenReady = (index) => {
        if (otherCommandReadyWatchers.has(index)) clearInterval(otherCommandReadyWatchers.get(index));
        const watcher = setInterval(() => {
            if (state.client?.isReady()) {
                loopManager.startOtherCommand(index);
                clearInterval(watcher);
                otherCommandReadyWatchers.delete(index);
            }
        }, 1000);
        otherCommandReadyWatchers.set(index, watcher);
    };

    restManager.start();

    return {
        accountId,
        filePath,
        state,
        configManager,
        restManager,
        getRestStatus() {
            return restManager.getStatus();
        },
        clientManager,
        channelManager,
        loopManager,
        voiceManager,
        adventureManager,
        monsterCatcherManager,
        getDisplayName() {
            return state.client?.user?.tag || accountId;
        },
        connect() {
            const statusChanged = !!state.config.botStatus?.running || !state.config.botStatus?.paused;
            runtimeRunning = false;
            state.config.botStatus = { running: false, paused: true };
            if (statusChanged) configManager.save();
            if (state.readyLoopWatcher) {
                clearInterval(state.readyLoopWatcher);
                state.readyLoopWatcher = null;
            }
            loopManager.stopAll();
            loopsActive = false;

            if (!state.client) {
                log.info(`${accountPrefix(state)}🔌 Connect/Login akun tanpa start loop.`);
                clientManager.initialize();
                return true;
            }

            if (!state.client.isReady()) {
                log.info(`${accountPrefix(state)}🔌 Client sudah ada, menunggu ready tanpa start loop.`);
                return true;
            }

            log.info(`${accountPrefix(state)}✅ Client sudah ready, tetap paused; loop tidak dijalankan.`);
            channelManager.updateActive();
            return true;
        },
        start() {
            const wasRuntimeRunning = runtimeRunning;
            const statusChanged = !state.config.botStatus?.running || !!state.config.botStatus?.paused;
            runtimeRunning = true;
            state.config.botStatus = { running: true, paused: false };
            if (statusChanged) configManager.save();

            // Tombol START profile menghidupkan fitur Lucy.
            if (!wasRuntimeRunning) messageHandler.setLucyFeatures(true);

            if (!state.client) {
                log.info(`${accountPrefix(state)}🚀 Menjalankan akun paralel.`);
                clientManager.initialize();
                startLoopsWhenReady();
                return;
            }

            if (!state.client.isReady()) {
                if (!wasRuntimeRunning) {
                    log.info(`${accountPrefix(state)}▶️ Resume diminta; menunggu sesi Discord yang sudah ada siap tanpa login ulang.`);
                }
                startLoopsWhenReady();
                return;
            }

            if (!wasRuntimeRunning || !loopsActive) {
                if (!wasRuntimeRunning) log.info(`${accountPrefix(state)}▶️ Melanjutkan sisa fitur akun paralel.`);
                activateReadyRuntime(wasRuntimeRunning ? 'reconcile' : 'start');
            }
        },
        startOtherCommand(index) {
            const command = state.config.otherCommands?.[index];
            if (!command?.enabled || !command.text?.trim() || !command.channelId?.trim()) return false;

            if (state.client?.isReady()) return loopManager.startOtherCommand(index);

            if (!state.client) {
                log.info(`${accountPrefix(state)}▶️ Menjalankan Other Command tanpa START Global.`);
                clientManager.initialize();
            }
            startOtherCommandWhenReady(index);
            return true;
        },
        stopOtherCommand(index) {
            if (otherCommandReadyWatchers.has(index)) {
                clearInterval(otherCommandReadyWatchers.get(index));
                otherCommandReadyWatchers.delete(index);
            }
            loopManager.stopOtherCommand(index);
            return true;
        },
        joinVoice(source = 'dashboard-button') {
            if (!state.client?.isReady()) {
                log.warn(`${accountPrefix(state)}⚠️ Client belum ready, tombol Join Voice dibatalkan.`);
                return false;
            }
            voiceManager.joinConfigured(source).catch(err => log.error(`${accountPrefix(state)}❌ Join VC dari dashboard gagal: ${err.message}`));
            return true;
        },
        pause() {
            const wasRuntimeRunning = runtimeRunning;
            const statusChanged = !!state.config.botStatus?.running || !state.config.botStatus?.paused;
            runtimeRunning = false;
            state.config.botStatus = { running: false, paused: true };
            if (statusChanged) configManager.save();

            if (wasRuntimeRunning || hasEnabledLucyFeatures()) messageHandler.setLucyFeatures(false);
            if (!wasRuntimeRunning && !loopsActive) return;
            if (wasRuntimeRunning) log.info(`${accountPrefix(state)}⏸ Menjeda akun paralel.`);
            loopManager.stopAll();
            loopsActive = false;
        },
        destroy() {
            restManager.stop();
            this.pause();
            loopManager.stopOtherCommands();
            if (state.readyLoopWatcher) clearInterval(state.readyLoopWatcher);
            state.readyLoopWatcher = null;
            otherCommandReadyWatchers.forEach(watcher => clearInterval(watcher));
            otherCommandReadyWatchers.clear();
            huntbot2Manager?.stop?.();
            monsterCatcherManager?.stop?.();
            boss2Manager.stop();
            gemsManager.stop();
            adventureManager.stop();
            if (state.client) {
                try { state.client.destroy(); } catch (error) { log.warn(`${accountPrefix(state)}Gagal destroy client: ${error.message}`); }
                state.client = null;
            }
        },
        reloadConfig(nextConfig) {
            const oldConfig = state.config;
            const oldToken = state.activeToken;
            const oldLoopSignature = getLoopConfigSignature(oldConfig);
            const oldVoice = safeJsonStringify(oldConfig.settings?.voice || {});
            const oldAdventure = safeJsonStringify(oldConfig.settings?.adventure || {});
            const oldChannels = safeJsonStringify(oldConfig.channels || []);
            const oldStatus = safeJsonStringify(oldConfig.botStatus || {});

            state.config = ensureRuntimeShape(dropOwOConfig(nextConfig || {}));
            state.activeToken = state.config.token || '';

            const tokenChanged = oldToken !== state.activeToken;
            const voiceChanged = oldVoice !== safeJsonStringify(state.config.settings?.voice || {});
            const adventureChanged = oldAdventure !== safeJsonStringify(state.config.settings?.adventure || {});
            const channelsChanged = oldChannels !== safeJsonStringify(state.config.channels || []);
            const statusChanged = oldStatus !== safeJsonStringify(state.config.botStatus || {});
            const loopConfigChanged = oldLoopSignature !== getLoopConfigSignature(state.config);

            if (tokenChanged) {
                log.warn(`${accountPrefix(state)}Token berubah, runtime akan dibuat ulang.`);
                this.destroy();
                return;
            }

            restManager.tick();

            if (statusChanged) log.info(`${accountPrefix(state)}🔁 Status config berubah: running=${!!state.config.botStatus?.running}, paused=${!!state.config.botStatus?.paused}`);
            if (channelsChanged) log.info(`${accountPrefix(state)}📡 Config channel berubah (${(state.config.channels || []).length} channel).`);
            if (voiceChanged) log.info(`${accountPrefix(state)}🔊 Config voice berubah: enabled=${state.config.settings?.voice?.enabled === true}, channel=${state.config.settings?.voice?.channelId || '-'}`);
            if (adventureChanged && state.config.settings?.adventure?.enabled !== true) adventureManager.stop();

            if (!runtimeRunning || !state.client?.isReady()) return;

            if (loopConfigChanged) {
                loopsActive = false;
                activateReadyRuntime('config');
            } else if (voiceChanged) {
                this.joinVoice('config');
            }
        }
    };
};

module.exports.getAccountIdFromToken = getAccountIdFromToken;
module.exports.ensureRuntimeShape = ensureRuntimeShape;
module.exports.dropOwOConfig = dropOwOConfig;
