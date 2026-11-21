// Run with: node --test js/download-flow.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./download-flow.js', import.meta.url), 'utf8');
const sandbox = { module: { exports: {} }, URL, URLSearchParams, setTimeout, clearTimeout, AbortSignal, console };
vm.runInNewContext(source, sandbox);
const flow = sandbox.module.exports;

function memoryStorage() {
    const data = new Map();
    return {
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => { data.set(key, String(value)); },
        removeItem: (key) => { data.delete(key); },
        data,
    };
}

const brokenStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
};

function returnPage(search) {
    const replaced = [];
    return {
        location: { search, href: `https://apexracetech.in/race-insight${search}` },
        history: { replaceState: (_state, _title, url) => replaced.push(url) },
        replaced,
    };
}

test('the selected operating system persists across the checkout redirect', () => {
    const storage = memoryStorage();
    assert.equal(flow.recallPlatform(storage, 'windows'), 'windows');
    assert.equal(flow.rememberPlatform(storage, 'linux'), true);
    assert.equal(flow.recallPlatform(storage, 'windows'), 'linux');
    assert.equal(storage.data.get(flow.PLATFORM_KEY), 'linux');
});

test('unknown operating systems and unusable storage fall back to Windows', () => {
    const storage = memoryStorage();
    assert.equal(flow.rememberPlatform(storage, 'beos'), false);
    storage.setItem(flow.PLATFORM_KEY, '<script>');
    assert.equal(flow.recallPlatform(storage, 'windows'), 'windows');
    assert.equal(flow.rememberPlatform(brokenStorage, 'windows'), false);
    assert.equal(flow.recallPlatform(brokenStorage, 'windows'), 'windows');
    assert.equal(flow.recallPlatform(null), 'windows');
});

test('reads the Dodo return parameters; only status=succeeded with a payment id is a success', () => {
    assert.equal(flow.readCheckoutReturn(''), null);
    assert.equal(flow.readCheckoutReturn('?utm_source=x'), null);
    assert.deepEqual({ ...flow.readCheckoutReturn('?payment_id=pay_123&status=succeeded&email=a%40b.c') },
        { outcome: 'succeeded', paymentId: 'pay_123' });
    assert.equal(flow.readCheckoutReturn('?payment_id=pay_123&status=failed').outcome, 'failed');
    assert.equal(flow.readCheckoutReturn('?payment_id=pay_123&status=cancelled').outcome, 'cancelled');
    assert.equal(flow.readCheckoutReturn('?payment_id=pay_123&status=expired').outcome, 'cancelled');
    assert.equal(flow.readCheckoutReturn('?payment_id=pay_123&status=processing').outcome, 'pending');
    assert.equal(flow.readCheckoutReturn('?payment_id=pay_123&status=requires_customer_action').outcome, 'pending');
    assert.equal(flow.readCheckoutReturn('?payment_id=pay_123').outcome, 'pending');
    // A success without a usable payment id is not trusted as a success.
    assert.equal(flow.readCheckoutReturn('?status=succeeded').outcome, 'pending');
    assert.equal(flow.readCheckoutReturn('?payment_id=%3Cscript%3E&status=succeeded').outcome, 'pending');
});

/** A checkout return with fakes for the page, the licence check and the download. */
function scenario({ search, licence = ['ready'], storage = memoryStorage(), session = memoryStorage(), mobile = false, startOk = true, offerOk = true, checkLicence } = {}) {
    const page = returnPage(search);
    const started = [];
    const offered = [];
    const shown = [];
    const answers = [...licence];
    let checks = 0;
    let clock = 0;
    const options = {
        location: page.location,
        history: page.history,
        storage,
        session,
        isMobile: mobile,
        start: async (platform) => { started.push(platform); return startOk; },
        offer: async (platform) => { offered.push(platform); return offerOk; },
        show: (state, message, _platform, actions) => shown.push({ state, message, retry: actions && actions.retry }),
        checkLicence: checkLicence === undefined ? async () => {
            checks += 1;
            const answer = answers.length > 1 ? answers.shift() : answers[0];
            if (answer instanceof Error) throw answer;
            return answer;
        } : checkLicence,
        sleep: async (ms) => { clock += ms; },
        now: () => clock,
    };
    return { page, options, started, offered, shown, storage, session, get checks() { return checks; }, get clock() { return clock; } };
}

test('a successful return shows "payment confirmed", waits for the licence, then starts the download once', async () => {
    const s = scenario({ search: '?payment_id=pay_abc&status=succeeded&email=buyer%40example.com', licence: ['not_yet', 'not_yet', 'ready'] });
    flow.rememberPlatform(s.storage, 'windows');
    const control = flow.handleCheckoutReturn(s.options);
    assert.equal(control.outcome, 'succeeded');
    assert.equal(await control.finished, 'ready');
    assert.equal(s.shown[0].state, 'paid');
    assert.match(s.shown[0].message, /^Payment confirmed\. Getting your licence ready/);
    assert.equal(s.shown.at(-1).state, 'ready');
    assert.match(s.shown.at(-1).message, /licence is ready and your download has started/);
    assert.deepEqual(s.started, ['windows']);
    assert.equal(s.checks, 3);
    // The address loses the return parameters (and the buyer's email) and lands on the section.
    assert.deepEqual(s.page.replaced, ['/race-insight#download']);
});

test('the same payment again does not download a second time but still offers a working "Download again" link', async () => {
    const storage = memoryStorage();
    const first = scenario({ search: '?payment_id=pay_abc&status=succeeded', storage });
    await flow.handleCheckoutReturn(first.options).finished;
    assert.deepEqual(first.started, ['windows']);

    const again = scenario({ search: '?payment_id=pay_abc&status=succeeded', storage });
    assert.equal(await flow.handleCheckoutReturn(again.options).finished, 'ready');
    assert.deepEqual(again.started, []);
    assert.deepEqual(again.offered, ['windows']);
    assert.match(again.shown.at(-1).message, /Download again/);
});

test('a download that could not start is not marked as done: the next return starts it again', async () => {
    const storage = memoryStorage();
    const failing = scenario({ search: '?payment_id=pay_retry&status=succeeded', storage, startOk: false });
    const control = flow.handleCheckoutReturn(failing.options);
    assert.equal(await control.finished, 'download_failed');
    assert.match(failing.shown.at(-1).message, /could not be fetched/);
    assert.ok(failing.shown.at(-1).retry, 'a retry action is offered');
    assert.match(failing.shown.at(-1).message, /info@apexracetech\.in/);
    assert.equal(flow.downloadState(storage, 'pay_retry'), 'attempted');

    const later = scenario({ search: '?payment_id=pay_retry&status=succeeded', storage });
    assert.equal(await flow.handleCheckoutReturn(later.options).finished, 'ready');
    assert.deepEqual(later.started, ['windows']);
    assert.equal(flow.downloadState(storage, 'pay_retry'), 'initiated');
});

test('retry on a failed download tries the download again in the same page view', async () => {
    let ok = false;
    const s = scenario({ search: '?payment_id=pay_r2&status=succeeded' });
    s.options.start = async (platform) => { s.started.push(platform); return ok; };
    const control = flow.handleCheckoutReturn(s.options);
    assert.equal(await control.finished, 'download_failed');
    ok = true;
    assert.equal(await control.retry(), 'ready');
    assert.deepEqual(s.started, ['windows', 'windows']);
    assert.equal(flow.downloadState(s.storage, 'pay_r2'), 'initiated');
});

test('status=processing waits for the licence and then reports payment confirmed and licence ready', async () => {
    const s = scenario({ search: '?payment_id=pay_proc&status=processing', licence: ['not_yet', 'ready'] });
    const control = flow.handleCheckoutReturn(s.options);
    assert.equal(control.outcome, 'pending');
    assert.equal(await control.finished, 'ready');
    assert.equal(s.shown[0].state, 'confirming');
    assert.match(s.shown[0].message, /being confirmed/);
    assert.equal(s.shown.at(-1).state, 'ready');
    assert.match(s.shown.at(-1).message, /Payment confirmed/);
    assert.deepEqual(s.started, ['windows']);
});

test('the pending payment survives a reload without the return parameters', async () => {
    const session = memoryStorage();
    const storage = memoryStorage();
    const first = scenario({ search: '?payment_id=pay_reload&status=processing&email=buyer%40example.com', session, storage, licence: ['not_yet'] });
    first.options.maxWaitMs = 1;
    assert.equal(await flow.handleCheckoutReturn(first.options).finished, 'timeout');
    assert.ok(session.data.size > 0, 'the pending payment is kept in sessionStorage');
    assert.doesNotMatch([...session.data.values()].join(), /buyer|@/);

    // The address bar was cleaned; a reload comes back with no parameters at all.
    const reload = scenario({ search: '', session, storage, licence: ['ready'] });
    const control = flow.handleCheckoutReturn(reload.options);
    assert.ok(control, 'the reload resumes the pending payment');
    assert.equal(control.outcome, 'pending');
    assert.equal(await control.finished, 'ready');
    assert.deepEqual(reload.started, ['windows']);
    assert.deepEqual(reload.page.replaced, []);
});

test('a licence that does not appear in time shows a timeout with a retry action and the support email', async () => {
    const s = scenario({ search: '?payment_id=pay_slow&status=succeeded', licence: ['not_yet'] });
    const control = flow.handleCheckoutReturn(s.options);
    assert.equal(await control.finished, 'timeout');
    const last = s.shown.at(-1);
    assert.equal(last.state, 'timeout');
    assert.ok(last.retry);
    assert.match(last.message, /info@apexracetech\.in/);
    assert.match(last.message, /pay_slow/);
    assert.deepEqual(s.started, []);
    // Polling is bounded: about two minutes, with growing gaps.
    assert.ok(s.clock <= 120000, `waited ${s.clock} ms`);
    assert.ok(s.checks >= 5 && s.checks <= 12, `checked ${s.checks} times`);

    // A later retry that finds the licence finishes the purchase.
    s.options.checkLicence = async () => 'ready';
    assert.equal(await control.retry(), 'ready');
    assert.deepEqual(s.started, ['windows']);
});

test('network errors while checking the licence are retried, not reported as a failure', async () => {
    const s = scenario({ search: '?payment_id=pay_net&status=succeeded', licence: [new Error('offline'), new Error('offline'), 'ready'] });
    assert.equal(await flow.handleCheckoutReturn(s.options).finished, 'ready');
    assert.equal(s.checks, 3);
});

test('a signed-out visitor is asked to sign in, and the check resumes after sign-in', async () => {
    const s = scenario({ search: '?payment_id=pay_auth&status=succeeded', licence: ['signed_out'] });
    const control = flow.handleCheckoutReturn(s.options);
    assert.equal(await control.finished, 'sign_in');
    assert.equal(control.state, 'sign_in');
    assert.match(s.shown.at(-1).message, /Sign in with the account you used at checkout/);
    s.options.checkLicence = async () => 'ready';
    assert.equal(await control.retry(), 'ready');
    assert.deepEqual(s.started, ['windows']);
});

test('a phone or tablet never downloads the Windows installer; it explains where to download', async () => {
    const s = scenario({ search: '?payment_id=pay_phone&status=succeeded', mobile: true });
    assert.equal(await flow.handleCheckoutReturn(s.options).finished, 'ready');
    assert.deepEqual(s.started, []);
    assert.deepEqual(s.offered, []);
    assert.match(s.shown.at(-1).message, /RACE Insight runs on Windows 10\/11\. Open this page on your Windows PC and use 'Already have a licence\? Download'\./);
});

test('without the accounts API the payment return still downloads once (the licence is granted on the server)', async () => {
    const s = scenario({ search: '?payment_id=pay_noapi&status=succeeded', checkLicence: null });
    assert.equal(await flow.handleCheckoutReturn(s.options).finished, 'paid');
    assert.deepEqual(s.started, ['windows']);
    assert.match(s.shown.at(-1).message, /download has started/);
    const phone = scenario({ search: '?payment_id=pay_noapi2&status=succeeded', checkLicence: null, mobile: true });
    await flow.handleCheckoutReturn(phone.options).finished;
    assert.deepEqual(phone.started, []);
    assert.match(phone.shown.at(-1).message, /Open this page on your Windows PC/);
});

test('a failed or cancelled return shows a calm message, starts nothing and forgets the pending payment', async () => {
    const session = memoryStorage();
    session.setItem(flow.PENDING_KEY, JSON.stringify({ paymentId: 'pay_old', outcome: 'pending', savedAt: Date.now() }));
    const shown = [];
    for (const [search, outcome] of [['?payment_id=pay_x&status=failed', 'failed'], ['?payment_id=pay_y&status=cancelled', 'cancelled']]) {
        const s = scenario({ search, session });
        const control = flow.handleCheckoutReturn(s.options);
        assert.equal(control.outcome, outcome);
        assert.equal(await control.finished, outcome);
        assert.deepEqual(s.started, []);
        assert.equal(s.checks, 0);
        assert.equal(s.storage.data.size, 0);
        shown.push(...s.shown);
    }
    assert.match(shown[0].message, /did not go through\. You can try again/);
    assert.match(shown[1].message, /cancelled/);
    assert.equal(session.getItem(flow.PENDING_KEY), null);
});

test('a page opened without return parameters or a pending payment does nothing', () => {
    let touched = false;
    const page = returnPage('');
    const result = flow.handleCheckoutReturn({ ...page, storage: memoryStorage(), session: memoryStorage(), start: () => { touched = true; }, show: () => { touched = true; } });
    assert.equal(result, null);
    assert.equal(touched, false);
    assert.deepEqual(page.replaced, []);
});

test('a pending payment older than a day, or unreadable, is dropped', () => {
    const session = memoryStorage();
    session.setItem(flow.PENDING_KEY, JSON.stringify({ paymentId: 'pay_old', outcome: 'pending', savedAt: 0 }));
    assert.equal(flow.loadPendingPayment(session, 25 * 3600 * 1000), null);
    assert.equal(session.getItem(flow.PENDING_KEY), null);
    session.setItem(flow.PENDING_KEY, '{not json');
    assert.equal(flow.loadPendingPayment(session, 0), null);
    session.setItem(flow.PENDING_KEY, JSON.stringify({ paymentId: '<script>', outcome: 'succeeded', savedAt: 0 }));
    assert.equal(flow.loadPendingPayment(session, 0), null);
});

test('blocked storage still downloads once for this page view', async () => {
    const s = scenario({ search: '?payment_id=pay_z&status=succeeded', storage: brokenStorage, session: brokenStorage });
    assert.equal(await flow.handleCheckoutReturn(s.options).finished, 'ready');
    assert.deepEqual(s.started, ['windows']);
    assert.deepEqual(s.page.replaced, ['/race-insight#download']);
});

test('the licence check asks the accounts API for the entitlements with the ID token', async () => {
    const calls = [];
    const view = { licences: [{ licence_id: 'lic_1', product: 'desktop_beta', state: 'active' }] };
    const fetchStub = async (url, options) => { calls.push({ url, options }); return { status: 200, ok: true, json: async () => view }; };
    const check = flow.createLicenceCheck({ apiUrl: 'https://accounts.example.com/', getIdToken: async () => 'id-token', fetch: fetchStub });
    assert.equal(await check(), 'ready');
    assert.equal(calls[0].url, 'https://accounts.example.com/me/entitlements');
    assert.equal(calls[0].options.method, 'GET');
    assert.equal(calls[0].options.redirect, 'error');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer id-token');
});

test('the licence check reads only an active early access licence as ready', async () => {
    const answer = (status, body) => async () => ({ status, ok: status < 300, json: async () => body });
    const check = (fetchStub, token = 'id-token') => flow.createLicenceCheck({ apiUrl: 'https://accounts.example.com', getIdToken: async () => token, fetch: fetchStub })();
    assert.equal(await check(answer(200, { licences: [] })), 'not_yet');
    assert.equal(await check(answer(200, { licences: [{ product: 'desktop_beta', state: 'revoked' }] })), 'not_yet');
    assert.equal(await check(answer(200, { licences: [{ product: 'desktop_beta', state: 'active' }] })), 'ready');
    assert.equal(await check(answer(401, { error: 'unauthorized' })), 'signed_out');
    assert.equal(await check(answer(200, {}), null), 'signed_out');
    await assert.rejects(check(answer(503, null)));
    // An address that is not https is refused before any request.
    await assert.rejects(flow.createLicenceCheck({ apiUrl: 'http://accounts.example.com', getIdToken: async () => 't', fetch: answer(200, {}) })());
});

test('phones and tablets are detected; Windows PCs, Macs and Linux desktops are not', () => {
    const media = (coarse, fine) => (query) => (query === '(pointer: coarse)' ? coarse : query === '(any-pointer: fine)' ? fine : false);
    const nav = (userAgent, extra = {}) => ({ userAgent, ...extra });
    assert.equal(flow.isMobileDevice(nav('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36'), media(true, false)), true);
    assert.equal(flow.isMobileDevice(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), media(true, false)), true);
    // iPadOS reports itself as a Mac with touch points.
    assert.equal(flow.isMobileDevice(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', { platform: 'MacIntel', maxTouchPoints: 5 }), media(true, false)), true);
    assert.equal(flow.isMobileDevice(nav('Mozilla/5.0', { userAgentData: { mobile: true } }), media(false, true)), true);
    assert.equal(flow.isMobileDevice(nav('Mozilla/5.0 (X11; Linux x86_64)'), media(true, false)), true);
    assert.equal(flow.isMobileDevice(nav('Mozilla/5.0 (X11; Linux x86_64)'), media(false, true)), false);
    assert.equal(flow.isMobileDevice(nav('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), media(false, true)), false);
    // A Windows touch laptop or tablet can still run the installer.
    assert.equal(flow.isMobileDevice(nav('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), media(true, false)), false);
    assert.equal(flow.isMobileDevice(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', { platform: 'MacIntel', maxTouchPoints: 0 }), media(false, true)), false);
    assert.equal(flow.isMobileDevice(null, null), false);
});

test('cleaning the address keeps unrelated parameters and an existing hash', () => {
    assert.equal(flow.cleanReturnUrl('https://apexracetech.in/race-insight?ref=x&payment_id=p&status=succeeded&email=a%40b.c&license_key=k#faq'),
        '/race-insight?ref=x#faq');
});

const html = readFileSync(new URL('../race-insight.html', import.meta.url), 'utf8');
const section = html.match(/<section id="download"[^]*?<\/section>/)[0];

test('the page offers "Already have a licence? Download" outside the purchase panel', () => {
    const line = section.match(/<p id="download-licensed"[^]*?<\/p>/)[0];
    assert.match(line, /Already have a licence\? <button id="download-btn" type="button"[^>]*>Download<\/button>/);
    const checkout = section.match(/<div id="beta-checkout"[^]*?<\/div>/)[0];
    assert.doesNotMatch(checkout, /download-btn/);
    // The direct download goes through the release feed, not checkout.
    const page = readFileSync(new URL('./race-insight.js', import.meta.url), 'utf8');
    assert.match(page, /downloadBtn\.addEventListener\('click'[^]*?triggerDownload\(\)/);
});

test('"Download again" starts with no address so the page-wide #download handlers leave it alone', () => {
    const link = section.match(/<a id="download-again"[^>]*>/)[0];
    assert.doesNotMatch(link, /href=/);
    assert.match(link, /hidden/);
});

test('the section reads: heading, operating system, buy button, licence link, notes', () => {
    const order = ['id="download-title"', 'class="platform-options"', 'id="buy-beta-licence"', 'id="download-notice"', 'id="download-licensed"', 'class="download-notes"'];
    const positions = order.map((marker) => section.indexOf(marker));
    assert.ok(positions.every((p) => p > 0), positions.join(','));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions);
    assert.match(section, /data-platform="linux" disabled[^>]*>[^]*?Coming soon/);
    assert.match(section, /data-platform="apple" disabled[^>]*>[^]*?Coming soon/);
});

test('download-flow.js loads before race-insight.js and beta-checkout.js', () => {
    const at = (name) => html.indexOf(`src="js/${name}`);
    assert.ok(at('download-flow.js') > 0);
    assert.ok(at('download-flow.js') < at('race-insight.js'));
    assert.ok(at('download-flow.js') < at('beta-checkout.js'));
});

const pageScript = readFileSync(new URL('./race-insight.js', import.meta.url), 'utf8');
const triggerDownloadSource = pageScript.match(/async function triggerDownload\(\) {[^]*?\n    }\n/)[0];

test('the existing-licence download navigates in the same tab instead of clicking a new-window link', () => {
    assert.doesNotMatch(triggerDownloadSource, /_blank/);
    assert.doesNotMatch(triggerDownloadSource, /link\.click\(\)/);
    assert.match(triggerDownloadSource, /window\.location\.assign\(downloadUrl\)/);
});

test('the page wires the checkout return to the licence check, sessionStorage, phones and the retry button', () => {
    assert.match(pageScript, /window\.sessionStorage/);
    assert.match(pageScript, /downloadFlow\.createLicenceCheck\(/);
    assert.match(pageScript, /isMobile:\s*downloadFlow\.isMobileDevice\(/);
    assert.match(pageScript, /offer:\s*offerPurchasedDownload/);
    assert.match(pageScript, /getElementById\('download-retry'\)/);
    assert.match(pageScript, /checkoutReturn\.retry\(\)/);
    // A visitor who signs in after returning from checkout picks up the licence check again.
    assert.match(pageScript, /onAuthStateChanged\([^]*?checkoutReturn\.state === 'sign_in'/);
});

test('the purchased download only reports success after the browser was sent to the installer', () => {
    const start = pageScript.match(/async function startPurchasedDownload\(platform\) {[^]*?\n    }\n/)[0];
    assert.match(start, /window\.location\.assign\(url\);\s*return true;/);
    assert.match(start, /return false;/);
});

test('the download gate is checked again at the opening instant and when the visitor returns to the tab', () => {
    assert.match(pageScript, /RaRelease\.scheduleAt\(downloadsOpenAt, applyDownloadsGate\)/);
    assert.match(pageScript, /addEventListener\('pageshow', applyDownloadsGate\)/);
    assert.match(pageScript, /addEventListener\('visibilitychange'/);
});

test('the notice has a hidden retry button, and the buy button says it is a Windows 10/11 desktop app', () => {
    const notice = section.match(/<div id="download-notice"[^]*?<\/div>/)[0];
    assert.match(notice, /<button id="download-retry" type="button" class="download-link-btn" hidden><\/button>/);
    const checkout = section.match(/<div id="beta-checkout"[^]*?<\/div>/)[0];
    assert.match(checkout, /Windows 10\/11 desktop app/);
});
