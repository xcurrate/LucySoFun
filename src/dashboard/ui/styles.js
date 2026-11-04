function getStyles() {
        return `
        <style>
            :root {
                --bg: #0c1118;
                --panel: #121923;
                --panel-soft: #182231;
                --panel-strong: #1d2939;
                --text: #eef2f6;
                --muted: #98a2b3;
                --border: #263345;
                --accent: #8ea4ff;
                --accent-solid: #5865f2;
                --green: #47cd89;
                --red: #f97066;
                --yellow: #fdb022;
                --blue-soft: #202b46;
                --green-soft: #163526;
                --red-soft: #3b1f23;
                --yellow-soft: #3a2d16;
                --mono: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
            }
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: Inter, 'Segoe UI', system-ui, sans-serif; }
            html { background: var(--bg); }
            body { background: var(--bg); color: var(--text); padding: 18px; font-size: 14px; min-height: 100vh; }
            .container { max-width: 1120px; margin: 0 auto; padding-bottom: 48px; }
            h2 { text-align: center; color: var(--text); margin-bottom: 12px; font-weight: 850; letter-spacing: -0.03em; }
            .subtitle { text-align: center; color: var(--muted); margin: -6px 0 18px; line-height: 1.5; }
            .status-box { padding: 16px; border-radius: 18px; text-align: center; font-weight: 750; margin-bottom: 16px; border: 1px solid var(--border); background: var(--panel); }
            .running { color: var(--green); border-color: #23543a; background: var(--green-soft); }
            .paused { color: var(--red); border-color: #66343a; background: var(--red-soft); }
            .offline { color: var(--muted); border-color: var(--border); background: var(--panel); }
            .profile-box { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 12px; padding: 10px; background: var(--panel-soft); border: 1px solid var(--border); border-radius: 12px; font-weight: 500; font-size: 13px; color: var(--muted); }
            .profile-box-top { justify-content: flex-start; margin: 14px 0 16px; padding: 14px 16px; background: var(--panel); border-radius: 18px; }
            .profile-box img { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--border); }
            .account-chip-wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
            .account-chip-group { display: inline-flex; align-items: stretch; gap: 4px; max-width: 100%; }
            .account-chip { width: auto; max-width: min(100%, 320px); padding: 7px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--panel-soft); color: var(--text); text-decoration: none; display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 850; white-space: nowrap; }
            .account-chip:hover { transform: translateY(-1px); border-color: var(--accent); }
            .account-chip.running { color: var(--green); border-color: #2e7a52; background: rgba(71, 205, 137, 0.13); }
            .account-chip.paused { color: var(--red); border-color: #7a363c; background: rgba(249, 112, 102, 0.12); }
            .account-chip.viewing { outline: 2px solid var(--accent); outline-offset: 2px; }
            .account-chip-name { overflow: hidden; text-overflow: ellipsis; }
            .account-chip-id { color: var(--muted); font-size: 10px; max-width: 110px; overflow: hidden; text-overflow: ellipsis; }
            .account-chip-status { font-size: 10px; letter-spacing: 0.04em; }
            .account-chip-action { width: 30px; min-width: 30px; padding: 0 8px; border: 1px solid var(--border); border-radius: 999px; background: var(--panel-soft); color: var(--text); font-weight: 900; cursor: pointer; }
            .account-chip-action.connect { color: var(--accent); border-color: #4d5fc0; }
            .account-chip-action.start { color: var(--green); border-color: #2e7a52; }
            .account-chip-action.pause { color: var(--red); border-color: #7a363c; }
            .account-chip-action.delete { color: var(--yellow); border-color: #8a5d16; }
            .account-chip-action:hover { border-color: var(--accent); background: var(--blue-soft); }
            .slot-indicator { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
            .slot-indicator span { display: inline-flex; align-items: center; gap: 6px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--panel-soft); color: var(--text); font-size: 12px; font-weight: 800; }
            .slot-indicator strong { color: var(--accent); }
            .profile-preview { display: none; align-items: center; gap: 8px; margin-top: 8px; padding: 10px; background: var(--blue-soft); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-size: 13px; }
            .profile-preview.visible { display: flex; }
            .profile-preview strong { color: var(--accent); }
            .settings-nav { position: sticky; top: 10px; z-index: 20; display: flex; align-items: center; gap: 12px; background: rgba(18, 25, 35, 0.96); border: 1px solid var(--border); border-radius: 16px; margin-bottom: 15px; padding: 10px; backdrop-filter: blur(10px); }
            .hamburger-btn { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 10px; padding: 12px 14px; background: var(--panel-strong); color: var(--text); border: 1px solid var(--border); border-radius: 12px; cursor: pointer; font-weight: 850; font-size: 14px; }
            .hamburger-btn:hover, .hamburger-btn[aria-expanded="true"] { border-color: var(--accent); color: var(--accent); }
            .settings-current { flex: 1; color: var(--muted); font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .settings-menu { display: none; position: absolute; top: calc(100% + 8px); left: 0; width: min(360px, 100%); background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 12px; box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35); }
            .settings-menu.open { display: grid; gap: 12px; }
            .settings-menu-group { display: grid; gap: 7px; }
            .settings-menu-group > span { color: var(--muted); font-size: 11px; font-weight: 850; text-transform: uppercase; letter-spacing: 0.05em; padding: 0 4px; }
            .settings-menu-item { width: 100%; padding: 11px 12px; background: transparent; color: var(--text); border: 1px solid transparent; border-radius: 11px; cursor: pointer; font-weight: 750; text-align: left; }
            .settings-menu-item:hover { background: var(--panel-soft); border-color: var(--border); }
            .settings-menu-item.active { background: var(--blue-soft); border-color: var(--accent); color: var(--accent); }
            .category-heading { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; background: var(--panel); border: 1px solid var(--border); border-radius: 18px; padding: 16px; margin-bottom: 16px; }
            .category-heading h3 { margin-top: 4px; font-size: 20px; letter-spacing: -0.02em; }
            .category-heading p { max-width: 520px; color: var(--muted); line-height: 1.5; text-align: right; }
            .tab-content { display: none; }
            .tab-content.active { display: block; }
            .card { background: var(--panel); padding: 16px; border-radius: 18px; margin-bottom: 16px; border: 1px solid var(--border); }
            .card-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
            label, .section-label { display: block; margin-top: 10px; font-size: 0.78em; color: var(--muted); font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
            label:first-child { margin-top: 0; }
            input[type=text], input[type=password], input[type=number], select.input-select {
                width: 100%; padding: 12px; margin-top: 5px; background: var(--panel-soft); border: 1px solid var(--border);
                color: var(--text); border-radius: 10px; outline: none; font-size: 14px; font-family: inherit;
            }
            select.input-select { appearance: auto; cursor: pointer; }
            input:focus, select.input-select:focus { border-color: var(--accent); }
            input[type=checkbox] { width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-solid); }
            .row { display: flex; gap: 10px; margin-top: 8px; }
            .col { flex: 1; }
            .toggle-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
            .toggle-row:last-child { border-bottom: none; }
            .btn { width: 100%; padding: 14px; border: 1px solid transparent; border-radius: 10px; font-weight: 800; cursor: pointer; font-size: 14px; letter-spacing: 0.01em; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
            .btn-save { background: var(--accent-solid); color: white; }
            .btn-connect { background: var(--accent-solid); color: white; flex: 1; }
            .btn-home { background: var(--panel-soft); color: var(--text); border-color: var(--border); flex: 1; }
            .btn-home:hover { border-color: var(--accent); color: var(--accent); }
            .btn-start { background: #208a5d; color: white; flex: 1; }
            .btn-pause { background: #b93838; color: white; flex: 1; }
            .btn-voice { background: #7c3aed; color: white; flex: 1; }
            .btn-logout { background: #475467; color: white; flex: 1; }
            .btn-secondary { background: var(--panel-soft); color: var(--text); border-color: var(--border); }
            .btn-danger { background: var(--red-soft); color: var(--red); border-color: #7a363c; }
            .save-toast { position: fixed; right: 20px; bottom: 20px; z-index: 100; display: flex; align-items: center; gap: 8px; max-width: min(360px, calc(100vw - 40px)); padding: 12px 15px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel-strong); color: var(--text); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35); font-weight: 800; opacity: 0; pointer-events: none; transform: translateY(12px); transition: opacity 160ms ease, transform 160ms ease; }
            .save-toast.visible { opacity: 1; transform: translateY(0); }
            .save-toast.success { border-color: #2e7a52; color: var(--green); background: var(--green-soft); }
            .save-toast.error { border-color: #7a363c; color: var(--red); background: var(--red-soft); }
            .action-group { display: flex; gap: 10px; margin-bottom: 16px; }
            .divider { border-top: 1px solid var(--border); margin: 16px 0; }
            .dashboard-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
            .stat-card { background: var(--panel); border: 1px solid var(--border); border-radius: 18px; padding: 15px; min-height: 118px; }
            .stat-label { color: var(--muted); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; }
            .stat-value { color: var(--text); font-size: 25px; font-weight: 850; line-height: 1.1; }
            .stat-note { color: var(--muted); font-size: 12px; margin-top: 7px; overflow-wrap: anywhere; line-height: 1.45; }
            .info-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
            .info-item { background: var(--panel-soft); border: 1px solid var(--border); border-radius: 12px; padding: 11px; }
            .pill-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
            .pill { border: 1px solid var(--border); background: var(--panel-soft); border-radius: 999px; padding: 7px 10px; font-size: 12px; color: var(--text); }
            .recent-list { display: grid; gap: 8px; margin-top: 10px; }
            .recent-item { display: grid; grid-template-columns: 92px 90px 1fr; gap: 10px; align-items: center; background: var(--panel-soft); border: 1px solid var(--border); border-radius: 12px; padding: 9px 10px; color: var(--text); font-size: 12px; }
            .recent-muted { color: var(--muted); }
            .log-box { background: #0a0f16; color: #d0d5dd; border: 1px solid var(--border); border-radius: 14px; padding: 0; font-family: var(--mono); font-size: 12px; line-height: 1.45; overflow: auto; height: 320px; min-height: 320px; max-height: 58vh; resize: vertical; user-select: text; -webkit-user-select: text; }
            .log-line { display: grid; grid-template-columns: 78px 88px 1fr; gap: 10px; padding: 9px 12px; border-bottom: 1px solid #182231; white-space: pre-wrap; word-break: break-word; border-left: 3px solid transparent; user-select: text; -webkit-user-select: text; }
            .log-line:last-child { border-bottom: none; }
            .log-line:nth-child(even) { background: rgba(255,255,255,0.018); }
            .log-time { color: #98a2b3; }
            .log-level { font-weight: 900; letter-spacing: 0.02em; }
            .log-message { color: #d0d5dd; }
            .log-level-info { border-left-color: #2f80ed; }
            .log-level-info .log-level, .log-level-info .log-message { color: #8ec5ff; }
            .log-level-ok { border-left-color: #12b76a; }
            .log-level-ok .log-level, .log-level-ok .log-message { color: #8ff0bf; }
            .log-level-warn { border-left-color: #fdb022; }
            .log-level-warn .log-level, .log-level-warn .log-message { color: #ffd27a; }
            .log-level-err { border-left-color: #f04438; }
            .log-level-err .log-level, .log-level-err .log-message { color: #ff9b96; }
            .log-level-battle { border-left-color: #d444f1; }
            .log-level-battle .log-level, .log-level-battle .log-message { color: #efa8ff; }
            .log-level-captcha { border-left-color: #ff4d6d; background: rgba(255, 77, 109, 0.08); }
            .log-level-captcha .log-level, .log-level-captcha .log-message { color: #ffb3c1; }
            .log-empty { min-height: 318px; display: flex; align-items: center; justify-content: center; padding: 16px; color: #98a2b3; }
            .input-hint { font-size: 11px; color: var(--muted); margin-top: 5px; line-height: 1.45; }
            .debug-output-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
            .debug-action-button { width: auto; padding: 9px 12px; font-size: 12px; }
            .debug-output { margin-top: 8px; padding: 12px; min-height: 220px; max-height: 460px; overflow: auto; white-space: pre-wrap; word-break: break-word; background: #0a0f16; border: 1px solid var(--border); border-radius: 10px; color: #c5d7ff; font: 12px/1.5 var(--mono); user-select: text; -webkit-user-select: text; }
            .telegram-badge { background: var(--blue-soft); border: 1px solid var(--border); border-radius: 999px; padding: 5px 9px; font-size: 11px; color: var(--accent); display: inline-block; margin-top: 8px; }
            @media (max-width: 920px) { .dashboard-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .info-grid { grid-template-columns: 1fr; } }
            @media (max-width: 760px) { body { padding: 12px; } .dashboard-grid, .info-grid { grid-template-columns: 1fr; } .row, .action-group, .card-title, .category-heading { flex-direction: column; align-items: stretch; } .category-heading p { text-align: left; } .settings-nav { top: 6px; } .log-line, .recent-item { grid-template-columns: 1fr; gap: 3px; } .stat-card { min-height: auto; } }
        </style>
        `;
    }

module.exports = getStyles;