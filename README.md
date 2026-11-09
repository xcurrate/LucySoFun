# LucySoFun

LucySoFun adalah selfbot Discord yang dikhususkan sepenuhnya untuk **Lucy** — bot RPG universal (game "Lucy") dengan automasi lengkap, dashboard web, dan dukungan multi-profile.

> Project ini sebelumnya dikenal sebagai *Multi-together* dan mendukung dua bot (OwO & Lucy). Seluruh implementasi khusus OwO telah dihapus permanen; sekarang project hanya berisi fitur, konfigurasi, dan integrasi untuk Lucy.

## Fitur

- 🐲 **Auto Boss2** — deteksi kemunculan boss, auto-fight, konfirmasi tiket Guild, dan status tiket.
- 💎 **Auto Use Gems** — pemakaian otomatis lootbox/gems berdasarkan prioritas dan tier.
- 🗺️ **Auto Adventure** — loop adventure (`ladv`) mandiri dengan dukungan pause saat memilih map.
- 🤖 **Huntbot2** — automasi huntbot Lucy.
- 🐾 **Monster Catcher** — mengetik otomatis kode 6 karakter (huruf kapital + angka) dari gambar sensor (OCR via `TooEz2.js`) dan menyelesaikan siklus catch.
- 🔊 **Voice Channel** — bergabung/keluar voice channel secara otomatis (dan via perintah `vjoin`/`vleave`).
- 🧩 **Custom Commands** — 3 loop perintah kustom dengan delay, count, dan channel masing-masing.
- 🎮 **Lucy Control** — kata kunci start/pause via Discord untuk menghidupkan/mematikan seluruh fitur Lucy.
- 😴 **Auto Rest** — jadwal istirahat (sleep schedule) dan budget istirahat harian.
- 🔎 **Message Debug** — menangkap dan menampilkan pesan Discord untuk keperluan debugging.
- 🛡️ **Safety / Message Filter** — filter pesan, mode CCTV (memantau mention/reply di channel yang diatur pada filter pesan), dan proteksi akun.
- 📊 **Dashboard Web** — kontrol penuh melalui browser (lihat di bawah).

## Persyaratan

- Node.js 18+ (direkomendasikan 20 LTS)
- Token akun Discord (selfbot)

> ⚠️ **Catatan etika & risiko:** Selfbot melanggar [Terms of Service Discord](https://discord.com/terms). Penggunaan dilakukan sepenuhnya atas risiko Anda sendiri. Project ini ditujukan untuk penggunaan pribadi.

## Instalasi

```bash
npm install
nano config.json   # isi token & pengaturan lain (lihat contoh di bawah)
npm start          # atau: node index.js
```

Setelah itu buka dashboard:

```bash
# URL dashboard
http://localhost:4002
```

## Konfigurasi

Salin `config.json` sebagai basis konfigurasi. Contoh struktur utama:

```jsonc
{
  "port": 2028,
  "token": "TOKEN_AKUN_DISCORD",
  "botStatus": { "running": false, "paused": true },
  "maxLogLines": 15,
  "settings": {
    "lucyControl": {
      "start": "lucy start",
      "pause": "lucy pause",
      "allowIds": []
    },
    "adventure": { "enabled": false, "channelId": "", "guildId": "" },
    "messageFilter": { "enabled": true, "channelIds": [], "guildIds": [], "debug": false },
    "messageDebug": { "enabled": false, "targetId": "", "channelId": "", "guildId": "" },
    "telegram": { "token": "", "chatId": "" },
    "voice": { "enabled": false, "channelId": "" },
    "boss2": {},
    "gems": {},
    "huntbot2": {},
    "monsterCatcher": {},
    "rest": {}
  },
  "safety": { "cctv": false },
  "multiAccount": { "enabled": true, "maxAccounts": 3 },
  "otherCommands": [
    { "text": "", "delayMs": 5000, "count": 1, "channelId": "", "enabled": false },
    { "text": "", "delayMs": 5000, "count": 1, "channelId": "", "enabled": false },
    { "text": "", "delayMs": 5000, "count": 1, "channelId": "", "enabled": false }
  ],
  "fixedCommands": {
    "lb": { "channelId": "", "delayMs": 5000, "count": 0, "enabled": false },
    "lh": { "channelId": "", "delayMs": 5000, "count": 0, "enabled": false }
  }
}
```

Semua pengaturan diatur melalui dashboard pada tab masing-masing. Properti konfigurasi legacy dari bot OwO (mis. `macrodroidId`, `autosolver`, `twoCaptchaKey`, `settings.control`, `settings.channelRotation`, `delays`, `captcha`, `tiketandhb`, `huntbot`, `boss`) akan **dibersihkan otomatis** saat project dimuat dan tidak lagi dipakai.

### Lucy Control via Discord

- Default kata start: `lucy start` → menghidupkan Boss2, Gems, Adventure, Huntbot2, Monster Catcher, dan Custom Commands.
- Default kata pause: `lucy pause` → mematikan semuanya.
- Dibatasi hanya untuk ID yang terdaftar di `settings.lucyControl.allowIds` (dan akun bot itu sendiri).

### Perintah Voice

- `vjoin <channelId>` — join voice channel.
- `vleave` — keluar dari voice channel server.

## Dashboard

Dashboard menyediakan:

- **Profile Manager** — multi-profile dengan `?profileId=<id>`, PIN per-profile, dan simpan buka/kunci.
- **Control Panel** — START/PAUSE ALL, start/pause per-akun.
- **Tab pengaturan Lucy** — Auto Boss2, Auto Use Gems, Auto Adventure, Huntbot2, Monster Catcher, Voice Channel, Kontrol Lucy.
- **Menu Utama (control panel)** — kartu Multi Account (daftar akun, indikator slot, dan form "MASUKKUN TOKEN AKUN BARU") + tombol **👤 HALAMAN PROFIL** menuju profil akun utama.
- **Halaman Profil** (`?profileId=<id>`) — kartu Custom Commands (3 loop kustom) dan Command Tetap (pasangan `lb` + `lh` yang selalu dikirim berurutan `lb` → "sedang mengetik" → `lh` sebagai satu unit), dengan tombol **⌂ MENU UTAMA** untuk kembali.
- **Tab umum** — Menu Utama/Profil Akun (sesuai halaman), Notifikasi (Telegram), Integrasi Sistem, Safety & Filter, Istirahat, Debug Pesan, Kontrol & Sistem.
- **Statistik, info bot, dan logs** tampil di bawah form dan selalu terlihat di kedua halaman.

### Autentikasi

Dashboard menggunakan **Basic Auth bersama** untuk semua profile:

- Default: `dashboard` / `zuya2000`
- Diganti lewat environment: `DASHBOARD_USERNAME` dan `DASHBOARD_PASSWORD`

Selain itu, setiap profile dapat dikunci dengan PIN per-profile melalui menu Profile.

### Multiple Profile

- `profiles/config_<id>.json` — konfigurasi tiap profile.
- `profiles/meta.json` — metadata profile manager.
- Akses dashboard profile dengan `?profileId=<id>`.

## Testing

```bash
npm test
```

Menjalankan seluruh suite test (`node --test test/*.test.js`).

## Struktur Proyek

```
index.js                        # entry point
dashboard.js                    # starter server dashboard
logger.js                       # logger terpusat (WIB, buffer, keyword penting)
config.json                     # konfigurasi utama
profiles/                       # konfigurasi per-profile
src/
  core/                         # wrapper runtime (accountRuntime, multiAccount, client)
  managers/                     # logic fitur (boss2, gems, adventure, huntbot2, monsterCatcher,
                                #   voice, rest, command, loop, message...) + OCR TooEz/TooEz2
  services/                     # layanan pendukung (config, stats, telegram, dashboard services)
  dashboard/                    # aplikasi web dashboard
test/                           # unit tests
```

## Lisensi

Hanya untuk penggunaan pribadi. Seluruh risiko penggunaan terhadap kebijakan Discord ditanggung pengguna.