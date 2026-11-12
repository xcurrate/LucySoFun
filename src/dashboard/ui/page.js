const fs = require('fs');
const fileService = require('../services/fileService');
module.exports = function createPageRenderer({ CONSTANTS, configManager, profileManager, statsService, escapeHtml, getStyles, getDashboardStatsCard, getLogCard, getLogRefreshScript, renderSettingsTabs }) {
    // Ringkasan selalu menampilkan SATU akun. Selector ini membuat cakupannya eksplisit
    // dan bisa dipindah tanpa kembali ke halaman Menu Utama.
    function renderScopeBar({ profileOptions = [], viewingProfileId = '' }) {
        const active = profileOptions.find(profile => profile.isViewing) || null;
        const name = active ? active.displayName : (viewingProfileId || 'Belum ada akun');
        const detail = active
            ? `ID ${active.id} · ${active.statusText === 'START' ? 'sedang berjalan' : 'berhenti'}`
            : 'Belum ada akun tersimpan. Tambahkan token akun di halaman Menu Utama.';
        const options = profileOptions.map(profile => `
            <a class="${profile.isViewing ? 'active' : ''}" href="/?profileId=${encodeURIComponent(profile.id)}">${escapeHtml(profile.displayName)}</a>
        `).join('');

        return `
        <div class="scope-bar">
            <div class="sb-text">
                <strong>Menampilkan: ${escapeHtml(name)}</strong>
                <small>${escapeHtml(detail)}</small>
            </div>
            ${options ? `<div class="scope-seg" role="tablist">${options}</div>` : ''}
        </div>
        `;
    }

    // Halaman profil: kartu pengantar + status akun + aksi langsung. Daftar Custom
    // Commands ada di tab sendiri, jadi tidak dirender ulang di sini.
    function renderProfileHomeCard({ profileOptions = [], viewingProfileId = '' }) {
        const current = profileOptions.find(profile => profile.id === viewingProfileId) || null;
        const name = current ? escapeHtml(current.displayName) : escapeHtml(viewingProfileId);
        const others = profileOptions.filter(profile => profile.id !== viewingProfileId);
        const running = current ? current.running : false;
        return `
        <div class="card">
            <div class="card-head">
                <h3>👤 Akun Aktif</h3>
                <span class="pill ${running ? 'pill-run' : ''}">${running ? '● RUNNING' : '⏸ PAUSED'}</span>
            </div>
            <div id="userProfileBox" class="profile-box profile-box-top" data-control-panel="false">⏳ Menghubungi Discord API...</div>
            <div class="action-row">
                <button type="submit" name="action" value="connectProfile" class="btn btn-connect">🔌 Connect / Login</button>
                <button type="submit" name="action" value="startProfile" class="btn btn-start">▶ Start / Resume</button>
                <button type="submit" name="action" value="pauseProfile" class="btn btn-pause">⏸ Pause</button>
                <button type="submit" name="action" value="joinVoice" class="btn btn-voice">🔊 Join Voice</button>
                <button type="submit" name="action" value="logoutProfile" class="btn btn-logout">🚪 Logout</button>
            </div>
            <p class="input-hint">Tombol di atas adalah aksi langsung dan tidak masuk savebar. Start/Resume memakai konfigurasi yang <strong>sudah tersimpan</strong> — kalau ada perubahan di layar, simpan dulu lewat savebar.</p>
            ${others.length ? `
            <div class="divider"></div>
            <div class="section-label">Ganti akun</div>
            <div class="scope-seg">${others.map(profile => `<a href="/?profileId=${encodeURIComponent(profile.id)}">${escapeHtml(profile.displayName)}</a>`).join('')}</div>` : ''}
        </div>
        `;
    }

function renderPage(config) {
        console.log('[DASHBOARD] Rendering page with config:', { port: config.port, token: config.token ? '***' : 'MISSING' });

        const { statusText, statusClass } = configManager.computeStatus(config);
        const hasTelegram = config.settings?.telegram?.token && config.settings?.telegram?.chatId;

        const lucyControl = config.settings.lucyControl || {};
        const boss2 = config.settings.boss2 || {};
        const gems = config.settings.gems || {};
        const adventure = config.settings.adventure || {};
        const monsterCatcher = config.settings.monsterCatcher || {};
        const msgFilter = config.settings.messageFilter || {};
        const messageDebug = config.settings.messageDebug || {};
        const voice = config.settings.voice || {};
        const statsSnapshot = statsService.getSnapshot(config);
        const viewingProfileId = config.viewingProfileId || '';
        const isControlPanel = !viewingProfileId;
        const viewingProfileHasPin = !!profileManager.getProfileMeta(viewingProfileId)?.pin;
        const viewingProfileName = viewingProfileId ? profileManager.getProfileDisplayName(viewingProfileId) : '';
        // Di control panel statistik dibaca dari token global (akun utama), jadi labelnya
        // diambil dari token itu, bukan dari profil yang sedang dibuka.
        const statsScopeName = viewingProfileName
            || (config.token ? profileManager.getProfileDisplayName(profileManager.getUserId(config.token)) : '');

        const renderLucyCommandCards = renderSettingsTabs.renderLucyCommandCards || (() => '');
        const renderMultiAccountCard = renderSettingsTabs.renderMultiAccountCard || (() => '');

        // renderSettingsTabs sekarang objek berisi { renderSettingsTabs, renderLucyCommandCards }.
        const pageSettingsTabs = renderSettingsTabs.renderSettingsTabs
            ? renderSettingsTabs.renderSettingsTabs
            : renderSettingsTabs;

        const profiles = profileManager.getSavedProfiles();
        const activeProfileId = profileManager.getUserId(config.token);
        // Target tombol "HALAMAN PROFIL" di control panel: akun utama (token di
        // config.json) bila profilnya tersimpan, jika tidak profil pertama.
        const primaryProfileId = profiles.includes(activeProfileId) ? activeProfileId : (profiles[0] || '');
        const profileOptions = profiles.map(id => {
            const profilePath = profileManager.getProfilePath(id);
            const profileConfig = fs.existsSync(profilePath)
                ? configManager.ensureShape(fileService.readJson(profilePath))
                : null;
            const profileStatus = profileConfig?.botStatus || { running: false, paused: true };
            const isRunning = !!profileStatus.running && !profileStatus.paused;
            return {
                id,
                meta: (() => { const meta = profileManager.getProfileMeta(id); return meta ? { username: meta.username, globalName: meta.globalName, avatar: meta.avatar } : null; })(),
                hasPin: !!profileManager.getProfileMeta(id)?.pin,
                displayName: profileManager.getProfileDisplayName(id),
                isActive: id === activeProfileId,
                isViewing: id === viewingProfileId,
                running: isRunning,
                paused: !isRunning,
                statusText: isRunning ? 'START' : 'PAUSE',
                statusClass: isRunning ? 'running' : 'paused'
            };
        });

        const topbarScopeName = statsScopeName || (isControlPanel ? 'Control Panel' : viewingProfileId);
        const topbarInitial = (topbarScopeName || 'L').trim().charAt(0).toUpperCase() || 'L';
        const topbarStatus = statusText || 'OFFLINE';
        const topbarStatusClass = statusClass === 'running' ? 'run' : '';

        // Halaman Ringkasan: cakupan akun, statistik, dan log langsung.
        const ringkasanCards = `
                ${profileOptions.length ? renderScopeBar({ profileOptions, viewingProfileId }) : ''}
                <div class="status-box ${statusClass}">
                    <span style="font-size: 16px;">${statusText}</span>
                    ${hasTelegram ? '<div class="telegram-badge">📱 Telegram Active</div>' : ''}
                </div>
                ${getDashboardStatsCard(statsSnapshot, { scopeName: statsScopeName })}
                ${getLogCard()}`;

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>LucySoFun Dashboard</title>
            ${getStyles()}
        </head>
        <body>
            <header class="topbar">
                <button type="button" class="tb-burger" aria-label="Buka navigasi" aria-controls="settingsMenu" onclick="toggleSettingsMenu(event)">☰</button>
                <div class="tb-account">
                    <span class="tb-avatar">${escapeHtml(topbarInitial)}</span>
                    <div style="min-width:0">
                        <div class="tb-name">${escapeHtml(topbarScopeName)}</div>
                        <div class="tb-id">${isControlPanel ? 'Semua akun tersimpan' : 'ID ' + escapeHtml(viewingProfileId)}</div>
                    </div>
                </div>
                <div class="tb-spacer"></div>
                <span class="tb-pill ${topbarStatusClass}"><span class="dot"></span> ${escapeHtml(topbarStatus)}</span>
                <div class="tb-actions">
                    <button type="submit" form="configForm" name="action" value="${viewingProfileId ? 'startProfile' : 'start'}" class="tb-btn start">▶ START</button>
                    <button type="submit" form="configForm" name="action" value="${viewingProfileId ? 'pauseProfile' : 'pause'}" class="tb-btn pause">⏸ PAUSE</button>
                </div>
            </header>
            <div class="container">
                <form id="configForm" action="/save" method="POST">
                    ${viewingProfileId ? `<input type="hidden" name="viewingProfileId" value="${viewingProfileId}">` : ''}
                    <div class="action-group">
                        ${viewingProfileId ? '<a href="/" class="btn btn-home">⌂ MENU UTAMA</a>' : ''}
                        ${!viewingProfileId ? '<a href="/owner/slots" class="btn btn-home">🔐 IZIN SLOT AKUN</a>' : ''}
                        ${!viewingProfileId && primaryProfileId ? `<a href="/?profileId=${encodeURIComponent(primaryProfileId)}" class="btn btn-home">👤 HALAMAN PROFIL</a>` : ''}
                    </div>

                    ${pageSettingsTabs({
                        profileOptions,
                        config,
                        lucyControl,
                        boss2,
                        gems,
                        adventure,
                        monsterCatcher,
                        msgFilter,
                        messageDebug,
                        voice,
                        viewingProfileName,
                        homePageCards: viewingProfileId
                            ? renderProfileHomeCard({ profileOptions, viewingProfileId })
                            : renderMultiAccountCard({ profileOptions, maxAccounts: config.multiAccount?.maxAccounts }),
                        ringkasanCards,
                    })}
                </form>

                ${viewingProfileId ? `
                <section id="profilePinSection" class="card profile-home-only" style="margin-top:16px; display:none">
                    <label>🔒 PIN PROFILE</label>
                    <p style="font-size:13px;color:#aeb7c8">${viewingProfileHasPin ? 'Profile ini dilindungi PIN.' : 'PIN opsional. Tanpa PIN, profile dapat dibuka langsung.'}</p>
                    ${viewingProfileHasPin ? `
                    <form method="POST" action="/profile/${encodeURIComponent(viewingProfileId)}/pin" style="margin-bottom:12px">
                        <input type="hidden" name="pinAction" value="change">
                        <input type="password" name="oldPin" inputmode="numeric" pattern="\\d{4}" maxlength="4" minlength="4" autocomplete="current-password" placeholder="PIN lama (4 digit)" required>
                        <input type="password" name="newPin" inputmode="numeric" pattern="\\d{4}" maxlength="4" minlength="4" autocomplete="new-password" placeholder="PIN baru (4 digit)" required>
                        <button class="btn btn-save" type="submit">Ganti PIN</button>
                    </form>
                    <form method="POST" action="/profile/${encodeURIComponent(viewingProfileId)}/pin" style="margin-bottom:12px">
                        <input type="hidden" name="pinAction" value="delete">
                        <input type="password" name="oldPin" inputmode="numeric" pattern="\\d{4}" maxlength="4" minlength="4" autocomplete="current-password" placeholder="PIN lama (4 digit)" required>
                        <button class="btn btn-pause" type="submit">Hapus PIN</button>
                    </form>
                    <form method="POST" action="/profile/${encodeURIComponent(viewingProfileId)}/lock">
                        <button class="btn btn-home" type="submit">🔒 Kunci Profile</button>
                    </form>
                    ` : `
                    <form method="POST" action="/profile/${encodeURIComponent(viewingProfileId)}/pin">
                        <input type="hidden" name="pinAction" value="set">
                        <input type="password" name="newPin" inputmode="numeric" pattern="\\d{4}" maxlength="4" minlength="4" autocomplete="new-password" placeholder="PIN baru (4 digit)" required>
                        <button class="btn btn-save" type="submit">Tambah PIN</button>
                    </form>
                    `}
                    <p style="font-size:12px;color:#aeb7c8">Lupa PIN? Pemilik server harus menghapus properti <code>profiles[${viewingProfileId}].pin</code> dari <code>profiles/meta.json</code>. Tidak ada reset PIN dari dashboard.</p>
                </section>
                ` : ''}
            </div>
            <div id="saveToast" class="save-toast" role="status" aria-live="polite"></div>
            <div id="unsavedBanner" class="unsaved-banner warning" style="display:none" role="status" aria-live="polite">
                <span class="unsaved-dot"></span>
                <span class="unsaved-text" id="unsavedText">Ada perubahan yang belum disimpan</span>
                <span class="unsaved-actions">
                    <button type="button" class="btn btn-secondary" id="unsavedCancel">Batalkan</button>
                    <button type="submit" class="btn btn-save" id="unsavedSave" form="configForm" name="action" value="save">💾 Simpan semua perubahan →</button>
                </span>
            </div>

            ${getLogRefreshScript(profileOptions, viewingProfileId, isControlPanel)}

            <script>
            (() => {
                const output = document.getElementById('messageDebugOutput');
                const copyButton = document.getElementById('copyMessageDebugButton');
                const clearButton = document.getElementById('clearMessageDebugButton');
                if (!output) return;

                const profileId = ${JSON.stringify(viewingProfileId)};
                const refresh = async () => {
                    try {
                        const query = profileId ? '?profileId=' + encodeURIComponent(profileId) : '';
                        const response = await fetch('/api/message-debug' + query, { credentials: 'include' });
                        if (!response.ok) throw new Error('Gagal memuat debug pesan');
                        const payload = await response.json();
                        output.textContent = payload.entries?.length
                            ? JSON.stringify(payload.entries, null, 2)
                            : 'Belum ada pesan yang cocok. Aktifkan fitur lalu kirim/terima pesan sesuai filter.';
                    } catch (error) {
                        output.textContent = 'Gagal memuat debug pesan: ' + error.message;
                    }
                };

                refresh();
                setInterval(refresh, 2000);

                copyButton?.addEventListener('click', async () => {
                    const text = output.textContent || '';
                    if (!text || text.startsWith('Belum ada')) return;

                    try {
                        await navigator.clipboard.writeText(text);
                        copyButton.textContent = '✓ Tersalin';
                    } catch {
                        const selection = window.getSelection();
                        const range = document.createRange();
                        range.selectNodeContents(output);
                        selection.removeAllRanges();
                        selection.addRange(range);
                        document.execCommand('copy');
                        selection.removeAllRanges();
                        copyButton.textContent = '✓ Tersalin';
                    }

                    setTimeout(() => { copyButton.textContent = '📋 Salin output'; }, 1500);
                });

                clearButton?.addEventListener('click', async () => {
                    clearButton.disabled = true;
                    try {
                        const response = await fetch('/api/message-debug/clear', {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                            body: new URLSearchParams(profileId ? { profileId } : {}).toString()
                        });
                        if (!response.ok) throw new Error('Gagal membersihkan output');
                        output.textContent = 'Output debug telah dibersihkan.';
                    } catch (error) {
                        output.textContent = 'Gagal membersihkan output: ' + error.message;
                    } finally {
                        clearButton.disabled = false;
                    }
                });
            })();
            </script>

            <script>
            (() => {
                const form = document.getElementById('configForm');
                const toast = document.getElementById('saveToast');
                if (!form) return;
                let toastTimeout;

                const unsavedBanner = document.getElementById('unsavedBanner');
                const unsavedText = document.getElementById('unsavedText');
                const unsavedCancel = document.getElementById('unsavedCancel');
                let isSaving = false;
                let dirtyCount = 0;

                function trackUnsaved() {
                    let dirty = false;
                    const dirtyFields = new Set();
                    const showBanner = () => {
                        if (!unsavedBanner) return;
                        if (dirty && !isSaving) {
                            unsavedBanner.style.display = 'flex';
                            document.body.classList.add('has-savebar');
                            if (unsavedText) {
                                unsavedText.textContent = (dirtyCount > 1 ? dirtyCount + ' perubahan lokal belum disimpan.' : '1 perubahan lokal belum disimpan.');
                            }
                        } else {
                            unsavedBanner.style.display = 'none';
                            document.body.classList.remove('has-savebar');
                        }
                    };
                    const markDirty = (event) => {
                        dirty = true;
                        // Hitung elemen berbeda yang berubah, bukan tiap ketikan.
                        if (event && event.target && event.target.name && !dirtyFields.has(event.target.name)) {
                            dirtyFields.add(event.target.name);
                        }
                        dirtyCount = dirtyFields.size || 1;
                        showBanner();
                    };
                    const markClean = () => {
                        dirty = false;
                        dirtyFields.clear();
                        dirtyCount = 0;
                        showBanner();
                    };

                    form.addEventListener('input', markDirty);
                    form.addEventListener('change', markDirty);

                    // Batalkan: kembalikan form ke kondisi terakhir tersimpan.
                    unsavedCancel?.addEventListener('click', () => {
                        form.reset();
                        markClean();
                    });

                    window.addEventListener('beforeunload', (event) => {
                        if (dirty && !isSaving) {
                            event.preventDefault();
                            event.returnValue = '';
                            return '';
                        }
                    });

                    return { markClean, isDirty: () => dirty, refresh: showBanner };
                }

                const unsaved = form ? trackUnsaved() : null;

                function showToast(type, message) {
                    if (!toast) return;
                    clearTimeout(toastTimeout);
                    toast.className = 'save-toast ' + type + ' visible';
                    toast.textContent = (type === 'success' ? '✓ ' : '✗ ') + message;
                    toastTimeout = setTimeout(() => {
                        toast.classList.remove('visible');
                    }, 2500);
                }

                function toUrlEncodedBody(formData) {
                    const params = new URLSearchParams();
                    formData.forEach((value, key) => {
                        params.append(key, value);
                    });
                    return params.toString();
                }

                form.addEventListener('submit', async (event) => {
                    const submitter = event.submitter;
                    event.preventDefault();

                    if (!submitter || submitter.form !== form) return;

                    const originalText = submitter.textContent;
                    submitter.disabled = true;
                    submitter.textContent = '⏳ PROCESSING...';
                    isSaving = true;

                    try {
                        const formData = new FormData(form);

                        // Preserve the exact action submitted by the clicked button.
                        // This supports both action=... and profileAction=... buttons.
                        if (submitter.name) {
                            formData.set(submitter.name, submitter.value);
                        }

                        // Explicitly serialize the form instead of relying on the browser's
                        // FormData-to-URLSearchParams conversion. This keeps the payload
                        // compatible with the URL-encoded parser used by POST /save.
                        // Do not read form.action: controls named "action" shadow that
                        // DOM property and can turn it into a RadioNodeList (which stringifies
                        // to /[object RadioNodeList]).
                        const saveUrl = form.getAttribute('action') || '/save';
                        const response = await fetch(saveUrl, {
                            method: 'POST',
                            body: toUrlEncodedBody(formData),
                            credentials: 'include',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                                'X-Requested-With': 'XMLHttpRequest',
                                'Accept': 'application/json'
                            }
                        });

                        const contentType = response.headers.get('content-type') || '';
                        let result = null;

                        if (!contentType.includes('application/json')) {
                            const responseText = await response.text();
                            throw new Error(
                                responseText.trim() || 'Server returned an invalid response'
                            );
                        }
                        result = await response.json();

                        if (!response.ok || (result && result.success === false)) {
                            throw new Error(
                                (result && result.message) ||
                                ('HTTP ' + response.status)
                            );
                        }

                        submitter.textContent = '✓ BERHASIL';
                        showToast('success', 'Tersimpan');
                        unsaved?.markClean();

                        setTimeout(() => {
                            submitter.disabled = false;
                            submitter.textContent = originalText;
                        }, 1000);
                    } catch (error) {
                        console.error('[DASHBOARD] Action error:', error);
                        submitter.disabled = false;
                        submitter.textContent = '✗ GAGAL';
                        showToast('error', error.message ? 'Gagal: ' + error.message : 'Gagal');

                        setTimeout(() => {
                            submitter.textContent = originalText;
                        }, 1500);
                    } finally {
                        isSaving = false;
                        // Jika aksi gagal, tetap tampilkan indikator kalau masih ada perubahan.
                        if (unsaved?.isDirty()) {
                            unsaved.refresh();
                        } else {
                            unsaved?.markClean();
                        }
                    }
                });
            })();
            </script>
        </body>
        </html>
        `;
    }

    return renderPage;
};