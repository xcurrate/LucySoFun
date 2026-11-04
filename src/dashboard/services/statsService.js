module.exports = function createStatsService({ state, runtimeStatsService, configManager }) {
    return {
    formatDuration(ms) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const parts = [];
        if (days) parts.push(`${days}d`);
        if (hours || days) parts.push(`${hours}h`);
        if (minutes || hours || days) parts.push(`${minutes}m`);
        parts.push(`${seconds}s`);
        return parts.join(' ');
    },

    formatTime(timestamp) {
        if (!timestamp) return '-';
        return new Date(timestamp).toLocaleString('id-ID', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            day: '2-digit', month: 'short'
        });
    },

    getSnapshot(config) {
        const accountStats = runtimeStatsService.ensureAccountStats(state, config.token);
        const snapshotAccountId = runtimeStatsService.getAccountIdFromToken(config.token);
        const activeAccountId = runtimeStatsService.getAccountIdFromToken(state.activeToken || state.config?.token);
        const runtime = state.accountRuntimes?.get(snapshotAccountId);
        const runtimeState = runtime?.state || state;
        const commandStats = accountStats.commands || { total: 0, byType: {}, recent: [], last: null };
        const uptimeMs = runtimeStatsService.getUptimeMs(runtimeState, config.token, {
            sync: snapshotAccountId === activeAccountId || !!runtime
        });
        const { statusText, statusClass } = configManager.computeStatus(runtimeState.config || config);

        return {
            status: {
                text: statusText,
                className: statusClass,
                activeChannelId: runtimeState.activeChannelId || '-',
                channelsTotal: Array.isArray(config.channels) ? config.channels.length : 0,
                running: !!runtimeState.config?.botStatus?.running,
                paused: !!runtimeState.config?.botStatus?.paused,
                telegram: !!(config.settings?.telegram?.token && config.settings?.telegram?.chatId)
            },
            commands: {
                total: commandStats.total || 0,
                byType: commandStats.byType || {},
                recent: Array.isArray(commandStats.recent) ? commandStats.recent : [],
                last: commandStats.last || null
            },
            uptime: {
                ms: uptimeMs,
                text: this.formatDuration(uptimeMs),
                startedAt: this.formatTime(accountStats.uptime?.lastStartedAt)
            }
        };
    }
    };
};
