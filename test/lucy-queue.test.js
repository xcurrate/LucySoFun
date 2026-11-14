const test = require('node:test');
const assert = require('node:assert/strict');

const createCommandSender = require('../src/managers/command');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function createSender() {
    const state = { accountId: 'test-account' };
    return { state, sender: createCommandSender(state) };
}

test('waitForLucyQueueIdle resolves once the queue stays empty for the grace period', async () => {
    const { sender } = createSender();
    const start = Date.now();
    assert.equal(await sender.waitForLucyQueueIdle(100, 2000), true);
    assert.ok(Date.now() - start >= 100, 'should wait for the idle grace period');
});

test('waitForLucyQueueIdle gives up at maxWaitMs while an action is still pending', async () => {
    const { state, sender } = createSender();
    state.lucyActionPending = 1;
    const start = Date.now();
    assert.equal(await sender.waitForLucyQueueIdle(50, 300), false);
    assert.ok(Date.now() - start >= 300);
    assert.ok(Date.now() - start < 1500);
});

test('idleOnly action yields to a main action already in the queue', async () => {
    const { sender } = createSender();
    const order = [];

    const main = sender.runLucyAction(async () => {
        order.push('main-start');
        await sleep(400);
        order.push('main-end');
    });
    const idle = sender.runLucyAction(async () => { order.push('idle'); }, { idleOnly: true, idleMs: 50, maxWaitMs: 5000 });

    await Promise.all([main, idle]);
    assert.deepEqual(order, ['main-start', 'main-end', 'idle']);
});

test('main actions run sequentially in the Lucy action queue', async () => {
    const { sender } = createSender();
    const order = [];

    const first = sender.runLucyAction(async () => { order.push('a-start'); await sleep(120); order.push('a-end'); });
    const second = sender.runLucyAction(async () => { order.push('b'); });

    await Promise.all([first, second]);
    assert.deepEqual(order, ['a-start', 'a-end', 'b']);
});

test('queue depth returns to zero after all actions settle', async () => {
    const { state, sender } = createSender();
    await Promise.all([
        sender.runLucyAction(async () => sleep(50)),
        sender.runLucyAction(async () => sleep(20))
    ]);
    assert.equal(Number(state.lucyActionPending || 0), 0);
});
