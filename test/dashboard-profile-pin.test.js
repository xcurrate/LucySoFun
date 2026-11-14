const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const createDashboardApp = require('../src/dashboard/app');

const PROFILE_A = '11111111111111111';
const PROFILE_B = '22222222222222222';

function authHeader() {
    return `Basic ${Buffer.from('dashboard:zuya2000').toString('base64')}`;
}

async function withDashboard(callback) {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-profile-pin-'));
    fs.writeFileSync(path.join(baseDir, 'config.json'), JSON.stringify({ token: '', settings: {} }));
    const profilesDir = path.join(baseDir, 'profiles');
    fs.mkdirSync(profilesDir, { recursive: true });
    for (const id of [PROFILE_A, PROFILE_B]) {
        fs.writeFileSync(path.join(profilesDir, `config_${id}.json`), JSON.stringify({
            token: '', settings: {}, botStatus: { running: false, paused: true }
        }));
    }
    const { app } = createDashboardApp({ baseDir });
    const server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));

    try {
        await callback(`http://127.0.0.1:${server.address().port}`, baseDir);
    } finally {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(baseDir, { recursive: true, force: true });
    }
}

function postForm(url, values, extraHeaders = {}) {
    return fetch(url, {
        method: 'POST',
        redirect: 'manual',
        headers: {
            Authorization: authHeader(),
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            ...extraHeaders
        },
        body: new URLSearchParams(values)
    });
}

async function setPin(url, id, pin) {
    return postForm(`${url}/profile/${id}/pin`, { pinAction: 'set', newPin: pin });
}

async function unlock(url, id, pin) {
    return postForm(`${url}/profile/${id}/unlock`, { pin });
}

test('set PIN locks a profile; correct PIN unlocks it and invalid PIN is rejected', async () => {
    await withDashboard(async (url) => {
        const set = await setPin(url, PROFILE_A, '1234');
        assert.equal(set.status, 302);

        const locked = await fetch(`${url}/?profileId=${PROFILE_A}`, { headers: { Authorization: authHeader() } });
        assert.equal(locked.status, 403);
        assert.match(await locked.text(), /Profile Terkunci/);

        const wrong = await unlock(url, PROFILE_A, '0000');
        assert.equal(wrong.status, 403);
        assert.match(await wrong.text(), /PIN salah/);

        const correct = await unlock(url, PROFILE_A, '1234');
        assert.equal(correct.status, 302);
        const cookie = correct.headers.get('set-cookie');
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /SameSite=Lax/);

        const opened = await fetch(`${url}/?profileId=${PROFILE_A}`, {
            headers: { Authorization: authHeader(), Cookie: cookie.split(';')[0] }
        });
        assert.equal(opened.status, 200);
        assert.match(await opened.text(), /PIN Profile/);
    });
});

test('five incorrect PIN attempts lock the profile for five minutes', async () => {
    await withDashboard(async (url) => {
        await setPin(url, PROFILE_A, '1234');
        for (let i = 0; i < 4; i++) {
            const response = await unlock(url, PROFILE_A, '9999');
            assert.equal(response.status, 403);
        }
        const fifth = await unlock(url, PROFILE_A, '9999');
        assert.equal(fifth.status, 429);
        assert.match(await fifth.text(), /5 menit|detik/);
        const retry = await unlock(url, PROFILE_A, '1234');
        assert.equal(retry.status, 429);
    });
});

test('profile stats and logs require a profile unlock', async () => {
    await withDashboard(async (url) => {
        await setPin(url, PROFILE_A, '1234');
        for (const endpoint of [
            `/api/stats?profileId=${PROFILE_A}`,
            `/logs?profileId=${PROFILE_A}`
        ]) {
            const response = await fetch(url + endpoint, {
                headers: { Authorization: authHeader(), Accept: 'application/json' }
            });
            assert.equal(response.status, 403, endpoint);
            assert.deepEqual(await response.json(), { success: false, message: 'PIN profile diperlukan' });
        }
    });
});

test('a profile A session does not unlock profile B', async () => {
    await withDashboard(async (url) => {
        await setPin(url, PROFILE_A, '1234');
        await setPin(url, PROFILE_B, '5678');
        const response = await unlock(url, PROFILE_A, '1234');
        const cookie = response.headers.get('set-cookie').split(';')[0];

        const a = await fetch(`${url}/?profileId=${PROFILE_A}`, {
            headers: { Authorization: authHeader(), Cookie: cookie }
        });
        const b = await fetch(`${url}/?profileId=${PROFILE_B}`, {
            headers: { Authorization: authHeader(), Cookie: cookie }
        });
        assert.equal(a.status, 200);
        assert.equal(b.status, 403);
    });
});

test('changing and deleting a PIN both require the old PIN', async () => {
    await withDashboard(async (url) => {
        await setPin(url, PROFILE_A, '1234');

        const wrongChange = await postForm(`${url}/profile/${PROFILE_A}/pin`, {
            pinAction: 'change', oldPin: '0000', newPin: '5678'
        });
        assert.equal(wrongChange.status, 403);

        const change = await postForm(`${url}/profile/${PROFILE_A}/pin`, {
            pinAction: 'change', oldPin: '1234', newPin: '5678'
        });
        assert.equal(change.status, 302);

        const oldPin = await unlock(url, PROFILE_A, '1234');
        assert.equal(oldPin.status, 403);
        const newPin = await unlock(url, PROFILE_A, '5678');
        assert.equal(newPin.status, 302);

        const wrongDelete = await postForm(`${url}/profile/${PROFILE_A}/pin`, {
            pinAction: 'delete', oldPin: '1234'
        });
        assert.equal(wrongDelete.status, 403);

        const remove = await postForm(`${url}/profile/${PROFILE_A}/pin`, {
            pinAction: 'delete', oldPin: '5678'
        });
        assert.equal(remove.status, 302);

        const page = await fetch(`${url}/?profileId=${PROFILE_A}`, {
            headers: { Authorization: authHeader() }
        });
        assert.equal(page.status, 200);
        assert.match(await page.text(), /Tambah PIN/);
    });
});

test('PIN metadata stores only salted hash and is never rendered in dashboard HTML', async () => {
    await withDashboard(async (url, baseDir) => {
        await setPin(url, PROFILE_A, '1234');
        const meta = JSON.parse(fs.readFileSync(path.join(baseDir, 'profiles', 'meta.json'), 'utf8'));
        assert.match(meta.profiles[PROFILE_A].pin.hash, /^[a-f0-9]{128}$/);
        assert.match(meta.profiles[PROFILE_A].pin.salt, /^[a-f0-9]{32}$/);
        assert.equal(JSON.stringify(meta).includes('"1234"'), false);

        const page = await fetch(url, { headers: { Authorization: authHeader() } });
        const html = await page.text();
        assert.equal(html.includes(meta.profiles[PROFILE_A].pin.hash), false);
        assert.equal(html.includes(meta.profiles[PROFILE_A].pin.salt), false);
    });
});

test('halaman Profil Akun menampilkan kartu Log Akun Ini khusus akun tersebut', async () => {
    await withDashboard(async (url) => {
        const html = await (await fetch(`${url}/?profileId=${PROFILE_A}`, {
            headers: { Authorization: authHeader() }
        })).text();

        // Kartu log per-akun hadir, terpisah dari kartu log Ringkasan.
        assert.match(html, /id="logBoxProfile"/);
        assert.match(html, /Log Akun Ini/);
        assert.match(html, /data-empty="✨ Belum ada log untuk akun ini/);
        assert.match(html, /Hanya menampilkan log milik akun/);

        // Kotak log generik memakai penanda data-log-box agar script mengisi semuanya.
        assert.match(html, /id="logBox" data-log-box/);
        assert.match(html, /querySelectorAll\('\[data-log-box\]'\)/);

        // Dock log mengambang tersedia di halaman profil dan memakai scope akun ini.
        assert.match(html, /id="logDock"/);
        assert.match(html, /id="logDockBox" data-log-box/);
        assert.match(html, /data-empty="✨ Belum ada log untuk akun ini/);
        assert.match(html, /function toggleLogDock/);

        // Halaman Menu Utama tidak menampilkan kartu log per-akun.
        const control = await (await fetch(`${url}/`, { headers: { Authorization: authHeader() } })).text();
        assert.doesNotMatch(control, /id="logBoxProfile"/);
    });
});

test('dock log mengambang tampil di semua halaman dan tidak terikat tab', async () => {
    await withDashboard(async (url) => {
        const control = await (await fetch(`${url}/`, { headers: { Authorization: authHeader() } })).text();
        assert.match(control, /id="logDock"/);
        assert.match(control, /id="logDockBox" data-log-box/);
        assert.match(control, /toggleLogDock/);
        assert.doesNotMatch(control, /id="logDockProfile"/);

        // Dock dirender di luar wadah tab (.settings-tabs), jadi tetap terlihat
        // saat berpindah tab fitur.
        const tabsIndex = control.indexOf('class="settings-tabs"');
        const dockIndex = control.indexOf('id="logDock"');
        assert.ok(tabsIndex >= 0 && dockIndex > tabsIndex, 'dock should render after the tab container');

        const profile = await (await fetch(`${url}/?profileId=${PROFILE_A}`, { headers: { Authorization: authHeader() } })).text();
        assert.match(profile, /id="logDock"/);
        assert.match(profile, /🧾 Log Akun Ini/);
    });
});
