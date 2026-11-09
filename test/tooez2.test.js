const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const opentype = require('opentype.js');
const { createCanvas } = require('@napi-rs/canvas');
const TooEz2 = require('../src/managers/TooEz2');

const FONT_DIR = path.join(__dirname, '..', 'src', 'managers', 'fonts');
const FONT = path.join(FONT_DIR, 'primaserif.otf');
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function loadFont(fontPath = FONT) {
    const buf = fs.readFileSync(fontPath);
    return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

// Render satu huruf di latar putih, pakai pipeline yang sama dengan template.
function renderLetter(font, ch) {
    const glyphPath = font.charToGlyph(ch).getPath(0, 0, 256);
    const bbox = glyphPath.getBoundingBox();
    const pad = 8;
    const w = Math.ceil(bbox.x2 - bbox.x1) + pad * 2;
    const h = Math.ceil(bbox.y2 - bbox.y1) + pad * 2;
    const canvas = createCanvas(w + 80, h + 80);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.translate(40 - bbox.x1, 40 - bbox.y1);
    glyphPath.draw(ctx);
    return canvas.toBuffer('image/png');
}

test('TooEz2 exposes the decodeBuffer contract Monster Catcher relies on', () => {
    assert.equal(typeof TooEz2.decodeBuffer, 'function');
    assert.equal(typeof TooEz2.decodeLetters, 'function');
});

test('TooEz2 runtime loads its alphanumeric templates from the on-disk cache', () => {
    assert.ok(fs.existsSync(TooEz2.TEMPLATE_FILE), `cache tidak ada: ${TooEz2.TEMPLATE_FILE}`);
    const payload = JSON.parse(fs.readFileSync(TooEz2.TEMPLATE_FILE, 'utf8'));
    assert.ok(payload.size >= 80);
    assert.ok(payload.templates.length >= 36);
    assert.equal(payload.charset, CHARSET);

    const templates = TooEz2.getTemplates();
    const dariCache = new Uint8Array(Buffer.from(payload.templates[0].mask, 'base64'));
    assert.deepEqual(templates[0].mask, dariCache);
});

test('TooEz2 canvas size matches the cached masks', () => {
    const payload = JSON.parse(fs.readFileSync(TooEz2.TEMPLATE_FILE, 'utf8'));
    const templates = TooEz2.getTemplates();
    const sisi = Math.sqrt(templates[0].mask.length);
    assert.equal(sisi, payload.size, 'ukuran mask cache harus sama dengan payload.size');
});

test('TooEz2 runtime does not pull in the heavy font engine', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'managers', 'TooEz2.js'), 'utf8');
    assert.ok(!/require\(['"]opentype\.js['"]\)/.test(src), 'runtime tidak boleh require opentype.js');
    assert.ok(!/require\(['"]@napi-rs\/canvas['"]\)/.test(src), 'runtime tidak boleh require @napi-rs/canvas');
});

test('TooEz2 loads a template for every charset letter and digit', () => {
    const templates = TooEz2.getTemplates();
    const huruf = new Set(templates.map(t => t.huruf));
    for (const ch of CHARSET) {
        assert.ok(huruf.has(ch), `template karakter ${ch} tidak ada`);
    }
});

test('TooEz2 reads a rendered character back via decodeBuffer', () => {
    const font = loadFont();
    for (const ch of ['A', 'M', 'X', 'R', '7', '4']) {
        assert.equal(TooEz2.decodeBuffer(renderLetter(font, ch)), ch);
    }
});

test('TooEz2 decodeLetters reports a score for each detected character', () => {
    const font = loadFont();
    const hasil = TooEz2.decodeLetters(renderLetter(font, 'K'));
    assert.equal(hasil.length, 1);
    assert.equal(hasil[0].huruf, 'K');
    assert.ok(hasil[0].skor > 0 && hasil[0].skor <= 1);
});

test('TooEz2 decodeBuffer returns null when nothing is recognizable', () => {
    const blank = new PNG({ width: 80, height: 80 });
    for (let i = 0; i < blank.data.length; i++) blank.data[i] = 255;
    assert.equal(TooEz2.decodeBuffer(PNG.sync.write(blank)), null);
});

// Regresi: dulu Z dari font cervoneue dibaca "2" (dan G kadang dibaca "6")
// karena disambiguasi rasio aspek menimpa juara yang sudah unggul jelas.
test('TooEz2 keeps Z and G from the cervoneue font (no 2/6 mix-up)', () => {
    const font = loadFont(path.join(FONT_DIR, 'Fontspring-DEMO-cervoneue-semiboldneue.otf'));
    for (const ch of ['Z', 'G', '2', '6']) {
        assert.equal(TooEz2.decodeBuffer(renderLetter(font, ch)), ch);
    }
});
