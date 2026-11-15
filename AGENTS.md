# AGENTS.md

Discord selfbot RPG "Lucy". Node.js, tanpa build step untuk menjalankan bot.

## Perintah

- Jalankan seluruh test: `npm test` (memakai `node --test`).
- Jalankan satu file test: `node --test test/<nama>.test.js`.
- Dashboard: `src/dashboard/` (Express + HTML string yang di-render manual).

## Catatan test

Ada 4 test yang gagal di kondisi baseline (bukan akibat perubahan baru):

- `test/lucy-cooldown.test.js`: "schedules the same action after its timestamp and buffer", "parser ignores messages from other authors".
- `test/dashboard-save.test.js`: "POST /save persists Auto Boss2 settings...", "POST /save persists Auto Use Gems settings...".

Selalu bandingkan hasil test dengan baseline ini sebelum menyimpulkan ada regresi.

## Konvensi penting

- Angka kebijakan (cooldown, jeda) terpusat di `src/constants.js`.
- Normalizer (`src/managers/commandSlots.js`) tidak boleh mengunci delay internal; penguncian delay Command Tetap dilakukan lewat `lockFixedDelay` saat config dimuat/dijalankan, agar test loop tetap bisa memakai jeda kecil.
- Manajer dengan timer (Monster Catcher, Huntbot2) menerima opsi injeksi delay (mis. `resumeDelayMs`, `readyDelayMs`) supaya test tidak menunggu waktu nyata.
- Tier izin slot (Premium/Reguler) hanya membedakan fitur dan delay, bukan durasi izin. Kebijakannya di `src/tierPolicy.js` (netral); `src/dashboard/services/tierPolicy.js` hanya re-export.
- Command Tetap (lb + lh) dikunci per tier (Premium 15–16 dtk, Reguler 17–20 dtk); jeda setelah captcha juga per tier (Premium tanpa jeda, Reguler 10 dtk). Tier disimpan di `config.accountTier` saat `/save` agar runtime memakai kebijakan sama.
- Penegakan tier terjadi di sisi server (`/save` memanggil `applyTierPolicy`); UI hanya menonaktifkan kontrolnya (`settingsTabs.js`, tanda `🔒 Premium`) sebagai lapis kedua.
