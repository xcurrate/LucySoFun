function getLogCard({ id = 'logBox', title = '🧾 Log Langsung', stamp = 'live', emptyText = '✨ Belum ada log...', hint = '' } = {}) {
        return `
        <div class="card">
            <div class="card-head">
                <h3>${title}</h3>
                <span class="pill">${stamp}</span>
            </div>
            ${hint ? `<p class="input-hint">${hint}</p>` : ''}
            <div id="${id}" data-log-box data-empty="${emptyText}" class="log-box"><div class="log-empty">(loading...)</div></div>
        </div>
        `;
    }

// Dock log mengambang: satu kotak log yang bisa dibuka dari halaman/tab mana pun.
// Markup-nya di luar area tab, jadi tidak ikut tersembunyi saat berpindah tab.
function getLogDock({ id = 'logBox', title = '🧾 Log Langsung', emptyText = '✨ Belum ada log...', hint = '' } = {}) {
    return `
        <div id="logDock" class="log-dock">
            <button type="button" class="log-dock-toggle" id="logDockToggle" aria-expanded="false" aria-controls="logDockPanel" onclick="toggleLogDock()">
                <span class="ld-ico">🧾</span>
                <span class="ld-label">Log</span>
                <span class="ld-live">live</span>
            </button>
            <section class="log-dock-panel" id="logDockPanel" aria-label="Log Langsung">
                <div class="log-dock-head">
                    <h3>${title}</h3>
                    <button type="button" class="log-dock-close" aria-label="Tutup log" onclick="toggleLogDock()">✕</button>
                </div>
                ${hint ? `<p class="input-hint">${hint}</p>` : ''}
                <div id="${id}" data-log-box data-empty="${emptyText}" class="log-box"><div class="log-empty">(loading...)</div></div>
            </section>
        </div>
    `;
}

module.exports = getLogCard;
module.exports.getLogCard = getLogCard;
module.exports.getLogDock = getLogDock;
