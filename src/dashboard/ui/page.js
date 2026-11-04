const fs = require('fs');
const fileService = require('../services/fileService');
module.exports = function createPageRenderer({ CONSTANTS, configManager, profileManager, statsService, getStyles, getDashboardStatsCard, getLogCard, getLogRefreshScript, renderSettingsTabs }) {
function renderPage(config) {
        console.log('[DASHBOARD] Rendering page with config:', { port: config.port, token: config.token ? '***' : 'MISSING' });

        const { statusText, statusClass } = configManager.computeStatus(config);
        const channels = config.channels || [];
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

        const renderLucyCommandCards = renderSettingsTabs.renderLucyCommandCards || (() => '');

        // renderSettingsTabs sekarang objek berisi { renderSettingsTabs, renderLucyCommandCards }.
        const pageSettingsTabs = renderSettingsTabs.renderSettingsTabs
            ? renderSettingsTabs.renderSettingsTabs
            : renderSettingsTabs;

        const profiles = profileManager.getSavedProfiles();
        const activeProfileId = profileManager.getUserId(config.token);
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
            <div class="container">
                <h2>LucySoFun Dashboard</h2>
                <div class="subtitle">${isControlPanel ? 'Control Panel utama untuk mengontrol semua akun dan slot paralel; halaman ini bukan akun default.' : `Sedang melihat akun: ${viewingProfileId}`}</div>

                <div id="userProfileBox" class="profile-box profile-box-top" data-control-panel="${isControlPanel ? 'true' : 'false'}">
                    ${isControlPanel ? '🧭 Control Panel — tidak ada akun default. Pilih akun tersimpan untuk melihat profil Discord.' : '⏳ Menghubungi Discord API...'}
                </div>

                <form id="configForm" action="/save" method="POST">
                    ${viewingProfileId ? `<input type="hidden" name="viewingProfileId" value="${viewingProfileId}">` : ''}
                    <div class="action-group">
                        ${viewingProfileId ? '<a href="/" class="btn btn-home">⌂ MENU UTAMA</a>' : ''}
                        ${!viewingProfileId ? '<a href="/owner/slots" class="btn btn-home">🔐 IZIN SLOT AKUN</a>' : ''}
                        ${viewingProfileId ? '<button type="submit" name="action" value="connectProfile" class="btn btn-connect">🔌 CONNECT / LOGIN</button>' : ''}
                        <button type="submit" name="action" value="${viewingProfileId ? 'startProfile' : 'start'}" class="btn btn-start">▶ ${viewingProfileId ? 'START / RESUME COMMANDS' : 'START ALL COMMANDS'}</button>
                        <button type="submit" name="action" value="${viewingProfileId ? 'pauseProfile' : 'pause'}" class="btn btn-pause">⏸ ${viewingProfileId ? 'PAUSE COMMANDS' : 'PAUSE ALL COMMANDS'}</button>
                        ${viewingProfileId ? '<button type="submit" name="action" value="joinVoice" class="btn btn-voice">🔊 JOIN VOICE</button>' : ''}
                        ${viewingProfileId ? '<button type="submit" name="action" value="logoutProfile" class="btn btn-logout">🚪 LOGOUT</button>' : ''}
                    </div>

                    ${renderLucyCommandCards({ config })}

                    ${pageSettingsTabs({
                        config,
                        profileOptions,
                        channels,
                        lucyControl,
                        boss2,
                        gems,
                        adventure,
                        monsterCatcher,
                        msgFilter,
                        messageDebug,
                        voice,
                    })}
                    <button type="submit" name="action" value="save" class="btn btn-save" style="margin-top: 10px;">💾 SAVE CONFIGURATION</button>
                </form>

                ${viewingProfileId ? `
                <section class="card" style="margin-top:16px">
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

                <div class="status-box ${statusClass}">
                    <span style="font-size: 16px;">${statusText}</span>

                    ${hasTelegram ? '<div class="telegram-badge">📱 Telegram Active</div>' : ''}
                </div>

                ${getDashboardStatsCard(statsSnapshot)}
                ${getLogCard()}
            </div>
            <div id="saveToast" class="save-toast" role="status" aria-live="polite"></div>
            <div id="unsavedBanner" class="unsaved-banner warning" style="display:none" role="status" aria-live="polite">
                <span class="unsaved-dot"></span>
                <span>⚠️ Ada perubahan yang belum disimpan</span>
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
                let isSaving = false;

                function trackUnsaved() {
                    let dirty = false;
                    const showBanner = () => {
                        if (!unsavedBanner) return;
                        if (dirty && !isSaving) {
                            unsavedBanner.style.display = 'flex';
                        } else {
                            unsavedBanner.style.display = 'none';
                        }
                    };
                    const markDirty = () => {
                        dirty = true;
                        showBanner();
                    };
                    const markClean = () => {
                        dirty = false;
                        showBanner();
                    };

                    form.addEventListener('input', markDirty);
                    form.addEventListener('change', markDirty);

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