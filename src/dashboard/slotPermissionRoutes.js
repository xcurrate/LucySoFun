const express = require('express');
const fs = require('fs');

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

function formatExpiry(expiresAt) {
    const ms = Date.parse(expiresAt || '');
    if (!Number.isFinite(ms)) return '—';
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

// Menghapus profil akun + runtime untuk izin yang sudah dipakai (revoke/kedaluwarsa).
function teardownUsedGrant({ accountId, configManager, profileManager, state }) {
    state?.multiAccountManager?.logoutAccount?.(accountId);
    profileManager.deleteProfile(accountId);
    const remainingProfiles = profileManager.getSavedProfiles();
    const mainConfig = configManager.ensureShape(configManager.get());
    mainConfig.multiAccount = mainConfig.multiAccount || {};
    mainConfig.multiAccount.enabled = true;
    mainConfig.multiAccount.maxAccounts = Math.min(4, remainingProfiles.length);
    configManager.save(mainConfig);
    state?.multiAccountManager?.reconcile?.();
}

function createSlotPermissionRoutes({ slotPermissionManager, configManager, profileManager, state }) {
    const router = express.Router();

    router.get('/owner/slots', (req, res) => {
        const message = escapeHtml(req.query.message || '');
        const grants = slotPermissionManager.list();
        const rows = grants.length ? grants.map((grant) =>
            '<tr><td><code>' + escapeHtml(grant.accountId) + '</code></td><td>' + escapeHtml(grant.note || '—') +
            '</td><td>' + escapeHtml(grant.status) + '</td><td>' + escapeHtml(grant.durationHours ? grant.durationHours + ' jam' : 'Tanpa batas') +
            '</td><td>' + escapeHtml(formatExpiry(grant.expiresAt)) + '</td><td>' + escapeHtml(grant.createdAt || '—') + '</td><td>' +
            (grant.status !== 'revoked'
                ? '<form method="POST" action="/owner/slots"><input type="hidden" name="action" value="revoke">' +
                  '<input type="hidden" name="accountId" value="' + escapeHtml(grant.accountId) + '">' +
                  '<input type="password" name="confirmPassword" minlength="12" required autocomplete="current-password" placeholder="Password pemilik">' +
                  '<button type="submit">Cabut izin</button></form>'
                : '—') + '</td></tr>'
        ).join('') : '<tr><td colspan="7">Belum ada izin.</td></tr>';
        const notice = slotPermissionManager.isConfigured()
            ? '<p class="good">Password pemilik aktif. Satu izin berlaku untuk satu Discord User ID dan hanya dapat dipakai sekali.</p>'
            : '<p class="warning">Fitur belum aktif. Atur SLOT_OWNER_PASSWORD di panel hosting, atau buat file <code>slot-owner-password.txt</code> di folder utama bot berisi password acak minimal 12 karakter, lalu restart bot.</p>';

        res.setHeader('Cache-Control', 'no-store');
        res.send('<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>Izin Slot Akun</title><style>body{font:16px system-ui;background:#10131a;color:#eef2ff;margin:0;padding:24px}' +
            'main{max-width:960px;margin:auto}section{background:#191f2b;border:1px solid #30394a;border-radius:12px;padding:18px;margin:16px 0}' +
            'input,button{font:inherit;padding:10px;border-radius:8px;border:1px solid #465168;background:#0e1420;color:inherit;box-sizing:border-box}' +
            'button{cursor:pointer;background:#3157a4}label{display:block;margin:10px 0}table{width:100%;border-collapse:collapse;display:block;overflow:auto}' +
            'th,td{text-align:left;padding:10px;border-bottom:1px solid #30394a;white-space:nowrap}.good{color:#9ae6b4}.warning{color:#f6c76a}' +
            '.message{padding:12px;background:#252f40;border-radius:8px}a{color:#9bbcff}</style></head><body><main><h1>Izin Slot Akun</h1>' +
            '<p><a href="/">← Kembali ke dashboard</a></p>' + (message ? '<p class="message">' + message + '</p>' : '') + notice +
            '<section><h2>Berikan satu izin</h2><p>Masukkan Discord User ID akun yang akan ditambahkan. Izin hanya berlaku untuk satu akun baru.</p>' +
            '<form method="POST" action="/owner/slots"><input type="hidden" name="action" value="grant">' +
            '<label>Discord User ID <input name="accountId" inputmode="numeric" pattern="\\d{17,20}" minlength="17" maxlength="20" required placeholder="123456789012345678"></label>' +
            '<label>Catatan (opsional) <input name="note" maxlength="120" placeholder="Nama penerima / referensi donasi"></label>' +
            '<label>Durasi izin (jam) <input type="number" name="durationHours" min="0" step="1" placeholder="Contoh: 24 — kosongkan untuk tanpa batas"></label>' +
            '<div class="input-hint">Isi 24 untuk izin 24 jam. Setelah akun ditambahkan, hitungan dimulai dan akun akan dihapus otomatis saat durasi habis. Kosong/0 = tanpa batas waktu.</div>' +
            '<label>Password khusus pemilik <input type="password" name="confirmPassword" minlength="12" required autocomplete="current-password"></label>' +
            '<button type="submit">Berikan izin satu slot</button></form></section><section><h2>Daftar izin</h2>' +
            '<p><code>available</code> = belum dipakai; <code>used</code> = sudah digunakan; <code>revoked</code> = dicabut/kedaluwarsa.</p>' +
            '<table><thead><tr><th>Discord User ID</th><th>Catatan</th><th>Status</th><th>Durasi</th><th>Berakhir</th><th>Diberikan</th><th>Aksi</th></tr></thead><tbody>' +
            rows + '</tbody></table></section></main></body></html>');
    });

    router.post('/owner/slots', (req, res) => {
        if (!slotPermissionManager.isConfigured()) {
            return res.status(503).send('Atur SLOT_OWNER_PASSWORD dengan password acak minimal 12 karakter lalu restart bot.');
        }
        if (!slotPermissionManager.verifyOwnerPassword(req.body?.confirmPassword)) {
            return res.status(403).send('Password pemilik salah.');
        }

        const action = String(req.body?.action || '');
        const accountId = String(req.body?.accountId || '').trim();
        const mainId = profileManager.getUserId(configManager.ensureShape(configManager.get()).token);

        if (action === 'grant') {
            if (accountId === mainId || profileManager.getSavedProfiles().includes(accountId)) {
                return res.redirect('/owner/slots?message=' + encodeURIComponent('Akun ini sudah ada. Izin hanya diberikan untuk akun baru.'));
            }
            const result = slotPermissionManager.grant(accountId, req.body?.note || '', req.body?.durationHours);
            return res.redirect('/owner/slots?message=' + encodeURIComponent(
                result.ok
                    ? (result.durationHours ? `Izin satu slot berhasil diberikan (${result.durationHours} jam).` : 'Izin satu slot berhasil diberikan (tanpa batas waktu).')
                    : result.message
            ));
        }

        if (action === 'revoke') {
            if (accountId === mainId) return res.status(409).send('Izin akun utama tidak dapat dicabut dari halaman ini.');
            const result = slotPermissionManager.revoke(accountId);
            if (!result.ok) return res.redirect('/owner/slots?message=' + encodeURIComponent(result.message));
            if (result.wasUsed) {
                teardownUsedGrant({ accountId, configManager, profileManager, state });
            }
            return res.redirect('/owner/slots?message=' + encodeURIComponent(
                result.wasUsed ? 'Izin dicabut dan profil akun terkait dihapus.' : 'Izin berhasil dicabut.'
            ));
        }
        return res.status(400).send('Aksi izin tidak dikenal.');
    });

    return router;
}

// Memeriksa izin `used` yang sudah lewat expiresAt lalu menghapus slot akunnya.
// Dipanggil berkala oleh dashboard; aman dipanggil berulang.
function createSlotExpirySweeper({ slotPermissionManager, configManager, profileManager, state, onExpire }) {
    return function sweepExpiredSlots(now = Date.now()) {
        const mainId = profileManager.getUserId(configManager.ensureShape(configManager.get()).token);
        const expired = slotPermissionManager.listExpired(now);
        const removed = [];
        for (const grant of expired) {
            // Akun utama tidak pernah dihapus otomatis (konsisten dengan route revoke).
            if (grant.accountId === mainId) continue;
            const result = slotPermissionManager.expire(grant.accountId);
            if (!result.ok || result.alreadyRevoked) continue;
            if (result.wasUsed) {
                teardownUsedGrant({ accountId: grant.accountId, configManager, profileManager, state });
            }
            removed.push(grant.accountId);
            if (typeof onExpire === 'function') onExpire(grant);
        }
        return removed;
    };
}

function createSlotPermissionGuard({ slotPermissionManager, configManager, profileManager }) {
    return (req, res, next) => {
        if (req.method !== 'POST' || req.path !== '/save') return next();
        const body = req.body || {};
        const currentConfig = configManager.ensureShape(configManager.get());
        const ownerPasswordValid = slotPermissionManager.verifyOwnerPassword(body.ownerPassword);

        if (body.maxAccounts !== undefined) {
            const requestedMax = Math.max(0, Math.min(4, parseInt(body.maxAccounts, 10) || 0));
            if (requestedMax !== currentConfig.multiAccount.maxAccounts && !ownerPasswordValid) {
                return res.status(403).send('Hanya pemilik yang dapat mengubah batas slot akun.');
            }
        }
        if ((body.action === 'addSlot' || body.action === 'removeSlot') && !ownerPasswordValid) {
            return res.status(403).send('Hanya pemilik yang dapat mengubah jumlah slot.');
        }

        if (body.action === 'newProfile') {
            const accountId = profileManager.getUserId(String(body.newToken || ''));
            if (accountId === 'default') return next();
            const existingProfiles = new Set(profileManager.getSavedProfiles());
            const isTokenUpdate = existingProfiles.has(accountId)
                || profileManager.getUserId(currentConfig.token) === accountId;
            if (isTokenUpdate) return next();
            if (existingProfiles.size >= 4) {
                return res.status(409).json({ success: false, message: 'Account slots are full' });
            }
            const permission = slotPermissionManager.consume(accountId);
            if (!permission.ok) {
                return res.status(403).json({ success: false, message: permission.message });
            }
            res.on('finish', () => {
                if (res.statusCode >= 400) slotPermissionManager.release(accountId);
            });
            return next();
        }

        // Menghapus slot akun hanya boleh oleh pemilik: wajib password pemilik
        // (SLOT_OWNER_PASSWORD / slot-owner-password.txt), sama seperti ubah jumlah slot.
        const profileActionValue = String(body.profileAction || '');
        if (profileActionValue.startsWith('delete:')) {
            if (!slotPermissionManager.isConfigured()) {
                return res.status(403).json({
                    success: false,
                    message: 'Hapus akun butuh password pemilik, tapi password pemilik belum diatur. Set SLOT_OWNER_PASSWORD (atau slot-owner-password.txt) lalu restart bot.'
                });
            }
            if (!ownerPasswordValid) {
                return res.status(403).json({ success: false, message: 'Password pemilik salah. Hapus akun dibatalkan.' });
            }
        }

        // The account-chip actions share the main dashboard form. Keep the target
        // profile's token on the body so the checks below treat the chip as an
        // existing account rather than a brand-new one.
        if (body.profileAction && !body.viewingProfileId) {
            const targetId = String(body.profileAction).split(':')[1] || '';
            if (/^\d{17,20}$/.test(targetId)) {
                try {
                    const targetConfig = JSON.parse(fs.readFileSync(profileManager.getProfilePath(targetId), 'utf8'));
                    body.token = targetConfig.token || '';
                } catch {
                    // The route below will return its usual not-found response.
                }
            }
        }

        // Changing a token to a different, not-yet-saved account is another way
        // to create an account, so route it through the owner-grant flow.
        if (body.token) {
            let oldId = profileManager.getUserId(currentConfig.token);
            if (body.viewingProfileId) {
                try {
                    const viewedConfig = JSON.parse(fs.readFileSync(
                        profileManager.getProfilePath(String(body.viewingProfileId)), 'utf8'
                    ));
                    oldId = profileManager.getUserId(viewedConfig.token);
                } catch {
                    // The profile route below handles missing profiles.
                }
            }
            const newId = profileManager.getUserId(String(body.token));
            const existingProfiles = new Set(profileManager.getSavedProfiles());
            if (newId !== 'default' && newId !== oldId && !existingProfiles.has(newId)) {
                return res.status(403).send('Untuk menambahkan akun baru, gunakan form token akun baru dan izin satu slot dari pemilik.');
            }
        }
        next();
    };
}

module.exports = { createSlotPermissionRoutes, createSlotPermissionGuard, createSlotExpirySweeper };
