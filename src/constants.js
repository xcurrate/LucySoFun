module.exports = {

    LUCY_BOT_ID: '1438615298012872817',
    BOSS2_DEFAULTS: {
        enabled: false,
        allowedGuilds: [],
        channelIds: [],
        appearText: 'Guild Boss Telah Muncul',
        defeatedText: 'Guild Boss Telah Dikalahkan',
        buttonId: 'raid:fight',
        fightsPerBoss: 3,
        maxFightsPerBoss: 3,
        delayMinMs: 1000,
        delayMaxMs: 1000,
        ticketYesId: 'raid:ticket:yes',
ticketNoId:  'raid:ticket:no',
limitText:   'limit fight',
minTicketLeft: 1,
        ticketStatusChannelId: '',
        ticketStatusCommand: 'lboss t'
    },
    GEMS_TIERS: {
        F: { main: ['57', '71', '78'], special: '85' },
        L: { main: ['56', '70', '77'], special: '84' },
        M: { main: ['55', '69', '76'], special: '83' },
        E: { main: ['54', '68', '75'], special: '82' },
        R: { main: ['53', '67', '74'], special: '81' },
        U: { main: ['52', '66', '73'], special: '80' },
        C: { main: ['51', '65', '72'], special: '79' }
    },
    GEMS_DEFAULTS: {
        enabled: false,
        channelId: '',
        accountName: '',
        triggerText: 'menghabiskan 5 <:lucent:1523362382355759266>',
        inventoryCommand: 'linv',
        lootboxItem: '049',
        lootboxCommand: 'llb f all',
        lootboxTypes: ['fable', 'normal'],
        lootboxPriority: 'fable',
        selectedTiers: ['F', 'L', 'M', 'E', 'R', 'U', 'C'],
        useSpecialGems: true,
        tierPriority: 'highest',
        requiredGems: ['57', '71', '78'],
        optionalGems: ['85'],
        useCommand: 'luse',
        recheckMinutes: 5,
        delayMinMs: 1500,
        delayMaxMs: 3000,
        lootboxWaitMs: 5000,
        maxLootboxOpens: 3,
        inventoryTimeoutMs: 60000
    },
    MAX_LOG_LINES: 20,
    LOG_FILE_DIR: 'logs',
    LOG_FILE_MAX_LINES: 1000,
    RESPONSE_TIMEOUT_MS: 40000,
    MAX_SET_SIZE: 500,
    MIN_TYPING_DELAY: 290,
    MAX_TYPING_DELAY: 300,
    RESET_CHECK_INTERVAL_MS: 60000,
    INVISIBLE_CHARS_REGEX: /[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g,

    // --- Izin slot bertingkat (reguler vs premium) ---
    SLOT_TIER: { PREMIUM: 'premium', REGULAR: 'regular' },
    // Kebijakan cooldown (jeda) per tier, dalam milidetik.
    // - Custom Commands: premium boleh dari 5 dtk; reguler minimal 16 dtk.
    // - Command Tetap (lb+lh): premium 15-16 dtk; reguler 17-20 dtk.
    COOLDOWN_POLICY: {
        customDefaultMs: 15000,
        customPremiumMinMs: 5000,
        customRegularMinMs: 16000,
        fixedPremiumMinMs: 15000,
        fixedPremiumMaxMs: 16000,
        fixedRegularMinMs: 17000,
        fixedRegularMaxMs: 20000
    },
    // Fitur yang hanya boleh dinyalakan akun premium.
    PREMIUM_ONLY_FEATURES: ['adventure', 'daily', 'cookie'],
    // Jeda setelah captcha terverifikasi sebelum loop lanjut (Monster Catcher & Huntbot2).
    // Reguler memakai jeda aman ini; premium lanjut tanpa jeda.
    CAPTCHA_RESUME_DELAY_MS: 10000,
    CAPTCHA_RESUME_DELAY_PREMIUM_MS: 0
};
