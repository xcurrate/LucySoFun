const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function safeEqual(actual, expected) {
    const actualBuffer = Buffer.from(String(actual || ''), 'utf8');
    const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
    return actualBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

// Batas atas agar Date tidak overflow; 100 tahun sudah jauh lebih dari cukup.
const MAX_DURATION_HOURS = 24 * 365 * 100;

module.exports = function createSlotPermissionManager({
    baseDir = process.cwd(),
    password = process.env.SLOT_OWNER_PASSWORD || ''
} = {}) {
    const filePath = path.join(baseDir, 'slot-permissions.json');
    const passwordFilePath = path.join(baseDir, 'slot-owner-password.txt');

    function getOwnerPassword() {
        if (typeof password === 'string' && password.trim()) return password.trim();
        try {
            return fs.readFileSync(passwordFilePath, 'utf8').trim();
        } catch {
            return '';
        }
    }

    function readStore() {
        try {
            const store = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (!store.grants || typeof store.grants !== 'object' || Array.isArray(store.grants)) {
                store.grants = {};
            }
            return store;
        } catch {
            return { grants: {} };
        }
    }

    function writeStore(store) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const temporaryPath = `${filePath}.tmp`;
        fs.writeFileSync(temporaryPath, JSON.stringify(store, null, 2), { mode: 0o600 });
        fs.renameSync(temporaryPath, filePath);
    }

    function normalizeId(id) {
        const value = String(id || '').trim();
        return /^\d{17,20}$/.test(value) ? value : '';
    }

    // Durasi izin dalam jam. Kosong/0 = tanpa kedaluwarsa (perilaku lama).
    function normalizeDurationHours(value) {
        if (value === undefined || value === null || String(value).trim() === '') return 0;
        const hours = Number(value);
        if (!Number.isFinite(hours) || hours <= 0) return 0;
        return Math.min(Math.round(hours * 100) / 100, MAX_DURATION_HOURS);
    }

    function computeExpiresAt(usedAt, durationHours) {
        if (!durationHours) return null;
        const base = Date.parse(usedAt || '') || Date.now();
        return new Date(base + durationHours * 60 * 60 * 1000).toISOString();
    }

    function isExpired(grant, now = Date.now()) {
        if (!grant || grant.status !== 'used' || !grant.expiresAt) return false;
        const expiresAt = Date.parse(grant.expiresAt);
        return Number.isFinite(expiresAt) && expiresAt <= now;
    }

    return {
        isConfigured() {
            return getOwnerPassword().length >= 12;
        },

        verifyOwnerPassword(candidate) {
            return this.isConfigured() && safeEqual(candidate, getOwnerPassword());
        },

        list() {
            return Object.entries(readStore().grants)
                .map(([accountId, grant]) => ({ accountId, ...grant }))
                .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        },

        get(accountId) {
            const id = normalizeId(accountId);
            return id ? readStore().grants[id] || null : null;
        },

        grant(accountId, note = '', durationHours = 0) {
            const id = normalizeId(accountId);
            if (!id) return { ok: false, message: 'Discord User ID harus berupa 17–20 digit.' };

            const store = readStore();
            const existing = store.grants[id];
            if (existing && existing.status !== 'revoked') {
                return { ok: false, message: 'ID ini sudah memiliki izin atau pernah menggunakan izin. Satu ID tidak bisa diberi izin berulang.' };
            }

            const duration = normalizeDurationHours(durationHours);
            store.grants[id] = {
                status: 'available',
                note: String(note || '').trim().slice(0, 120),
                durationHours: duration,
                createdAt: new Date().toISOString(),
                usedAt: null,
                expiresAt: null
            };
            writeStore(store);
            return { ok: true, durationHours: duration };
        },

        consume(accountId) {
            const id = normalizeId(accountId);
            if (!id) return { ok: false, message: 'Discord User ID tidak valid.' };

            const store = readStore();
            const grant = store.grants[id];
            if (!grant || grant.status !== 'available') {
                return { ok: false, message: 'Akun ini belum memiliki izin slot yang aktif dari pemilik.' };
            }

            grant.status = 'used';
            grant.usedAt = new Date().toISOString();
            grant.expiresAt = computeExpiresAt(grant.usedAt, grant.durationHours);
            writeStore(store);
            return { ok: true, expiresAt: grant.expiresAt };
        },

        // Izin `used` yang sudah lewat expiresAt. Dipakai sweeper untuk menghapus
        // slot akun otomatis. Tidak mengubah store.
        listExpired(now = Date.now()) {
            return Object.entries(readStore().grants)
                .filter(([, grant]) => isExpired(grant, now))
                .map(([accountId, grant]) => ({ accountId, ...grant }));
        },

        // Tandai izin sebagai kedaluwarsa/dicabut agar ID dapat diberi izin ulang.
        expire(accountId) {
            const id = normalizeId(accountId);
            if (!id) return { ok: false, message: 'Discord User ID tidak valid.' };
            const store = readStore();
            const grant = store.grants[id];
            if (!grant) return { ok: false, message: 'Izin tidak ditemukan.' };
            if (grant.status === 'revoked') return { ok: true, wasUsed: false, alreadyRevoked: true };
            grant.status = 'revoked';
            grant.revokedAt = new Date().toISOString();
            grant.revokedReason = 'expired';
            writeStore(store);
            return { ok: true, wasUsed: grant.usedAt != null };
        },

        release(accountId) {
            const id = normalizeId(accountId);
            if (!id) return false;
            const store = readStore();
            const grant = store.grants[id];
            if (!grant || grant.status !== 'used') return false;
            grant.status = 'available';
            grant.usedAt = null;
            grant.expiresAt = null;
            writeStore(store);
            return true;
        },

        revoke(accountId) {
            const id = normalizeId(accountId);
            if (!id) return { ok: false, message: 'Discord User ID tidak valid.' };
            const store = readStore();
            const grant = store.grants[id];
            if (!grant || grant.status === 'revoked') {
                return { ok: false, message: 'Izin tidak ditemukan atau sudah dicabut.' };
            }
            grant.status = 'revoked';
            grant.revokedAt = new Date().toISOString();
            writeStore(store);
            return { ok: true, wasUsed: grant.usedAt != null };
        }
    };
};
