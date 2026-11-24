const { PNG } = require('pngjs');
const TooEz2 = require('./TooEz2');

// Kartu reward Lucy berupa satu strip 1913x208 berisi lima kartu. Angka reward
// berada di bagian atas tiap kartu; label kategori ada di bawahnya. Region di
// bawah adalah proporsi lebar strip yang hanya memuat angkanya.
const REGIONS = Object.freeze({
    weaponShards: [0.078, 0.165],
    weaponCrate: [0.275, 0.345],
    bossCrate: [0.470, 0.535],
    fabledLootbox: [0.670, 0.735],
    experience: [0.870, 0.985]
});

const CROP_TOP = 0.27;
const CROP_BOTTOM = 0.57;
const INK_THRESHOLD = 140;
const MIN_GLYPH_HEIGHT_RATIO = 0.5;
const MIN_MATCH_SCORE = 0.5;

let digitTemplates = null;

// Runtime hanya memakai cache template alfanumerik yang sudah ada (0-9).
const getDigitTemplates = () => {
    if (digitTemplates) return digitTemplates;
    digitTemplates = TooEz2.getTemplates().filter(t => t.huruf >= '0' && t.huruf <= '9');
    return digitTemplates;
};

const luminanceAt = (data, index) =>
    0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];

// Binarisasi region: kartu gelap memakai angka putih, kartu terang memakai
// angka gelap. Polaritas ditentukan dari rata-rata luminance region.
const cropToMask = (image, [start, end]) => {
    const x = Math.floor(image.width * start);
    const x2 = Math.floor(image.width * end);
    const y = Math.floor(image.height * CROP_TOP);
    const y2 = Math.floor(image.height * CROP_BOTTOM);
    if (x2 <= x || y2 <= y) return null;

    const width = x2 - x;
    const height = y2 - y;
    const mask = new Uint8Array(width * height);
    let total = 0;
    for (let cy = 0; cy < height; cy++) {
        for (let cx = 0; cx < width; cx++) {
            const index = ((y + cy) * image.width + (x + cx)) * 4;
            const lum = luminanceAt(image.data, index);
            mask[cy * width + cx] = lum;
            total += lum;
        }
    }

    const darkBackground = total / (width * height) < 128;
    for (let i = 0; i < mask.length; i++) {
        const ink = darkBackground ? mask[i] > INK_THRESHOLD : mask[i] <= INK_THRESHOLD;
        mask[i] = ink ? 1 : 0;
    }
    return { mask, width, height };
};

const glyphCrop = (object, regionWidth) => {
    const width = object.maxX - object.minX + 1;
    const height = object.maxY - object.minY + 1;
    const crop = new Uint8Array(width * height);
    for (const pos of object.piksel) {
        const x = pos % regionWidth;
        const y = Math.floor(pos / regionWidth);
        crop[(y - object.minY) * width + (x - object.minX)] = 1;
    }
    return { crop, width, height };
};

// Membaca satu region menjadi string digit. Null berarti ada bagian yang tidak
// terbaca; nilai parsial tidak dipakai karena gate reward harus konservatif.
const readRegionDigits = (image, range, templates) => {
    const region = cropToMask(image, range);
    if (!region) return null;

    const objects = TooEz2._internals.cariObjek(region.mask, region.width, region.height);
    if (!objects.length) return null;

    const maxHeight = Math.max(...objects.map(o => o.maxY - o.minY + 1));
    const glyphs = objects.filter(o => {
        const width = o.maxX - o.minX + 1;
        const height = o.maxY - o.minY + 1;
        return height >= maxHeight * MIN_GLYPH_HEIGHT_RATIO
            && width >= 2
            && width / height <= 1.4;
    });
    if (!glyphs.length) return null;

    let digits = '';
    for (const object of glyphs) {
        const { crop, width, height } = glyphCrop(object, region.width);
        const { terbaik, diterima } = TooEz2._internals.cocokkanObjek(crop, width, height, templates);
        if (!diterima || terbaik.skor < MIN_MATCH_SCORE) return null;
        digits += terbaik.huruf;
    }
    return digits || null;
};

// Satu pemanggilan membaca kelima kategori. Nilai null berarti tidak terbaca,
// bukan nol.
const readRewards = (buffer) => {
    const image = PNG.sync.read(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
    if (image.width < 100 || image.height < 50) {
        throw new Error('Resolusi gambar reward terlalu kecil.');
    }

    const templates = getDigitTemplates();
    if (!templates.length) {
        throw new Error('Template digit OCR tidak tersedia (jalankan npm run build:templates:alnum).');
    }

    const rewards = {};
    for (const [name, range] of Object.entries(REGIONS)) {
        const digits = readRegionDigits(image, range, templates);
        const value = digits === null ? null : Number(digits);
        rewards[name] = Number.isSafeInteger(value) ? value : null;
    }
    return rewards;
};

module.exports = { readRewards, REGIONS, MIN_MATCH_SCORE };
module.exports._internals = { getDigitTemplates, cropToMask, readRegionDigits };
