const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeDelayRange,
    normalizeOtherCommands,
    normalizeFixedCommands,
    getCommandSlots,
    getCommandSlot,
    setSlotEnabled,
    resolveDelayMs
} = require('../src/managers/commandSlots');
const createLoopManager = require('../src/managers/loop');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test('min-max delay: bound boleh sama dengan max, dan tertukar ikut dinormalisasi', () => {
    assert.deepEqual(normalizeDelayRange({ delayMinMs: 3000, delayMaxMs: 3000 }), { delayMinMs: 3000, delayMaxMs: 3000 });
    const swapped = normalizeDelayRange({ delayMinMs: 8000, delayMaxMs: 2000 });
    assert.deepEqual(swapped, { delayMinMs: 2000, delayMaxMs: 8000 });
    const legacy = normalizeDelayRange({ delayMs: 7000 });
    assert.deepEqual(legacy, { delayMinMs: 7000, delayMaxMs: 7000 });
});

test('resolveDelayMs selalu dalam rentang min-max (inklusive)', () => {
    for (let i = 0; i < 200; i += 1) {
        const value = resolveDelayMs({ delayMinMs: 1500, delayMaxMs: 1500 });
        assert.equal(value, 1500);
    }
    const seen = new Set();
    for (let i = 0; i < 300; i += 1) seen.add(resolveDelayMs({ delayMinMs: 100, delayMaxMs: 900 }));
    assert.ok(seen.size > 10, 'rentang bervariasi');
    seen.forEach(value => assert.ok(value >= 100 && value <= 900));
});

test('konfigurasi lama tanpa min-max tetap bersih dan delay lama dipertahankan', () => {
    const commands = normalizeOtherCommands([{ text: '!c', delayMs: 4000, channelId: '111', enabled: true }]);
    assert.equal(commands[0].delayMinMs, 4000);
    assert.equal(commands[0].delayMaxMs, 4000);
    const fixed = normalizeFixedCommands({ lb: { channelId: '222', delayMs: 6000, count: 0 } });
    assert.equal(fixed.lb.delayMinMs, 6000);
    assert.equal(fixed.lb.delayMaxMs, 6000);
});

test('slot tetap lh & lb tersedia sebagai slot 4 dan 5', () => {
    const config = { otherCommands: normalizeOtherCommands([]), fixedCommands: normalizeFixedCommands({}) };
    const slots = getCommandSlots(config);
    assert.equal(slots.length, 5);
    assert.equal(slots[3].fixed, 'lb');
    assert.equal(slots[3].command.text, 'lb');
    assert.equal(slots[4].fixed, 'lh');
    assert.equal(slots[4].command.text, 'lh');
    assert.equal(getCommandSlot(config, 3).fixed, 'lb');
    assert.equal(getCommandSlot(config, 4).fixed, 'lh');
});

test('enabled slot tetap diatur lewat setSlotEnabled', () => {
    const config = { otherCommands: normalizeOtherCommands([]), fixedCommands: normalizeFixedCommands({}) };
    setSlotEnabled(config, 3, true);
    setSlotEnabled(config, 4, false);
    assert.equal(config.fixedCommands.lb.enabled, true);
    assert.equal(config.fixedCommands.lh.enabled, false);
});

test('Custom Command tetap lh/lb berjalan dengan delay acak in-range dan berhenti sesuai count', async () => {
    const sent = [];
    const state = {
        config: {
            otherCommands: normalizeOtherCommands([]),
            fixedCommands: normalizeFixedCommands({
                lb: { channelId: 'c1', delayMinMs: 20, delayMaxMs: 60, count: 3, enabled: true },
                lh: { channelId: 'c1', delayMinMs: 20, delayMaxMs: 60, count: 0, enabled: false }
            }),
            botStatus: { running: true, paused: false }
        },
        loops: {}, nextAt: {}, otherCommandDelays: {}, rest: { active: false }
    };
    const loopManager = createLoopManager(state, { async send(cmd) { sent.push({ cmd, t: Date.now() }); return true; } });

    assert.equal(loopManager.startOtherCommand(3), true);
    await wait(400);
    assert.equal(sent.length, 3, 'lb count 3 selesai');
    assert.equal(state.config.fixedCommands.lb.enabled, false, 'slot selesai dinonaktifkan');
    assert.equal(state.config.fixedCommands.lh.enabled, false, 'lh tidak aktif');

    const gaps = [];
    for (let i = 1; i < sent.length; i += 1) gaps.push(sent[i].t - sent[i - 1].t);
    gaps.forEach(gap => assert.ok(gap >= 15 && gap <= 130, `gap ${gap}ms diluar estimasi min-max`));
});

test('startAll mencakup command tetap dan slot yang berjalan tidak di-restart', async () => {
    const sent = [];
    const state = {
        config: {
            otherCommands: normalizeOtherCommands([{ text: '!c', channelId: 'c1', delayMinMs: 30, delayMaxMs: 30, count: 1, enabled: true }]),
            fixedCommands: normalizeFixedCommands({ lb: { channelId: 'c1', delayMinMs: 30, delayMaxMs: 30, count: 1, enabled: true } }),
            botStatus: { running: true, paused: false }
        },
        loops: {}, nextAt: {}, otherCommandDelays: {}, rest: { active: false }
    };
    const loopManager = createLoopManager(state, { async send(cmd) { sent.push(cmd); return true; } });

    loopManager.startAll();
    // Slot pertama (custom) langsung jalan tanpa stagger; slot tetap lb baru menyusul
    // setelah jeda anti-burst (500ms).
    assert.deepEqual(sent.slice(), ['!c'], 'slot pertama start langsung');
    await wait(1300);
    assert.deepEqual(sent.slice().sort(), ['!c', 'lb'], 'command tetap ikut start');

    loopManager.startAll();
    const countAfterSecond = sent.length;
    assert.equal(countAfterSecond, 2, 'startAll ulang tidak menambah kiriman baru');
    await wait(400);
    assert.equal(countAfterSecond, sent.length);
});