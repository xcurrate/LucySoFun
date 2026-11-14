module.exports = function createScripts({ CONSTANTS, serializeForScript }) {
function getLogRefreshScript(profileOptions = [], viewingProfileId = '', isControlPanel = false) {
        const profileOptionsJson = serializeForScript(profileOptions);
        const viewingProfileIdJson = serializeForScript(viewingProfileId || '');
        const isControlPanelJson = serializeForScript(!!isControlPanel);
        return `
        <script>
            (function() {
                let retryCount = 0;
                function parseLogLine(line) {
                    const match = String(line || '').match(/^(\[[^\]]+\])\s+(\[[^\]]+\])\s+(.*)$/);
                    if (!match) return { time: '', level: '', message: line || '' };
                    return { time: match[1], level: match[2], message: match[3] };
                }

                function getLogLevelClass(level) {
                    return 'log-level-' + String(level || 'info')
                        .split('[').join('').split(']').join('')
                        .toLowerCase()
                        .replace(/[^a-z0-9_-]/g, '');
                }

                function isSelectingInside(element) {
                    const selection = window.getSelection ? window.getSelection() : null;
                    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
                    const range = selection.getRangeAt(0);
                    return element.contains(range.commonAncestorContainer) ||
                        element.contains(selection.anchorNode) ||
                        element.contains(selection.focusNode);
                }

                function renderLogs(lines) {
                    const boxes = document.querySelectorAll('[data-log-box]');
                    if (!boxes.length) return;

                    boxes.forEach(logBox => {
                        if (isSelectingInside(logBox)) return;

                        const previousScrollTop = logBox.scrollTop;
                        const distanceFromBottom = logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight;
                        const shouldStickToBottom = logBox.dataset.userScrolled !== 'true' || distanceFromBottom < 48;

                        if (!lines || !lines.length) {
                            const emptyText = logBox.dataset.empty || '✨ Belum ada log...';
                            logBox.innerHTML = '<div class="log-empty">' + escapeHtml(emptyText) + '</div>';
                            return;
                        }
                        logBox.innerHTML = lines.map(line => {
                            const item = parseLogLine(line);
                            const levelClass = getLogLevelClass(item.level);
                            return '<div class="log-line ' + levelClass + '">' +
                                '<span class="t">' + escapeHtml(item.time) + '</span>' +
                                '<span class="lv">' + escapeHtml(item.level) + '</span>' +
                                '<span class="m">' + escapeHtml(item.message) + '</span>' +
                            '</div>';
                        }).join('');

                        if (shouldStickToBottom) {
                            logBox.scrollTop = logBox.scrollHeight;
                            logBox.dataset.userScrolled = 'false';
                        } else {
                            logBox.scrollTop = previousScrollTop;
                        }
                    });
                }

                async function refreshLogs() {
                    // Tidak ada kotak log (mis. halaman Menu Utama) → tidak perlu polling.
                    if (!document.querySelector('[data-log-box]')) return;
                    try {
                        const res = await fetch('/logs' + profileQuery, { cache: 'no-store', headers: { 'Accept': 'application/json' }});
                        if (!res.ok) throw new Error('HTTP Error');
                        const data = await res.json();
                        renderLogs(data.lines);
                        retryCount = 0;
                    } catch (err) {
                        retryCount++;
                        renderLogs([retryCount <= 3 ? '[--:--:--] [INFO] ⏳ Reconnecting...' : '[--:--:--] [WARN] 📡 Log service unavailable']);
                    }
                }

                // Halaman Ringkasan dan kartu "Ringkasan Akun Ini" memakai
                // data-stat yang sama, jadi semua kecocokan harus diperbarui.
                function updateText(selector, text) {
                    document.querySelectorAll(selector).forEach(el => { el.textContent = text; });
                }

                function renderCommandTypes(byType) {
                    const target = document.getElementById('commandTypes');
                    if (!target) return;
                    const entries = Object.entries(byType || {}).sort((a, b) => b[1] - a[1]);
                    target.innerHTML = entries.length
                        ? entries.map(([type, total]) => '<span class="pill">' + escapeHtml(type) + ': <strong>' + total + '</strong></span>').join('')
                        : '<span class="pill">Belum ada command</span>';
                }

                function renderRecentCommands(commands) {
                    const target = document.getElementById('recentCommands');
                    if (!target) return;
                    const entries = (commands || []).slice(-5).reverse();
                    target.innerHTML = entries.length
                        ? entries.map(item => '<div class="recent-item">' +
                            '<span class="tt">' + escapeHtml(item.atFormatted || '-') + '</span>' +
                            '<span class="pill">' + escapeHtml(item.type || 'Command') + '</span>' +
                            '<span class="m">' + escapeHtml(item.cmd || '-') + '</span>' +
                        '</div>').join('')
                        : '<div class="recent-item"><span class="m">Belum ada command terkirim sejak bot berjalan.</span></div>';
                }

                const viewingProfileId = ${viewingProfileIdJson};
                const isControlPanel = ${isControlPanelJson};
                const profileQuery = viewingProfileId ? '?profileId=' + encodeURIComponent(viewingProfileId) : '';
                document.querySelectorAll('[data-log-box]').forEach(logBox => {
                    logBox.addEventListener('scroll', () => {
                        const distanceFromBottom = logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight;
                        logBox.dataset.userScrolled = distanceFromBottom >= 48 ? 'true' : 'false';
                    }, { passive: true });
                });

                async function refreshStats() {
                    try {
                        const res = await fetch('/api/stats' + profileQuery, { cache: 'no-store', headers: { 'Accept': 'application/json' }});
                        if (!res.ok) throw new Error('HTTP Error');
                        const data = await res.json();
                        const lastCommand = data.commands.last ? data.commands.last.cmd + ' • ' + data.commands.last.type : 'Belum ada command terkirim';
                        updateText('[data-stat="commandTotal"]', data.commands.total);
                        updateText('[data-stat="lastCommand"]', lastCommand);
                        updateText('[data-stat="uptimeText"]', data.uptime.text);
                        updateText('[data-stat="startedAt"]', 'Start: ' + data.uptime.startedAt);
                        updateText('[data-stat="statusText"]', data.status.text);
                        updateText('[data-stat="statusNote"]', 'Akun: ' + (data.status.running ? 'AKTIF' : 'NONAKTIF'));
                        updateText('[data-stat="serviceFlags"]', 'Telegram: ' + (data.status.telegram ? 'ON' : 'OFF'));
                        renderCommandTypes(data.commands.byType);
                        renderRecentCommands(data.commands.recent);
                    } catch (err) {
                        updateText('[data-stat="statusNote"]', 'Statistik belum bisa diperbarui');
                    }
                }

                refreshLogs(); setInterval(refreshLogs, ${CONSTANTS.LOG_REFRESH_INTERVAL_MS});
                refreshStats(); setInterval(refreshStats, 1000);

                // MONSTER CATCHER STATUS
                async function refreshMonsterCatcher() {
                    const target = document.querySelector('[data-mc-status]');
                    if (!target) return;
                    try {
                        const res = await fetch('/api/monster-catcher-status' + profileQuery, { cache: 'no-store', headers: { 'Accept': 'application/json' }});
                        if (!res.ok) throw new Error('HTTP Error');
                        const data = await res.json();
                        const acc = (data.accounts || [])[0];
                        if (!acc) { updateText('[data-mc-status]', '⚠️ Akun belum tersedia'); return; }
                        const s = acc.status || {};
                        const phaseLabel = {
                            idle: 'menunggu sensor',
                            awaitingVerdict: 'menunggu verifikasi Lucy',
                            awaitingRefresh: 'menunggu tunda pembaruan',
                            awaitingNewSensor: 'menunggu sensor baru'
                        }[s.phase] || s.phase || '-';
                        const stateLabel = {
                            IDLE: '🟢 IDLE',
                            PAUSED: '⏸️ PAUSED (loop dijeda)',
                            PROCESSING: '🔄 PROCESSING (OCR)',
                            WAITING_RETRY: '⏳ WAITING_RETRY',
                            RESUMING: '▶️ RESUMING'
                        }[s.status] || s.status || '-';
                        const code = s.lastCode ? 'Kode: ' + s.lastCode : 'Belum ada kode';
                        updateText('[data-mc-status]', (s.enabled ? '✅ Aktif' : '⛔ Nonaktif') + ' • ' + stateLabel + ' • ' + phaseLabel + ' • ' + code + (s.processing ? ' • memproses' : ''));
                    } catch (err) {
                        updateText('[data-mc-status]', 'Status tidak bisa dimuat');
                    }
                }
                refreshMonsterCatcher(); setInterval(refreshMonsterCatcher, 2000);

                // LUCY DAILY STATUS
                async function refreshDaily() {
                    const target = document.querySelector('[data-daily-status]');
                    if (!target) return;
                    try {
                        const res = await fetch('/api/daily-status' + profileQuery, { cache: 'no-store', headers: { 'Accept': 'application/json' }});
                        if (!res.ok) throw new Error('HTTP Error');
                        const data = await res.json();
                        const acc = (data.accounts || [])[0];
                        if (!acc) { updateText('[data-daily-status]', '⚠️ Akun belum tersedia'); return; }
                        const s = acc.status || {};
                        const parts = [s.enabled ? '✅ Aktif' : '⛔ Nonaktif'];
                        if (s.nextRunAt) {
                            const when = new Date(s.nextRunAt);
                            parts.push('berikutnya ' + when.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) + ' WIB');
                        }
                        if (s.lastResult) {
                            const who = s.lastResult.server ? s.lastResult.server + ' · ' : '';
                            parts.push('terakhir ' + who + s.lastResult.days + ' hari');
                        } else {
                            parts.push('belum ada balasan daily');
                        }
                        updateText('[data-daily-status]', parts.join(' • '));
                    } catch (err) {
                        updateText('[data-daily-status]', 'Status tidak bisa dimuat');
                    }
                }
                refreshDaily(); setInterval(refreshDaily, 5000);


                
                // AUTO FETCH PROFILE SCRIPT
                async function fetchProfile() {
                    const avatarEl = document.getElementById('userProfileAvatar');
                    const nameEl = document.getElementById('userProfileName');
                    const metaEl = document.getElementById('userProfileMeta');
                    if (!avatarEl) return;
                    try {
                        const res = await fetch('/api/profile' + profileQuery);
                        const data = await res.json();

                        if (data.username) {
                            const name = data.global_name || data.username;
                            const avatarUrl = data.avatar
                                ? \`https://cdn.discordapp.com/avatars/\${data.id}/\${data.avatar}.png?size=64\`
                                : \`https://cdn.discordapp.com/embed/avatars/0.png\`;

                            avatarEl.innerHTML = \`<img src="\${avatarUrl}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover">\`;
                            if (nameEl) nameEl.textContent = name;
                            if (metaEl) metaEl.textContent = \`@\${data.username} · ID \${data.id}\`;
                        } else if (metaEl) {
                            metaEl.textContent = 'Gagal memuat data akun. (Cek token)';
                        }
                    } catch (err) {
                        if (metaEl) metaEl.textContent = 'Koneksi ke Discord API gagal.';
                    }
                }
                if (!isControlPanel) {
                    fetchProfile(); // Panggil hanya saat melihat akun tertentu
                }

                const profileOptions = ${profileOptionsJson};
                const profileSelect = document.getElementById('selectedProfile');
                const profilePreview = document.getElementById('selectedProfilePreview');

                function getProfilePreviewLabel(profile) {
                    if (!profile) return '';
                    if (profile.meta && profile.meta.username) return '@' + profile.meta.username;
                    return 'Profil ' + profile.id;
                }

                function updateProfilePreview() {
                    if (!profileSelect || !profilePreview) return;
                    const selected = profileOptions.find(profile => profile.id === profileSelect.value);
                    if (!selected) {
                        profilePreview.classList.remove('visible');
                        profilePreview.textContent = '';
                        return;
                    }

                    const label = getProfilePreviewLabel(selected);
                    profilePreview.innerHTML = '<span>👁️ Preview:</span> <strong>' + escapeHtml(label) + '</strong>' + (selected.isActive ? '<span>(Aktif)</span>' : '');
                    profilePreview.classList.add('visible');
                }

                function escapeHtml(value) {
                    return String(value || '')
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;');
                }

                if (profileSelect) {
                    profileSelect.addEventListener('change', updateProfilePreview);
                    updateProfilePreview();
                }
            })();
            
            function toggleSettingsMenu(event) {
                const menu = document.getElementById('settingsMenu');
                const button = event.currentTarget;
                if (!menu || !button) return;
                const isOpen = menu.classList.toggle('open');
                button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            }

            function closeSettingsMenu() {
                const menu = document.getElementById('settingsMenu');
                const button = document.querySelector('.tb-burger');
                if (menu) menu.classList.remove('open');
                if (button) button.setAttribute('aria-expanded', 'false');
            }

            // Hapus slot akun wajib password pemilik. Prompt di sini hanya untuk
            // kenyamanan; server tetap memverifikasi ulang (createSlotPermissionGuard).
            function confirmDeleteAccount(button, label) {
                const name = label ? ' "' + label + '"' : '';
                if (!window.confirm('Hapus slot akun' + name + '? Slot akan berkurang 1 dan tidak bisa dibatalkan.')) {
                    return false;
                }
                const password = window.prompt('Masukkan password pemilik untuk menghapus akun ini:');
                if (password === null) return false;
                if (!password.trim()) {
                    window.alert('Password pemilik wajib diisi. Hapus akun dibatalkan.');
                    return false;
                }
                const form = button.form;
                if (!form) return false;
                let field = form.querySelector('input[name="ownerPassword"]');
                if (!field) {
                    field = document.createElement('input');
                    field.type = 'hidden';
                    field.name = 'ownerPassword';
                    form.appendChild(field);
                }
                field.value = password;
                return true;
            }

            function switchTab(event, tabId) {
                const target = document.getElementById(tabId);
                if (!target) return;

                document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
                document.querySelectorAll('.settings-menu-item').forEach(el => el.classList.remove('active'));
                target.classList.add('active');

                // Profile-only controls must never leak into feature pages.
                const profilePinSection = document.getElementById('profilePinSection');
                if (profilePinSection) {
                    profilePinSection.style.display = tabId === 'tab-main' ? '' : 'none';
                }

                if (event && event.currentTarget) {
                    const control = event.currentTarget;
                    control.classList.add('active');
                }
                closeSettingsMenu();
            }

            document.addEventListener('click', function(event) {
                const menu = document.getElementById('settingsMenu');
                if (!menu || !menu.classList.contains('open')) return;
                // Klik pada tombol hamburger ditangani oleh toggle-nya sendiri,
                // jangan sampai handler ini langsung menutup menu yang baru dibuka.
                if (event.target.closest && event.target.closest('.tb-burger')) return;
                if (!menu.contains(event.target)) closeSettingsMenu();
            });
        </script>
        `;
    }

    return { getLogRefreshScript };
};
