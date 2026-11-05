const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const createSlotPermissionManager = require('../src/dashboard/services/slotPermissionManager');

const OWNER_PASSWORD = 'test-owner-password-123';
const ACCOUNT_ID = '123456789012345678';

test('slot grants are one-time, persistent, and protected by the owner password', () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slot-manager-'));
    try {
        const manager = createSlotPermissionManager({ baseDir, password: OWNER_PASSWORD });
        assert.equal(manager.isConfigured(), true);
        assert.equal(manager.verifyOwnerPassword(OWNER_PASSWORD), true);
        assert.equal(manager.verifyOwnerPassword('wrong-password'), false);

        assert.deepEqual(manager.grant(ACCOUNT_ID, 'donation'), { ok: true, durationHours: 0 });
        assert.equal(manager.get(ACCOUNT_ID).status, 'available');
        assert.equal(manager.grant(ACCOUNT_ID).ok, false);
        assert.deepEqual(manager.consume(ACCOUNT_ID), { ok: true, expiresAt: null });
        assert.equal(manager.consume(ACCOUNT_ID).ok, false);
        assert.equal(manager.get(ACCOUNT_ID).status, 'used');
        assert.equal(fs.existsSync(path.join(baseDir, 'slot-permissions.json')), true);

        const restartedManager = createSlotPermissionManager({ baseDir, password: OWNER_PASSWORD });
        assert.equal(restartedManager.get(ACCOUNT_ID).status, 'used');
        const revoked = restartedManager.revoke(ACCOUNT_ID);
        assert.deepEqual(revoked, { ok: true, wasUsed: true });
        assert.equal(restartedManager.get(ACCOUNT_ID).status, 'revoked');
    } finally {
        fs.rmSync(baseDir, { recursive: true, force: true });
    }
});

test('durasi izin dihitung sejak akun dipakai dan melahirkan expiresAt', () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slot-duration-'));
    try {
        const manager = createSlotPermissionManager({ baseDir, password: OWNER_PASSWORD });
        assert.deepEqual(manager.grant(ACCOUNT_ID, '24 jam', 24), { ok: true, durationHours: 24 });
        assert.equal(manager.get(ACCOUNT_ID).expiresAt, null, 'belum ada hitungan sebelum dipakai');

        const before = Date.now();
        const result = manager.consume(ACCOUNT_ID);
        assert.equal(result.ok, true);
        const expiresMs = Date.parse(result.expiresAt);
        assert.ok(expiresMs >= before + 24 * 3600 * 1000 - 5000, 'expiresAt ~24 jam dari sekarang');
        assert.ok(expiresMs <= Date.now() + 24 * 3600 * 1000 + 5000);
        assert.equal(manager.get(ACCOUNT_ID).expiresAt, result.expiresAt, 'expiresAt tersimpan');

        // Belum lewat: tidak masuk daftar kedaluwarsa.
        assert.deepEqual(manager.listExpired(), []);
    } finally {
        fs.rmSync(baseDir, { recursive: true, force: true });
    }
});

test('durasi tidak valid diperlakukan sebagai tanpa batas', () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slot-duration-invalid-'));
    try {
        const manager = createSlotPermissionManager({ baseDir, password: OWNER_PASSWORD });
        assert.deepEqual(manager.grant('111111111111111111', '', 'abc'), { ok: true, durationHours: 0 });
        assert.deepEqual(manager.grant('222222222222222222', '', -5), { ok: true, durationHours: 0 });
        assert.deepEqual(manager.grant('333333333333333333', '', '12'), { ok: true, durationHours: 12 });
        assert.equal(manager.get('333333333333333333').durationHours, 12);
        assert.equal(manager.consume('111111111111111111').expiresAt, null);
    } finally {
        fs.rmSync(baseDir, { recursive: true, force: true });
    }
});

test('sweeper menghapus profil akun yang izinnya kedaluwarsa lalu menandainya revoked', () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slot-sweep-'));
    try {
        const manager = createSlotPermissionManager({ baseDir, password: OWNER_PASSWORD });
        manager.grant(ACCOUNT_ID, 'uji', 1);
        manager.consume(ACCOUNT_ID);

        // Paksa expiresAt ke masa lalu untuk mensimulasikan durasi habis.
        const storePath = path.join(baseDir, 'slot-permissions.json');
        const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
        store.grants[ACCOUNT_ID].expiresAt = new Date(Date.now() - 1000).toISOString();
        fs.writeFileSync(storePath, JSON.stringify(store));

        const profilesDir = path.join(baseDir, 'profiles');
        fs.mkdirSync(profilesDir, { recursive: true });
        fs.writeFileSync(path.join(profilesDir, `config_${ACCOUNT_ID}.json`), JSON.stringify({ token: 'x' }));
        const configPath = path.join(baseDir, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify({ multiAccount: { enabled: true, maxAccounts: 3 } }));

        const { createSlotExpirySweeper } = require('../src/dashboard/slotPermissionRoutes');
        const fileService = require('../src/dashboard/services/fileService');
        const createProfileManager = require('../src/dashboard/services/profileManager');
        const profileManager = createProfileManager({ baseDir, fileService });
        const configManager = {
            get: () => JSON.parse(fs.readFileSync(configPath, 'utf8')),
            ensureShape: (config) => config,
            save: (config) => { fs.writeFileSync(configPath, JSON.stringify(config)); return true; }
        };
        const loggedOut = [];
        const state = { multiAccountManager: { logoutAccount: (id) => { loggedOut.push(id); return true; } } };
        const sweeper = createSlotExpirySweeper({ slotPermissionManager: manager, configManager, profileManager, state });

        const removed = sweeper();
        assert.deepEqual(removed, [ACCOUNT_ID], 'melaporkan akun yang dihapus');
        assert.deepEqual(loggedOut, [ACCOUNT_ID], 'runtime akun dihentikan');
        assert.equal(fs.existsSync(path.join(profilesDir, `config_${ACCOUNT_ID}.json`)), false, 'profil dihapus');
        assert.equal(manager.get(ACCOUNT_ID).status, 'revoked', 'izin ditandai revoked');
        assert.equal(manager.get(ACCOUNT_ID).revokedReason, 'expired');
        assert.deepEqual(sweeper(), [], 'sweep kedua tidak mengulang');
    } finally {
        fs.rmSync(baseDir, { recursive: true, force: true });
    }
});
