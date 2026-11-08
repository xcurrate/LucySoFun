# Project Notes

## LucySoFun (Lucy-only Discord selfbot)

- **Stack**: Node.js Discord selfbot (`discord.js-selfbot-v13`), Express dashboard in `src/dashboard/`, managers in `src/managers/`, runtime in `src/core/accountRuntime.js`.
- This project is dedicated exclusively to the **Lucy** bot. All OwO-specific code (huntbot, boss, captcha, channel rotation, daily reset, battle/hunt/pray/custom loops, control words) has been removed.
- **Tests**: `node --test test/*.test.js` (or `npm test`). Some pre-existing failures are unrelated to new work:
  - `gems`, `boss2`, `adventure`, `lucy-cooldown`, and two `dashboard-save` tests were already failing (as of branch `main` at `c61ef1f`).
  - When adding features, run the full suite and compare `fail` count against the baseline before/after.
- Usage/installation docs live in `README.md` (created during the Lucy-only refactor; the repo previously had no README).

## Custom Command Lucy loop (Other Commands)

- Slot state lives in `config.otherCommands[]` (`text`, `delayMs`, `count`, `channelId`, `enabled`). `startOtherCommand`/`stopOtherCommand`/`startAll`/`stopAll` live in `src/managers/loop.js`.
- Loop gating: `pauseMonsterCatch`/`resumeMonsterCatch` and rest use per-slot delay objects `state.otherCommandDelays[key]` with `remainingMs` so a paused loop resumes with its remaining delay. `clearOtherCommandTimers(index)` clears timers WITHOUT disabling or persisting the slot (used by `startAll`).
- `startAll()` MUST NOT disable slots: it clears running timers then starts every `enabled` slot, so `activateReadyRuntime` (account connect/reconcile/rest-end/config-change) resumes enabled commands. `stopAll`/`stopOtherCommand` DO disable + persist (correct for pause/stop).
- Custom command sends go through `send`/`sendRaw` in `src/managers/command.js` with `allowWhilePaused: true`. Every successful `Other Command X` send (custom 1–3 AND the fixed lb/lh pair 4–5) arms a single Lucy-response emergency timeout via `setLucyResponseTimeout(type)`; the guard `if (state.lucyResponseTimeout) return` ensures at most ONE 40s timeout is armed per pair (lb arms it, lh is skipped). The timeout is cancelled only by a Lucy message in the command's own channel (`state.lastLucyCommandChannelId`) that includes our per-server username (content or embeds), and otherwise fires `emergencyHandler.pause(...)` for that account only; the `linv` recovery probe runs every 10 minutes and `startAll` resumes the same slots.
- `count` empty/`0` = infinite loop; a positive count stops the slot after that many successful sends and sets `enabled=false` (persisted).
- Lucy feature OCR decoders: root `neo3.js` (Monster Catcher) and `src/managers/TooEz.js` (Huntbot2 password images).

### TooEz (Huntbot2 password OCR) — font-based, disk-cached

Letter templates are built by **rendering glyphs from the `.otf` fonts** in `src/managers/fonts/` (measurably more accurate than the old base64-template approach). The work is split in two so the runtime stays light:

- **Build step** — `src/managers/TooEz.build.js` (`npm run build:templates`) uses `opentype.js` + `@napi-rs/canvas` to render every charset letter and writes the masks to `src/managers/fonts/templates.json` (base64, ~670 KB, committed). Re-run it after changing/adding a font.
- **Runtime** — `src/managers/TooEz.js` reads `templates.json` and needs only `pngjs`. It deliberately does NOT require the font engine, which keeps RAM low (font engine + render cost ~57 MB). It caches the parsed masks in memory after the first read and warns if the cache is older than a font file.
- Public contract used by `Huntbot2.js`: `TooEz.decodeBuffer(buffer)` -> 6-letter password string, or `null` if any character is unrecognized. Also exported: `decodeLetters(buffer)`, `getTemplates()`, `TEMPLATE_FILE`.
- Set `TOOEZ_DEBUG=1` to dump detected blobs to `./dump/`.
- Dependencies: runtime `pngjs`; build-only `opentype.js`, `@napi-rs/canvas` (both in `package.json`).
- Tests: `test/tooez.test.js` covers the export contract, disk-cache loading, that the runtime avoids the font engine, per-letter templates, round-trip decode, scoring, and the null path.

## Lucy bot integrations

- Lucy's Discord user id: `1438615298012872817` (`CONSTANTS.LUCY_BOT_ID` in `src/constants.js`).
- Lucy features live on the dashboard "Lucy" settings group (`renderLucySettings` in `src/dashboard/ui/settingsTabs.js`); each is a manager in `src/managers/` wired through `src/core/accountRuntime.js` and handled from `src/managers/message.js` `handle`/`handleUpdate`.
- Text matching against Lucy messages should always normalize invisible characters first:
  `messageText(msg)` in `src/managers/monsterCatcher.js` does `removeInvisibleChars(...).toLowerCase()` over content, components, and embed texts.

## Monster Catcher (neo3.js)

- Manager: `src/managers/monsterCatcher.js`; OCR decoder: root `neo3.js` (`decodeBuffer(pngBuffer)` → 6-char code or `null`). Depends on `pngjs` (already in package.json).
- Settings: `config.settings.monsterCatcher` via `normalizeMonsterCatcherSettings`; fields `enabled`, `autoPauseLoops`, `retryWaitMs`, `maxRetries`.
- State machine on `state.monsterCatcher`: status `IDLE / PAUSED / PROCESSING / WAITING_RETRY / RESUMING`, phases `idle / awaitingVerdict / awaitingRefresh / awaitingNewSensor`.
- Trigger texts (normalized): sensor `ketik 6 karakter pada gambar`, done `terima kasih, catch selesai`, mismatch `monsternya belum cocok`, refresh `monster perlu diperbarui`.
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

## Dashboard profile actions

- The MULTI ACCOUNT chips (`profileAction=connect|start|pause:<id>`) live inside the main `#configForm`, so clicking one submits the ENTIRE control-panel form. `POST /save` must therefore treat these as status-only: it toggles the target account (`connectAccount`/`setAccountStatus`) and never runs `applySave` on the target profile, otherwise the panel fields (token/settings/otherCommands) overwrite and reset that profile's own config.
- Only the profile page's own top buttons (`action=connectProfile|startProfile|pauseProfile`, submitted with `viewingProfileId`) apply the form to the profile being edited.
- `createSlotPermissionGuard` rewrites `body.token` to the target profile's token for chip actions, but it does not protect the other settings — the status-only rule above is what keeps the profile intact.

## Fixed Commands lb/lh (satu unit pasangan)

- Fixed Commands `lb` + `lh` adalah SATU UNIT: selalu dikirim berpasangan `lb` → typing (250-600ms) → `lh`. Tidak ada mode "sendiri".
- `normalizeFixedCommands` menyinkronkan `enabled` kedua slot (pairEnabled dari either) dan follower `lh` mewarisi channel/delay/count dari leader `lb` saat kosong.
- Runtime: `_getRotation()` selalu return rotation lengkap (leader lb + follower lh) saat unit aktif; `otherCommand`/`startOtherCommand` untuk index 3/4 delegate ke pair leader (index 3). `startAll` skip `lh` (rotation length 2) agar tak dikirim sendiri. STOP di salah satu slot menghentikan keduanya.
- `send()` for the pair (`'Other Command 4'` = lb, `'Other Command 5'` = lh) goes through `runLucyAction(..., { skipRetry: true })`, so pairs run sequentially in the same Lucy action queue as Adventure/Gems (no overlap, cooldown wait honored) WITHOUT registering a cooldown retry action (prevents duplicate `lh` if Lucy asks "pelan-pelan").
- UI (halaman utama): SATU kartu "Command Tetap: lb + lh" dengan input `other4*` saja (delay/count/channel); server menyinkronkan ke `lh` via `applySave`. `other5*` tidak lagi dirender.
- `setSlotEnabled` untuk fixed slot menyalakan/mematikan keduanya.
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
