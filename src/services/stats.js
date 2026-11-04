const getAccountIdFromToken = (token) => {
    if (!token || typeof token !== 'string') return 'default';
    try {
        const base64Id = token.split('.')[0];
        const decodedId = Buffer.from(base64Id, 'base64').toString('utf8');
        return /^\d+$/.test(decodedId) ? decodedId : 'default';
    } catch {
        return 'default';
    }
};

const createEmptyAccountStats = () => ({
    commands: {
        total: 0,
        byType: {},
        recent: [],
        last: null
    },
    uptime: {
        accumulatedMs: 0,
        startedAt: null,
        lastStartedAt: null,
        lastStoppedAt: null
    }
});

const ensureStatsRoot = (state) => {
    state.stats = state.stats || {};
    state.stats.accounts = state.stats.accounts || {};
    return state.stats;
};

const ensureAccountStats = (state, token = state.activeToken || state.config?.token) => {
    const stats = ensureStatsRoot(state);
    const accountId = getAccountIdFromToken(token);

    if (!stats.accounts[accountId]) {
        stats.accounts[accountId] = createEmptyAccountStats();

        if (accountId === getAccountIdFromToken(state.activeToken || state.config?.token)) {
            if (stats.commands && !stats.commands.__migratedToAccount) {
                stats.accounts[accountId].commands = {
                    total: stats.commands.total || 0,
                    byType: stats.commands.byType || {},
                    recent: Array.isArray(stats.commands.recent) ? stats.commands.recent : [],
                    last: stats.commands.last || null
                };
                stats.commands.__migratedToAccount = true;
            }
        }
    }

    stats.accounts[accountId].commands = stats.accounts[accountId].commands || createEmptyAccountStats().commands;
    stats.accounts[accountId].uptime = stats.accounts[accountId].uptime || createEmptyAccountStats().uptime;

    return stats.accounts[accountId];
};

const isUptimeActive = (state) => !!state.config?.botStatus?.running && !state.config?.botStatus?.paused;

const syncBotUptime = (state, options = {}) => {
    const accountStats = ensureAccountStats(state, options.token);
    const uptime = accountStats.uptime;
    const now = Date.now();
    const active = typeof options.forceActive === 'boolean' ? options.forceActive : isUptimeActive(state);

    if (active && !uptime.startedAt) {
        uptime.startedAt = now;
        uptime.lastStartedAt = now;
    }

    if (!active && uptime.startedAt) {
        uptime.accumulatedMs = (uptime.accumulatedMs || 0) + (now - uptime.startedAt);
        uptime.startedAt = null;
        uptime.lastStoppedAt = now;
    }

    return uptime;
};

const calculateUptimeMs = (uptime) => (uptime.accumulatedMs || 0) + (uptime.startedAt ? Date.now() - uptime.startedAt : 0);

const getUptimeMs = (state, token = state.activeToken || state.config?.token, options = {}) => {
    const accountStats = ensureAccountStats(state, token);
    const shouldSync = options.sync !== false;
    const uptime = shouldSync ? syncBotUptime(state, { token }) : accountStats.uptime;
    return calculateUptimeMs(uptime);
};

const recordCommand = (state, cmd, type) => {
    const accountStats = ensureAccountStats(state);
    const commandStats = accountStats.commands;
    const safeType = type || 'Command';
    const item = { cmd, type: safeType, at: Date.now(), channelId: state.activeChannelId || null };

    commandStats.total += 1;
    commandStats.byType[safeType] = (commandStats.byType[safeType] || 0) + 1;
    commandStats.last = item;
    commandStats.recent.push(item);

    while (commandStats.recent.length > 20) {
        commandStats.recent.shift();
    }
};

module.exports = {
    getAccountIdFromToken,
    ensureAccountStats,
    syncBotUptime,
    getUptimeMs,
    recordCommand
};
