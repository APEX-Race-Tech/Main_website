// Run with: node --test js/cloud-gate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const gateSource = readFileSync(new URL('./cloud-gate.js', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('./cloud-page.js', import.meta.url), 'utf8');

function loadGate() {
    const sandbox = { module: { exports: {} }, Promise };
    vm.runInNewContext(gateSource, sandbox);
    return sandbox.module.exports;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Fake RaAuth: a settable current user and auth-state listeners. */
function fakeAuth({ configured = true, user = null } = {}) {
    const listeners = [];
    return {
        configured,
        currentUser: user,
        onAuthStateChanged(cb) {
            listeners.push(cb);
            setTimeout(() => cb(this.currentUser), 0);
            return () => {};
        },
        set(next) {
            this.currentUser = next;
            listeners.forEach((cb) => cb(next));
        }
    };
}

const ADA = { uid: 'sub-ada', email: 'ada@example.com' };
const SUBSCRIBED = { entitlement: { active: true, edition: 'Pro' }, quota: { bytes_used: 0, limit: 10 * 1024 ** 3 }, consent_version: 1 };
const LAPSED = { entitlement: { active: false, edition: 'Pro' }, quota: { bytes_used: 0, limit: 0 } };

/** Fake RaCloudSync. account is a value, a function, or an error to throw. */
function fakeSync({ configured = true, account = SUBSCRIBED, units = { sessions: [] }, shares = {} } = {}) {
    const calls = [];
    const answer = (name, value) => {
        calls.push(name);
        if (value instanceof Error) return Promise.reject(value);
        return Promise.resolve(typeof value === 'function' ? value() : value);
    };
    return {
        configured,
        calls,
        account: () => answer('account', account),
        listUnits: () => answer('listUnits', units),
        listShares: () => answer('listShares', shares),
        friendlyError: (err) => (err && err.message) || 'Cloud sync failed.'
    };
}

function syncError(code) {
    const err = new Error(code);
    err.code = code;
    return err;
}

test('isActive accepts only entitlement.active === true', () => {
    const { isActive } = loadGate();
    assert.equal(isActive(SUBSCRIBED), true);
    assert.equal(isActive(LAPSED), false);
    assert.equal(isActive({ entitlement: { active: 'true' } }), false);
    assert.equal(isActive({}), false);
    assert.equal(isActive(null), false);
});

test('checkAccess: API not configured means unavailable, without calling it', async () => {
    const { checkAccess } = loadGate();
    const sync = fakeSync({ configured: false });
    assert.equal((await checkAccess(fakeAuth(), sync, ADA)).state, 'unavailable');
    assert.equal((await checkAccess(fakeAuth(), null, ADA)).state, 'unavailable');
    assert.deepEqual(sync.calls, []);
});

test('checkAccess: sign-in not configured, then signed out', async () => {
    const { checkAccess } = loadGate();
    const sync = fakeSync();
    assert.equal((await checkAccess(fakeAuth({ configured: false }), sync, ADA)).state, 'auth_unavailable');
    assert.equal((await checkAccess(fakeAuth(), sync, null)).state, 'signed_out');
    assert.deepEqual(sync.calls, [], 'no API call without a signed-in user');
});

test('checkAccess: subscribed and lapsed accounts', async () => {
    const { checkAccess } = loadGate();
    const ok = await checkAccess(fakeAuth(), fakeSync(), ADA);
    assert.equal(ok.state, 'subscribed');
    assert.equal(ok.account.entitlement.edition, 'Pro');
    assert.equal((await checkAccess(fakeAuth(), fakeSync({ account: LAPSED }), ADA)).state, 'no_subscription');
    assert.equal((await checkAccess(fakeAuth(), fakeSync({ account: {} }), ADA)).state, 'no_subscription');
});

test('checkAccess: API errors map to states and never reject', async () => {
    const { checkAccess } = loadGate();
    const auth = fakeAuth();
    assert.equal((await checkAccess(auth, fakeSync({ account: syncError('subscription_required') }), ADA)).state, 'no_subscription');
    assert.equal((await checkAccess(auth, fakeSync({ account: syncError('signed_out') }), ADA)).state, 'signed_out');
    const failed = await checkAccess(auth, fakeSync({ account: syncError('network') }), ADA);
    assert.equal(failed.state, 'error');
    assert.equal(failed.error.code, 'network');
    const thrown = await checkAccess(auth, { configured: true, account() { throw syncError('network'); } }, ADA);
    assert.equal(thrown.state, 'error');
});

/** The profile "Cloud files" link with its lock icon. */
function fakeLink() {
    const classes = new Set();
    const attrs = {};
    const lock = { style: { display: '' } };
    return {
        style: { display: '' },
        title: '',
        lock,
        attrs,
        classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains: (name) => classes.has(name) },
        querySelector: (sel) => (sel === '.cloud-link__lock' ? lock : null),
        listeners: {},
        addEventListener(type, cb) { this.listeners[type] = cb; },
        click() {
            const event = { prevented: false, preventDefault() { this.prevented = true; } };
            if (this.listeners.click) this.listeners.click(event);
            return event.prevented; // true: the page did not open
        },
        setAttribute(name, value) { attrs[name] = value; },
        removeAttribute(name) { delete attrs[name]; },
        get visible() { return this.style.display !== 'none'; },
        get locked() { return classes.has('cloud-link--locked') && lock.style.display !== 'none' && this.title !== ''; },
        get unlocked() { return !classes.has('cloud-link--locked') && lock.style.display === 'none' && this.title === '' && !('aria-label' in attrs); }
    };
}

const settle = async () => { await tick(); await tick(); };

test('bindLink hides the link while signed out', async () => {
    const { bindLink } = loadGate();
    const link = fakeLink();
    bindLink(link, fakeAuth(), fakeSync());
    await settle();
    assert.equal(link.visible, false);
    const noAuth = fakeLink();
    bindLink(noAuth, fakeAuth({ configured: false, user: ADA }), fakeSync());
    await settle();
    assert.equal(noAuth.visible, false);
});

test('bindLink shows non-subscribers a locked link', async () => {
    const { bindLink, LOCKED_TITLE } = loadGate();
    for (const sync of [fakeSync({ account: LAPSED }), fakeSync({ account: syncError('subscription_required') }),
        fakeSync({ account: syncError('network') }), fakeSync({ configured: false })]) {
        const link = fakeLink();
        bindLink(link, fakeAuth({ user: ADA }), sync);
        await settle();
        assert.equal(link.visible, true);
        assert.equal(link.locked, true);
        assert.equal(link.title, LOCKED_TITLE);
        assert.equal(link.attrs['aria-label'], 'Cloud files (subscription needed)');
    }
});

test('bindLink unlocks the link for subscribers only after the API confirms', async () => {
    const { bindLink } = loadGate();
    let release;
    const slow = new Promise((resolve) => { release = resolve; });
    const link = fakeLink();
    bindLink(link, fakeAuth({ user: ADA }), fakeSync({ account: () => slow }));
    await tick();
    assert.equal(link.visible, true);
    assert.equal(link.locked, true, 'locked while the check runs');
    release(SUBSCRIBED);
    await settle();
    assert.equal(link.unlocked, true);
});

test('bindLink hides the link on sign-out and ignores a late answer', async () => {
    const { bindLink } = loadGate();
    let release;
    const slow = new Promise((resolve) => { release = resolve; });
    const auth = fakeAuth({ user: ADA });
    const link = fakeLink();
    bindLink(link, auth, fakeSync({ account: () => slow }));
    await tick();
    auth.set(null); // signs out before the account check answers
    release(SUBSCRIBED);
    await settle();
    assert.equal(link.visible, false);

    const auth2 = fakeAuth({ user: ADA });
    const link2 = fakeLink();
    bindLink(link2, auth2, fakeSync());
    await settle();
    assert.equal(link2.unlocked, true);
    auth2.set(null);
    assert.equal(link2.visible, false);
    assert.equal(link2.locked, true, 'locked again for the next sign-in');
});

/** A minimal DOM with the elements cloud.html gives cloud-page.js. */
function fakeDocument() {
    const nodes = new Map();
    const make = (tag, id) => {
        const node = {
            tagName: tag, id, hidden: false, className: '', href: '', open: false, value: '', checked: false,
            children: [], style: {}, listeners: {},
            classList: { toggle() {} },
            get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
            set textContent(value) { this._text = String(value); this.children = []; },
            _text: '',
            appendChild(child) { this.children.push(child); return child; },
            addEventListener(type, cb) { this.listeners[type] = cb; },
            setAttribute() {},
            close() { this.open = false; },
            showModal() { this.open = true; },
            remove() {}
        };
        if (id) nodes.set(id, node);
        return node;
    };
    ['cloud-status', 'cloud-error', 'cloud-locked', 'cloud-account', 'cloud-edition', 'cloud-quota-text', 'cloud-quota-bar', 'cloud-consent',
        'cloud-inbox', 'cloud-inbox-list', 'cloud-sessions', 'cloud-session-list', 'cloud-upload-input', 'cloud-upload-status',
        'cloud-share-dialog', 'cloud-share-name', 'cloud-share-emails', 'cloud-share-ai', 'cloud-share-expires',
        'cloud-share-error', 'cloud-share-recipients', 'cloud-share-submit'].forEach((id) => make('div', id));
    ['cloud-locked', 'cloud-account', 'cloud-inbox', 'cloud-sessions', 'cloud-error', 'cloud-consent', 'cloud-upload-status'].forEach((id) => { nodes.get(id).hidden = true; });
    nodes.get('cloud-status')._text = 'Loading…';
    return {
        nodes,
        getElementById: (id) => nodes.get(id) || null,
        createElement: (tag) => make(tag),
        querySelector: () => make('div'),
        body: make('body')
    };
}

async function runPage({ auth, sync }) {
    const document = fakeDocument();
    const window = { RaAuth: auth, RaCloudSync: sync, document };
    window.RaCloudGate = loadGate();
    vm.runInNewContext(pageSource, { window, document, Promise, setTimeout, URL, Blob, Date, Array, Math, String, Set });
    for (let i = 0; i < 6; i += 1) await tick();
    const n = (id) => document.nodes.get(id);
    return {
        document,
        status: () => (n('cloud-status').hidden ? '' : n('cloud-status').textContent),
        visible: (id) => !n(id).hidden,
        link: () => n('cloud-status').children.find((c) => c.tagName === 'a'),
        sessionCount: () => n('cloud-session-list').children.length
    };
}

test('page: API not configured shows "not available yet" and no data', async () => {
    const sync = fakeSync({ configured: false });
    const page = await runPage({ auth: fakeAuth({ user: ADA }), sync });
    assert.equal(page.status(), 'Cloud sync is not available yet.');
    assert.equal(page.visible('cloud-sessions'), false);
    assert.equal(page.visible('cloud-locked'), false);
    assert.deepEqual(sync.calls, []);
});

test('page: signed out shows a sign-in link and never asks for data', async () => {
    const sync = fakeSync({ units: { sessions: [{ id: 's1', name: 'Spa' }] } });
    const page = await runPage({ auth: fakeAuth(), sync });
    assert.match(page.status(), /Sign in/);
    assert.equal(page.link().href, 'race-insight.html');
    assert.equal(page.visible('cloud-locked'), true, 'shows what Cloud files offers');
    assert.equal(page.visible('cloud-sessions'), false);
    assert.equal(page.visible('cloud-account'), false);
    assert.deepEqual(sync.calls, []);
});

test('page: signed in without a subscription sees the message and no data', async () => {
    const sync = fakeSync({ account: LAPSED, units: { sessions: [{ id: 's1', name: 'Spa' }] } });
    const page = await runPage({ auth: fakeAuth({ user: ADA }), sync });
    assert.equal(page.status(), 'A RACE Insight subscription is needed to use Cloud files.');
    assert.equal(page.visible('cloud-sessions'), false);
    assert.equal(page.visible('cloud-inbox'), false);
    assert.equal(page.visible('cloud-account'), false);
    assert.equal(page.visible('cloud-locked'), true, 'shows what Cloud files offers');
    assert.deepEqual(sync.calls, ['account'], 'sessions and shares are not requested');
});

test('page: subscription_required from the API shows the subscription message', async () => {
    const sync = fakeSync({ account: syncError('subscription_required') });
    const page = await runPage({ auth: fakeAuth({ user: ADA }), sync });
    assert.equal(page.status(), 'A RACE Insight subscription is needed to use Cloud files.');
    assert.equal(page.visible('cloud-sessions'), false);
});

test('page: subscriber sees account and sessions; sign-out clears them', async () => {
    const auth = fakeAuth({ user: ADA });
    const sync = fakeSync({ units: { sessions: [{ id: 's1', name: 'Spa' }, { id: 's2', name: 'Monza' }] } });
    const page = await runPage({ auth, sync });
    assert.equal(page.status(), '');
    assert.equal(page.visible('cloud-account'), true);
    assert.equal(page.visible('cloud-sessions'), true);
    assert.equal(page.sessionCount(), 2);
    assert.equal(page.visible('cloud-locked'), false, 'no lock card for subscribers');
    assert.deepEqual([...sync.calls].sort(), ['account', 'listShares', 'listUnits']);

    auth.set(null);
    assert.equal(page.visible('cloud-sessions'), false);
    assert.equal(page.visible('cloud-account'), false);
    assert.equal(page.sessionCount(), 0);
    assert.match(page.status(), /Sign in/);
});

test('page: data that arrives after sign-out is not shown', async () => {
    let release;
    const slow = new Promise((resolve) => { release = resolve; });
    const auth = fakeAuth({ user: ADA });
    const sync = fakeSync({ units: () => slow });
    const page = await runPage({ auth, sync });
    auth.set(null);
    release({ sessions: [{ id: 's1', name: 'Spa' }] });
    for (let i = 0; i < 4; i += 1) await tick();
    assert.equal(page.visible('cloud-sessions'), false);
    assert.equal(page.sessionCount(), 0);
    assert.match(page.status(), /Sign in/);
});

test('in the browser, every [data-cloud-link] element is bound', async () => {
    const links = [fakeLink(), fakeLink()];
    const auth = fakeAuth({ user: ADA });
    const window = {
        RaAuth: auth,
        RaCloudSync: fakeSync({ account: LAPSED }),
        document: { querySelectorAll: (sel) => (sel === '[data-cloud-link]' ? links : []), getElementById: () => null }
    };
    vm.runInNewContext(gateSource, { window, Promise, Array });
    await settle();
    assert.equal(typeof window.RaCloudGate.bindLink, 'function');
    links.forEach((link) => {
        assert.equal(link.visible, true);
        assert.equal(link.locked, true);
    });
    auth.set(null);
    links.forEach((link) => assert.equal(link.visible, false));
});

test('clicking a locked link calls onLocked with the state instead of opening the page', async () => {
    const { bindLink } = loadGate();
    for (const [sync, state] of [[fakeSync({ account: LAPSED }), 'no_subscription'],
        [fakeSync({ configured: false }), 'unavailable'], [fakeSync({ account: syncError('network') }), 'error']]) {
        const seen = [];
        const link = fakeLink();
        bindLink(link, fakeAuth({ user: ADA }), sync, { onLocked: (s) => { seen.push(s); return true; } });
        await settle();
        assert.equal(link.click(), true, 'navigation prevented');
        assert.deepEqual(seen, [state]);
    }
});

test('clicking opens the page for subscribers, while checking, or without a popup', async () => {
    const { bindLink } = loadGate();
    const calls = [];
    const onLocked = (s) => { calls.push(s); return true; };

    const subscriber = fakeLink();
    bindLink(subscriber, fakeAuth({ user: ADA }), fakeSync(), { onLocked });
    await settle();
    assert.equal(subscriber.click(), false);

    let release;
    const slow = new Promise((resolve) => { release = resolve; });
    const checking = fakeLink();
    bindLink(checking, fakeAuth({ user: ADA }), fakeSync({ account: () => slow }), { onLocked });
    await tick();
    assert.equal(checking.click(), false, 'the page checks again itself');
    release(LAPSED);
    await settle();
    assert.equal(checking.click(), true);

    const noPopup = fakeLink();
    bindLink(noPopup, fakeAuth({ user: ADA }), fakeSync({ account: LAPSED }), { onLocked: () => false });
    await settle();
    assert.equal(noPopup.click(), false, 'falls back to the page');

    assert.deepEqual(calls, ['no_subscription']);
});

/** A fake document holding the popup elements. */
function popupDocument({ withDialog = true } = {}) {
    const el = () => ({ textContent: '', style: { display: '' } });
    const nodes = {
        'cloud-locked-title': el(), 'cloud-locked-body': el(), 'cloud-locked-contact': el(),
        'cloud-locked-dialog': { open: false, showModal() { this.open = true; } }
    };
    if (!withDialog) delete nodes['cloud-locked-dialog'];
    return { nodes, getElementById: (id) => nodes[id] || null };
}

test('openLockedDialog shows the text for each state', () => {
    const { openLockedDialog, LOCKED_MESSAGES } = loadGate();
    const doc = popupDocument();
    assert.equal(openLockedDialog(doc, 'no_subscription'), true);
    assert.equal(doc.nodes['cloud-locked-dialog'].open, true);
    assert.equal(doc.nodes['cloud-locked-title'].textContent, LOCKED_MESSAGES.no_subscription.title);
    assert.equal(doc.nodes['cloud-locked-contact'].style.display, '');

    const soon = popupDocument();
    openLockedDialog(soon, 'unavailable');
    assert.equal(soon.nodes['cloud-locked-title'].textContent, 'Cloud files are coming soon');
    assert.equal(soon.nodes['cloud-locked-contact'].style.display, 'none', 'nothing to buy yet');

    const odd = popupDocument();
    openLockedDialog(odd, 'something_else');
    assert.equal(odd.nodes['cloud-locked-title'].textContent, LOCKED_MESSAGES.error.title);

    assert.equal(openLockedDialog(popupDocument({ withDialog: false }), 'no_subscription'), false);
    assert.equal(openLockedDialog(null, 'no_subscription'), false);
});
