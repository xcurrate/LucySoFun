const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

// Varian TooEz untuk Monster Catcher: charset huruf KAPITAL + angka (0-9).
// Template dimuat dari cache disk (fonts/templates-alnum.json) yang dibuat oleh
// `npm run build:templates:alnum`. Runtime ini sengaja TIDAK memakai opentype.js /
// @napi-rs/canvas supaya hemat RAM; font engine hanya dipakai oleh build script.
const TEMPLATE_FILE = path.join(__dirname, 'fonts', 'templates-alnum.json');

const AMBANG_WARNA = 150;
const LUAS_MINIMUM = 10;
// Ukuran kanvas normalisasi. Nilai sebenarnya diambil dari cache template
// (payload.size) saat dimuat, supaya bentuk input selalu punya dimensi yang
// sama dengan mask yang tersimpan.
let UKURAN = 96;
const ROTASI_MIN = -45;
const ROTASI_MAX = 45;
const ROTASI_STEP = 3;
const AMBANG_COCOK = 0.45;

// Ukuran relatif tiap template diambil dari mask-nya sendiri (tidak bergantung
// font), dipakai untuk memutuskan pasangan yang bentuknya nyaris sama
// (mis. 0/O): glyph yang lebih sempit/lebih tipis cenderung angka.
function rasioAspek(mask) {
    let minX = UKURAN, minY = UKURAN, maxX = -1, maxY = -1;
    for (let y = 0; y < UKURAN; y++) {
        for (let x = 0; x < UKURAN; x++) {
            if (!mask[y * UKURAN + x]) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    if (maxX < minX || maxY < minY) return 0;
    return (maxX - minX + 1) / (maxY - minY + 1);
}

// Pasangan karakter yang bentuknya mudah tertukar (mis. 0/O, 6/G). Disimpan
// sebagai referensi tuning; TIDAK dipakai lagi di jalur decode (lihat catatan
// di cocokkanObjek).
const GRUP_MIRIP = [
    ['0', 'O'],
    ['1', 'I'],
    ['2', 'Z'],
    ['5', 'S'],
    ['6', 'G'],
    ['8', 'B']
];

// Template di-cache di memori setelah dibaca dari disk (sekali per proses).
let templateCache = null;

// Baca gambar PNG
function bacaPNG(buffer) {
    return PNG.sync.read(buffer);
}

function jarakWarna(a, b) {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

// Ambil warna latar dari empat sudut gambar
function deteksiLatar(img) {
    const titik = [
        [0, 0],
        [img.width - 1, 0],
        [0, img.height - 1],
        [img.width - 1, img.height - 1]
    ];
    const warna = titik.map(([x, y]) => {
        const i = (y * img.width + x) * 4;
        return [img.data[i], img.data[i + 1], img.data[i + 2]];
    });
    return [0, 1, 2].map(c =>
        Math.round(warna.reduce((s, w) => s + w[c], 0) / 4)
    );
}

// Segmentasi piksel yang berbeda dari warna latar
function segmentasi(img, latar) {
    const { width, height, data } = img;
    const mask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            if (data[i + 3] === 0) continue;
            const d = jarakWarna([data[i], data[i + 1], data[i + 2]], latar);
            if (d > AMBANG_WARNA) mask[y * width + x] = 1;
        }
    }
    return mask;
}

// Cari komponen terhubung menggunakan BFS
function cariObjek(mask, width, height) {
    const dikunjungi = new Uint8Array(mask.length);
    const objek = [];
    const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
    const dy = [-1, -1, -1, 0, 0, 1, 1, 1];
    for (let awal = 0; awal < mask.length; awal++) {
        if (!mask[awal] || dikunjungi[awal]) continue;
        const antrean = [awal];
        dikunjungi[awal] = 1;
        let minX = width, minY = height, maxX = 0, maxY = 0;
        const piksel = [];
        for (let q = 0; q < antrean.length; q++) {
            const pos = antrean[q];
            const x = pos % width;
            const y = Math.floor(pos / width);
            piksel.push(pos);
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            for (let n = 0; n < 8; n++) {
                const nx = x + dx[n];
                const ny = y + dy[n];
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                const np = ny * width + nx;
                if (mask[np] && !dikunjungi[np]) {
                    dikunjungi[np] = 1;
                    antrean.push(np);
                }
            }
        }
        if (piksel.length < LUAS_MINIMUM) continue;

        const w = maxX - minX + 1;
        const h = maxY - minY + 1;

        // Tolak noise: terlalu tipis (garis), atau terlalu kecil tingginya
        if (w < 3 || h < 3) continue;
        if (w / h > 5 || h / w > 5) continue;

        objek.push({ piksel, minX, minY, maxX, maxY, luas: piksel.length });
    }
    return objek.sort((a, b) => a.minX - b.minX);
}

// Normalisasi bentuk ke kanvas persegi tanpa mengubah rasio
function normalisasi(mask, width, height) {
    const hasil = new Uint8Array(UKURAN * UKURAN);
    const padding = 12;
    const area = UKURAN - padding * 2;
    const scale = Math.min(area / width, area / height);
    const nw = Math.max(1, Math.round(width * scale));
    const nh = Math.max(1, Math.round(height * scale));
    const ox = Math.floor((UKURAN - nw) / 2);
    const oy = Math.floor((UKURAN - nh) / 2);
    for (let y = 0; y < nh; y++) {
        for (let x = 0; x < nw; x++) {
            const sx = Math.min(width - 1, Math.floor(x * width / nw));
            const sy = Math.min(height - 1, Math.floor(y * height / nh));
            if (mask[sy * width + sx]) hasil[(oy + y) * UKURAN + ox + x] = 1;
        }
    }
    return hasil;
}

// Putar + normalisasi
function rotasiDanNormalisasi(mask, width, height, angle) {
    const rad = angle * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const size = Math.ceil(Math.sqrt(width * width + height * height)) + 4;
    const source = new Uint8Array(size * size);
    const offsetX = Math.floor((size - width) / 2);
    const offsetY = Math.floor((size - height) / 2);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (mask[y * width + x]) source[(offsetY + y) * size + offsetX + x] = 1;
        }
    }
    const rotated = new Uint8Array(size * size);
    const center = (size - 1) / 2;
    let minX = size, minY = size, maxX = -1, maxY = -1;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = x - center;
            const dy = y - center;
            const sx = Math.round(cos * dx + sin * dy + center);
            const sy = Math.round(-sin * dx + cos * dy + center);
            if (sx < 0 || sx >= size || sy < 0 || sy >= size) continue;
            if (source[sy * size + sx]) {
                rotated[y * size + x] = 1;
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
    }
    if (maxX < minX || maxY < minY) return new Uint8Array(UKURAN * UKURAN);
    const rw = maxX - minX + 1;
    const rh = maxY - minY + 1;
    const crop = new Uint8Array(rw * rh);
    for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
            crop[y * rw + x] = rotated[(minY + y) * size + minX + x];
        }
    }
    return normalisasi(crop, rw, rh);
}

// Bandingkan dua mask dengan Intersection over Union
function skorCocok(a, b) {
    let irisan = 0, gabungan = 0;
    for (let i = 0; i < a.length; i++) {
        if (a[i] && b[i]) irisan++;
        if (a[i] || b[i]) gabungan++;
    }
    return gabungan ? irisan / gabungan : 0;
}

// Baca template dari cache disk. Hasilnya di-cache di memori (sekali per proses).
function getTemplates() {
    if (templateCache) return templateCache;

    if (!fs.existsSync(TEMPLATE_FILE)) {
        console.warn(`[TooEz2] Cache template tidak ada: ${TEMPLATE_FILE}. Jalankan: npm run build:templates:alnum`);
        templateCache = [];
        return templateCache;
    }

    const payload = JSON.parse(fs.readFileSync(TEMPLATE_FILE, 'utf8'));
    // Ambil ukuran kanvas dari cache supaya cocok dengan mask yang tersimpan.
    if (payload.size) UKURAN = payload.size;
    templateCache = (payload.templates || []).map(t => ({
        huruf: t.huruf,
        font: t.font,
        mask: new Uint8Array(Buffer.from(t.mask, 'base64'))
    }));
    console.log(`[TooEz2] ${templateCache.length} template dimuat dari cache disk (${UKURAN}x${UKURAN}).`);

    // Ingatkan bila file font lebih baru dari cache (cache perlu di-build ulang).
    try {
        const cacheTime = fs.statSync(TEMPLATE_FILE).mtimeMs;
        for (const f of payload.fonts || []) {
            const fontPath = path.join(__dirname, 'fonts', f);
            if (fs.existsSync(fontPath) && fs.statSync(fontPath).mtimeMs > cacheTime) {
                console.warn(`[TooEz2] Cache template lebih lama dari font ${f}. Jalankan: npm run build:templates:alnum`);
                break;
            }
        }
    } catch (_) {}

    return templateCache;
}

function rekanGrup(huruf) {
    for (const grup of GRUP_MIRIP) {
        if (grup.includes(huruf)) return grup.filter(c => c !== huruf);
    }
    return [];
}

// Cari huruf terbaik untuk satu objek (semua sudut x semua template).
function cocokkanObjek(crop, w, h, templates) {
    const skorTerbaik = {};

    for (let angle = ROTASI_MIN; angle <= ROTASI_MAX; angle += ROTASI_STEP) {
        const bentuk = rotasiDanNormalisasi(crop, w, h, angle);
        for (const tpl of templates) {
            const skor = skorCocok(bentuk, tpl.mask);
            const prev = skorTerbaik[tpl.huruf];
            if (!prev || skor > prev.skor) {
                skorTerbaik[tpl.huruf] = { skor, sudut: angle, template: tpl };
            }
        }
    }

    const semuaSkor = Object.entries(skorTerbaik)
        .map(([huruf, data]) => ({ huruf, skor: data.skor, sudut: data.sudut, template: data.template }))
        .sort((a, b) => b.skor - a.skor);

    // Salinan dangkal: `terbaik` tidak boleh berbagi referensi dengan semuaSkor[0].
    const terbaik = { ...(semuaSkor[0] || { huruf: '?', skor: 0, sudut: 0 }) };
    const diterima = terbaik.skor >= AMBANG_COCOK;

    return { terbaik, diterima, semuaSkor };
}

// Deteksi huruf-huruf pada satu gambar PNG (buffer) -> array {huruf, skor, ...}
function decodeLetters(buffer) {
    const templates = getTemplates();
    if (!templates.length) {
        console.warn('[TooEz2] Tidak ada template yang bisa dipakai.');
        return [];
    }

    const sumber = bacaPNG(buffer);
    const latar = deteksiLatar(sumber);
    const mask = segmentasi(sumber, latar);
    const objek = cariObjek(mask, sumber.width, sumber.height);

    return objek.map((obj, index) => {
        const w = obj.maxX - obj.minX + 1;
        const h = obj.maxY - obj.minY + 1;
        const crop = new Uint8Array(w * h);
        for (const pos of obj.piksel) {
            const x = pos % sumber.width;
            const y = Math.floor(pos / sumber.width);
            crop[(y - obj.minY) * w + (x - obj.minX)] = 1;
        }

        const { terbaik, diterima } = cocokkanObjek(crop, w, h, templates);

        return {
            index: index + 1,
            huruf: diterima ? terbaik.huruf : '?',
            skor: terbaik.skor,
            x: obj.minX,
            y: obj.minY,
            width: w,
            height: h
        };
    });
}

// Kontrak yang dipakai Monster Catcher: kembalikan kode 6 karakter, atau null
// bila ada karakter yang tidak dikenali.
function decodeBuffer(buffer) {
    const hasil = decodeLetters(buffer);
    const kode = hasil.map(h => h.huruf).join('');
    return kode && !kode.includes('?') ? kode : null;
}

module.exports = { decodeBuffer, decodeLetters, getTemplates, TEMPLATE_FILE };
// Diekspor untuk pengujian/tuning akurasi.
module.exports._internals = {
    bacaPNG, deteksiLatar, segmentasi, cariObjek, normalisasi, rotasiDanNormalisasi,
    skorCocok, rasioAspek, cocokkanObjek, rekanGrup, GRUP_MIRIP
};
