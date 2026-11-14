module.exports = function createDashboardStatsCard({ escapeHtml, statsService }) {
function getDashboardStatsCard(snapshot, { scopeName = '' } = {}) {
        // Nama akun ditempel di label supaya angka tidak pernah ambigu pemiliknya.
        const who = scopeName ? ` <span class="stat-who">· ${escapeHtml(scopeName)}</span>` : '';
        const commandTypes = Object.entries(snapshot.commands.byType || {})
            .sort((a, b) => b[1] - a[1])
            .map(([type, total]) => `<span class="pill" data-type="${escapeHtml(type)}" data-total="${total}">${escapeHtml(type)}: <strong>${total}</strong></span>`)
            .join('') || '<span class="pill">Belum ada command</span>';

        const recentCommands = (snapshot.commands.recent || []).slice(-5).reverse()
            .map(item => `
                <div class="recent-item">
                    <span class="tt">${escapeHtml(statsService.formatTime(item.at))}</span>
                    <span class="pill">${escapeHtml(item.type || 'Command')}</span>
                    <span class="m">${escapeHtml(item.cmd || '-')}</span>
                </div>
            `)
            .join('') || '<div class="recent-item"><span class="m">Belum ada command terkirim sejak bot berjalan.</span></div>';

        const lastCommand = snapshot.commands.last
            ? `${snapshot.commands.last.cmd} • ${snapshot.commands.last.type}`
            : 'Belum ada command terkirim';

        // Hanya kolom yang datanya nyata. "Ping gateway" dan "Captcha dijawab"
        // dari mockup tidak ditampilkan karena dashboard Lucy-only tidak
        // melacaknya — angka palsu lebih buruk daripada kolom yang absen.
        return `
        <div class="grid four" id="statsGrid">
            <div class="stat">
                <div class="lbl">Uptime${who}</div>
                <div class="val" data-stat="uptimeText">${escapeHtml(snapshot.uptime.text)}</div>
                <div class="note" data-stat="startedAt">Sejak ${escapeHtml(snapshot.uptime.startedAt)}</div>
            </div>
            <div class="stat">
                <div class="lbl">Command terkirim${who}</div>
                <div class="val" data-stat="commandTotal">${snapshot.commands.total}</div>
                <div class="note" data-stat="lastCommand">${escapeHtml(lastCommand)}</div>
            </div>
            <div class="stat">
                <div class="lbl">Status${who}</div>
                <div class="val" style="font-size:18px" data-stat="statusText">${escapeHtml(snapshot.status.text)}</div>
                <div class="note" data-stat="statusNote">Akun: ${escapeHtml(snapshot.status.running ? 'AKTIF' : 'NONAKTIF')}</div>
            </div>
            <div class="stat">
                <div class="lbl">Notifikasi${who}</div>
                <div class="val" style="font-size:18px" data-stat="serviceFlags">Telegram: ${snapshot.status.telegram ? 'ON' : 'OFF'}</div>
                <div class="note">Telegram opsional</div>
            </div>
        </div>

        <div class="grid two">
            <div class="card">
                <div class="card-head">
                    <h3>📊 Command Terakhir</h3>
                    <span class="pill">auto-refresh</span>
                </div>
                <div id="recentCommands" class="recent">${recentCommands}</div>
            </div>
            <div class="card">
                <div class="card-head">
                    <h3>🧩 Command per Tipe</h3>
                    <a class="btn btn-ghost" style="width:auto; padding:7px 12px;" href="/export-config">⬇ Export Config</a>
                </div>
                <div id="commandTypes" class="pill-list">${commandTypes}</div>
            </div>
        </div>
        `;
    }

    return getDashboardStatsCard;
};
