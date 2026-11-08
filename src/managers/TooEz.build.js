// Generator cache template untuk TooEz.
//
// Jalankan sekali (atau setiap kali file font di src/managers/fonts/ berubah):
//     npm run build:templates
//
// Script ini butuh opentype.js + @napi-rs/canvas dan memakai RAM cukup besar
// saat render. Runtime bot (TooEz.js) TIDAK memakai script ini; ia hanya
// membaca hasil cache-nya, sehingga tidak perlu memuat font engine.

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const opentype = require('opentype.js');
const { createCanvas } = require('@napi-rs/canvas');

const FONT_DIR = path.join(__dirname, 'fonts');
const OUTPUT = path.join(FONT_DIR, 'templates.json');
const FONT_PATHS = [
    path.join(FONT_DIR, 'NaumanNeueTrial-Bold-BF63bf7ff057634.otf'),
    path.join(FONT_DIR, 'primaserif.otf'),
    path.join(FONT_DIR, 'Fontspring-DEMO-cervoneue-semiboldneue.otf')
];
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const UKURAN = 80;
const RENDER_SIZE = 256;

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

function maskTemplate(img) {
    const mask = new Uint8Array(img.width * img.height);
    for (let i = 0; i < mask.length; i++) {
        mask[i] = img.data[i * 4 + 3] > 20 ? 1 : 0;
    }
    return normalisasi(mask, img.width, img.height);
}

function renderGlyphPNG(font, ch, renderSize = RENDER_SIZE) {
    const glyph = font.charToGlyph(ch);
    if (!glyph || glyph.index === 0) return null;

    const glyphPath = glyph.getPath(0, 0, renderSize);
    const bbox = glyphPath.getBoundingBox();
    if (bbox.x2 <= bbox.x1 || bbox.y2 <= bbox.y1) return null;

    const pad = 8;
    const w = Math.ceil(bbox.x2 - bbox.x1) + pad * 2;
    const h = Math.ceil(bbox.y2 - bbox.y1) + pad * 2;

    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.translate(-bbox.x1 + pad, -bbox.y1 + pad);
    glyphPath.draw(ctx);

    return canvas.toBuffer('image/png');
}

function main() {
    const templates = [];
    const fonts = [];

    for (const fontPath of FONT_PATHS) {
        if (!fs.existsSync(fontPath)) {
            console.warn(`[build] dilewati, tidak ada: ${fontPath}`);
            continue;
        }
        const buf = fs.readFileSync(fontPath);
        const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        const font = opentype.parse(arrayBuffer);
        const nama = path.basename(fontPath);
        fonts.push(nama);

        let n = 0;
        for (const ch of CHARSET) {
            const pngBuf = renderGlyphPNG(font, ch);
            if (!pngBuf) continue;
            templates.push({
                huruf: ch,
                font: nama,
                mask: Buffer.from(maskTemplate(PNG.sync.read(pngBuf))).toString('base64')
            });
            n++;
        }
        console.log(`[build] ${nama}: ${n} glyph`);
    }

    if (!templates.length) {
        console.error('[build] Tidak ada template yang berhasil dibuat.');
        process.exit(1);
    }

    const payload = {
        version: 1,
        size: UKURAN,
        charset: CHARSET,
        fonts,
        generatedAt: new Date().toISOString(),
        templates
    };
    fs.writeFileSync(OUTPUT, JSON.stringify(payload));
    console.log(`[build] ${templates.length} template ditulis ke ${path.relative(process.cwd(), OUTPUT)}`);
}

main();
