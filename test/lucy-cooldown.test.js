const test = require('node:test');
const assert = require('node:assert/strict');

const CONSTANTS = require('../src/constants');
const createCommandSender = require('../src/managers/command');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function createSender() {
    const state = { accountId: 'test-account' };
    const sender = createCommandSender(state, {}, {});
    return { state, sender };
}

test('Lucy cooldown parser ignores messages from other authors', () => {
    const { sender } = createSender();
    const handled = sender.handleLucyCooldownMessage({
        author: { id: 'not-lucy' },
        content: 'Pelan-pelan dan coba lagi command-nya <t:1999999999:R>'
    });
    assert.equal(handled, false);
});

test('Lucy cooldown message schedules the same action after its timestamp and buffer', async () => {
    const { state, sender } = createSender();
    let retries = 0;
    state.lucyCooldownLastAction = async () => { retries += 1; };
    const expiry = Math.ceil((Date.now() + 1000) / 1000);

    const handled = sender.handleLucyCooldownMessage({
        author: { id: CONSTANTS.LUCY_BOT_ID },
        content: `⏱ | Server Nickname! Pelan-pelan dan coba lagi command-nya <t:${expiry}:R>`
    });

    assert.equal(handled, true);
    assert.ok(state.lucyCooldownUntil >= expiry * 1000);
    await sleep(Math.max(0, state.lucyCooldownUntil - Date.now()) + 1700);
    assert.equal(retries, 1);
});

test('Other Command does not register a Lucy retry action', async () => {
    const { state, sender } = createSender();
    let sent = 0;
    sender.sendRaw = async () => { sent += 1; return true; };

    await sender.send('custom command', 'Other Command 1', 'channel-id');

    assert.equal(sent, 1);
    assert.equal(state.lucyCooldownLastAction, undefined);
});
