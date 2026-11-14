const path = require('path');
const express = require('express');

const state = require('../state');
const runtimeStatsService = require('../services/stats');
const logger = require('../../logger');

const CONSTANTS = require('./constants');
const fileService = require('./services/fileService');
const createProfileManager = require('./services/profileManager');
const createProfilePin = require('./services/profilePin');
const createConfigManager = require('./services/configManager');
const createSlotPermissionManager = require('./services/slotPermissionManager');
const { createSlotPermissionRoutes, createSlotPermissionGuard, createSlotExpirySweeper } = require('./slotPermissionRoutes');
const createLogService = require('./services/logService');
const createStatsService = require('./services/statsService');
const discordProfileService = require('./services/discordProfileService');
const createDashboardAuth = require('./auth');
const createUiComponents = require('./ui/components');
const createDashboardRoutes = require('./routes');
const { escapeHtml, serializeForScript } = require('./utils/html');
const { resolveBaseDir, resolveSlotDir } = require('../appPaths');

function createDashboardApp({ baseDir = resolveBaseDir() } = {}) {
    const configPath = path.join(baseDir, CONSTANTS.CONFIG_FILE);
    const profileManager = createProfileManager({ baseDir, fileService });
    const profilePin = createProfilePin({ baseDir, profileManager, fileService });
    const configManager = createConfigManager({ configPath, fileService, CONSTANTS });
    const slotPermissionManager = createSlotPermissionManager({ baseDir: resolveSlotDir(baseDir) });
    const logService = createLogService({ logger });
    const statsService = createStatsService({ state, runtimeStatsService, configManager });
    const uiComponents = createUiComponents({
        CONSTANTS,
        serializeForScript,
        escapeHtml,
        statsService,
        configManager,
        profileManager
    });

    const app = express();
    // Dashboard submissions are encoded as URLSearchParams by the browser script.
    // Keep this parser in sync with that request format so POST /save receives req.body.
    app.use(express.urlencoded({ extended: true }));
    app.use(createDashboardAuth());
    app.use(createSlotPermissionRoutes({ slotPermissionManager, configManager, profileManager, state }));
    app.use(createSlotPermissionGuard({ slotPermissionManager, configManager, profileManager }));

    // Hapus otomatis slot akun yang izinnya sudah lewat durasi (mis. 24 jam).
    const sweepExpiredSlots = createSlotExpirySweeper({ slotPermissionManager, configManager, profileManager, state });
    const expirySweepTimer = setInterval(() => {
        try {
            const removed = sweepExpiredSlots();
            removed.forEach(accountId => console.log(`[SLOT] ⏳ Izin ${accountId} kedaluwarsa; slot akun dihapus otomatis.`));
        } catch (error) {
            console.error('[SLOT] Sweep izin gagal:', error.message);
        }
    }, 60 * 1000);
    // Jangan menahan proses hanya karena timer ini (penting untuk test/CLI).
    if (typeof expirySweepTimer.unref === 'function') expirySweepTimer.unref();

    const initialConfig = configManager.ensureShape(configManager.get());
    // Samakan batas baris file log per akun dengan nilai tersimpan.
    if (typeof logger.setLogFileMaxLines === 'function') {
        logger.setLogFileMaxLines(initialConfig.logFileMaxLines);
    }
    const port = process.env.SERVER_PORT || process.env.PORT || initialConfig.port || CONSTANTS.DEFAULT_PORT;

    console.log(`[DASHBOARD] Initial port check: PORT=${port}, initialConfig.port=${initialConfig.port}`);

    app.use(createDashboardRoutes({
        configManager,
        fileService,
        profileManager,
        profilePin,
        uiComponents,
        logService,
        statsService,
        discordProfileService,
        state,
        logger
    }));

    return { app, port };
}

module.exports = createDashboardApp;
