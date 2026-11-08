const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const opentype = require('opentype.js');
const { createCanvas } = require('@napi-rs/canvas');
const TooEz = require('../src/managers/TooEz');

const FONT_DIR = path.join(__dirname, '..', 'src', 'managers', 'fonts');
const FONT = path.join(FONT_DIR, 'primaserif.otf');

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

test('TooEz exposes the decodeBuffer contract Huntbot2 relies on', () => {
    assert.equal(typeof TooEz.decodeBuffer, 'function');
    assert.equal(typeof TooEz.decodeLetters, 'function');
});

test('TooEz loads one template per charset letter from the fonts', () => {
    const templates = TooEz.getTemplates();
    assert.ok(templates.length >= 26, `template terlalu sedikit: ${templates.length}`);
    const huruf = new Set(templates.map(t => t.huruf));
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        assert.ok(huruf.has(ch), `template huruf ${ch} tidak ada`);
    }
});

test('TooEz reads a rendered letter back via decodeBuffer', () => {
    const font = loadFont();
    for (const ch of ['A', 'M', 'X', 'R']) {
        assert.equal(TooEz.decodeBuffer(renderLetter(font, ch)), ch);
    }
});

test('decodeLetters reports a score for each detected letter', () => {
    const font = loadFont();
    const hasil = TooEz.decodeLetters(renderLetter(font, 'K'));
    assert.equal(hasil.length, 1);
    assert.equal(hasil[0].huruf, 'K');
    assert.ok(hasil[0].skor > 0 && hasil[0].skor <= 1);
});

test('decodeBuffer returns null when nothing is recognizable', () => {
    const blank = new PNG({ width: 80, height: 80 });
    for (let i = 0; i < blank.data.length; i++) blank.data[i] = 255;
    assert.equal(TooEz.decodeBuffer(PNG.sync.write(blank)), null);
});
