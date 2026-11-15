const {
    SLOT_TIER,
    COOLDOWN_POLICY,
    PREMIUM_ONLY_FEATURES,
    CAPTCHA_RESUME_DELAY_MS,
    CAPTCHA_RESUME_DELAY_PREMIUM_MS
} = require('./constants');

const TIER_REGULAR = SLOT_TIER.REGULAR;
const TIER_PREMIUM = SLOT_TIER.PREMIUM;

// Tier tak dikenal (data lama / tanpa izin) dianggap premium agar perilaku
// akun yang sudah ada tidak berubah.
const normalizeTier = (value) => (String(value || '').trim().toLowerCase() === TIER_REGULAR ? TIER_REGULAR : TIER_PREMIUM);

const isRegular = (tier) => normalizeTier(tier) === TIER_REGULAR;

// Batas bawah jeda Custom Commands per tier.
const customDelayFloorMs = (tier) => (isRegular(tier) ? COOLDOWN_POLICY.customRegularMinMs : COOLDOWN_POLICY.customPremiumMinMs);

// Rentang jeda Command Tetap (lb + lh) per tier.
const fixedDelayRange = (tier) => (isRegular(tier)
    ? { delayMinMs: COOLDOWN_POLICY.fixedRegularMinMs, delayMaxMs: COOLDOWN_POLICY.fixedRegularMaxMs }
    : { delayMinMs: COOLDOWN_POLICY.fixedPremiumMinMs, delayMaxMs: COOLDOWN_POLICY.fixedPremiumMaxMs });

// Jeda aman setelah captcha terverifikasi: reguler menunggu, premium lanjut langsung.
const captchaResumeDelayMs = (tier) => (isRegular(tier) ? CAPTCHA_RESUME_DELAY_MS : CAPTCHA_RESUME_DELAY_PREMIUM_MS);

const clampRange = (minMs, maxMs, floorMs) => {
    const lo = Math.max(floorMs, Math.max(0, Math.round(Number(minMs) || 0)));
    const hi = Math.max(lo, Math.max(0, Math.round(Number(maxMs) || 0)));
    return { delayMinMs: lo, delayMaxMs: hi };
};

// Custom Commands: angkat jeda ke batas bawah tier. Command Tetap (lb+lh)
// dikunci ke rentang tier-nya.
function applyCooldownPolicy(config, tier) {
    const floor = customDelayFloorMs(tier);
    if (Array.isArray(config.otherCommands)) {
        config.otherCommands = config.otherCommands.map(command => {
            const current = command || {};
            const range = clampRange(
                current.delayMinMs ?? current.delayMs,
                current.delayMaxMs ?? current.delayMinMs ?? current.delayMs,
                floor
            );
            return { ...current, delayMs: range.delayMinMs, ...range };
        });
    }
    if (config.fixedCommands) {
        const range = fixedDelayRange(tier);
        config.fixedCommands = {
            ...config.fixedCommands,
            delayMs: range.delayMinMs,
            ...range
        };
    }
    return config;
}

// Fitur premium-only tidak boleh aktif pada akun reguler.
function applyPremiumFeatureGate(config, tier) {
    if (!isRegular(tier)) return config;
    config.settings = config.settings || {};
    for (const feature of PREMIUM_ONLY_FEATURES) {
        if (config.settings[feature]) config.settings[feature].enabled = false;
    }
    return config;
}

function applyTierPolicy(config, tier) {
    applyCooldownPolicy(config, tier);
    applyPremiumFeatureGate(config, tier);
    return config;
}

module.exports = {
    TIER_REGULAR,
    TIER_PREMIUM,
    PREMIUM_ONLY_FEATURES,
    COOLDOWN_POLICY,
    normalizeTier,
    isRegular,
    customDelayFloorMs,
    fixedDelayRange,
    captchaResumeDelayMs,
    applyCooldownPolicy,
    applyPremiumFeatureGate,
    applyTierPolicy
};
