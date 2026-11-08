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

test('enabled slot tetap diatur lewat setSlotEnabled (fixed = satu unit)', () => {
    const config = { otherCommands: normalizeOtherCommands([]), fixedCommands: normalizeFixedCommands({}) };
    setSlotEnabled(config, 3, true);
    assert.equal(config.fixedCommands.lb.enabled, true);
    assert.equal(config.fixedCommands.lh.enabled, true, 'menyalakan lb ikut menyalakan lh');

    setSlotEnabled(config, 4, false);
    assert.equal(config.fixedCommands.lb.enabled, false, 'mematikan lh ikut mematikan lb');
    assert.equal(config.fixedCommands.lh.enabled, false);
});

test('normalisasi fixed: enabled selalu sinkron walau config lama hanya nyalakan lb', () => {
    const fixed = normalizeFixedCommands({
        lb: { channelId: 'c1', delayMinMs: 20, delayMaxMs: 60, count: 3, enabled: true },
        lh: { channelId: 'c1', delayMinMs: 20, delayMaxMs: 60, count: 0, enabled: false }
    });
    assert.equal(fixed.lb.enabled, true);
    assert.equal(fixed.lh.enabled, true, 'lh ikut aktif karena pasangan adalah satu unit');
    assert.equal(fixed.lb.channelId, 'c1');
    assert.equal(fixed.lh.channelId, 'c1');
});

test('pasangan lb+lh berjalan dengan delay acak in-range dan berhenti sesuai count leader', async () => {
    const sent = [];
    const state = {
        config: {
            otherCommands: normalizeOtherCommands([]),
            fixedCommands: normalizeFixedCommands({
                lb: { channelId: 'c1', delayMinMs: 20, delayMaxMs: 60, count: 3, enabled: true },
                lh: { channelId: 'c1', delayMinMs: 20, delayMaxMs: 60, count: 0, enabled: true }
            }),
            botStatus: { running: true, paused: false }
        },
        loops: {}, nextAt: {}, otherCommandDelays: {}, rest: { active: false }
    };
    const loopManager = createLoopManager(state, { async send(cmd) { sent.push({ cmd, t: Date.now() }); return true; } });

    assert.equal(loopManager.startOtherCommand(3), true);
    await wait(2200);
    // count leader 3 => lb,lh,lb,lh,lb,lh
    assert.deepEqual(sent.map(s => s.cmd), ['lb', 'lh', 'lb', 'lh', 'lb', 'lh'], 'urutan selalu lb lalu lh');
    assert.equal(state.config.fixedCommands.lb.enabled, false, 'slot selesai dinonaktifkan');
    assert.equal(state.config.fixedCommands.lh.enabled, false, 'pasangan ikut dinonaktifkan');
});

test('lh+lb selalu berpasangan: lb lalu lh (jeda mengetik di antara)', async () => {
    const sent = [];
    const state = {
        config: {
            otherCommands: normalizeOtherCommands([]),
            fixedCommands: normalizeFixedCommands({
                lb: { channelId: 'c1', delayMinMs: 30, delayMaxMs: 30, count: 2, enabled: true },
                lh: { channelId: 'c1', delayMinMs: 30, delayMaxMs: 30, count: 0, enabled: true }
            }),
            botStatus: { running: true, paused: false }
        },
        loops: {}, nextAt: {}, otherCommandDelays: {}, rest: { active: false }
    };
    const loopManager = createLoopManager(state, { async send(cmd) { sent.push({ cmd, t: Date.now() }); return true; } });

    assert.equal(loopManager.startOtherCommand(3), true);
    await wait(1500);
    // pair count 2 => lb,lh,lb,lh
    assert.deepEqual(sent.map(s => s.cmd), ['lb', 'lh', 'lb', 'lh'], 'urutan selalu lb lalu lh');
    assert.equal(state.config.fixedCommands.lb.enabled, false, 'leader selesai dinonaktifkan');
    assert.equal(state.config.fixedCommands.lh.enabled, false, 'follower ikut dinonaktifkan');
});

test('startAll dengan lb+lh aktif: pair dikirim berpasangan, dari leader lb', async () => {
    const sent = [];
    const state = {
        config: {
            otherCommands: normalizeOtherCommands([]),
            fixedCommands: normalizeFixedCommands({
                lb: { channelId: 'c1', delayMinMs: 30, delayMaxMs: 30, count: 1, enabled: true },
                lh: { channelId: 'c1', delayMinMs: 30, delayMaxMs: 30, count: 0, enabled: true }
            }),
            botStatus: { running: true, paused: false }
        },
        loops: {}, nextAt: {}, otherCommandDelays: {}, rest: { active: false }
    };
    const loopManager = createLoopManager(state, { async send(cmd) { sent.push({ cmd, t: Date.now() }); return true; } });

    loopManager.startAll();
    await wait(1600);
    assert.deepEqual(sent.map(s => s.cmd), ['lb', 'lh'], 'startAll pair hanya sekali lb lalu lh, tidak ada lh di awal');
    assert.equal(state.config.fixedCommands.lb.enabled, false);
    assert.equal(state.config.fixedCommands.lh.enabled, false);
    // jeda mengetik nyata antara lb dan lh
    assert.ok(sent[1].t - sent[0].t >= 200, `jeda mengetik antara lb dan lh (${sent[1].t - sent[0].t}ms) >= 200ms`);
});

test('START pada tombol lh dengan lb aktif tetap memulai pair dari lb (bukan lh sendirian)', async () => {
    const sent = [];
    const state = {
        config: {
            otherCommands: normalizeOtherCommands([]),
            fixedCommands: normalizeFixedCommands({
                lb: { channelId: 'c1', delayMinMs: 30, delayMaxMs: 30, count: 1, enabled: true },
                lh: { channelId: 'c1', delayMinMs: 30, delayMaxMs: 30, count: 0, enabled: true }
            }),
            botStatus: { running: true, paused: false }
        },
        loops: {}, nextAt: {}, otherCommandDelays: {}, rest: { active: false }
    };
    const loopManager = createLoopManager(state, { async send(cmd) { sent.push({ cmd, t: Date.now() }); return true; } });

    assert.equal(loopManager.startOtherCommand(4), true);
    await wait(1000);
    assert.deepEqual(sent.map(s => s.cmd), ['lb', 'lh'], 'mulai dari tombol lh tetap lb lalu lh');
});

test('START ganda yang berdekatan tidak menyisipkan lh tanpa lb (pasangan atomik)', async () => {
    const sent = [];
    const state = {
        config: {
            otherCommands: normalizeOtherCommands([]),
            fixedCommands: normalizeFixedCommands({
                lb: { channelId: 'c1', delayMinMs: 40, delayMaxMs: 40, count: 3, enabled: true },
                lh: { channelId: 'c1', delayMinMs: 40, delayMaxMs: 40, count: 0, enabled: true }
            }),
            botStatus: { running: true, paused: false }
        },
        loops: {}, nextAt: {}, otherCommandDelays: {}, rest: { active: false }
    };
    const loopManager = createLoopManager(state, { async send(cmd) { sent.push(cmd); return true; } });

    // Dua START berdekatan (mis. tombol + startAll/reconcile) tidak boleh
    // saling menyisip sehingga lh terkirim tanpa lb pendampingnya.
    loopManager.startOtherCommand(3);
    loopManager.startOtherCommand(3);
    await wait(1500);

    assert.ok(sent.includes('lh'), 'pair benar-benar berjalan');
    for (let i = 0; i < sent.length; i += 1) {
        if (sent[i] === 'lh') {
            assert.equal(sent[i - 1], 'lb', `lh pada indeks ${i} harus tepat didahului lb (urutan: ${sent.join(',')})`);
        }
        if (sent[i] === 'lb' && sent[i + 1] === 'lb') {
            assert.fail(`dua lb berurutan: pasangan saling menyisip (urutan: ${sent.join(',')})`);
        }
    }
});

test('startAll saat pair sedang berjalan tidak menggandakan kiriman (skipIfRunning)', async () => {
    const sent = [];
    const state = {
        config: {
            otherCommands: normalizeOtherCommands([]),
            fixedCommands: normalizeFixedCommands({
                lb: { channelId: 'c1', delayMinMs: 200, delayMaxMs: 200, count: 3, enabled: true },
                lh: { channelId: 'c1', delayMinMs: 200, delayMaxMs: 200, count: 0, enabled: true }
            }),
            botStatus: { running: true, paused: false }
        },
        loops: {}, nextAt: {}, otherCommandDelays: {}, rest: { active: false }
    };
    const loopManager = createLoopManager(state, { async send(cmd) { sent.push(cmd); return true; } });

    loopManager.startOtherCommand(3);
    await wait(100); // lb sedang dalam perjalanan
    loopManager.startAll(); // tidak boleh memulai pair kedua
    await wait(1500);

    for (let i = 0; i < sent.length; i += 1) {
        if (sent[i] === 'lh') {
            assert.equal(sent[i - 1], 'lb', `lh harus didahului lb (urutan: ${sent.join(',')})`);
        }
        if (sent[i] === 'lb' && sent[i + 1] === 'lb') {
            assert.fail(`dua lb berurutan: pair ganda berjalan (urutan: ${sent.join(',')})`);
        }
    }
    // count 3 => maksimal 3 pasangan (6 kiriman); tidak ada loop kedua.
    assert.ok(sent.length <= 6, `tidak ada kiriman berlebih (urutan: ${sent.join(',')})`);
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
    // Slot pertama (custom) langsung jalan tanpa stagger; slot tetap lb menyusul
    // setelah jeda anti-burst (500ms), lalu lh mengikuti sebagai pasangan.
    assert.deepEqual(sent.slice(), ['!c'], 'slot pertama start langsung');
    await wait(1600);
    assert.deepEqual(sent.slice().sort(), ['!c', 'lb', 'lh'], 'command tetap ikut start sebagai pasangan lb+lh');

    loopManager.startAll();
    const countAfterSecond = sent.length;
    assert.equal(countAfterSecond, 3, 'startAll ulang tidak menambah kiriman baru');
    await wait(400);
    assert.equal(countAfterSecond, sent.length);
});
// Regresi: pause akun tidak boleh menghapus flag `enabled` fitur, supaya
// perubahan config dari dashboard saat akun pause tetap tersimpan dan START
// berikutnya bisa melanjutkan fitur yang sama (mis. Command Tetap lb+lh).
test('pause() menghentikan timer tanpa mengubah flag enabled Command Tetap', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const createAccountRuntime = require('../src/core/accountRuntime');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pause-keeps-enabled-'));
    const file = path.join(dir, 'config_x.json');
    const token = `${Buffer.from('123456789012345678', 'utf8').toString('base64').replace(/=+$/, '')}.abcdef.ghijkl`;
    const config = {
        token,
        botStatus: { running: true, paused: false },
        settings: { monsterCatcher: { enabled: true }, boss2: { enabled: true } },
        otherCommands: [{ text: '!c', channelId: 'c', delayMinMs: 20, delayMaxMs: 20, count: 1, enabled: true }],
        fixedCommands: {
            lb: { text: 'lb', channelId: 'c', delayMinMs: 20, delayMaxMs: 20, count: 0, enabled: true },
            lh: { text: 'lh', channelId: 'c', delayMinMs: 20, delayMaxMs: 20, count: 0, enabled: true }
        }
    };
    fs.writeFileSync(file, JSON.stringify(config, null, 2));

    try {
        const runtime = createAccountRuntime({ config, filePath: file, sharedStats: {} });
        runtime.pause();

        const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
        assert.equal(disk.fixedCommands.lb.enabled, true, 'pause tidak boleh mematikan lb');
        assert.equal(disk.fixedCommands.lh.enabled, true, 'pause tidak boleh mematikan lh');
        assert.equal(disk.otherCommands[0].enabled, true, 'pause tidak boleh mematikan custom command');
        assert.equal(disk.settings.monsterCatcher.enabled, true, 'pause tidak boleh mematikan Monster Catcher');
        assert.deepEqual(disk.botStatus, { running: false, paused: true });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
