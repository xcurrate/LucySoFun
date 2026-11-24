const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const { readRewards } = require('../src/managers/rewardOCR');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name));

const blankStrip = () => {
    const image = new PNG({ width: 1913, height: 208 });
    for (let i = 0; i < image.data.length; i += 4) {
        image.data[i] = 39;
        image.data[i + 1] = 43;
        image.data[i + 2] = 52;
        image.data[i + 3] = 255;
    }
    return PNG.sync.write(image);
};

test('reads all five reward categories from real Lucy reward cards', () => {
    assert.deepEqual(readRewards(fixture('boss-reward-1.png')), {
        weaponShards: 241,
        weaponCrate: 9,
        bossCrate: 7,
        fabledLootbox: 4,
        experience: 281092
    });
    assert.deepEqual(readRewards(fixture('boss-reward-2.png')), {
        weaponShards: 132,
        weaponCrate: 3,
        bossCrate: 6,
        fabledLootbox: 2,
        experience: 10409
    });
    assert.deepEqual(readRewards(fixture('boss-reward-3.png')), {
        weaponShards: 62,
        weaponCrate: 3,
        bossCrate: 2,
        fabledLootbox: 6,
        experience: 22226
    });
});

test('returns null (not zero) when a category has no readable digits', () => {
    assert.deepEqual(readRewards(blankStrip()), {
        weaponShards: null,
        weaponCrate: null,
        bossCrate: null,
        fabledLootbox: null,
        experience: null
    });
});

test('rejects images that are too small for the reward layout', () => {
    const image = new PNG({ width: 50, height: 20 });
    image.data.fill(255);
    assert.throws(() => readRewards(PNG.sync.write(image)), /terlalu kecil/);
});
