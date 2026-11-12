const fs = require('fs');
const path = require('path');

const APP_ROOT = path.join(__dirname, '..');

const hasConfigFile = (dir) => fs.existsSync(path.join(dir, 'config.json'));

const hasSavedProfiles = (dir) => {
    try {
        return fs.readdirSync(path.join(dir, 'profiles'))
            .some(name => name.startsWith('config_') && name.endsWith('.json'));
    } catch {
        return false;
    }
};

// Bot menulis config.json/profiles relatif ke cwd-nya, sedangkan modul dashboard
// berada di dalam folder aplikasi. Keduanya bisa berbeda (mis. panel hosting
// menjalankan proses dari folder data terpisah), sehingga dashboard sempat
// menampilkan "0 akun" walau profil ada. Resolver ini memilih folder yang
// benar-benar memuat data bot agar bot dan dashboard selalu membaca lokasi sama.
const resolveBaseDir = (explicit) => {
    if (explicit) return explicit;
    const candidates = [process.cwd(), APP_ROOT];
    return candidates.find(hasSavedProfiles)
        || candidates.find(hasConfigFile)
        || process.cwd();
};

const SLOT_FILES = ['slot-permissions.json', 'slot-owner-password.txt'];

// File izin slot bersifat milik aplikasi dan bisa sudah ada di folder aplikasi
// (perilaku lama). Utamakan lokasi yang sudah memuat file itu agar tidak
// "berpindah" saat cwd berbeda dari folder aplikasi.
const resolveSlotDir = (baseDir) => {
    const candidates = [baseDir, process.cwd(), APP_ROOT];
    return candidates.find(dir => dir && SLOT_FILES.some(name => fs.existsSync(path.join(dir, name))))
        || baseDir;
};

module.exports = { resolveBaseDir, resolveSlotDir, APP_ROOT };
