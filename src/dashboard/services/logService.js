module.exports = function createLogService({ logger }) {
    return {
        getRecentLines(filter = {}) {
            try {
                const accountId = filter.accountId ? String(filter.accountId).trim() : '';
                const limit = Number.isFinite(Number(filter.limit)) && Number(filter.limit) > 0
                    ? Number(filter.limit)
                    : undefined;

                if (!logger || typeof logger.getRecent !== 'function') return [];

                return logger.getRecent({
                    accountId,
                    limit,
                    globalOnly: !accountId
                });
            } catch {
                return [];
            }
        },

        // Isi file log .txt milik satu akun (untuk diunduh/ditelusuri).
        getAccountLogLines(filter = {}) {
            try {
                const accountId = filter.accountId ? String(filter.accountId).trim() : '';
                if (!accountId) return [];
                if (!logger || typeof logger.getAccountLog !== 'function') return [];
                const limit = Number.isFinite(Number(filter.limit)) && Number(filter.limit) > 0
                    ? Number(filter.limit)
                    : undefined;
                return logger.getAccountLog(accountId, limit);
            } catch {
                return [];
            }
        },

        getLogFileMaxLines() {
            return logger && typeof logger.getLogFileMaxLines === 'function'
                ? logger.getLogFileMaxLines()
                : undefined;
        }
    };
};
