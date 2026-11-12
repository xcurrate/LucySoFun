# Project Notes

## LucySoFun (Lucy-only Discord selfbot)

- **Stack**: Node.js Discord selfbot (`discord.js-selfbot-v13`), Express dashboard in `src/dashboard/`, managers in `src/managers/`, runtime in `src/core/accountRuntime.js`.
- This project is dedicated exclusively to the **Lucy** bot. All OwO-specific code (huntbot, boss, captcha, channel rotation, daily reset, battle/hunt/pray/custom loops, control words) has been removed.
- **Tests**: `node --test test/*.test.js` (or `npm test`). Some pre-existing failures are unrelated to new work:
  - `gems` (8), `lucy-cooldown` (2), and three `dashboard-save` tests were already failing before this work. The `adventure` suite has since been repaired (harness used a stale Lucy author id / missing `runLucyAction`).
  - When adding features, run the full suite and compare `fail` count against the baseline before/after.
- Usage/installation docs live in `README.md` (created during the Lucy-only refactor; the repo previously had no README).

## Custom Command Lucy loop (Other Commands)

- Slot state lives in `config.otherCommands[]` (`text`, `delayMs`, `count`, `channelId`, `enabled`). `startOtherCommand`/`stopOtherCommand`/`startAll`/`stopAll` live in `src/managers/loop.js`.
- Loop gating: `pauseMonsterCatch`/`resumeMonsterCatch` and rest use per-slot delay objects `state.otherCommandDelays[key]` with `remainingMs` so a paused loop resumes with its remaining delay. `clearOtherCommandTimers(index)` clears timers WITHOUT disabling or persisting the slot (used by `startAll`).
- `startAll()` MUST NOT disable slots: it clears running timers then starts every `enabled` slot, so `activateReadyRuntime` (account connect/reconcile/rest-end/config-change) resumes enabled commands. `stopOtherCommand` DO disable + persist (correct for an explicit STOP). `stopAll` only clears timers.
- **The lb/lh unit is started once, via its leader.** `startAll()` must NOT re-check each fixed slot on its own (`if (!command.channelId) return`). If only `lh` carried the channel (or the `lb` key was missing), the old per-slot check skipped the whole unit, so START ALL and the Lucy Discord control (both call `startAll`) started nothing while the card's own START (which goes through `startOtherCommand` → its own recovery) still worked. `config.fixedCommands` is now a single unit (see "Fixed Commands lb/lh" below), so `startAll` just checks it once and starts the leader (index 3).
- **`pause()` must not touch `enabled`.** `accountRuntime.pause()` calls `stopFeatureTimers()` (stop loop/adventure/boss2/gems/huntbot2/monster-catcher timers) WITHOUT clearing any `enabled` flag. The reconcile loop calls `pause()` every 2s, so clearing flags there would silently wipe dashboard saves made while an account is paused. `start()` likewise only starts what the config already marks `enabled` (it no longer force-enables every feature).
- Custom command sends go through `send`/`sendRaw` in `src/managers/command.js` with `allowWhilePaused: true`. Every successful `Other Command X` send (custom 1–3 AND the fixed lb/lh pair 4–5) arms a single Lucy-response emergency timeout via `setLucyResponseTimeout(type)`; the guard `if (state.lucyResponseTimeout) return` ensures at most ONE 40s timeout is armed per pair (lb arms it, lh is skipped). The timeout is cancelled only by a Lucy message in the command's own channel (`state.lastLucyCommandChannelId`) that includes our per-server username (content or embeds), and otherwise fires `emergencyHandler.pause(...)` for that account only; the `linv` recovery probe runs every 10 minutes and `startAll` resumes the same slots.
- `count` empty/`0` = infinite loop; a positive count stops the slot after that many successful sends and sets `enabled=false` (persisted).
- **`startAll` stagger must be a small FIXED step, never the previous slot's delay.** `startAll` starts slots with `position * START_STAGGER_MS` (500ms). The old code did `staggerMs += Math.max(500, resolveDelayMs(command))`, so each slot waited out the previous slot's full delay. With a large custom-command delay (e.g. 300000ms) the fixed lb/lh unit was scheduled minutes later, so START ALL looked like it "only sent the first custom command and stopped" — the exact symptom users reported, while the card's own START (initialDelay 0) worked instantly.
- **Field preservation in `applySave`**: the control-panel form does NOT render any `otherN*` inputs, so its START ALL / PAUSE ALL submit only `action`. `configManager.applySave` must therefore treat a field that is *absent from the body* as "leave unchanged" (`hasField`) and only overwrite when the field is present. Otherwise START ALL / Lucy control blank `text`/`channelId` in `config.json`, and `startAll()` silently skips the emptied slots (the classic "START ALL doesn't start my commands" symptom). Explicitly emptied fields on the profile page (field present, value `''`) still clear the value.
- Lucy feature OCR decoders: `src/managers/TooEz.js` (Huntbot2 password images, letters A–Z) and `src/managers/TooEz2.js` (Monster Catcher captcha, letters + digits).

### TooEz (Huntbot2 password OCR) — font-based, disk-cached

Letter templates are built by **rendering glyphs from the `.otf` fonts** in `src/managers/fonts/` (measurably more accurate than the old base64-template approach). The work is split in two so the runtime stays light:

- **Build step** — `src/managers/TooEz.build.js` (`npm run build:templates`, canvas size via `TOOEZ_SIZE`, default 96) uses `opentype.js` + `@napi-rs/canvas` to render every charset letter and writes the masks to `src/managers/fonts/templates.json` (base64, committed). Re-run it after changing/adding a font or the canvas size.
- **Runtime** — `src/managers/TooEz.js` reads `templates.json` and needs only `pngjs`. It deliberately does NOT require the font engine, which keeps RAM low (font engine + render cost ~57 MB). It caches the parsed masks in memory after the first read, takes the canvas size from the cache (`payload.size`) so input and stored masks always match, and warns if the cache is older than a font file.
- Public contract used by `Huntbot2.js`: `TooEz.decodeBuffer(buffer)` -> 6-letter password string, or `null` if any character is unrecognized. Also exported: `decodeLetters(buffer)`, `getTemplates()`, `TEMPLATE_FILE`.
- Dependencies: runtime `pngjs`; build-only `opentype.js`, `@napi-rs/canvas` (both in `package.json`).
- Tests: `test/tooez.test.js` covers the export contract, disk-cache loading, that the runtime avoids the font engine, per-letter templates, round-trip decode, scoring, and the null path.

### TooEz2 (Monster Catcher captcha OCR) — alphanumeric sibling of TooEz

- Same pipeline as TooEz (segment → normalize → rotate → IoU) but the charset is **capital letters + digits** (`A–Z0–9`), and its cache is a separate file so Huntbot2 is unaffected.
- **Build step** — `TOOEZ_PROFILE=alnum node src/managers/TooEz.build.js` (npm: `npm run build:templates:alnum`) writes `src/managers/fonts/templates-alnum.json` (committed). The `letters` profile keeps writing `templates.json`.
- **Runtime** — `src/managers/TooEz2.js` reads `templates-alnum.json`, requires only `pngjs`, and exports the same contract as TooEz: `decodeBuffer(buffer)` → 6-char code or `null`, plus `decodeLetters`, `getTemplates`, `TEMPLATE_FILE`.
- Ambiguity: look-alike pairs (`0/O`, `1/I`, `2/Z`, `5/S`, `6/G`, `8/B`) are listed in `GRUP_MIRIP` for tuning, but are **not** resolved by aspect ratio at decode time. That override was removed: on 120 rendered glyphs it never once corrected a wrong IoU winner, and on real captchas it flipped correct `Z`→`2` and `G`→`6`. The decode result is simply the highest-IoU template; `cocokkanObjek` returns `terbaik` as a copy of `semuaSkor[0]`. `_internals` is exported for tuning.
- Normalization canvas size is **96** (`let UKURAN = 96` in both `TooEz.js` and `TooEz2.js`); the runtime value is overridden by `payload.size` from the cache at load time, and the build script defaults to 96 (`TOOEZ_SIZE` overrides).
- Tests: `test/tooez2.test.js` mirrors `tooez.test.js` for the alphanumeric cache and contract, and pins `Z`/`G`/`2`/`6` from the `cervoneue` font against the old `Z→2` mix-up. `test/monster-catcher.test.js` decodes two real captcha fixtures in `test/fixtures/monster-captcha-{1,2}.png` end to end (captcha #2 contains two `G`s that the old aspect-ratio override read as `6`).

## Lucy bot integrations

- Lucy's Discord user id: `1438615298012872817` (`CONSTANTS.LUCY_BOT_ID` in `src/constants.js`).
- Lucy features live on the dashboard "Lucy" settings group (`renderLucySettings` in `src/dashboard/ui/settingsTabs.js`); each is a manager in `src/managers/` wired through `src/core/accountRuntime.js` and handled from `src/managers/message.js` `handle`/`handleUpdate`.
- Text matching against Lucy messages should always normalize invisible characters first:
  `messageText(msg)` in `src/managers/monsterCatcher.js` does `removeInvisibleChars(...).toLowerCase()` over content, components, and embed texts.

## Monster Catcher (TooEz2.js)

- Manager: `src/managers/monsterCatcher.js`; OCR decoder: `src/managers/TooEz2.js` (`decodeBuffer(pngBuffer)` → 6-char alphanumeric code or `null`). Depends on `pngjs` (already in package.json).
- Settings: `config.settings.monsterCatcher` via `normalizeMonsterCatcherSettings`; fields `enabled`, `autoPauseLoops`, `retryWaitMs`, `maxRetries`.
- State machine on `state.monsterCatcher`: status `IDLE / PAUSED / PROCESSING / WAITING_RETRY / RESUMING`, phases `idle / awaitingVerdict / awaitingRefresh / awaitingNewSensor`.
- Trigger texts (normalized): sensor `6 karakter pada gambar`, done `terima kasih`, mismatch `belum cocok`, refresh `perlu diperbarui`.
- Loop gating:
  - `loopManager.pauseMonsterCatch()` sets `state.monsterCatchPaused` and pauses all Custom Command Lucy delays with `reason: 'monster'` (remaining delay preserved).
  - `loopManager.resumeMonsterCatch()` resumes the saved Custom Command delays.
  - `command.js` `sendRaw` blocks normal commands while `state.monsterCatchPaused`; Monster Catcher DM replies pass via `options.allowDuringMonsterCatch: true`.
  - Mon Catcher manager must only handle DM messages from Lucy; dedupe uses a bounded `Set` of processed message ids (`state.monsterCatcher.processedMessageIds`).
  - Dashboard: `/api/monster-catcher-status` route in `src/dashboard/routes.js`; live status chip in the Monster Catcher settings tab polled by `src/dashboard/ui/scripts.js` (`refreshMonsterCatcher`).

## Channels (Active Channels removed)

- The "Active Channels" dashboard card, `config.channels`, `state.activeChannelId`, and `src/managers/channel.js` were removed. There is no global channel list or `channelManager` anymore.
- Every Lucy command must pass an explicit target channel id (`sendRaw(cmd, type, targetChannelId)`); a send with no target is rejected. Each feature uses its own configured channel (`otherCommands[].channelId`, `fixedCommands`, `adventure.channelId`, `gems.channelId`, `huntbot2.channelId`, etc.).
- `state.lastLucyCommandChannelId` still records the channel of the last Custom/Fixed command so the 40s Lucy-response timeout and the `linv` recovery probe check that same server.
- CCTV (`safety.cctv`) now scopes monitoring to `settings.messageFilter.channelIds` / `guildIds` (empty list = all channels) instead of the removed active-channel list.
- **Auto Adventure is channel-only**: `settings.adventure = { enabled, channelId }`. `guildId` was removed everywhere (manager `matchesTarget`/`start`, config normalization, dashboard UI); the runtime drops any legacy `guildId` on load.

## Dashboard page layout (Menu Utama vs Halaman Profil)

- The dashboard has two page modes: the **Menu Utama / control panel** (`/`, no `profileId`) and the **Halaman Profil** (`/?profileId=<id>`).
- `tab-main` is the only tab whose content differs per mode, driven by `homePageCards` in `src/dashboard/ui/page.js`:
  - Control panel → `renderMultiAccountCard` (account chips + "MASUKKUN TOKEN AKUN BARU" form).
  - Profile page → `renderProfileHomeCard` (perkenalan akun + status + tombol ganti akun). Daftar Custom Commands TIDAK lagi di `tab-main`; ia punya tab sendiri.
- Sidebar (`renderSettingsTabs`) dikelompokkan berurutan: **Dasar**, **Commands Lucy** (hanya di halaman profil), **Fitur Lucy**, **Sistem**. Grup "Commands Lucy" dan tab `tab-lucy-commands`/`tab-lucy-fixed` hanya dirender bila `config.viewingProfileId` ada (control panel tidak memilikinya).
- Custom Commands 1–3 ada di `tab-lucy-commands` (`renderLucyCommandCards`); pasangan tetap `lb`+`lh` ada di `tab-lucy-fixed` (`renderFixedCommandCard`). Keduanya diekspor dari `settingsTabs.js`.
- Halaman profil menampilkan **scope bar** (`renderScopeBar` di `page.js`) di atas kartu statistik: segmen per-akun (tanpa "Semua Akun") yang berpindah lewat `/?profileId=<id>`.
- Kartu statistik (`dashboardStatsCard.js`) menerima `{ scopeName }` dan menempelkan nama akun pada label Uptime/Status Info/Total Command. `page.js` mengirim `viewingProfileName` di halaman profil, atau nama akun dari `config.token` di control panel.
- Savebar tetap (`#unsavedSave`, `#unsavedCancel`, `#unsavedBanner`) di `page.js` + `.save-toast`/`.scope-bar` di `styles.js`; counter `dirtyCount`/`trackUnsaved()` menandai perubahan form yang belum disimpan.
- Navigation buttons live in the action group: control panel shows **🔐 IZIN SLOT AKUN** and **👤 HALAMAN PROFIL** (links to the main/first saved profile); the profile page shows **⌂ MENU UTAMA**. The "HALAMAN PROFIL" target is `activeProfileId` when it is a saved profile, else the first saved profile.
- The `tab-main` menu/select label is context-aware: `🏠 Menu Utama` on the control panel, `👤 Profil Akun` on a profile page (`mainTabLabel` in `renderSettingsTabs`).
- Statistics, bot info (`#userProfileBox`), and logs render outside the tab container, so they are always visible on both modes.
- Layout (v7): sidebar kiri **permanen** (250px) + **topbar** sticky dengan nama akun, status pill, dan tombol START/PAUSE (`form="configForm"`). Di layar < 861px sidebar berubah jadi drawer (tombol ☰ di topbar, `toggleSettingsMenu`), dan topbar menyembunyikan nama/pill/aksi. CSS-nya di blok `/* ===== v7 layout ===== */` `styles.js`; markup topbar di `renderPage` (`page.js`), sidebar di `renderSettingsTabs` (`settingsTabs.js`).

## Dashboard profile actions

- The MULTI ACCOUNT chips (`profileAction=connect|start|pause:<id>`) live inside the main `#configForm`, so clicking one submits the ENTIRE control-panel form. `POST /save` must therefore treat these as status-only: it toggles the target account (`connectAccount`/`setAccountStatus`) and never runs `applySave` on the target profile, otherwise the panel fields (token/settings/otherCommands) overwrite and reset that profile's own config.
- Only the profile page's own top buttons (`action=connectProfile|startProfile|pauseProfile`, submitted with `viewingProfileId`) apply the form to the profile being edited.
- The `🔐 TEMPLATE TOKEN / KONFIG UTAMA` card (a `name="token"` input in the Main tab) was removed: `applySave` no longer assigns `config.token`, so a submitted `token` field is ignored. The main account's token comes only from `config.json`; new/rotated tokens are added through the MULTI ACCOUNT "MASUKKUN TOKEN AKUN BARU" form (`newToken` → `newProfile`).
- `createSlotPermissionGuard` still rewrites `body.token` to the target profile's token for chip actions (legacy from the removed template-token card); it is now unused but harmless.

## Fixed Commands lb/lh (satu unit)

- Fixed Commands `lb` + `lh` adalah SATU UNIT, persis seperti `battle()` lama yang mengirim `wb` lalu `wh`: teks **hardcode**, dan `config.fixedCommands` adalah SATU objek `{ channelId, delayMinMs, delayMaxMs, count, enabled }` — BUKAN `{ lb, lh }` per-slot. Karena cuma ada satu channel/delay/count/enabled, mustahil ada "lh kosong" atau "lb kosong" yang berbeda.
- `normalizeFixedCommands` memigrasikan config lama `{ lb, lh }` ke unit tunggal (channel = `lb` || `lh`, enabled = either) saat dimuat, jadi config lama tetap jalan tanpa diubah manual.
- Runtime: `_getRotation()` cek `config.fixedCommands.enabled` + `channelId` sekali saja. `otherCommand`/`startOtherCommand` untuk index 3/4 delegate ke leader (index 3); `startAll` memulai unit sekali lewat leader. STOP di salah satu slot menghentikan unitnya.
- `send()` for the pair (`'Other Command 4'` = lb, `'Other Command 5'` = lh) goes through `runLucyAction(..., { skipRetry: true })`, so pairs run sequentially in the same Lucy action queue as Adventure/Gems (no overlap, cooldown wait honored) WITHOUT registering a cooldown retry action (prevents duplicate `lh` if Lucy asks "pelan-pelan").
- UI (halaman utama): SATU kartu "Command Tetap: lb + lh" dengan input `other4*` saja (delay/count/channel) — membaca/menulis `config.fixedCommands` langsung. `other5*` tidak dirender.
- `setSlotEnabled` untuk index 3 atau 4 (atau key `fixedlb`/`fixedlh`) menyalakan/mematikan unit yang sama.
- `_otherCommandPair` memakai kunci `state.fixedPairBusy` (busy-lock `while (state.fixedPairBusy) await wait(0)`), sama seperti `battle()` di `main` yang mengunci `wb`→`wh`. Ini mencegah dua START berdekatan (tombol + `startAll`/`reconcile`) saling menyisip dan menghasilkan `lb,lb,lh,lh` (lh tanpa lb pendamping). `lh` hanya dikirim bila `lb` benar-benar terkirim dan tidak sedang monster-catch/istirahat.

## Izin Slot Akun (slot permissions)

- Owner page `/owner/slots` (link "🔐 IZIN SLOT AKUN" di halaman utama) dikelola `src/dashboard/services/slotPermissionManager.js` + `src/dashboard/slotPermissionRoutes.js`; guard `createSlotPermissionGuard` menjaga `POST /save`.
- Store `slot-permissions.json`: `{ grants: { <discordId>: { status, note, durationHours, createdAt, usedAt, expiresAt } } }`. Status: `available` → `used` → `revoked`.
- `grant(accountId, note, durationHours)` menerima durasi jam (kosong/0 = tanpa batas). `consume()` menghitung `expiresAt = usedAt + durationHours` (hitung mulai saat akun benar-benar ditambahkan, bukan saat grant dibuat).
- `listExpired(now)` mengembalikan grant `used` yang lewat `expiresAt`; `expire(accountId)` menandainya `revoked` + `revokedReason: 'expired'` sehingga ID bisa diberi izin ulang.
- `createSlotExpirySweeper(...)` di `slotPermissionRoutes.js` melakukan teardown yang sama dengan revoke grant `used` (via helper `teardownUsedGrant`): `logoutAccount` → `deleteProfile` → hitung ulang `maxAccounts` → `reconcile`. Dijalankan tiap 60 detik dari `src/dashboard/app.js` (timer `.unref()` agar tidak menahan proses saat test).
- Test: `test/slot-permissions.test.js` (grant/consume/durasi/expiry/sweeper).

## Auto Boss2 (Guild-only)

- `src/managers/boss2.js` sekarang **hanya menangani Guild Boss**. Deteksi/penanganan Global Boss (teks "Global Raid Boss ...", state `kind: 'global'`, saldo tiket Global) sudah dihapus.
- `parseRaidMessage` mengembalikan `kind: 'guild'` atau `null`; pesan Global (yang tidak memuat `settings.appearText`/`defeatedText`) diabaikan. `settings.appearText`/`defeatedText` default kini ber-prefix "Guild ..." (`src/constants.js`), dan `globalAppearText`/`globalDefeatedText` sudah dihapus.
- `parseTicketStatusMessage` hanya membaca bagian **Ticket Boss Guild** → `{ guild: {left,max} }`. Dispatcher menerima balasan status jika `status.guild` ada (tidak lagi mensyaratkan `status.global`).
- Keputusan tiket (`handleTicketConfirmation` KASUS C) tetap mengambil saldo dari **channel privat** (`ticketStatusChannelId`, perintah `lboss t`) — angka di prompt konfirmasi TIDAK dipakai. Yang dibaca hanya `inventory.guild.left`; `inventory.global` diabaikan.
- Syarat "Fights per Boss" (`canFightMore`) **tetap dipertahankan** sesuai permintaan user.
- Tes: `test/boss2.test.js` (13 tes). Fixture `setup()`/`createMessage()` memakai `author.id = CONSTANTS.LUCY_BOT_ID` dan `state.client.user.id` berbeda supaya lolos gate Lucy-only. Dua tes baru memverifikasi keputusan tiket memakai saldo Guild dan mengabaikan Global.
