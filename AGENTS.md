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
- Custom command sends go through `send`/`sendRaw` in `src/managers/command.js` with `allowWhilePaused: true`. Every successful `Other Command X` send (custom 1–3 AND the fixed lb/lh pair 4–5) arms a single Lucy-response emergency timeout via `setLucyResponseTimeout(type)`; the guard `if (state.lucyResponseTimeout) return` ensures at most ONE 40s timeout is armed per pair (lb arms it, lh is skipped). The timeout is cancelled only by a Lucy message in the active channel that includes our per-server username (content or embeds), and otherwise fires `emergencyHandler.pause(...)` for that account only; the `linv` recovery probe runs every 10 minutes and `startAll` resumes the same slots. `state.lastLucyCommandChannelId` records the channel used so timeout/probe checks target the same server.
- `count` empty/`0` = infinite loop; a positive count stops the slot after that many successful sends and sets `enabled=false` (persisted).
- Lucy feature OCR decoders: root `neo3.js` (Monster Catcher) and `src/managers/TooEz.js` (Huntbot2 password images). Both contain only base64 PNG template data; the "owo" snippet inside them is incidental base64, not an OwO reference.

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
## Fixed Commands lb/lh (satu unit pasangan)

- Fixed Commands `lb` + `lh` adalah SATU UNIT: selalu dikirim berpasangan `lb` → typing (250-600ms) → `lh`. Tidak ada mode "sendiri".
- `normalizeFixedCommands` menyinkronkan `enabled` kedua slot (pairEnabled dari either) dan follower `lh` mewarisi channel/delay/count dari leader `lb` saat kosong.
- Runtime: `_getRotation()` selalu return rotation lengkap (leader lb + follower lh) saat unit aktif; `otherCommand`/`startOtherCommand` untuk index 3/4 delegate ke pair leader (index 3). `startAll` skip `lh` (rotation length 2) agar tak dikirim sendiri. STOP di salah satu slot menghentikan keduanya.
- `send()` for the pair (`'Other Command 4'` = lb, `'Other Command 5'` = lh) goes through `runLucyAction(..., { skipRetry: true })`, so pairs run sequentially in the same Lucy action queue as Adventure/Gems (no overlap, cooldown wait honored) WITHOUT registering a cooldown retry action (prevents duplicate `lh` if Lucy asks "pelan-pelan").
- UI (halaman utama): SATU kartu "Command Tetap: lb + lh" dengan input `other4*` saja (delay/count/channel); server menyinkronkan ke `lh` via `applySave`. `other5*` tidak lagi dirender.
- `setSlotEnabled` untuk fixed slot menyalakan/mematikan keduanya.
