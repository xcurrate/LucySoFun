const fs = require('fs');
const path = require('path');
const createAccountRuntime = require('./accountRuntime');
const statsService = require('../services/stats');
const log = require('../../logger');

const CONSTANTS = require('../constants');
const { resolveBaseDir } = require('../appPaths');

const DEFAULT_MAX_ACCOUNTS = 0;
const ABSOLUTE_MAX_ACCOUNTS = 4;

const readJson = (filePath, fallback = null) => {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallback;
    }
};

const writeJson = (filePath, value) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const getAccountIdFromToken = createAccountRuntime.getAccountIdFromToken;

module.exports = function createMultiAccountManager({ rootState, baseDir = resolveBaseDir(), configManager }) {
    const configPath = path.join(baseDir, 'config.json');
    const profilesDir = path.join(baseDir, 'profiles');
    const runtimes = new Map();
    rootState.accountRuntimes = runtimes;
    rootState.multiAccountManager = null;


    function readMainConfig() {
        const config = configManager.read() || readJson(configPath, {}) || {};
        rootState.config = config;
        rootState.activeToken = config.token || '';
        rootState.multiAccount = config.multiAccount || { enabled: true, maxAccounts: DEFAULT_MAX_ACCOUNTS };
        return config;
    }

    function discoverAccountConfigs(mainConfig) {
        const maxAccounts = Math.max(0, Math.min(ABSOLUTE_MAX_ACCOUNTS, parseInt(mainConfig.multiAccount?.maxAccounts, 10) || DEFAULT_MAX_ACCOUNTS));
        const configsById = new Map();

        const addConfig = (config, filePath) => {
            if (!config?.token || String(config.token).length <= 20) return;
            const accountId = getAccountIdFromToken(config.token);
            if (configsById.has(accountId)) return;
            const profileStatus = config.botStatus || { running: false, paused: true };
            configsById.set(accountId, {
                accountId,
                config: {
                    ...config,
                    botStatus: {
                        running: !!profileStatus.running,
                        paused: profileStatus.paused !== false
                    }
                },
                filePath
            });
        };

        addConfig(mainConfig, configPath);

        if (fs.existsSync(profilesDir)) {
            fs.readdirSync(profilesDir)
                .filter(file => file.startsWith('config_') && file.endsWith('.json'))
                .sort()
                .forEach(file => addConfig(readJson(path.join(profilesDir, file)), path.join(profilesDir, file)));
        }

        return Array.from(configsById.values()).slice(0, maxAccounts);
    }

    function reconcile() {
        const mainConfig = readMainConfig();
        const desired = discoverAccountConfigs(mainConfig);

        // Each account's persisted botStatus is authoritative at startup.
        // Global Start/Stop already writes every account config, so copying the
        // main config status here would incorrectly resume profiles paused individually.

        const desiredIds = new Set(desired.map(item => item.accountId));

        for (const [accountId, runtime] of runtimes.entries()) {
            if (!desiredIds.has(accountId)) {
                log.warn(`[account:${accountId}] 🧹 Akun tidak lagi masuk slot paralel, sesi ditutup.`);
                runtime.destroy();
                runtimes.delete(accountId);
            }
        }

        for (const item of desired) {
            const existing = runtimes.get(item.accountId);
            if (existing) {
                existing.reloadConfig(item.config);
                existing.filePath = item.filePath;
            } else {
                runtimes.set(item.accountId, createAccountRuntime({
                    config: item.config,
                    filePath: item.filePath,
                    sharedStats: rootState.stats
                }));
            }
        }

        for (const runtime of runtimes.values()) {
            const shouldRun = !!runtime.state.config.botStatus?.running && !runtime.state.config.botStatus?.paused;
            statsService.syncBotUptime(runtime.state);
            if (shouldRun) {
                runtime.start();
            } else {
                runtime.pause();
            }
        }

        syncDashboardState();
    }

    function syncDashboardState() {
        const firstReady = Array.from(runtimes.values()).find(runtime => runtime.state.client?.isReady());
        const selected = firstReady || Array.from(runtimes.values())[0];
        if (!selected) return;

        rootState.client = selected.state.client;
    }

    function persistSlotsToMainConfig() {
        const mainConfig = readMainConfig();
        mainConfig.multiAccount = mainConfig.multiAccount || {};
        mainConfig.multiAccount.enabled = true;
        mainConfig.multiAccount.maxAccounts = Math.max(0, Math.min(ABSOLUTE_MAX_ACCOUNTS, parseInt(mainConfig.multiAccount.maxAccounts, 10) || DEFAULT_MAX_ACCOUNTS));
        writeJson(configPath, mainConfig);
        rootState.config = mainConfig;
        return mainConfig;
    }

    function getRuntime(accountId) {
        return runtimes.get(String(accountId));
    }

    const api = {
        start() {
            persistSlotsToMainConfig();
            reconcile();
            setInterval(reconcile, 2000);
            setInterval(syncDashboardState, 1000);
        },
        getRuntimes() {
            return runtimes;
        },
        getRuntime,
        connectAccount(accountId) {
            reconcile();
            const runtime = getRuntime(accountId);
            if (!runtime) return false;
            runtime.connect();
            syncDashboardState();
            return true;
        },
        startAccount(accountId) {
            const runtime = getRuntime(accountId);
            if (!runtime) return false;
            runtime.start();
            return true;
        },
        pauseAccount(accountId) {
            const runtime = getRuntime(accountId);
            if (!runtime) return false;
            runtime.pause();
            return true;
        },
        startOtherCommand(accountId, index) {
            reconcile();
            const runtime = getRuntime(accountId);
            if (!runtime || typeof runtime.startOtherCommand !== 'function') return false;
            const started = runtime.startOtherCommand(index);
            syncDashboardState();
            return started;
        },
        stopOtherCommand(accountId, index) {
            reconcile();
            const runtime = getRuntime(accountId);
            if (!runtime || typeof runtime.stopOtherCommand !== 'function') return false;
            return runtime.stopOtherCommand(index);
        },
        startAdventure(accountId) {
            reconcile();
            const runtime = getRuntime(accountId);
            if (!runtime?.adventureManager) return false;
            runtime.adventureManager.start({ restart: true }).catch(error => log.error(`[account:${accountId}] ❌ Auto Adventure gagal dimulai: ${error.message}`));
            return true;
        },
        stopAdventure(accountId) {
            reconcile();
            const runtime = getRuntime(accountId);
            if (!runtime?.adventureManager) return false;
            runtime.adventureManager.stop();
            return true;
        },
        logoutAccount(accountId) {
            const runtime = getRuntime(accountId);
            if (!runtime) return false;
            runtime.destroy();
            syncDashboardState();
            return true;
        },
        joinVoiceAccount(accountId) {
            const runtime = getRuntime(accountId);
            if (!runtime || typeof runtime.joinVoice !== 'function') return false;
            return runtime.joinVoice('dashboard-button');
        },
        joinVoiceAll() {
            let joined = 0;
            for (const runtime of runtimes.values()) {
                if (typeof runtime.joinVoice === 'function' && runtime.joinVoice('dashboard-button')) joined += 1;
            }
            return joined;
        },
        reconcile
    };

    rootState.multiAccountManager = api;
    return api;
};
