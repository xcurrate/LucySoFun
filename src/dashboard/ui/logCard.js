function getLogCard() {
        return `
        <div class="card">
            <div class="card-head">
                <h3>🧾 Log Langsung</h3>
                <span class="pill" id="logStamp">live</span>
            </div>
            <div id="logBox" class="log-box"><div class="log-empty">(loading...)</div></div>
        </div>
        `;
    }

module.exports = getLogCard;
