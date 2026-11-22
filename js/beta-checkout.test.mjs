import assert from 'node:assert/strict';
import test from 'node:test';
import { ALREADY_LICENSED_MESSAGE, BUY_ANOTHER_LABEL, PURCHASES_PAUSED_MESSAGE, betaPhase, bindBetaCheckout, purchaseState, rememberSelectedPlatform, requestBetaCheckout, requestEntitlements, unavailableMessage } from './beta-checkout.js';

const api = 'https://accounts.example.com';
const hosted = 'https://test.checkout.dodopayments.com/session/cks_example';

test('submits the v1 product with the current ID token to the accounts API', async () => {
    const fetchCheckout = async (url, options) => {
        assert.equal(url, `${api}/checkout`);
        assert.equal(options.method, 'POST');
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers.Authorization, 'Bearer id-token');
        assert.deepEqual(JSON.parse(options.body), { product: 'desktop_v1' });
        return Response.json({ url: hosted }, { status: 201 });
    };
    assert.equal(await requestBetaCheckout(api, 'test', 'id-token', fetchCheckout), hosted);
});

test('rejects sandbox checkout in live mode and rejects an untrusted checkout hostname', async () => {
    for (const url of [hosted, 'https://checkout.dodopayments.com.example.org/session/cks_example']) {
        await assert.rejects(requestBetaCheckout(api, 'live', 'id-token', async () => Response.json({ url })));
    }
});

test('reports a verified existing licence without starting another checkout', async () => {
    const conflict = async () => Response.json({ error: 'already_licensed' }, { status: 409 });
    await assert.rejects(requestBetaCheckout(api, 'test', 'id-token', conflict), /one licence per account/i);
});

test('shows the panel without a buy action when checkout is not configured', async () => {
    const panel = { hidden: true, dataset: { accountsApi: '', checkoutMode: 'live', betaOpensAt: '2027-01-01T00:00:00+05:30' } };
    const button = { addEventListener: (_type, onClick) => { button.onClick = onClick; } };
    const status = { textContent: '' };
    const nodes = { 'beta-checkout': panel, 'buy-beta-licence': button, 'beta-checkout-status': status };
    globalThis.document = { getElementById: (id) => nodes[id] };
    globalThis.window = {};
    try {
        await import('./beta-checkout.js?no-api');
        assert.equal(panel.hidden, false);
        assert.equal(button.disabled, true);
        assert.equal(button.onClick, undefined);
        assert.ok(status.textContent.length > 0);
    } finally {
        delete globalThis.document;
        delete globalThis.window;
    }
});

test('explains why the buy button is disabled', () => {
    assert.match(unavailableMessage('not_open', false), /open on 1 January 2027/);
    assert.match(unavailableMessage('not_open', true), /open on 1 January 2027/);
    assert.match(unavailableMessage('closed', false), /early access has ended/);
    assert.match(unavailableMessage('open', false), /checkout opens soon.*info@apexracetech\.in/);
    assert.equal(unavailableMessage('open', true), '');
});

test('opens existing sign-in for a signed-out buyer once checkout is configured', async () => {
    let signInOpened = false;
    const panel = { hidden: true, dataset: { accountsApi: '', checkoutMode: 'live' } };
    const button = { addEventListener: (_type, onClick) => { button.onClick = onClick; } };
    const status = { textContent: '' };
    const nodes = {
        'beta-checkout': panel,
        'buy-beta-licence': button,
        'beta-checkout-status': status,
        'nav-signin-btn': { click: () => { signInOpened = true; } },
    };
    globalThis.document = { getElementById: (id) => nodes[id] };
    globalThis.window = { RaAuth: { configured: true, currentUser: null, getIdToken: async () => null } };
    try {
        await import('./beta-checkout.js?unconfigured');
        assert.equal(panel.hidden, false);
        assert.equal(button.disabled, true);
        assert.equal(button.onClick, undefined);

        button.disabled = false;
        panel.dataset = { accountsApi: api, checkoutMode: 'test' };
        await import('./beta-checkout.js?configured');
        assert.equal(panel.hidden, false);
        assert.equal(button.textContent, 'Open test checkout');
        await button.onClick();
        assert.equal(signInOpened, true);
        assert.match(status.textContent, /sign in/i);
        assert.equal(button.disabled, false);
    } finally {
        delete globalThis.document;
        delete globalThis.window;
    }
});

test('maps the server beta window errors to clear messages', async () => {
    const notOpen = async () => Response.json({ error: 'beta_not_open' }, { status: 403 });
    await assert.rejects(requestBetaCheckout(api, 'test', 'id-token', notOpen), /open on 1 January 2027/);
    const closed = async () => Response.json({ error: 'beta_closed' }, { status: 403 });
    await assert.rejects(requestBetaCheckout(api, 'test', 'id-token', closed), /early access has ended/);
});

test('chooses the page phase from the beta window', () => {
    const opens = '2027-01-01T00:00:00+05:30';
    const ends = '2027-03-31T23:59:59+05:30';
    assert.equal(betaPhase(opens, ends, new Date('2026-12-31T18:29:59Z')), 'not_open');
    assert.equal(betaPhase(opens, ends, new Date('2026-12-31T18:30:00Z')), 'open');
    assert.equal(betaPhase(opens, ends, new Date('2027-03-31T18:30:00Z')), 'closed');
    assert.equal(betaPhase('', '', new Date('2030-01-01T00:00:00Z')), 'open');
});

test('the buy button shows the struck regular price with an accessible label', async () => {
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(new URL('../race-insight.html', import.meta.url), 'utf8');
    const tag = html.match(/<button id="buy-beta-licence"[^>]*>[^]*?<\/button>/)[0];
    assert.match(tag, /aria-label="Buy early access, US\$15, regular price US\$35"/);
    assert.match(tag, />Buy early access</);
    assert.match(tag, /<s class="regular-price">US\$35<\/s> <span class="sale-price">US\$15<\/span>/);
});

test('the separate licence box and its price paragraph are gone: the price is only on the button', async () => {
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(new URL('../race-insight.html', import.meta.url), 'utf8');
    const section = html.match(/<section id="download"[^]*?<\/section>/)[0];
    assert.doesNotMatch(section, /early access licence<\/h4>/);
    const withoutButton = section.replace(/<button id="buy-beta-licence"[^]*?<\/button>/, '');
    assert.doesNotMatch(withoutButton, /US\$15|US\$35/);
});

test('the buy button is spaced with a gap because inline-flex drops the spaces between label and prices', async () => {
    const { readFile } = await import('node:fs/promises');
    const css = await readFile(new URL('../css/race-insight.css', import.meta.url), 'utf8');
    const rule = css.match(/#download \.btn-buy {[^}]*}/)[0];
    assert.match(rule, /gap:\s*0\.6em/);
});

test('an existing licence points the buyer to the direct download link', async () => {
    const conflict = async () => Response.json({ error: 'already_licensed' }, { status: 409 });
    await assert.rejects(requestBetaCheckout(api, 'test', 'id-token', conflict), (error) => {
        assert.equal(error.cause, 'already_licensed');
        assert.equal(error.message, ALREADY_LICENSED_MESSAGE);
        return true;
    });
});

test('shows the server message for a 409 already_licensed', async () => {
    const conflict = async () => Response.json({ error: 'already_licensed', message: 'Early access allows one licence per account.' }, { status: 409 });
    await assert.rejects(requestBetaCheckout(api, 'test', 'id-token', conflict), (error) => {
        assert.equal(error.cause, 'already_licensed');
        assert.equal(error.message, 'Early access allows one licence per account.');
        return true;
    });
    const custom = async () => Response.json({ error: 'already_licensed', message: 'Server says no.' }, { status: 409 });
    await assert.rejects(requestBetaCheckout(api, 'test', 'id-token', custom), /Server says no./);
});

test('maps a missing early access discount to a friendly paused message', async () => {
    const paused = async () => Response.json({ error: 'early_access_discount_missing' }, { status: 503 });
    await assert.rejects(requestBetaCheckout(api, 'test', 'id-token', paused), (error) => {
        assert.equal(error.cause, 'paused');
        assert.equal(error.message, PURCHASES_PAUSED_MESSAGE);
        return true;
    });
});

test('chooses the buy button state from the entitlements', () => {
    assert.equal(purchaseState(null), 'buy');
    assert.equal(purchaseState({ licence_count: 0, additional_licence_available: false }), 'buy');
    assert.equal(purchaseState({ licence_count: 1, additional_licence_available: false }), 'blocked');
    assert.equal(purchaseState({ licence_count: 2 }), 'blocked');
    assert.equal(purchaseState({ licence_count: 1, additional_licence_available: true }), 'buy_another');
});

test('reads entitlements with the ID token and returns null on any failure', async () => {
    const ok = async (url, options) => {
        assert.equal(url, `${api}/me/entitlements`);
        assert.equal(options.headers.Authorization, 'Bearer id-token');
        return Response.json({ licence_count: 1 });
    };
    assert.deepEqual(await requestEntitlements(api, 'id-token', ok), { licence_count: 1 });
    assert.equal(await requestEntitlements(api, 'id-token', async () => new Response('{}', { status: 500 })), null);
    assert.equal(await requestEntitlements(api, 'id-token', async () => { throw new Error('offline'); }), null);
    assert.equal(await requestEntitlements('http://insecure.example.com', 'id-token', ok), null);
    assert.equal(await requestEntitlements(api, '', ok), null);
});

async function bindWithEntitlements(entitlements) {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json(entitlements);
    const listeners = [];
    const label = { textContent: 'Buy early access' };
    const panel = { hidden: true, dataset: { accountsApi: api, checkoutMode: 'live' } };
    const button = {
        disabled: false, hidden: false, textContent: 'unused',
        addEventListener: (_type, onClick) => { button.onClick = onClick; },
        querySelector: (selector) => (selector === '.btn-buy__label' ? label : null),
        removeAttribute: () => {},
    };
    const status = { textContent: '' };
    const nodes = { 'beta-checkout': panel, 'buy-beta-licence': button, 'beta-checkout-status': status };
    const auth = {
        configured: true,
        currentUser: null,
        getIdToken: async () => 'id-token',
        onAuthStateChanged: (fn) => { listeners.push(fn); },
    };
    const win = { RaAuth: auth };
    try {
        bindBetaCheckout({ document: { getElementById: (id) => nodes[id] }, window: win, now: () => new Date('2027-02-01T00:00:00Z'), schedule: () => () => {} });
        auth.currentUser = { uid: 'user-1' };
        listeners.forEach((fn) => fn(auth.currentUser));
        await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
        globalThis.fetch = realFetch;
    }
    return { button, label, status };
}

test('an account without a licence sees the normal buy button', async () => {
    const { button, label, status } = await bindWithEntitlements({ licence_count: 0, additional_licence_available: false });
    assert.equal(button.hidden, false);
    assert.equal(button.disabled, false);
    assert.equal(label.textContent, 'Buy early access');
    assert.equal(status.textContent, '');
});

test('an account with a licence during early access cannot buy and sees why', async () => {
    const { button, status } = await bindWithEntitlements({ licence_count: 1, additional_licence_available: false });
    assert.equal(button.hidden, true);
    assert.equal(button.disabled, true);
    assert.equal(status.textContent, 'Early access allows one licence per account.');
});

test('an account with a licence can buy another when it is available', async () => {
    const { button, label, status } = await bindWithEntitlements({ licence_count: 1, additional_licence_available: true });
    assert.equal(button.hidden, false);
    assert.equal(button.disabled, false);
    assert.equal(label.textContent, BUY_ANOTHER_LABEL);
    assert.equal(status.textContent, '');
});

test('remembers the selected operating system before leaving for checkout', () => {
    const remembered = [];
    const flow = { rememberPlatform: (_storage, platform) => { remembered.push(platform); return true; } };
    const doc = { querySelector: (selector) => (selector === '.platform-btn.selected' ? { dataset: { platform: 'windows' } } : null) };
    assert.equal(rememberSelectedPlatform(doc, flow), true);
    assert.deepEqual(remembered, ['windows']);
    assert.equal(rememberSelectedPlatform({ querySelector: () => null }, flow), false);
    assert.equal(rememberSelectedPlatform(doc, undefined), false);
});

test('a tab opened before the opening enables the buy button at the opening instant and on return to the tab', async () => {
    const { bindBetaCheckout } = await import('./beta-checkout.js');
    const opensAt = '2027-01-01T00:00:00+05:30';
    let now = new Date('2026-12-31T18:29:00Z');
    const scheduled = [];
    const listeners = {};
    const panel = { hidden: true, dataset: { accountsApi: api, checkoutMode: 'live', betaOpensAt: opensAt, betaEndsAt: '2027-03-31T23:59:59+05:30' } };
    const button = { disabled: false, addEventListener: (_type, onClick) => { button.onClick = onClick; } };
    const status = { textContent: '' };
    const nodes = { 'beta-checkout': panel, 'buy-beta-licence': button, 'beta-checkout-status': status };
    const doc = {
        getElementById: (id) => nodes[id],
        visibilityState: 'visible',
        addEventListener: (type, fn) => { listeners[type] = fn; },
    };
    const win = {
        RaAuth: { configured: true, currentUser: null, getIdToken: async () => null },
        addEventListener: (type, fn) => { listeners[type] = fn; },
    };
    bindBetaCheckout({ document: doc, window: win, now: () => now, schedule: (at, fn) => { scheduled.push({ at, fn }); return () => {}; } });
    assert.equal(button.disabled, true);
    assert.match(status.textContent, /open on 1 January 2027/);
    assert.ok(scheduled.some((entry) => entry.at === opensAt), 'a timer is set for the opening');
    // A click before the opening does nothing.
    if (button.onClick) await button.onClick();
    assert.equal(button.disabled, true);

    // The opening instant passes while the tab stays open.
    now = new Date('2026-12-31T18:30:00Z');
    scheduled.find((entry) => entry.at === opensAt).fn();
    assert.equal(button.disabled, false);
    assert.equal(status.textContent, '');
    assert.equal(typeof button.onClick, 'function');

    // After the end, coming back to the tab (pageshow or visibilitychange) disables it again.
    now = new Date('2027-04-01T00:00:00Z');
    listeners.visibilitychange();
    assert.equal(button.disabled, true);
    assert.match(status.textContent, /early access has ended/);
    now = new Date('2026-12-31T18:31:00Z');
    listeners.pageshow();
    assert.equal(button.disabled, false);
});
