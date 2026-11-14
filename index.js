const startDashboard = require('./dashboard');
const state = require('./src/state');
const createConfigManager = require('./src/services/config');
const createMultiAccountManager = require('./src/core/multiAccount');

const configManager = createConfigManager(state);
const multiAccountManager = createMultiAccountManager({ rootState: state, configManager });

const initialize = () => {
    state.config = configManager.read() || {};
    state.activeToken = state.config.token || '';

    startDashboard();

    multiAccountManager.start();
};

process.on('unhandledRejection', (reason, promise) => {
    console.log('⚠️ [ANTI-CRASH] Unhandled Rejection dihentikan:', reason.message || reason);
});

process.on('uncaughtException', (error, origin) => {
    console.log('⚠️ [ANTI-CRASH] Uncaught Exception dihentikan:', error.message || error);
});

process.on('uncaughtExceptionMonitor', (error, origin) => {
    console.log('⚠️ [ANTI-CRASH] Uncaught Exception Monitor:', error.message || error);
});

// Start the application
initialize();
