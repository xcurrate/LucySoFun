function getLogCard({ id = 'logBox', title = '🧾 Log Langsung', stamp = 'live', emptyText = '✨ Belum ada log...', hint = '', actions = '' } = {}) {
        return `
        <div class="card">
            <div class="card-head">
                <h3>${title}</h3>
                <span class="pill">${stamp}</span>
            </div>
            ${hint ? `<p class="input-hint">${hint}</p>` : ''}
            <div id="${id}" data-log-box data-empty="${emptyText}" class="log-box"><div class="log-empty">(loading...)</div></div>
            ${actions}
        </div>
        `;
    }

module.exports = getLogCard;
