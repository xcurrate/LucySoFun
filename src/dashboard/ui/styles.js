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
            .container { max-width: 1120px; margin: 0 auto; padding-top: 68px; padding-bottom: 48px; }
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
            .settings-nav { position: fixed; top: 12px; left: 12px; z-index: 60; display: flex; align-items: center; gap: 12px; background: rgba(18, 25, 35, 0.96); border: 1px solid var(--border); border-radius: 16px; margin: 0; padding: 8px; backdrop-filter: blur(10px); max-width: calc(100vw - 24px); }
            .hamburger-btn { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 10px; padding: 12px 14px; background: var(--panel-strong); color: var(--text); border: 1px solid var(--border); border-radius: 12px; cursor: pointer; font-weight: 850; font-size: 14px; }
            .hamburger-btn:hover, .hamburger-btn[aria-expanded="true"] { border-color: var(--accent); color: var(--accent); }
            .settings-current { flex: 1; color: var(--muted); font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .settings-menu { display: none; position: absolute; top: calc(100% + 8px); left: 0; width: min(360px, calc(100vw - 24px)); max-height: calc(100vh - 96px); overflow-y: auto; background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 12px; box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35); }
            .settings-menu.open { display: grid; gap: 12px; }
            .settings-menu-group { display: grid; gap: 7px; }
            .settings-menu-group > span { color: var(--muted); font-size: 11px; font-weight: 850; text-transform: uppercase; letter-spacing: 0.05em; padding: 0 4px; }
            .settings-menu-item { width: 100%; padding: 11px 12px; background: transparent; color: var(--text); border: 1px solid transparent; border-radius: 11px; cursor: pointer; font-weight: 750; text-align: left; }
            .settings-menu-item:hover { background: var(--panel-soft); border-color: var(--border); }
            .settings-menu-item.active { background: var(--blue-soft); border-color: var(--accent); color: var(--accent); }
            .settings-tabs { display: block; }
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
            /* Savebar: fixed di bawah viewport, tidak ikut scroll. */
            .unsaved-banner { position: fixed; left: 24px; right: 24px; bottom: 18px; z-index: 200; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; max-width: 1120px; margin: 0 auto; padding: 12px 14px; border: 1px solid #344054; border-radius: 14px; background: rgba(19, 25, 38, 0.97); color: var(--text); box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55); font-weight: 800; font-size: 14px; backdrop-filter: blur(14px); }
            .unsaved-banner .unsaved-dot { width: 10px; height: 10px; border-radius: 50%; background: #e6a23c; box-shadow: 0 0 0 0 rgba(230, 162, 60, 0.5); animation: unsavedPulse 1.6s ease-out infinite; flex: 0 0 auto; }
            .unsaved-banner.warning { border-color: #a8782f; color: #e6a23c; }
            .unsaved-banner .unsaved-text { flex: 1 1 200px; min-width: 0; }
            .unsaved-banner .unsaved-actions { display: flex; gap: 10px; flex-wrap: wrap; }
            .unsaved-banner .unsaved-actions .btn { min-width: 0; width: auto; padding: 10px 16px; }
            body.has-savebar { padding-bottom: 96px; }
            /* Scope bar: penanda akun yang sedang ditampilkan di Ringkasan. */
            .scope-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 14px 16px; margin-bottom: 16px; border: 1px solid #3a4a6b; border-radius: 16px; background: linear-gradient(120deg, rgba(99, 102, 241, 0.13), rgba(16, 24, 39, 0.95) 70%); }
            .scope-bar .sb-text { min-width: 0; flex: 1 1 200px; }
            .scope-bar .sb-text strong { display: block; font-size: 13.5px; }
            .scope-bar .sb-text small { color: var(--muted); font-size: 11.5px; }
            .scope-seg { display: inline-flex; flex-wrap: wrap; gap: 3px; padding: 3px; border: 1px solid var(--border); border-radius: 12px; background: #0b1322; }
            .scope-seg button, .scope-seg a { padding: 8px 12px; border: 0; border-radius: 9px; background: transparent; color: var(--muted); font-family: inherit; font-size: 11.5px; font-weight: 800; cursor: pointer; white-space: nowrap; text-decoration: none; display: inline-block; }
            .scope-seg button:hover, .scope-seg a:hover { color: var(--text); }
            .scope-seg button.active, .scope-seg a.active { background: var(--blue-soft); color: var(--accent); box-shadow: inset 0 0 0 1px rgba(129, 140, 248, 0.35); }
            .stat-card .stat-who { color: var(--accent); font-weight: 800; text-transform: none; letter-spacing: 0; }
            @keyframes unsavedPulse { 0% { box-shadow: 0 0 0 0 rgba(230, 162, 60, 0.45); } 70% { box-shadow: 0 0 0 8px rgba(230, 162, 60, 0); } 100% { box-shadow: 0 0 0 0 rgba(230, 162, 60, 0); } }
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
            .log-empty { min-height: 318px; display: flex; align-items: center; justify-content: center; padding: 16px; color: #98a2b3; }
            .input-hint { font-size: 11px; color: var(--muted); margin-top: 5px; line-height: 1.45; }
            .debug-output-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
            .debug-action-button { width: auto; padding: 9px 12px; font-size: 12px; }
            .debug-output { margin-top: 8px; padding: 12px; min-height: 220px; max-height: 460px; overflow: auto; white-space: pre-wrap; word-break: break-word; background: #0a0f16; border: 1px solid var(--border); border-radius: 10px; color: #c5d7ff; font: 12px/1.5 var(--mono); user-select: text; -webkit-user-select: text; }
            .telegram-badge { background: var(--blue-soft); border: 1px solid var(--border); border-radius: 999px; padding: 5px 9px; font-size: 11px; color: var(--accent); display: inline-block; margin-top: 8px; }
            @media (max-width: 920px) { .dashboard-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .info-grid { grid-template-columns: 1fr; } }
            @media (max-width: 760px) { body { padding: 12px; } .dashboard-grid, .info-grid { grid-template-columns: 1fr; } .row, .action-group, .card-title, .category-heading { flex-direction: column; align-items: stretch; } .category-heading p { text-align: left; } .settings-nav { top: 6px; left: 6px; } .log-line, .recent-item { grid-template-columns: 1fr; gap: 3px; } .stat-card { min-height: auto; } }
        
            /* LucySoFun dashboard refresh */
            :root { --bg:#080d18; --panel:#101827; --panel-soft:#151f31; --panel-strong:#1b2940; --text:#f4f7ff; --muted:#9aa8bf; --border:#263650; --accent:#a5b4fc; --accent-solid:#6366f1; --green:#4adea1; --red:#fb7185; --yellow:#fbbf24; --blue-soft:#202d4a; --green-soft:#123629; --red-soft:#3d202c; --yellow-soft:#3a2e19; }
            html { background:#080d18; scroll-behavior:smooth; }
            body { padding:clamp(12px,2.5vw,30px); background:radial-gradient(ellipse at 12% 0%,rgba(99,102,241,.16),transparent 34%),radial-gradient(ellipse at 92% 12%,rgba(45,212,191,.09),transparent 28%),var(--bg); color:var(--text); line-height:1.55; }
            .container { max-width:1240px; padding-bottom:64px; }
            h2 { text-align:left; font-size:clamp(25px,3vw,36px); margin:8px 0 4px; letter-spacing:-.045em; }
            .subtitle { text-align:left; margin:0 0 22px; color:#9eacc4; }
            .profile-box-top { justify-content:flex-start; margin:18px 0; padding:16px 18px; border-radius:18px; background:linear-gradient(115deg,rgba(99,102,241,.13),rgba(16,24,39,.96) 58%); border-color:#344567; box-shadow:0 12px 34px rgba(0,0,0,.18); }
            .settings-nav { position:sticky; top:10px; z-index:30; display:grid; grid-template-columns:minmax(180px,.7fr) minmax(240px,1.3fr); align-items:center; gap:14px; padding:14px 16px; margin:18px 0; background:rgba(13,20,34,.94); border:1px solid #34435f; border-radius:18px; box-shadow:0 14px 36px rgba(0,0,0,.28); backdrop-filter:blur(16px); }
            .settings-nav-heading { display:grid; gap:2px; }
            .settings-nav-heading .section-label { margin:0; color:#8b9ab4; }
            .settings-nav-heading strong { font-size:15px; color:var(--text); }
            .settings-select-label { margin:0; font-size:11px; color:#aab7cd; }
            .settings-category-select { margin:0 !important; min-height:46px; border-radius:12px !important; font-weight:750; }
            .category-heading { align-items:center; padding:20px 22px; margin-bottom:18px; background:linear-gradient(120deg,rgba(99,102,241,.13),rgba(16,24,39,.95) 68%); border-color:#344567; border-radius:20px; }
            .category-heading h3 { font-size:clamp(20px,2.4vw,26px); }
            .category-heading p { color:var(--muted); text-align:left; }
            .card { padding:20px; margin-bottom:16px; border-radius:18px; background:linear-gradient(145deg,rgba(20,31,49,.98),rgba(14,22,36,.98)); border-color:#293a56; box-shadow:0 10px 28px rgba(0,0,0,.14); }
            .card-title { margin-bottom:16px; }
            label,.section-label { letter-spacing:.075em; color:#a5b2c8; }
            input[type=text],input[type=password],input[type=number],select.input-select { min-height:44px; padding:11px 13px; border-radius:11px; background:#0c1525; border-color:#2c3d5b; transition:border-color .16s,box-shadow .16s; }
            input:focus,select.input-select:focus { border-color:#818cf8; box-shadow:0 0 0 3px rgba(129,140,248,.14); }
            .btn { min-height:44px; border-radius:12px; transition:transform .16s,filter .16s,border-color .16s; }
            .btn:hover { transform:translateY(-1px); filter:brightness(1.08); }
            .btn-save { background:linear-gradient(135deg,#6366f1,#4f46e5); }
            .btn-start { background:linear-gradient(135deg,#159b6b,#08784e); }
            .btn-pause { background:linear-gradient(135deg,#c24155,#9f3044); }
            .action-group { gap:10px; flex-wrap:wrap; }
            .action-group .btn { min-width:150px; }
            .dashboard-grid { gap:14px; }
            .stat-card { background:linear-gradient(145deg,#17243a,#101827); border-color:#2b3c59; border-radius:18px; }
            .stat-value { letter-spacing:-.04em; }
            .info-item,.recent-item { background:#111d30; border-color:#2a3a55; }
            .log-box,.debug-output { background:#080f1c; border-color:#293b58; border-radius:14px; }
            .account-chip { border-radius:12px; }
            .profile-picker-card { border-color:#4c5e91; background:linear-gradient(135deg,rgba(42,52,91,.48),rgba(16,24,39,.98)); }
            .profile-picker-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
            .profile-picker-heading .section-label { margin:0 0 3px; }
            .profile-picker-heading strong { font-size:16px; }
            .profile-picker-count { padding:5px 10px; border:1px solid #455782; border-radius:999px; color:#c7d2fe; font-size:11px; font-weight:800; }
            .profile-picker-select { min-height:50px !important; border-color:#5969a2 !important; background:#0b1426 !important; }
            .profile-preview.visible { border-color:#5266a0; }
            .status-box { border-radius:16px; }
            .save-toast { border-radius:14px; }
            @media(max-width:760px) { .settings-nav { grid-template-columns:1fr; gap:8px; padding:12px; } .category-heading { padding:16px; } .card { padding:16px; } .action-group .btn { min-width:0; } h2 { font-size:27px; } }


            /* Sidebar navigation + compact dashboard layout */
            .container { max-width: 1440px; margin: 0 auto; padding-top: 76px; padding-left: 8px; }
            .settings-nav { position: fixed; top: 16px; left: 18px; z-index: 72; display: flex; align-items: center; gap: 14px; width: min(360px, calc(100vw - 36px)); padding: 10px 12px; border: 1px solid #34435f; border-radius: 14px; background: rgba(13,20,34,.96); box-shadow: 0 12px 30px rgba(0,0,0,.28); backdrop-filter: blur(16px); }
            .hamburger-btn { display: inline-flex; align-items: center; justify-content: center; gap: 9px; min-width: 104px; padding: 10px 12px; border: 1px solid #34435f; border-radius: 10px; background: #1b2940; color: var(--text); cursor: pointer; font-weight: 850; }
            .hamburger-icon { font-size: 18px; line-height: 1; }
            .settings-current { font-size: 13px; }
            .settings-menu.settings-sidebar { display: flex; flex-direction: column; position: fixed; top: 0; bottom: 0; left: 0; z-index: 90; width: 292px; max-width: min(86vw, 320px); max-height: 100vh; overflow-y: auto; padding: 22px 16px 28px; border: 0; border-right: 1px solid #34435f; border-radius: 0 18px 18px 0; background: #0d1524; box-shadow: 22px 0 54px rgba(0,0,0,.42); transform: translateX(-105%); transition: transform .22s ease; visibility: hidden; }
            .settings-menu.settings-sidebar.open { display: flex; transform: translateX(0); visibility: visible; gap: 14px; }
            .sidebar-brand { display: flex; align-items: center; gap: 12px; padding: 4px 4px 18px; border-bottom: 1px solid var(--border); }
            .sidebar-brand-mark { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 13px; background: linear-gradient(135deg,#818cf8,#4f46e5); color: white; font-size: 22px; font-weight: 900; }
            .sidebar-brand strong,.sidebar-brand small { display: block; }
            .sidebar-brand strong { font-size: 15px; }.sidebar-brand small { color: var(--muted); font-size: 10px; margin-top: 2px; }
            .settings-select-label { margin: 0; }
            .settings-category-select { margin-top: 6px !important; }
            .sidebar-divider { height: 1px; background: var(--border); }
            .settings-menu-group { display: grid; gap: 5px; }
            .settings-menu-group > span { padding: 0 8px 4px; color: #8998b2; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .09em; }
            .settings-menu-item { padding: 10px 12px; border-radius: 10px; font-size: 13px; text-align: left; }
            .settings-menu-item.active { background: rgba(99,102,241,.16); border-color: rgba(129,140,248,.35); color: #c7d2fe; }
            .settings-overlay { display: block; position: fixed; inset: 0; z-index: 80; border: 0; background: rgba(2,6,15,.58); opacity: 0; visibility: hidden; transition: opacity .2s ease, visibility .2s ease; }
            body:has(.settings-sidebar.open) .settings-overlay { opacity: 1; visibility: visible; }
            .account-chip-wrap { gap: 10px; }
            .account-chip-group { padding: 5px; border: 1px solid var(--border); border-radius: 14px; background: rgba(8,15,28,.48); }
            .account-chip { border-radius: 9px; }
            #lucy-command-cards { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 0 14px; }
            #lucy-command-cards > .category-heading, #lucy-command-cards > .input-hint { grid-column: 1 / -1; }
            #lucy-command-cards > .card { margin-bottom: 12px; }
            #lucy-command-cards > .category-heading { margin-top: 8px; }
            .profile-picker-card { display: none !important; }
            @media(max-width: 900px) { #lucy-command-cards { grid-template-columns: 1fr; } .container { padding-left: 0; } }
            @media(max-width: 760px) { .settings-nav { top: 8px; left: 8px; width: calc(100vw - 16px); } .container { padding-top: 72px; } }


            /* Compact collapsible fixed-command panel */
            .command-dropdown { grid-column: 1 / -1; margin: 8px 0 16px; border: 1px solid #344567; border-radius: 16px; background: linear-gradient(145deg,rgba(20,31,49,.98),rgba(14,22,36,.98)); overflow: hidden; }
            .command-dropdown > summary { display: flex; align-items: center; gap: 10px; padding: 14px 18px; color: var(--text); font-weight: 800; cursor: pointer; list-style: none; }
            .command-dropdown > summary::-webkit-details-marker { display: none; }
            .command-dropdown > summary::after { content: '＋'; margin-left: auto; color: var(--accent); font-size: 18px; }
            .command-dropdown[open] > summary::after { content: '−'; }
            .command-dropdown > summary:hover { background: rgba(99,102,241,.10); }
            .command-dropdown > .category-heading { margin: 0 !important; padding: 12px 18px 4px; background: transparent; border: 0; border-radius: 0; }
            .command-dropdown > .input-hint { display: block; padding: 0 18px 12px; }
            .command-dropdown > .card { margin: 0 14px 14px; }
            .dropdown-hint { color: var(--muted); font-size: 11px; font-weight: 500; }

            /* ===== v7 layout: sidebar kiri permanen + topbar ===== */
            :root { --sidebar-w: 250px; --topbar-h: 60px; }
            .page-head { margin: 0 0 18px; }
            .page-head h1 { font-size: clamp(22px, 2.6vw, 30px); letter-spacing: -.04em; margin-bottom: 4px; font-weight: 850; }
            .page-head p { color: var(--muted); max-width: 640px; line-height: 1.5; }
            .topbar { position: sticky; top: 0; z-index: 50; display: none; align-items: center; gap: 14px; min-height: var(--topbar-h); padding: 8px 18px; background: rgba(10,16,28,.92); border-bottom: 1px solid var(--border); backdrop-filter: blur(14px); }
            .topbar .tb-account { display: flex; align-items: center; gap: 10px; min-width: 0; }
            .topbar .tb-avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg,#818cf8,#4f46e5); display: grid; place-items: center; font-weight: 900; font-size: 13px; flex: 0 0 auto; }
            .topbar .tb-name { font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .topbar .tb-id { color: var(--muted); font-size: 11px; }
            .topbar .tb-spacer { flex: 1; }
            .topbar .tb-pill { display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px; border: 1px solid var(--border); border-radius: 999px; background: var(--panel-soft); font-size: 12px; font-weight: 800; white-space: nowrap; }
            .topbar .tb-pill.run { color: var(--green); border-color: #2e7a52; background: rgba(74,222,161,.10); }
            .topbar .tb-pill .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); animation: tbPulse 1.8s infinite; }
            @keyframes tbPulse { 0% { box-shadow: 0 0 0 0 rgba(74,222,161,.45); } 70% { box-shadow: 0 0 0 7px rgba(74,222,161,0); } 100% { box-shadow: 0 0 0 0 rgba(74,222,161,0); } }
            .topbar .tb-actions { display: flex; gap: 8px; }
            .topbar .tb-btn { display: inline-flex; align-items: center; gap: 7px; min-height: 38px; padding: 8px 14px; border-radius: 10px; border: 1px solid transparent; font-weight: 800; font-size: 12px; cursor: pointer; font-family: inherit; }
            .topbar .tb-btn:hover { filter: brightness(1.1); }
            .topbar .tb-btn.start { background: linear-gradient(135deg,#159b6b,#08784e); color: #fff; }
            .topbar .tb-btn.pause { background: transparent; border-color: #7a363c; color: var(--red); }
            .topbar .tb-burger { display: none; background: none; border: 1px solid var(--border); border-radius: 10px; color: var(--text); padding: 8px 10px; cursor: pointer; font-size: 15px; }

            /* Desktop: sidebar selalu terlihat, konten digeser ke kanan. */
            @media (min-width: 861px) {
                body { padding: 0; }
                .topbar { display: flex; padding-left: calc(var(--sidebar-w) + 18px); }
                .container { max-width: 1180px; margin: 0; padding: 22px 24px 170px; margin-left: var(--sidebar-w); }
                .settings-nav { display: none; }
                .settings-overlay { display: none !important; }
                .settings-menu.settings-sidebar { transform: none; visibility: visible; width: var(--sidebar-w); padding: 16px 12px 26px; border-radius: 0; border-right: 1px solid var(--border); background: #0b1322; box-shadow: none; }
                .settings-menu.settings-sidebar .sidebar-divider { display: none; }
                .settings-menu.settings-sidebar .settings-select-label,
                .settings-menu.settings-sidebar .settings-category-select { display: none; }
            }
            @media (max-width: 860px) {
                .topbar { display: flex; }
                .topbar .tb-burger { display: inline-flex; }
                .topbar .tb-name, .topbar .tb-id { display: none; }
                .topbar .tb-pill, .topbar .tb-actions { display: none; }
                .container { padding-top: 14px; }
            }

            /* ===== v7 content polish: toggle switch, kartu, tipografi ===== */
            /* Checkbox di dalam .toggle-row tampil sebagai saklar geser. */
            .toggle-row { padding: 13px 0; gap: 14px; }
            .toggle-row > span, .toggle-row > label { font-size: 13.5px; font-weight: 700; text-transform: none; letter-spacing: 0; color: var(--text); margin: 0; }
            .toggle-row input[type=checkbox] {
                appearance: none; -webkit-appearance: none; position: relative; flex: 0 0 auto;
                width: 46px; height: 26px; border-radius: 999px; background: #2c3d5b;
                cursor: pointer; border: none; margin: 0; transition: background .18s;
            }
            .toggle-row input[type=checkbox]::before {
                content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px;
                border-radius: 50%; background: #fff; transition: transform .18s;
            }
            .toggle-row input[type=checkbox]:checked { background: var(--accent-solid); }
            .toggle-row input[type=checkbox]:checked::before { transform: translateX(20px); }
            .toggle-row input[type=checkbox]:focus-visible { box-shadow: 0 0 0 3px rgba(129,140,248,.25); }

            .card { padding: 20px; border-radius: 18px; }
            .card > label:first-child { font-size: 11px; letter-spacing: .075em; color: #a5b2c8; margin-bottom: 10px; }
            .divider { margin: 16px 0; }

            .category-heading { padding: 18px 20px; border-radius: 18px; }
            .category-heading h3 { font-size: clamp(19px, 2.2vw, 24px); }
            .category-heading .section-label { color: #8b9ab4; }

            .stat-card { background: linear-gradient(145deg,#17243a,#101827); border: 1px solid #2b3c59; border-radius: 18px; padding: 16px; }
            .stat-label { display: flex; align-items: center; gap: 6px; font-size: 11px; letter-spacing: .06em; margin-bottom: 9px; }
            .stat-label .stat-who { color: var(--accent); font-size: 10px; letter-spacing: 0; text-transform: none; }
            .stat-value { font-size: 26px; font-weight: 850; letter-spacing: -.04em; line-height: 1.1; }
            .stat-note { margin-top: 7px; }

            .info-item { border-radius: 12px; }
            .pill { font-weight: 800; }

            .action-group .btn { min-height: 44px; }
            .btn-connect, .btn-save { background: linear-gradient(135deg,#6366f1,#4f46e5); }
            .btn-start { background: linear-gradient(135deg,#159b6b,#08784e); }
            .btn-pause { background: linear-gradient(135deg,#c24155,#9f3044); }
            .btn-voice { background: linear-gradient(135deg,#7c3aed,#5b21b6); }
            .btn-logout { background: linear-gradient(135deg,#475467,#344054); }
            .btn-home, .btn-secondary { background: var(--panel-soft); border-color: var(--border); }

        </style>
        `;
    }

module.exports = getStyles;