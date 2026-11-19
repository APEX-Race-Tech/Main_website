// Run with: node --test js/download-flow.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./download-flow.js', import.meta.url), 'utf8');
const sandbox = { module: { exports: {} }, URL, URLSearchParams };
vm.runInNewContext(source, sandbox);
const flow = sandbox.module.exports;

function memoryStorage() {
    const data = new Map();
    return {
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => { data.set(key, String(value)); },
        data,
    };
}

const brokenStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
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

test('a successful return starts the download for the remembered system once, then never again', () => {
    const storage = memoryStorage();
    flow.rememberPlatform(storage, 'windows');
    const started = [];
    const shown = [];
    const options = (page) => ({
        location: page.location,
        history: page.history,
        storage,
        start: (platform) => started.push(platform),
        show: (outcome, message) => shown.push({ outcome, message }),
    });

    const first = returnPage('?payment_id=pay_abc&status=succeeded&email=buyer%40example.com');
    assert.equal(flow.handleCheckoutReturn(options(first)), 'succeeded');
    assert.deepEqual(started, ['windows']);
    assert.equal(shown[0].outcome, 'succeeded');
    assert.match(shown[0].message, /^Thanks — your download has started\. Sign in to RACE Insight with the same account to activate your licence\.$/);
    // The address loses the return parameters (and the buyer's email) and lands on the section.
    assert.deepEqual(first.replaced, ['/race-insight#download']);

    // The same payment again (back button, reopened tab) does not download a second time.
    const again = returnPage('?payment_id=pay_abc&status=succeeded');
    assert.equal(flow.handleCheckoutReturn(options(again)), 'succeeded');
    assert.deepEqual(started, ['windows']);
    assert.match(shown[1].message, /Download again/);
});

test('a failed or cancelled return shows a calm message and starts nothing', () => {
    const storage = memoryStorage();
    const started = [];
    const shown = [];
    for (const [search, outcome] of [['?payment_id=pay_x&status=failed', 'failed'], ['?payment_id=pay_y&status=cancelled', 'cancelled']]) {
        const page = returnPage(search);
        const result = flow.handleCheckoutReturn({
            ...page,
            storage,
            start: (platform) => started.push(platform),
            show: (shownOutcome, message) => shown.push({ shownOutcome, message }),
        });
        assert.equal(result, outcome);
    }
    assert.deepEqual(started, []);
    assert.match(shown[0].message, /did not go through\. You can try again/);
    assert.match(shown[1].message, /cancelled/);
    assert.equal(storage.data.size, 0);
});

test('a page opened without return parameters does nothing', () => {
    let touched = false;
    const page = returnPage('');
    const result = flow.handleCheckoutReturn({ ...page, storage: memoryStorage(), start: () => { touched = true; }, show: () => { touched = true; } });
    assert.equal(result, null);
    assert.equal(touched, false);
    assert.deepEqual(page.replaced, []);
});

test('blocked storage still downloads once for this page view', () => {
    const started = [];
    const page = returnPage('?payment_id=pay_z&status=succeeded');
    flow.handleCheckoutReturn({ ...page, storage: brokenStorage, start: (p) => started.push(p), show: () => {} });
    assert.deepEqual(started, ['windows']);
    assert.deepEqual(page.replaced, ['/race-insight#download']);
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
