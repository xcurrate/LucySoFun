# Project Notes

## LucySoFun (Lucy-only Discord selfbot)

- **Stack**: Node.js Discord selfbot (`discord.js-selfbot-v13`), Express dashboard in `src/dashboard/`, managers in `src/managers/`, runtime in `src/core/accountRuntime.js`.
- This project is dedicated exclusively to the **Lucy** bot. All OwO-specific code (huntbot, boss, captcha, channel rotation, daily reset, battle/hunt/pray/custom loops, control words) has been removed.
- **Tests**: `node --test test/*.test.js` (or `npm test`). Some pre-existing failures are unrelated to new work:
  - `gems`, `boss2`, `adventure`, `lucy-cooldown`, and two `dashboard-save` tests were already failing (as of branch `main` at `c61ef1f`).
  - When adding features, run the full suite and compare `fail` count against the baseline before/after.
- Usage/installation docs live in `README.md` (created during the Lucy-only refactor; the repo previously had no README).
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