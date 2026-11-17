import assert from 'node:assert/strict';
import test from 'node:test';
import { requestBetaCheckout } from './beta-checkout.js';

const api = 'https://accounts.example.com';
const hosted = 'https://test.checkout.dodopayments.com/session/cks_example';

test('submits the beta product with the current ID token to the accounts API', async () => {
    const fetchCheckout = async (url, options) => {
        assert.equal(url, `${api}/checkout`);
        assert.equal(options.method, 'POST');
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers.Authorization, 'Bearer id-token');
        assert.deepEqual(JSON.parse(options.body), { product: 'desktop_beta' });
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
    await assert.rejects(requestBetaCheckout(api, 'test', 'id-token', conflict), /already has a beta licence/i);
});

test('keeps checkout hidden without config and opens existing sign-in for a signed-out buyer', async () => {
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
        assert.equal(panel.hidden, true);
        assert.equal(button.onClick, undefined);

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
