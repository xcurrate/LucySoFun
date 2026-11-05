const getStyles = require('./styles');
const createDashboardStatsCard = require('./dashboardStatsCard');
const getLogCard = require('./logCard');
const createScripts = require('./scripts');
const createSavedResponse = require('./savedResponse');
const createPageRenderer = require('./page');
const createSettingsTabs = require('./settingsTabs');

module.exports = function createUiComponents({ CONSTANTS, serializeForScript, escapeHtml, statsService, configManager, profileManager }) {
    const getDashboardStatsCard = createDashboardStatsCard({ escapeHtml, statsService });
    const { getLogRefreshScript } = createScripts({ CONSTANTS, serializeForScript });
    const getSavedResponse = createSavedResponse({ CONSTANTS });
    const { renderSettingsTabs, renderLucyCommandCards, renderMultiAccountCard } = createSettingsTabs({ escapeHtml });
    const renderPage = createPageRenderer({
        CONSTANTS,
        configManager,
        profileManager,
        statsService,
        getStyles,
        getDashboardStatsCard,
        getLogCard,
        getLogRefreshScript,
        renderSettingsTabs: { renderSettingsTabs, renderLucyCommandCards, renderMultiAccountCard }
    });

    return {
        getStyles,
        getDashboardStatsCard,
        getLogCard,
        getLogRefreshScript,
        getSavedResponse,
        renderPage
    };
};
