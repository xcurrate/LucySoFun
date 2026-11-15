const test = require('node:test');
const assert = require('node:assert/strict');

const { COOLDOWN_POLICY, applyTierPolicy, normalizeTier, customDelayFloorMs, fixedDelayRange, captchaResumeDelayMs } = require('../src/dashboard/services/tierPolicy');

const makeConfig = (overrides = {}) => ({
    otherCommands: [{ text: '!c', channelId: 'c1', delayMinMs: 3000, delayMaxMs: 3000, count: 0, enabled: true }],
    fixedCommands: { channelId: 'c1', delayMinMs: 1000, delayMaxMs: 1000, count: 0, enabled: true },
    settings: {
        adventure: { enabled: true },
        daily: { enabled: true },
        cookie: { enabled: true },
        gems: { enabled: true }
    },
    ...overrides
});

test('tier tak dikenal / data lama dianggap premium', () => {
    assert.equal(normalizeTier(''), 'premium');
    assert.equal(normalizeTier(undefined), 'premium');
    assert.equal(normalizeTier('PREMIUM'), 'premium');
    assert.equal(normalizeTier('regular'), 'regular');
});

test('premium: Custom Commands dari 5 detik, Command Tetap 15-16 detik, tanpa jeda captcha', () => {
    assert.equal(customDelayFloorMs('premium'), COOLDOWN_POLICY.customPremiumMinMs);

    const config = applyTierPolicy(makeConfig(), 'premium');
    assert.equal(config.otherCommands[0].delayMinMs, 5000);
    assert.equal(config.otherCommands[0].delayMaxMs, 5000);
    assert.equal(config.otherCommands[0].delayMs, 5000);
    assert.deepEqual(fixedDelayRange('premium'), { delayMinMs: 15000, delayMaxMs: 16000 });
    assert.equal(config.fixedCommands.delayMinMs, 15000);
    assert.equal(config.fixedCommands.delayMaxMs, 16000);
    // Premium lanjut tanpa jeda setelah captcha.
    assert.equal(captchaResumeDelayMs('premium'), 0);
    // Premium boleh memakai fitur premium-only.
    assert.equal(config.settings.adventure.enabled, true);
    assert.equal(config.settings.daily.enabled, true);
    assert.equal(config.settings.cookie.enabled, true);
});

test('reguler: Custom Commands dari 16 detik, Command Tetap 17-20 detik, jeda captcha 10 detik', () => {
    assert.equal(customDelayFloorMs('regular'), COOLDOWN_POLICY.customRegularMinMs);

    const config = applyTierPolicy(makeConfig(), 'regular');
    assert.equal(config.otherCommands[0].delayMinMs, 16000);
    assert.equal(config.otherCommands[0].delayMaxMs, 16000);
    // Command Tetap dikunci 17-20 detik untuk reguler.
    assert.deepEqual(fixedDelayRange('regular'), { delayMinMs: 17000, delayMaxMs: 20000 });
    assert.equal(config.fixedCommands.delayMinMs, 17000);
    assert.equal(config.fixedCommands.delayMaxMs, 20000);
    // Reguler memakai jeda aman setelah captcha.
    assert.equal(captchaResumeDelayMs('regular'), 10000);
    // Fitur premium-only dimatikan untuk reguler.
    assert.equal(config.settings.adventure.enabled, false);
    assert.equal(config.settings.daily.enabled, false);
    assert.equal(config.settings.cookie.enabled, false);
    // Fitur non-premium dibiarkan.
    assert.equal(config.settings.gems.enabled, true);
});

test('reguler: delay di atas batas bawah dipertahankan, rentang max >= min dijaga', () => {
    const config = applyTierPolicy(makeConfig({
        otherCommands: [{ text: '!c', channelId: 'c1', delayMinMs: 20000, delayMaxMs: 25000, count: 0, enabled: true }]
    }), 'regular');
    assert.equal(config.otherCommands[0].delayMinMs, 20000);
    assert.equal(config.otherCommands[0].delayMaxMs, 25000);

    // Rentang tertukar: max < min dirapikan (max = min) setelah floor diterapkan.
    const swapped = applyTierPolicy(makeConfig({
        otherCommands: [{ text: '!c', channelId: 'c1', delayMinMs: 40000, delayMaxMs: 1000, count: 0, enabled: true }]
    }), 'regular');
    assert.equal(swapped.otherCommands[0].delayMinMs, 40000);
    assert.equal(swapped.otherCommands[0].delayMaxMs, 40000);
});

test('konfigurasi tanpa otherCommands/fixedCommands tidak melempar error', () => {
    const config = applyTierPolicy({ settings: {} }, 'regular');
    assert.deepEqual(config.settings, {});
});
