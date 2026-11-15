# Slot permission controls

The dashboard can share access while keeping account creation under the owner's control.

## Enable owner controls

Choose one of these methods. The owner password must be private and at least 12 characters long. Do not reuse the dashboard login password.

### Hosting panel with environment variables

Set `SLOT_OWNER_PASSWORD` to your private password in the hosting panel, then restart the application.

### Hosting panel with File Manager only

Create a plain-text file named `slot-owner-password.txt` in the bot's project root (the same folder as `package.json`). Put only your private password in the file, save it, and restart the bot. Keep this file private; it is ignored by Git and must never be committed or shared. If both the environment variable and file are present, the environment variable takes precedence.

Open the dashboard and choose **IZIN SLOT AKUN**, or visit `/owner/slots`.

## Grant one account

1. Ask the recipient for the Discord User ID of the account they will add.
2. On the owner page, enter that ID and optionally add a note for the donation.
3. Optionally set **Durasi izin (jam)** — for example `24` for a 24-hour grant. Leave it empty (or `0`) for a grant that never expires.
4. Choose the **Tier** for the slot: **Premium** (default) or **Reguler**. The tier only changes features and delays; it never changes the grant duration.
5. Confirm using the owner password.
6. The recipient can then add that account once through the existing new-account form.

An unused grant is stored in `slot-permissions.json`. After successful account creation it is marked `used`, and cannot be used to add a different account. A token refresh for an account already saved does not consume another grant.

You can change an account's tier later with the **Tier** action on the owner page. The new tier applies the next time the account's settings are saved or the account is started.

## Tiers: Premium vs Reguler

There is no quota. The owner decides how many slots to grant. The tier is set when a slot is granted and only differentiates features and delays.

| Setting | Premium | Reguler |
| --- | --- | --- |
| Custom Commands delay (lower bound) | from 5 seconds | minimum 16 seconds |
| Command Tetap (lb + lh) delay | locked 15–16 seconds | locked 17–20 seconds |
| Delay after captcha is verified | none (continues immediately) | waits 10 seconds |
| Premium-only features (Auto Adventure, Lucy Daily, Send Cookie) | allowed | disabled |

The main account is always Premium. Accounts without a grant record, or with legacy data, are treated as Premium so existing behaviour does not change.

Command Tetap (lb + lh) is a single locked unit: the delay is locked per tier (Premium 15–16 seconds, Reguler 17–20 seconds) and cannot be customized. Only the target channel and the send count are editable.

## Fixed delays for all accounts

These delays are the same for every account and tier:

- **Rest, Mode 1 (schedule)**: the rest duration is locked to 3 hours; pick the start time and the end time is computed automatically (end = start + 3 hours).
- **Rest, Mode 2 (budget)**: the default total rest budget is 3 hours (180 minutes).

## Delay after a captcha (per tier)

After a captcha/password is verified, the resume delay follows the account's tier:

- **Premium**: continues immediately, with no extra delay.
- **Reguler**: waits 10 seconds before the loops continue. This applies to **Monster Catcher** (after the captcha is confirmed) and **Huntbot2** (after the "siap berburu" trigger).

## Duration and automatic removal

When a grant has a duration, the countdown starts at the moment the account is added (the grant is consumed), not when the grant was created. The owner page shows the expiry time in the **Berakhir** column.

A background check runs every minute. When a `used` grant passes its expiry time, the account is removed automatically — the same teardown as revoking a used grant: the runtime is stopped, the saved profile is deleted, and the account-slot count is recalculated. The grant is then marked `revoked` (with reason `expired`), so the Discord User ID can be granted access again later.

A grant with no duration (empty or `0`) never expires and is only removed by manual revoke.

Revoking an unused grant disables it. Revoking a used grant also removes the associated saved profile and requests its runtime to stop.

## Security notes

- The owner password is separate from dashboard HTTP Basic Auth.
- The guard checks requests server-side; hiding a button is not the security boundary.
- Changing the main token to a different account cannot be used as a shortcut around the grant check.
- The existing four-account ceiling is unchanged. This feature does not increase the hard maximum.
- Existing saved accounts are not retroactively locked by this feature.
