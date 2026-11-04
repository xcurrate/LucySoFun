const log = require('../../logger');
const { accountPrefix } = require('../utils');

module.exports = (state, configManager) => ({
    updateActive() {
        const valid = configManager.getValidChannels();
        if (valid.length === 0) return false;

        if (state.activeChannelId && valid.includes(state.activeChannelId)) {
            return true;
        }

        const newChannelId = valid[Math.floor(Math.random() * valid.length)];
        state.activeChannelId = newChannelId;

        if (state.client?.isReady()) {
            const channel = state.client.channels.cache.get(newChannelId);
            if (channel) log.info(`${accountPrefix(state)}📡 Channel Aktif: ${channel.name}`);
        }

        return true;
    }
});
