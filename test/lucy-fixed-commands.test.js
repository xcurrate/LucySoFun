const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

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
const createAccountRuntime = require('../src/core/accountRuntime');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Config Command Tetap SATU UNIT: satu channel/delay/count/enabled.
const makeState = (fixedOverrides = {}, otherCommands = []) => ({
    config: {
        otherCommands: normalizeOtherCommands(otherCommands),
        fixedCommands: normalizeFixedCommands(fixedOverrides),
        botStatus: { running: true, paused: false }
    },
    loops: {}, nextAt: {}, otherCommandDelays: {}, rest: { active: false }
});

test('min-max delay: bound boleh sama dengan max, dan tertukar ikut dinormalisasi', () => {
    assert.deepEqual(normalizeDelayRange({ delayMinMs: 3000, delayMaxMs: 3000 }), { delayMinMs: 3000, delayMaxMs: 3000 });
    const swapped = normalizeDelayRange({ delayMinMs: 8000, delayMaxMs: 2000 });
    assert.deepEqual(swapped, { delayMinMs: 2000, delayMaxMs: 8000 });
    const legacy = normalizeDelayRange({ delayMs: 7000 });
    assert.deepEqual(legacy, { delayMinMs: 7000, delayMaxMs: 7000 });
});

test('resolveDelayMs selalu dalam rentang min-max (inklusive)', () => {
    for (let i = 0; i < 200; i += 1) {
        assert.equal(resolveDelayMs({ delayMinMs: 1500, delayMaxMs: 1500 }), 1500);
    }
    const seen = new Set();
    for (let i = 0; i < 300; i += 1) seen.add(resolveDelayMs({ delayMinMs: 100, delayMaxMs: 900 }));
    assert.ok(seen.size > 10, 'rentang bervariasi');
    seen.forEach(value => assert.ok(value >= 100 && value <= 900));
});

test('konfigurasi lama (delayMs saja) tetap bersih dan delay dipertahankan', () => {
    const commands = normalizeOtherCommands([{ text: '!c', delayMs: 4000, channelId: '111', enabled: true }]);
    assert.equal(commands[0].delayMinMs, 4000);
    assert.equal(commands[0].delayMaxMs, 4000);
    const fixed = normalizeFixedCommands({ channelId: '222', delayMs: 6000, count: 0 });
    assert.equal(fixed.delayMinMs, 6000);
    assert.equal(fixed.delayMaxMs, 6000);
    assert.equal(fixed.channelId, '222');
});

test('normalisasi fixed: bentuk lama { lb, lh } digabung jadi satu unit', () => {
    // lb punya channel, lh punya count; keduanya harus menyatu tanpa field hilang.
    const fixed = normalizeFixedCommands({
        lb: { channelId: 'c1', delayMinMs: 20, delayMaxMs: 60, count: 3, enabled: true },
        lh: { channelId: 'c1', delayMinMs: 20, delayMaxMs: 60, count: 0, enabled: false }
    });
    assert.equal(fixed.channelId, 'c1');
    assert.equal(fixed.delayMinMs, 20);
    assert.equal(fixed.delayMaxMs, 60);
    assert.equal(fixed.enabled, true, 'aktif jika salah satu slot lama aktif');
    assert.equal(fixed.lb, undefined, 'tidak lagi menyimpan config per-slot');
});

test('normalisasi fixed: unit tetap satu walau channel hanya di lh (self-heal)', () => {
    const fixed = normalizeFixedCommands({
        lb: { channelId: '', delayMinMs: 30, delayMaxMs: 30, count: 1, enabled: true },
        lh: { channelId: 'c1', delayMinMs: 30, delayMaxMs: 30, count: 1, enabled: true }
    });
    assert.equal(fixed.channelId, 'c1');
    assert.equal(fixed.enabled, true);
});

test('slot tetap lh & lb tersedia sebagai slot 4 dan 5 dari SATU sumber', () => {
    const config = { otherCommands: normalizeOtherCommands([]), fixedCommands: normalizeFixedCommands({ channelId: 'c9', count: 0, enabled: true }) };
    const slots = getCommandSlots(config);
    assert.equal(slots.length, 5);
    assert.equal(slots[3].fixed, 'lb');
    assert.equal(slots[3].command.text, 'lb');
    assert.equal(slots[4].fixed, 'lh');
    assert.equal(slots[4].command.text, 'lh');
    // channel dibaca dari sumber yang sama, jadi mustahil berbeda.
    assert.equal(slots[3].command.channelId, 'c9');
    assert.equal(slots[4].command.channelId, 'c9');
    assert.equal(getCommandSlot(config, 3).fixed, 'lb');
    assert.equal(getCommandSlot(config, 4).fixed, 'lh');
});

test('setSlotEnabled: slot 3 atau 4 menyalakan/mematikan SATU unit', () => {
    const config = { otherCommands: normalizeOtherCommands([]), fixedCommands: normalizeFixedCommands({}) };
    setSlotEnabled(config, 3, true);
    assert.equal(config.fixedCommands.enabled, true);
    setSlotEnabled(config, 4, false);
    assert.equal(config.fixedCommands.enabled, false, 'dari slot mana pun, unit tetap satu');
    setSlotEnabled(config, 'fixedlh', true);
    assert.equal(config.fixedCommands.enabled, true);
});

test('pair lb+lh berjalan berpasangan dan berhenti sesuai count unit', async () => {
    const sent = [];
    const state = makeState({ channelId: 'c1', delayMinMs: 20, delayMaxMs: 20, count: 3, enabled: true });
    const loopManager = createLoopManager(state, { async send(cmd) { sent.push(cmd); return true; } });

    assert.equal(loopManager.startOtherCommand(3), true);
    await wait(2200);
    assert.deepEqual(sent, ['lb', 'lh', 'lb', 'lh', 'lb', 'lh'], 'urutan selalu lb lalu lh');
    assert.equal(state.config.fixedCommands.enabled, false, 'unit selesai dinonaktifkan');
});

test('START pada slot lh tetap memulai unit dari lb', async () => {
    const sent = [];
    const state = makeState({ channelId: 'c1', delayMinMs: 30, delayMaxMs: 30, count: 1, enabled: true });
    const loopManager = createLoopManager(state, { async send(cmd) { sent.push(cmd); return true; } });

    assert.equal(loopManager.startOtherCommand(4), true);
    await wait(1000);
    assert.deepEqual(sent, ['lb', 'lh']);
});

test('startAll memulai unit lb/lh sekali (tidak dobel) beserta custom command', async () => {
    const sent = [];
    const state = makeState(
        { channelId: 'c1', delayMinMs: 30, delayMaxMs: 30, count: 1, enabled: true },
        [{ text: '!c', channelId: 'c1', delayMinMs: 30, delayMaxMs: 30, count: 1, enabled: true }]
    );
    const loopManager = createLoopManager(state, { async send(cmd) { sent.push(cmd); return true; } });

    loopManager.startAll();
    await wait(1600);
    assert.deepEqual(sent.slice().sort(), ['!c', 'lb', 'lh'], 'START ALL menjalankan custom + unit lb/lh');

    const before = sent.length;
    loopManager.startAll();
    await wait(400);
    assert.equal(sent.length, before, 'startAll ulang tidak menambah kiriman');
});

test('START ganda berdekatan tidak menyisipkan lh tanpa lb (pasangan atomik)', async () => {
    const sent = [];
    const state = makeState({ channelId: 'c1', delayMinMs: 40, delayMaxMs: 40, count: 3, enabled: true });
    const loopManager = createLoopManager(state, { async send(cmd) { sent.push(cmd); return true; } });

    loopManager.startOtherCommand(3);
    loopManager.startOtherCommand(3);
    await wait(1500);

    assert.ok(sent.includes('lh'), 'pair benar-benar berjalan');
    for (let i = 0; i < sent.length; i += 1) {
        if (sent[i] === 'lh') assert.equal(sent[i - 1], 'lb', `lh pada indeks ${i} harus didahului lb (${sent.join(',')})`);
        if (sent[i] === 'lb' && sent[i + 1] === 'lb') assert.fail(`dua lb berurutan (${sent.join(',')})`);
    }
});

// Regresi inti: START ALL / kontrol Lucy memakai startAll(). Dulu unit lb/lh
// diperiksa per-slot, jadi config yang channel-nya hanya di lh (atau key lb tidak
// ada) tidak pernah jalan lewat START ALL — padahal tombol kartu jalan.
test('startAll menjalankan unit lb/lh walau channel hanya ada di lh (atau lb tidak ada)', async () => {
    const shapes = [
        { name: 'channel hanya di lh', fixed: { lb: { channelId: '', delayMinMs: 30, delayMaxMs: 30, count: 1, enabled: true }, lh: { channelId: 'c1', delayMinMs: 30, delayMaxMs: 30, count: 1, enabled: true } } },
        { name: 'key lb tidak ada', fixed: { lh: { channelId: 'c1', delayMinMs: 30, delayMaxMs: 30, count: 1, enabled: true } } }
    ];

    for (const shape of shapes) {
        const sent = [];
        const state = makeState(shape.fixed);
        const loopManager = createLoopManager(state, { async send(cmd) { sent.push(cmd); return true; } });
        loopManager.startAll();
        await wait(1200);
        assert.deepEqual(sent, ['lb', 'lh'], `startAll harus menjalankan lb+lh (${shape.name})`);
    }
});

// Regresi: pause() tidak boleh menghapus flag `enabled` fitur.
test('pause() menghentikan timer tanpa mengubah flag enabled Command Tetap', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pause-keeps-enabled-'));
    const file = path.join(dir, 'config_x.json');
    const token = `${Buffer.from('123456789012345678', 'utf8').toString('base64').replace(/=+$/, '')}.abcdef.ghijkl`;
    const config = {
        token,
        botStatus: { running: true, paused: false },
        settings: { monsterCatcher: { enabled: true }, boss2: { enabled: true } },
        otherCommands: [{ text: '!c', channelId: 'c', delayMinMs: 20, delayMaxMs: 20, count: 1, enabled: true }],
        fixedCommands: { channelId: 'c', delayMinMs: 20, delayMaxMs: 20, count: 0, enabled: true }
    };
    fs.writeFileSync(file, JSON.stringify(config, null, 2));

    try {
        const runtime = createAccountRuntime({ config, filePath: file, sharedStats: {} });
        runtime.pause();

        const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
        assert.equal(disk.fixedCommands.enabled, true, 'pause tidak boleh mematikan Command Tetap');
        assert.equal(disk.otherCommands[0].enabled, true, 'pause tidak boleh mematikan custom command');
        assert.equal(disk.settings.monsterCatcher.enabled, true, 'pause tidak boleh mematikan Monster Catcher');
        assert.deepEqual(disk.botStatus, { running: false, paused: true });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
