# Project Notes

## Multi-together (OwO selfbot)

- **Stack**: Node.js Discord selfbot (`discord.js`), Express dashboard in `src/dashboard/`, managers in `src/managers/`, runtime in `src/core/accountRuntime.js`.
- **Tests**: `node --test test/*.test.js` (or `npm test`). Some pre-existing failures are unrelated to new work:
  - `gems`, `boss2`, `adventure`, `lucy-cooldown`, and two `dashboard-save` tests were already failing (as of branch `main` at `c61ef1f`).
  - When adding features, run the full suite and compare `fail` count against the baseline before/after.

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
  - `loopManager.pauseMonsterCatch()` sets `state.monsterCatchPaused`, clears main-loop timers (`battle/hunt/pray/custom1/custom2`) leaving `state.nextAt[key]` (remaining delay) intact, and pauses other-command delays with `reason: 'monster'`.
  - `loopManager.resumeMonsterCatch()` re-schedules every main loop with its saved remaining delay and resumes other-command delays.
  - `command.js` `sendRaw` blocks normal commands while `state.monsterCatchPaused`; Monster Catcher DM replies pass via `options.allowDuringMonsterCatch: true`.
- Mon Catcher manager must only handle DM messages from Lucy; dedupe uses a bounded `Set` of processed message ids (`state.monsterCatcher.processedMessageIds`).
- Dashboard: `/api/monster-catcher-status` route in `src/dashboard/routes.js`; live status chip in the Monster Catcher settings tab polled by `src/dashboard/ui/scripts.js` (`refreshMonsterCatcher`).