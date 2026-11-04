module.exports = function createSettingsTabs({ escapeHtml }) {
    function renderMultiAccountCard({ profileOptions = [] }) {
        const usedSlots = Math.min(4, profileOptions.length);
        const remainingSlots = Math.max(0, 4 - usedSlots);
        return `
<div class="card" style="border-color: var(--accent);">
                            <label style="color: var(--accent);">👥 MULTI ACCOUNT</label>
                            
                            <div style="margin-bottom: 12px;">
                                <div class="account-chip-wrap">
                                    ${profileOptions.length ? profileOptions.map(profile => `
                                        <span class="account-chip-group">
                                            <a class="account-chip ${profile.statusClass || 'paused'} ${profile.isViewing ? 'viewing' : ''}" href="/?profileId=${encodeURIComponent(profile.id)}" title="Lihat akun ${escapeHtml(profile.id)}">
                                                <span class="account-chip-name">${profile.hasPin ? '🔒 ' : ''}${escapeHtml(profile.displayName)}</span>
                                                <span class="account-chip-id">${escapeHtml(profile.id)}</span>
                                                <span class="account-chip-status">${profile.running ? '● START' : '● PAUSE'}</span>
                                            </a>
                                            <button type="submit" name="profileAction" value="connect:${escapeHtml(profile.id)}" class="account-chip-action connect" title="Connect/Login akun ${escapeHtml(profile.id)} tanpa start loop">🔌</button>
                                            <button type="submit" name="profileAction" value="start:${escapeHtml(profile.id)}" class="account-chip-action start" title="Start/Resume commands akun ${escapeHtml(profile.id)}">▶</button>
                                            <button type="submit" name="profileAction" value="pause:${escapeHtml(profile.id)}" class="account-chip-action pause" title="Pause commands akun ${escapeHtml(profile.id)}">⏸</button>
                                            <button type="submit" name="profileAction" value="delete:${escapeHtml(profile.id)}" class="account-chip-action delete" title="Hapus slot akun ${escapeHtml(profile.id)}" onclick="return confirm('Hapus slot akun ini? Slot akan berkurang 1.');">🗑</button>
                                        </span>
                                    `).join('') : '<div class="input-hint">Belum ada profil.</div>'}
                                </div>
                                <label>Slot akun paralel otomatis</label>
                                <div class="slot-indicator" aria-live="polite">
                                    <span>📦 Terpakai: <strong>${usedSlots}/4</strong></span>
                                    <span>🟢 Sisa slot: <strong>${remainingSlots}</strong></span>
                                </div>
                                <input type="hidden" name="selectedProfile" id="selectedProfile" value="">
                                <div id="selectedProfilePreview" class="profile-preview" aria-live="polite"></div>
                            </div>

                            <div class="divider"></div>

                            <div>
                                <label>ATAU MASUKKUN TOKEN AKUN BARU</label>
                                <div class="row">
                                    <div class="col">
                                        <input type="password" name="newToken" placeholder="Token">
                                    </div>
                                    <div class="col" style="flex: 0.4;">
                                        <button type="submit" name="action" value="newProfile" class="btn" style="background: var(--green); color: white;">➕ BUAT</button>
                                    </div>
                                </div>
                            </div>
                        </div>
        `;
    }

    function renderMainSettings({ config, profileOptions, homePageCards = '' }) {
        return `
                    <div id="tab-main" class="tab-content active">

                        <div class="card">
                            <label>🔐 TEMPLATE TOKEN / KONFIG UTAMA</label>
                            <input type="password" name="token" value="${config.token || ''}" placeholder="Token">
                        </div>

                        ${homePageCards}

                    </div>

        `;
    }

    function renderAdvancedSettings({ config, msgFilter, messageDebug, voice }) {
        return `
                    <div id="tab-notifications" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Advanced / Add-ons</span>
                                <h3>📱 Notifikasi</h3>
                            </div>

                        </div>

                        <div class="card">
                            <label>📱 TELEGRAM NOTIFICATIONS</label>
                            <input type="text" name="tgToken" value="${config.settings.telegram.token || ''}" placeholder="Bot Token">
                            <input type="text" name="tgChat" value="${config.settings.telegram.chatId || ''}" placeholder="Chat ID">

                        </div>
                    </div>

                    <div id="tab-integrations" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Advanced / Add-ons</span>
                                <h3>🔌 Integrasi Sistem</h3>
                            </div>

                        </div>

                        <div class="card">
                            <label>🔌 SYSTEM INTEGRATIONS</label>
                            <label>Dashboard Port</label>
                            <input type="number" name="port" value="${config.port}">
                            <label>MacroDroid ID</label>
                            <input type="text" name="macrodroidId" value="${config.macrodroidId || ''}">
                        </div>
                    </div>

${renderRestSettings(config.settings?.rest)}

                    <div id="tab-safety" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Advanced / Add-ons</span>
                                <h3>🛡️ Safety & Filter</h3>
                            </div>

                        </div>

                        <div class="card">
                            <label>🛡️ SAFETY & FILTER</label>
                            <div class="toggle-row">
                                <span>Enable CCTV Monitoring</span>
                                <input type="checkbox" name="cctvEnabled" ${config.safety?.cctv ? 'checked' : ''}>
                            </div>
                            
                            <div class="divider"></div>
                            
                            <label>📨 Message Filter</label>
                            <div class="toggle-row">
                                <span>Enable Filter</span>
                                <input type="checkbox" name="mfEnabled" ${msgFilter.enabled ? 'checked' : ''}>
                            </div>
                            <label>Channel IDs</label>
                            <input type="text" name="mfChannelIds" value="${(msgFilter.channelIds || []).join(',')}" placeholder="Channel IDs">
                            <label>Guild IDs</label>
                            <input type="text" name="mfGuildIds" value="${(msgFilter.guildIds || []).join(',')}" placeholder="Guild IDs">
                            <div class="toggle-row">
                                <span>Debug Mode</span>
                                <input type="checkbox" name="mfDebug" ${msgFilter.debug ? 'checked' : ''}>
                            </div>
                        </div>
                    </div>

                    <div id="tab-message-debug" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Advanced / Add-ons</span>
                                <h3>🔎 Debug Pesan</h3>
                            </div>
                        </div>

                        <div class="card">
                            <label>🔎 MESSAGE DEBUG</label>
                            <div class="toggle-row">
                                <span>DEBUG2</span>
                                <input type="checkbox" name="debug2Enabled" ${config.settings.debug2 === true ? 'checked' : ''}>
                            </div>
                            <div class="toggle-row">
                                <span>Aktifkan ekstraksi pesan</span>
                                <input type="checkbox" name="messageDebugEnabled" ${messageDebug.enabled ? 'checked' : ''}>
                            </div>
                            <div class="input-hint">Filter bersifat opsional. Bila seluruh ID kosong, semua pesan pada akun yang sedang dipantau akan ditangkap.</div>
                            <label>Target User ID</label>
                            <input type="text" name="messageDebugTargetId" value="${escapeHtml(messageDebug.targetId || '')}" placeholder="Author/User ID">
                            <label>Target Channel ID</label>
                            <input type="text" name="messageDebugChannelId" value="${escapeHtml(messageDebug.channelId || '')}" placeholder="Channel ID">
                            <label>Target Guild ID</label>
                            <input type="text" name="messageDebugGuildId" value="${escapeHtml(messageDebug.guildId || '')}" placeholder="Guild/Server ID">
                            <div class="divider"></div>
                            <label>RAW JSON PESAN TERAKHIR</label>
                            <div class="input-hint">Jenis pesan ditandai sebagai <code>text</code>, <code>embed</code>, atau <code>components</code>. Untuk komponen, JSON menyertakan semua tombol dan properti yang diterima.</div>
                            <div class="debug-output-actions">
                                <button type="button" id="copyMessageDebugButton" class="btn btn-secondary debug-action-button">📋 Salin output</button>
                                <button type="button" id="clearMessageDebugButton" class="btn btn-danger debug-action-button">🗑 Bersihkan output</button>
                            </div>
                            <pre id="messageDebugOutput" class="debug-output" aria-live="polite">Memuat debug pesan...</pre>
                        </div>
                    </div>

                    <div id="tab-control" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Advanced / Add-ons</span>
                                <h3>🎮 Kontrol & Sistem</h3>
                            </div>

                        </div>

                        <div class="card">
                            <label>🎮 CONTROL & SYSTEM</label>
                            <div class="toggle-row">
                                <span>Auto Resume</span>
                                <input type="checkbox" name="autoResume" ${config.settings.autoResume ? 'checked' : ''}>
                            </div>
                            <div class="divider"></div>
                            <label>Max Log Lines in Dashboard</label>
                            <input type="number" name="maxLogLines" value="${config.maxLogLines || 15}">
                        </div>

                    </div>
        `;
    }

    function renderRestSettings(rest = {}) {
        const schedule = rest.schedule || {};
        const budget = rest.budget || {};
        const budgetHours = Number.isFinite(Number(budget.maxMinutes)) ? Number(budget.maxMinutes) / 60 : 5;
        return `
                    <div id="tab-rest" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Safety</span>
                                <h3>😴 Istirahat</h3>
                            </div>
                        </div>
                        <div class="input-hint">Menjeda sementara semua loop (Custom Commands Lucy, Auto Use Gems, Auto Adventure, Auto Boss2, Huntbot2, Monster Catcher) lalu melanjutkannya otomatis. Kedua mode bisa diaktifkan terpisah atau bersamaan.</div>

                        <div class="card">
                            <label>📊 STATUS ISTIRAHAT</label>
                            <div id="restStatus" class="input-hint">Memuat status...</div>
                        </div>

                        <div class="card">
                            <label>🕔 MODE 1: JADWAL ISTIRAHAT (WIB)</label>
                            <div class="toggle-row">
                                <span>Enable Jadwal Istirahat</span>
                                <input type="checkbox" name="restScheduleEnabled" ${schedule.enabled ? 'checked' : ''}>
                            </div>
                            <div class="row">
                                <div class="col"><label>Jam Mulai</label><input type="time" name="restScheduleStart" value="${escapeHtml(schedule.start || '05:00')}"></div>
                                <div class="col"><label>Jam Selesai</label><input type="time" name="restScheduleEnd" value="${escapeHtml(schedule.end || '10:00')}"></div>
                            </div>
                            <div class="input-hint">Contoh 05:00 – 10:00: loop berhenti jam 05.00 WIB dan lanjut jam 10.00 WIB. Jam mulai lebih besar dari jam selesai berarti melewati tengah malam.</div>
                        </div>

                        <div class="card">
                            <label>🎲 MODE 2: BATAS TOTAL ISTIRAHAT / 24 JAM</label>
                            <div class="toggle-row">
                                <span>Enable Batas Istirahat Acak</span>
                                <input type="checkbox" name="restBudgetEnabled" ${budget.enabled ? 'checked' : ''}>
                            </div>
                            <label>Batas Istirahat per 24 Jam (jam)</label>
                            <input type="number" min="0.25" max="20" step="0.25" name="restBudgetHours" value="${budgetHours}" placeholder="5">
                            <label>Durasi per Sesi Acak (menit)</label>
                            <div class="row">
                                <div class="col"><input type="number" min="1" name="restBudgetMinSession" value="${budget.minSessionMinutes ?? 15}" placeholder="Min"></div>
                                <div class="col"><input type="number" min="1" name="restBudgetMaxSession" value="${budget.maxSessionMinutes ?? 60}" placeholder="Max"></div>
                            </div>
                            <div class="input-hint">Total batas dibagi menjadi beberapa sesi dengan durasi dan jam mulai acak. Akumulasi sesi dalam satu periode 24 jam tidak pernah melebihi batas.</div>
                        </div>
                        <script>
                            (function () {
                                const box = document.getElementById('restStatus');
                                if (!box) return;
                                const profileInput = document.querySelector('input[name="viewingProfileId"]');
                                const query = profileInput && profileInput.value ? '?profileId=' + encodeURIComponent(profileInput.value) : '';
                                const render = (accounts) => {
                                    box.textContent = '';
                                    if (!accounts.length) { box.textContent = 'Belum ada akun berjalan.'; return; }
                                    accounts.forEach(account => {
                                        const title = document.createElement('div');
                                        title.style.fontWeight = '600';
                                        title.textContent = account.name || account.accountId;
                                        box.appendChild(title);
                                        (account.lines || []).forEach(line => {
                                            const row = document.createElement('div');
                                            row.textContent = line;
                                            box.appendChild(row);
                                        });
                                    });
                                };
                                const load = () => fetch('/api/rest-status' + query, { cache: 'no-store' })
                                    .then(res => res.json())
                                    .then(data => render(data.accounts || []))
                                    .catch(() => { box.textContent = 'Status istirahat tidak tersedia.'; });
                                load();
                                setInterval(load, 15000);
                            })();
                        </script>
                    </div>
        `;
    }

    // Kartu Custom Command + Command Tetap. Dipakai di halaman utama.
    function renderLucyCommandCards({ config }) {
        const fixedCommands = config?.fixedCommands || {};
        return `
                    <div id="lucy-command-cards">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Lucy</span>
                                <h3>🧩 Custom Commands Lucy</h3>
                            </div>
                        </div>
                        <div class="input-hint">Setiap slot dikirim ke channel pilihannya sendiri. Delay memakai rentang min-max (boleh sama). Start menjalankan sejumlah pengiriman yang diatur (kosongkan Jumlah Pengiriman untuk infinite); Stop membatalkan slot tersebut.</div>
                        ${(config.otherCommands || []).map((command, index) => {
                            const slot = index + 1;
                            const isInfinite = !(Number(command.count) > 0);
                            const minSec = Math.floor((command.delayMinMs ?? command.delayMs ?? 0) / 1000);
                            const maxSec = Math.floor((command.delayMaxMs ?? command.delayMinMs ?? command.delayMs ?? 0) / 1000);
                            return `
                                <div class="card">
                                    <label>Custom Command Lucy ${slot}</label>
                                    <label>Command Text</label>
                                    <input type="text" name="other${slot}Text" value="${escapeHtml(command.text)}" placeholder="Contoh: !test">
                                    <div class="row">
                                        <div class="col"><label>Delay Min (detik)</label><input type="number" min="0" step="1" name="other${slot}DelayMin" value="${minSec}"></div>
                                        <div class="col"><label>Delay Max (detik)</label><input type="number" min="0" step="1" name="other${slot}DelayMax" value="${maxSec}"></div>
                                        <div class="col"><label>Jumlah Pengiriman</label><input type="number" min="1" step="1" name="other${slot}Count" value="${isInfinite ? '' : command.count}" placeholder="Kosong = ∞ Infinite"></div>
                                    </div>
                                    <label>Target Channel</label>
                                    <input type="text" name="other${slot}Channel" value="${escapeHtml(command.channelId)}" placeholder="Discord Channel ID">
                                    <div class="action-group" style="margin-top: 12px;">
                                        <button type="submit" name="action" value="otherCommandStart${slot}" class="btn btn-start">▶ START</button>
                                        <button type="submit" name="action" value="otherCommandStop${slot}" class="btn btn-pause">⏸ STOP</button>
                                        <span class="input-hint">${command.enabled ? '▶ Menunggu / berjalan' : '⏹ Berhenti'} · ${isInfinite ? '∞ Infinite' : `${command.count}x`}</span>
                                    </div>
                                </div>`;
                        }).join('')}

                        <details class="command-dropdown">
                            <summary>📌 Command Tetap (lh &amp; lb) <span class="dropdown-hint">Pengaturan pasangan command</span></summary>
                            <div class="category-heading" style="margin-top: 22px;">
                                <div>
                                    <span class="section-label">Lucy</span>
                                    <h3>📌 Command Tetap (lh &amp; lb)</h3>
                                </div>
                            </div>
                            <div class="input-hint">lh + lb adalah <strong>satu pasangan</strong>: selalu dikirim berurutan <strong>lb → "sedang mengetik" → lh</strong>, dan tidak dapat diaktifkan/dimatikan terpisah. Teks sudah terkunci — cukup atur channel, delay, dan jumlah pengiriman (kosongkan = ∞).</div>
                            ${(() => {
                                const command = fixedCommands?.lb || fixedCommands?.lh || {};
                                const isInfinite = !(Number(command.count) > 0);
                                const minSec = Math.floor((command.delayMinMs ?? command.delayMs ?? 0) / 1000);
                                const maxSec = Math.floor((command.delayMaxMs ?? command.delayMinMs ?? command.delayMs ?? 0) / 1000);
                                const channel = command.channelId || '';
                                const enabled = fixedCommands?.lb?.enabled === true || fixedCommands?.lh?.enabled === true;
                                return `
                                    <div class="card">
                                        <label>Command Tetap: lb + lh <span class="input-hint">(pasangan selalu dikirim)</span></label>
                                        <div class="row">
                                            <div class="col"><label>Delay Min (detik)</label><input type="number" min="0" step="1" name="other4DelayMin" value="${minSec}"></div>
                                            <div class="col"><label>Delay Max (detik)</label><input type="number" min="0" step="1" name="other4DelayMax" value="${maxSec}"></div>
                                            <div class="col"><label>Jumlah Pengiriman</label><input type="number" min="1" step="1" name="other4Count" value="${isInfinite ? '' : command.count}" placeholder="Kosong = ∞ Infinite"></div>
                                        </div>
                                        <label>Target Channel</label>
                                        <input type="text" name="other4Channel" value="${escapeHtml(channel)}" placeholder="Discord Channel ID">
                                        <div class="action-group" style="margin-top: 12px;">
                                            <button type="submit" name="action" value="otherCommandStart4" class="btn btn-start">▶ START</button>
                                            <button type="submit" name="action" value="otherCommandStop4" class="btn btn-pause">⏸ STOP</button>
                                            <span class="input-hint">${enabled ? '▶ Menunggu / berjalan' : '⏹ Berhenti'} · ${isInfinite ? '∞ Infinite' : `${command.count}x`} · lb then lh</span>
                                        </div>
                                    </div>`;
                            })()}
    
                        </details>
                    </div>
                `;
    }

    function renderLucySettings({ config, boss2 = {}, gems = {}, adventure = {}, monsterCatcher = {}, lucyControl = {}, voice = {} }) {
        return `

                    <div id="tab-lucy-boss2" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Lucy</span>
                                <h3>🐲 Auto Boss2</h3>
                            </div>
                        </div>

                        <div class="card">
                            <label>🐲 AUTO BOSS2 (DRAFT)</label>
                            <div class="input-hint">Saat pesan "Guild Boss Telah Muncul" terdeteksi dan tombol Fight aktif, bot otomatis Fight. Berhenti saat boss dikalahkan/kabur (tombol mati), lalu mencatat waktu "Boss baru". Kosongkan filter untuk semua.</div>
                            <div class="toggle-row">
                                <span>Enable Auto Boss2</span>
                                <input type="checkbox" name="boss2Enabled" ${boss2.enabled ? 'checked' : ''}>
                            </div>
                            <label>Allowed Guilds</label>
                            <input type="text" name="boss2Guilds" value="${escapeHtml((boss2.allowedGuilds || []).join(','))}" placeholder="Guild ID">
                            <label>Allowed Channels</label>
                            <input type="text" name="boss2ChannelIds" value="${escapeHtml((boss2.channelIds || []).join(','))}" placeholder="Channel ID">
                            <label>Teks Boss Muncul</label>
                            <input type="text" name="boss2AppearText" value="${escapeHtml(boss2.appearText || '')}" placeholder="Guild Boss Telah Muncul">
                            <label>Teks Boss Dikalahkan</label>
                            <input type="text" name="boss2DefeatedText" value="${escapeHtml(boss2.defeatedText || '')}" placeholder="Boss Telah Dikalahkan">
                            <label>Button Custom ID</label>
                            <input type="text" name="boss2ButtonId" value="${escapeHtml(boss2.buttonId || '')}" placeholder="raid:fight">
                            <label>Jumlah Fight per Boss (1-3)</label>
                            <input type="number" min="1" max="3" name="boss2FightsPerBoss" value="${boss2.fightsPerBoss ?? 3}" placeholder="3">
                            <label>Channel Privat Pemeriksaan Tiket Guild & Global</label>
                            <input type="text" name="boss2TicketStatusChannelId" value="${escapeHtml(boss2.ticketStatusChannelId || '')}" placeholder="Discord Channel ID khusus/private">
                            <div class="input-hint">Boss2 akan mengirim <strong>lboss t</strong> hanya ke channel ini setiap kali Lucy meminta konfirmasi tiket. Pastikan channel hanya dapat dilihat oleh akunmu.</div>
                            <label>Jeda sebelum tiap Fight (ms)</label>
                            <div class="row">
                                <div class="col"><input type="number" min="0" name="boss2DelayMin" value="${boss2.delayMinMs ?? 1000}" placeholder="Min"></div>
                                <div class="col"><input type="number" min="0" name="boss2DelayMax" value="${boss2.delayMaxMs ?? 1000}" placeholder="Max"></div>
                            </div>
                        </div>
                    </div>

                    <div id="tab-lucy-gems" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Lucy</span>
                                <h3>💎 Auto Use Gems</h3>
                            </div>
                        </div>

                        <div class="card">
                            <label>💎 AUTO USE GEMS</label>
                            <div class="input-hint">Saat pesan "| nama** menghabiskan 5 lucent" terdeteksi: kirim cek inventaris. Jika ada item lootbox → buka lootbox lalu cek lagi. Jika gems wajib lengkap → pakai (gems opsional ikut dipakai jika ada). Jika tidak lengkap → cek inventaris ulang tiap X menit sampai lengkap.</div>
                            <div class="toggle-row">
                                <span>Enable Auto Use Gems</span>
                                <input type="checkbox" name="gemsEnabled" ${gems.enabled ? 'checked' : ''}>
                            </div>
                            <label>Channel ID (kosong = channel pesan trigger)</label>
                            <input type="text" name="gemsChannelId" value="${escapeHtml(gems.channelId || '')}" placeholder="Channel ID">
                            <label>Nama Akun (kosong = otomatis dari username/nickname)</label>
                            <input type="text" name="gemsAccountName" value="${escapeHtml(gems.accountName || '')}" placeholder="neozen">
                            <label>Teks Trigger Gems Habis</label>
                            <input type="text" name="gemsTriggerText" value="${escapeHtml(gems.triggerText || '')}" placeholder="menghabiskan 5 <:lucent:1523362382355759266>">
                            <label>Command Cek Inventaris</label>
                            <input type="text" name="gemsInventoryCommand" value="${escapeHtml(gems.inventoryCommand || '')}" placeholder="linv">
                            <label>Jenis Lootbox yang digunakan</label>
                            <input type="hidden" name="gemsLootboxTypesPresent" value="true">
                            <input type="hidden" name="gemsLootboxTypes" value="">
                            <div style="margin:8px 0;">
                                <label style="display:inline-flex;align-items:center;gap:8px;margin-right:16px;"><input type="checkbox" name="gemsLootboxTypes" value="normal" ${(gems.lootboxTypes || ['normal']).includes('normal') ? 'checked' : ''}><span>Lootbox Biasa (049)</span></label>
                                <label style="display:inline-flex;align-items:center;gap:8px;"><input type="checkbox" name="gemsLootboxTypes" value="fable" ${(gems.lootboxTypes || ['fable']).includes('fable') ? 'checked' : ''}><span>Fable Lootbox (060)</span></label>
                            </div>
                            <label>Prioritas Lootbox</label>
                            <select name="gemsLootboxPriority" class="input-select"><option value="fable" ${(gems.lootboxPriority || 'fable') === 'fable' ? 'selected' : ''}>Prioritaskan Fable</option><option value="normal" ${gems.lootboxPriority === 'normal' ? 'selected' : ''}>Prioritaskan Lootbox Biasa</option></select>
                            <div class="divider"></div>
                            <label>Tier gems yang diizinkan</label><input type="hidden" name="gemsTierPresent" value="true"><input type="hidden" name="gemsTier" value=""><div style="margin:8px 0;">
                                <label style="display:inline-flex;align-items:center;gap:8px;margin:6px 14px 6px 0;"><input type="checkbox" name="gemsTier" value="F" ${(gems.selectedTiers || ['F']).includes('F') ? 'checked' : ''}><span>F (57, 71, 78 · spesial 85)</span></label>
                                <label style="display:inline-flex;align-items:center;gap:8px;margin:6px 14px 6px 0;"><input type="checkbox" name="gemsTier" value="L" ${(gems.selectedTiers || ['F']).includes('L') ? 'checked' : ''}><span>L (56, 70, 77 · spesial 84)</span></label>
                                <label style="display:inline-flex;align-items:center;gap:8px;margin:6px 14px 6px 0;"><input type="checkbox" name="gemsTier" value="M" ${(gems.selectedTiers || ['F']).includes('M') ? 'checked' : ''}><span>M (55, 69, 76 · spesial 83)</span></label>
                                <label style="display:inline-flex;align-items:center;gap:8px;margin:6px 14px 6px 0;"><input type="checkbox" name="gemsTier" value="E" ${(gems.selectedTiers || ['F']).includes('E') ? 'checked' : ''}><span>E (54, 68, 75 · spesial 82)</span></label>
                                <label style="display:inline-flex;align-items:center;gap:8px;margin:6px 14px 6px 0;"><input type="checkbox" name="gemsTier" value="R" ${(gems.selectedTiers || ['F']).includes('R') ? 'checked' : ''}><span>R (53, 67, 74 · spesial 81)</span></label>
                                <label style="display:inline-flex;align-items:center;gap:8px;margin:6px 14px 6px 0;"><input type="checkbox" name="gemsTier" value="U" ${(gems.selectedTiers || ['F']).includes('U') ? 'checked' : ''}><span>U (52, 66, 73 · spesial 80)</span></label>
                                <label style="display:inline-flex;align-items:center;gap:8px;margin:6px 14px 6px 0;"><input type="checkbox" name="gemsTier" value="C" ${(gems.selectedTiers || ['F']).includes('C') ? 'checked' : ''}><span>C (51, 65, 72 · spesial 79)</span></label>
                            </div>
                            <input type="hidden" name="gemsUseSpecialPresent" value="true">
                            <div class="toggle-row"><span>Gunakan Gems Opsional / Spesial</span><input type="checkbox" name="gemsUseSpecial" value="true" ${gems.useSpecialGems !== false ? 'checked' : ''}></div>
                            <label>Strategi prioritas tier</label>
                            <select name="gemsTierPriority" class="input-select"><option value="highest" selected>Prioritaskan Tier Tertinggi (F → C)</option></select>
                            <div class="input-hint">Tier utama hanya dipilih bila ketiga gems tersedia. Gems spesial tidak wajib dan hanya digunakan bila tersedia.</div>
                            <label>Jeda Cek Inventaris saat Gems &amp; Lootbox Habis (menit)</label>
                            <input type="number" min="1" name="gemsRecheckMinutes" value="${gems.recheckMinutes ?? 5}" placeholder="5">
                            <label>Jeda sebelum kirim command (ms)</label>
                            <div class="row">
                                <div class="col"><input type="number" min="0" name="gemsDelayMin" value="${gems.delayMinMs ?? 1500}" placeholder="Min"></div>
                                <div class="col"><input type="number" min="0" name="gemsDelayMax" value="${gems.delayMaxMs ?? 3000}" placeholder="Max"></div>
                            </div>
                        </div>
                    </div>

                    <div id="tab-lucy-adventure" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Lucy</span>
                                <h3>🗺️ Auto Adventure</h3>
                            </div>
                        </div>

                        <div class="card">
                            <label>🗺️ AUTO ADVENTURE</label>
                            <div class="input-hint">Memproses response target hanya pada guild dan channel yang ditentukan.</div>
                            <label>Adventure Channel ID</label>
                            <input type="text" name="adventureChannelId" value="${escapeHtml(adventure.channelId || '')}" placeholder="Channel ID">
                            <label>Adventure Guild ID</label>
                            <input type="text" name="adventureGuildId" value="${escapeHtml(adventure.guildId || '')}" placeholder="Guild ID">
                            <div class="action-group" style="margin-top: 12px;">
                                <button type="submit" name="action" value="adventureStart" class="btn btn-start">▶ AUTO ADVENTURE ON</button>
                                <button type="submit" name="action" value="adventureStop" class="btn btn-pause">⏸ AUTO ADVENTURE OFF</button>
                            </div>
                            <span class="input-hint">${adventure.enabled ? '▶ Auto Adventure aktif' : '⏹ Auto Adventure nonaktif'}</span>
                        </div>
                    </div>

                    <div id="tab-lucy-huntbot2" class="tab-content">
                        <div class="category-heading">
                            <div><span class="section-label">Lucy</span><h3>🤖 Huntbot2</h3></div>
                        </div>
                        <div class="card">
                            <label>🤖 HUNTBOT2 — LUCY</label>
                            <div class="input-hint">Automasi Huntbot Lucy berjalan mandiri.</div>
                            <div class="toggle-row"><span>Aktifkan Huntbot2</span><input type="checkbox" name="hb2Enabled" ${config.settings?.huntbot2?.enabled ? 'checked' : ''}></div>
                            <div class="toggle-row"><span>Jual hewan (lewati sacrifice)</span><input type="checkbox" name="hb2SellAnimals" ${config.settings?.huntbot2?.sellAnimals ? 'checked' : ''}></div>
                            <label>Channel ID Lucy (command & notifikasi DM)</label>
                            <input type="text" name="hb2ChannelId" value="${escapeHtml(config.settings?.huntbot2?.channelId || '')}" placeholder="Discord Channel ID">
                            <label>Durasi Hunt (contoh: 1D, 1H, 30M)</label>
                            <input type="text" name="hb2Duration" value="${escapeHtml(config.settings?.huntbot2?.duration || '1D')}" placeholder="1D">
                            <div class="divider"></div>
                            <div class="toggle-row"><span>Upgrade setelah sacrifice</span><input type="checkbox" name="hb2UpgradeEnabled" ${config.settings?.huntbot2?.upgradeEnabled ? 'checked' : ''}></div>
                            <label>Gain untuk upgrade</label>
                            <input type="text" name="hb2UpgradeGain" value="${escapeHtml(config.settings?.huntbot2?.upgradeGain || '')}" placeholder="Contoh: 1D">
                            <div class="input-hint">Jika upgrade aktif: setelah klik konfirmasi sacrifice tunggu 2 detik, kirim <code>lucy upgrade GAIN all</code>, tunggu 2 detik lagi, lalu kirim <code>lhb 1D</code>. Jika gambar password gagal diunduh atau tidak dikenali, Huntbot2 mencoba lagi dengan <code>lhb 1D</code> setelah 10 menit.</div>
                        </div>
                    </div>

                    <div id="tab-lucy-monster-catcher" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Lucy</span>
                                <h3>🐾 Monster Catcher</h3>
                            </div>
                        </div>

                        <div class="card">
                            <label>🐾 MONSTER CATCHER (neo3.js)</label>
                            <div class="input-hint">
                                Mendeteksi sensor monster dari DM Bot Lucy ("Ketik 6 karakter pada gambar"), mengunduh gambar, mengenali kode via <code>neo3.js</code>, lalu mengirimkan hasil ke DM Lucy. Saat sensor terdeteksi, seluruh loop command Lucy dijeda (sisa delay disimpan) dan dilanjutkan kembali setelah Lucy mengirim "Terima kasih, catch selesai". Jika monster tidak cocok, sistem mengirim "ulang", menunggu pembaruan sensor ≈1 menit, lalu mencoba lagi sampai berhasil.
                            </div>
                            <div class="toggle-row">
                                <span>Enable Monster Catcher</span>
                                <input type="checkbox" name="mcEnabled" ${monsterCatcher.enabled ? 'checked' : ''}>
                            </div>
                            <div class="input-hint mc-status-line"><span data-mc-status>Memuat status...</span></div>
                            <div class="toggle-row">
                                <span>Jeda semua loop saat penangkapan (recommended)</span>
                                <input type="checkbox" name="mcAutoPauseLoops" ${monsterCatcher.autoPauseLoops !== false ? 'checked' : ''}>
                            </div>
                            <label>DM Channel ID Lucy</label>
                            <input type="text" name="mcDmChannelId" value="${monsterCatcher.dmChannelId || ''}" placeholder="1557002545556230195">
                            <div class="input-hint">Channel DM tempat Bot Lucy mengirim sensor monster. Sensor hanya diproses bila datang dari channel ini; balasan kode juga dikirim ke channel ini.</div>
                            <label>Tunggu pembaruan sensor jika tidak cocok (detik)</label>
                            <input type="number" min="0" step="1" name="mcRetryWaitSec" value="${Math.round((monsterCatcher.retryWaitMs ?? 60000) / 1000)}" placeholder="60">
                            <label>Batas percobaan (0 = tak terbatas)</label>
                            <input type="number" min="0" step="1" name="mcMaxRetries" value="${monsterCatcher.maxRetries ?? 5}" placeholder="5">
                            <div class="input-hint">Proses catch dijalankan hanya untuk pesan dari Bot Lucy di DM. Pesan sensor dan respons tidak diproses dua kali (state: IDLE / PAUSED / PROCESSING / WAITING_RETRY / RESUMING).</div>
                        </div>
                    </div>

                    <div id="tab-lucy-voice" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Lucy</span>
                                <h3>🔊 Voice Channel</h3>
                            </div>
                        </div>
                        <div class="card">
                            <label>🔊 JOIN VOICE</label>
                            <div class="toggle-row">
                                <span>Auto Join Voice</span>
                                <input type="checkbox" name="voiceEnabled" ${voice.enabled ? 'checked' : ''}>
                            </div>
                            <label>Channel ID</label>
                            <input type="text" name="voiceChannelId" value="${escapeHtml(voice.channelId || '')}" placeholder="Discord Voice Channel ID">
                            <div class="input-hint">Tombol JOIN VOICE di atas otomatis bergabung ke channel ini. Akun akan kembali bergabung saat restart jika Auto Join aktif.</div>
                        </div>
                    </div>

                    <div id="tab-lucy-control" class="tab-content">
                        <div class="category-heading">
                            <div>
                                <span class="section-label">Lucy</span>
                                <h3>🎮 Kontrol Lucy</h3>
                            </div>
                        </div>

                        <div class="card">
                            <label>🎮 LUCY DISCORD CONTROL</label>
                            <div class="input-hint">Kirim kata ini di Discord (dari akun sendiri atau User ID yang diizinkan) untuk menjalankan/menjeda semua fitur Lucy: Custom Commands Lucy, Auto Boss2, Auto Use Gems, Auto Adventure, Huntbot2, dan Monster Catcher.</div>
                            <div class="row">
                                <div class="col">
                                    <label>Start Word</label>
                                    <input type="text" name="lucyCtrlStart" value="${escapeHtml(lucyControl.start || 'lucy start')}" placeholder="lucy start">
                                </div>
                                <div class="col">
                                    <label>Pause Word</label>
                                    <input type="text" name="lucyCtrlPause" value="${escapeHtml(lucyControl.pause || 'lucy pause')}" placeholder="lucy pause">
                                </div>
                            </div>
                            <label>Allowed User IDs</label>
                            <input type="text" name="lucyCtrlAllowIds" value="${escapeHtml((lucyControl.allowIds || []).join(','))}" placeholder="User ID">
                        </div>
                    </div>
        `;
    }

    function renderSettingsTabs(context) {
        return `
                    <div class="settings-nav">
                        <button type="button" class="hamburger-btn" aria-expanded="false" aria-controls="settingsMenu" onclick="toggleSettingsMenu(event)">
                            <span class="hamburger-icon">☰</span><span>MENU</span>
                        </button>
                        <strong id="settingsCurrentLabel" class="settings-current">Main Settings</strong>
                    </div>
                    <button type="button" class="settings-overlay" aria-label="Tutup navigasi" onclick="closeSettingsMenu()"></button>
                    <aside id="settingsMenu" class="settings-menu settings-sidebar" aria-label="Navigasi dashboard">
                        <div class="sidebar-brand">
                            <span class="sidebar-brand-mark">L</span>
                            <div><strong>LucySoFun</strong><small>Dashboard Navigation</small></div>
                        </div>
                        <label class="settings-select-label" for="settingsCategory">Kategori Fitur</label>
                        <select id="settingsCategory" class="input-select settings-category-select" aria-label="Pilih kategori fitur" onchange="switchTab(event, this.value)">
                            <optgroup label="Dasar"><option value="tab-main" selected>🏠 Main Settings</option></optgroup>
                            <optgroup label="Advanced / Add-ons">
                                <option value="tab-notifications">📱 Notifikasi</option><option value="tab-integrations">🔌 Integrasi Sistem</option>
                                <option value="tab-safety">🛡️ Safety &amp; Filter</option><option value="tab-rest">😴 Istirahat</option>
                                <option value="tab-message-debug">🔎 Debug Pesan</option><option value="tab-control">🎮 Kontrol &amp; Sistem</option>
                            </optgroup>
                            <optgroup label="Lucy">
                                <option value="tab-lucy-boss2">🐲 Auto Boss2</option><option value="tab-lucy-gems">💎 Auto Use Gems</option>
                                <option value="tab-lucy-adventure">🗺️ Auto Adventure</option><option value="tab-lucy-huntbot2">🤖 Huntbot2</option>
                                <option value="tab-lucy-monster-catcher">🐾 Monster Catcher</option><option value="tab-lucy-voice">🔊 Voice Channel</option>
                                <option value="tab-lucy-control">🎮 Kontrol Lucy</option>
                            </optgroup>
                        </select>
                        <div class="sidebar-divider"></div>
                        <div class="settings-menu-group"><span>Dasar</span>
                            <button type="button" class="settings-menu-item active" data-menu-label="Main Settings" onclick="switchTab(event, 'tab-main')">🏠 Main Settings</button>
                        </div>
                        <div class="settings-menu-group"><span>Advanced / Add-ons</span>
                            <button type="button" class="settings-menu-item" data-menu-label="Notifikasi" onclick="switchTab(event, 'tab-notifications')">📱 Notifikasi</button>
                            <button type="button" class="settings-menu-item" data-menu-label="Integrasi Sistem" onclick="switchTab(event, 'tab-integrations')">🔌 Integrasi Sistem</button>
                            <button type="button" class="settings-menu-item" data-menu-label="Safety & Filter" onclick="switchTab(event, 'tab-safety')">🛡️ Safety &amp; Filter</button>
                            <button type="button" class="settings-menu-item" data-menu-label="Istirahat" onclick="switchTab(event, 'tab-rest')">😴 Istirahat</button>
                            <button type="button" class="settings-menu-item" data-menu-label="Debug Pesan" onclick="switchTab(event, 'tab-message-debug')">🔎 Debug Pesan</button>
                            <button type="button" class="settings-menu-item" data-menu-label="Kontrol & Sistem" onclick="switchTab(event, 'tab-control')">🎮 Kontrol &amp; Sistem</button>
                        </div>
                        <div class="settings-menu-group"><span>Lucy Features</span>
                            <button type="button" class="settings-menu-item" data-menu-label="Auto Boss2" onclick="switchTab(event, 'tab-lucy-boss2')">🐲 Auto Boss2</button>
                            <button type="button" class="settings-menu-item" data-menu-label="Auto Use Gems" onclick="switchTab(event, 'tab-lucy-gems')">💎 Auto Use Gems</button>
                            <button type="button" class="settings-menu-item" data-menu-label="Auto Adventure" onclick="switchTab(event, 'tab-lucy-adventure')">🗺️ Auto Adventure</button>
                            <button type="button" class="settings-menu-item" data-menu-label="Huntbot2" onclick="switchTab(event, 'tab-lucy-huntbot2')">🤖 Huntbot2</button>
                            <button type="button" class="settings-menu-item" data-menu-label="Monster Catcher" onclick="switchTab(event, 'tab-lucy-monster-catcher')">🐾 Monster Catcher</button>
                            <button type="button" class="settings-menu-item" data-menu-label="Voice Channel" onclick="switchTab(event, 'tab-lucy-voice')">🔊 Voice Channel</button>
                            <button type="button" class="settings-menu-item" data-menu-label="Kontrol Lucy" onclick="switchTab(event, 'tab-lucy-control')">🎮 Kontrol Lucy</button>
                        </div>
                    </aside>
                    <div class="settings-tabs">
                        ${renderMainSettings(context)}
                        ${renderAdvancedSettings(context)}
                        ${renderLucySettings(context)}
                    </div>
        `;
    }

    return { renderMainSettings, renderAdvancedSettings, renderLucySettings, renderLucyCommandCards, renderMultiAccountCard, renderSettingsTabs };
};
