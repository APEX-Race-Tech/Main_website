// Run with: node --test js/cloud-app.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const gateSource = read('./cloud-gate.js');
const explorerSource = read('./cloud-explorer.js');
const appSource = read('./cloud-app.js');

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async (n = 10) => { for (let i = 0; i < n; i += 1) await tick(); };

function loadModule(source) {
    const sandbox = { module: { exports: {} }, Promise };
    vm.runInNewContext(source, sandbox);
    return sandbox.module.exports;
}

/* ---- Fakes ---- */

function fakeAuth({ user = null } = {}) {
    const listeners = [];
    return {
        configured: true,
        currentUser: user,
        onAuthStateChanged(cb) { listeners.push(cb); setTimeout(() => cb(this.currentUser), 0); return () => {}; },
        set(next) { this.currentUser = next; listeners.forEach((cb) => cb(next)); }
    };
}

const ADA = { uid: 'sub-ada' };
const SUBSCRIBED = { entitlement: { active: true, edition: 'Pro' }, quota: { bytes_used: 0, limit: 10 * 1024 ** 3 }, consent_version: 1 };
const LAPSED = { entitlement: { active: false }, quota: {} };
const SHA = (c) => c.repeat(64);
const SHARE_ID = '4'.repeat(32);

const UNITS = {
    projects: [{ id: '_library', name: '' }, { id: 'p1', name: 'Spa 2026' }],
    sessions: [{ id: 's1', name: 'Race', project_id: 'p1' }, { id: 's2', name: 'Upload', project_id: '_library' }]
};
const FILES = [
    { name: 'onboard.mp4', sha256: SHA('a'), size: 2048, storage: 'standard' },
    { name: 'race.ibt', sha256: SHA('b'), size: 4096, storage: 'standard' },
    { name: 'old.ld', sha256: SHA('c'), size: 10, storage: 'archived' },
    { name: 'notes.txt', sha256: SHA('d'), size: 10, storage: 'standard' }
];

function syncError(code) { const err = new Error(code); err.code = code; return err; }

function fakeSync({ configured = true, account = SUBSCRIBED, units = UNITS, shares = {}, files = FILES, slowUnits = null, demo = false } = {}) {
    const calls = [];
    const answer = (name, value) => {
        calls.push(name);
        if (value instanceof Error) return Promise.reject(value);
        return Promise.resolve(typeof value === 'function' ? value() : value);
    };
    return {
        configured,
        demo,
        calls,
        account: () => answer('account', account),
        listUnits: () => answer('listUnits', slowUnits || units),
        listShares: () => answer('listShares', shares),
        unitFiles: (kind, id) => answer(`unitFiles:${kind}:${id}`, files),
        sharedFiles: (id) => answer(`sharedFiles:${id}`, files),
        downloadFile: (file, shareId) => answer(`download:${file.name}:${shareId || ''}`, new ArrayBuffer(file.size)),
        createShare: (...args) => answer(`createShare:${args[0]}:${args[1].join(',')}`, {}),
        acceptShare: (id) => answer(`accept:${id}`, {}),
        removeShare: (id) => answer(`remove:${id}`, {}),
        friendlyError: (err) => (err && err.message) || 'Cloud sync failed.'
    };
}

/** A small DOM: enough elements and events for cloud-app.js. */
function fakeDom() {
    const nodes = new Map();
    const clicked = [];
    function make(tag, id) {
        const node = {
            tagName: tag, id, hidden: false, className: '', href: '', open: false, value: '', checked: false,
            disabled: false, type: '', title: '', src: '', alt: '', download: '', rel: '',
            children: [], style: {}, listeners: {}, attrs: {}, parent: null,
            classList: { toggle() {} },
            get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
            set textContent(value) { this._text = String(value); this.children = []; },
            _text: '',
            appendChild(child) { child.parent = this; this.children.push(child); return child; },
            addEventListener(type, cb) { (this.listeners[type] = this.listeners[type] || []).push(cb); },
            dispatch(type, extra = {}) {
                const event = { target: this, stopPropagation() {}, preventDefault() {}, ...extra };
                (this.listeners[type] || []).forEach((cb) => cb(event));
            },
            click() {
                if (this.tagName === 'a') clicked.push(this.href);
                this.dispatch('click');
            },
            querySelector: () => make('div'),
            setAttribute(name, value) { this.attrs[name] = value; },
            close() { if (!this.open) return; this.open = false; this.dispatch('close'); },
            showModal() { this.open = true; },
            remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
        };
        if (id) nodes.set(id, node);
        return node;
    }
    ['cloud-modal', 'cloud-modal-close', 'cloud-demo-badge', 'cloud-status', 'cloud-error', 'cloud-locked',
        'cloud-signin-btn', 'cloud-account', 'cloud-edition', 'cloud-quota-text', 'cloud-quota-bar',
        'cloud-consent', 'cloud-explorer', 'cx-breadcrumbs', 'cx-open-btn', 'cx-share-btn',
        'cx-tree', 'cx-list', 'cx-empty',
        'cx-viewer', 'cx-viewer-title', 'cx-viewer-body', 'cx-viewer-download', 'cx-viewer-close',
        'cx-open-dialog', 'cx-open-text', 'cx-open-get', 'nav-signin-btn',
        'cloud-share-dialog', 'cloud-share-name', 'cloud-share-emails', 'cloud-share-ai', 'cloud-share-expires',
        'cloud-share-error', 'cloud-share-recipients', 'cloud-share-submit'].forEach((id) => make('div', id));
    ['cloud-account', 'cloud-explorer', 'cloud-locked', 'cloud-signin-btn', 'cloud-error', 'cloud-consent',
        'cx-open-btn', 'cx-share-btn', 'cx-empty', 'cloud-demo-badge'].forEach((id) => { nodes.get(id).hidden = true; });
    nodes.get('cloud-status')._text = 'Loading…';
    const document = {
        getElementById: (id) => nodes.get(id) || null,
        createElement: (tag) => make(tag),
        createTextNode: (text) => ({ textContent: text }),
        querySelector: () => make('div'),
        body: make('body')
    };
    return { nodes, document, clicked };
}

async function runApp({ auth, sync, hash = '' }) {
    const dom = fakeDom();
    const hashListeners = [];
    const location = {
        pathname: '/race-insight.html',
        search: '',
        _hash: hash,
        get hash() { return this._hash; },
        set hash(value) {
            const next = value && value[0] !== '#' ? '#' + value : value;
            if (next === this._hash) return;
            this._hash = next;
            setTimeout(() => hashListeners.forEach((cb) => cb()), 0);
        }
    };
    const history = { replaceState: (_s, _t, url) => { location._hash = url.includes('#') ? url.slice(url.indexOf('#')) : ''; } };
    const window = {
        RaAuth: auth, RaCloudSync: sync, document: dom.document, location, history,
        addEventListener: (type, cb) => { if (type === 'hashchange') hashListeners.push(cb); }
    };
    window.RaCloudGate = loadModule(gateSource);
    window.RaCloudExplorer = loadModule(explorerSource);
    const URL = { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} };
    class Blob { constructor(parts, options) { this.parts = parts; this.type = options && options.type; } }
    vm.runInNewContext(appSource, { window, document: dom.document, Promise, setTimeout, URL, Blob, Date, Array, Math, String, Set, isNaN });
    await settle();
    const n = (id) => dom.nodes.get(id);
    const rows = () => n('cx-list').children;
    const titleOf = (r) => r.children[0].children[1].children[0].textContent;
    const rowNames = () => rows().map(titleOf);
    const rowByName = (name) => rows().find((r) => titleOf(r) === name);
    const actionsOf = (row) => row.children[4].children;
    const treeLabels = () => n('cx-tree').children.filter((c) => c.tagName === 'button').map((b) => b.children[1].textContent);
    return {
        dom, n, rows, rowNames, rowByName, actionsOf, treeLabels, location, window,
        status: () => (n('cloud-status').hidden ? '' : n('cloud-status').textContent),
        visible: (id) => !n(id).hidden,
        open: async (loc) => { window.RaCloudApp.open(loc); await settle(); },
        go: async (h) => { location.hash = h; await settle(); },
        openRow: async (name) => { rowByName(name).children[0].click(); await settle(); }
    };
}

/* ---- Opening and access ---- */

test('popup: stays closed until opened; open() shows My files and sets #cloud', async () => {
    const sync = fakeSync();
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync });
    assert.equal(app.n('cloud-modal').open, false);
    assert.deepEqual(sync.calls, [], 'nothing loads before the popup opens');
    await app.open();
    assert.equal(app.n('cloud-modal').open, true);
    assert.equal(app.location.hash, '#cloud');
    assert.deepEqual(app.rowNames(), ['Library', 'Spa 2026']);
});

test('popup: a #cloud link opens it at that folder; closing removes the hash', async () => {
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync(), hash: '#cloud/p=p1' });
    assert.equal(app.n('cloud-modal').open, true);
    assert.deepEqual(app.rowNames(), ['Race']);
    app.n('cloud-modal-close').click();
    assert.equal(app.n('cloud-modal').open, false);
    assert.equal(app.location.hash, '');
});

test('popup: the back button (hash leaves #cloud) closes it', async () => {
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync(), hash: '#cloud' });
    await app.go('#features');
    assert.equal(app.n('cloud-modal').open, false);
    assert.equal(app.location.hash, '#features', 'other anchors are left alone');
});

test('popup: API not configured shows "not available yet" and no data', async () => {
    const sync = fakeSync({ configured: false });
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync, hash: '#cloud' });
    assert.equal(app.status(), 'Cloud sync is not available yet.');
    assert.equal(app.visible('cloud-explorer'), false);
    assert.deepEqual(sync.calls, []);
});

test('popup: signed out shows the feature list and a Sign in button, and asks for no data', async () => {
    const sync = fakeSync();
    const app = await runApp({ auth: fakeAuth(), sync, hash: '#cloud' });
    assert.match(app.status(), /Sign in/);
    assert.equal(app.visible('cloud-locked'), true);
    assert.equal(app.visible('cloud-signin-btn'), true);
    assert.equal(app.visible('cloud-explorer'), false);
    assert.deepEqual(sync.calls, []);
    let signInClicked = false;
    app.n('nav-signin-btn').addEventListener('click', () => { signInClicked = true; });
    app.n('cloud-signin-btn').click();
    assert.equal(signInClicked, true);
    assert.equal(app.n('cloud-modal').open, false);
});

test('popup: no subscription shows the message and never lists projects or files', async () => {
    const sync = fakeSync({ account: LAPSED });
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync, hash: '#cloud/s=s1' });
    assert.equal(app.status(), 'A RACE Insight subscription is needed to use Cloud files.');
    assert.equal(app.visible('cloud-explorer'), false);
    assert.equal(app.visible('cloud-signin-btn'), false);
    assert.deepEqual(sync.calls, ['account']);
});

test('popup: subscription_required from the API shows the subscription message', async () => {
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync({ account: syncError('subscription_required') }), hash: '#cloud' });
    assert.equal(app.status(), 'A RACE Insight subscription is needed to use Cloud files.');
});

test('popup: sign-out clears the explorer', async () => {
    const auth = fakeAuth({ user: ADA });
    const app = await runApp({ auth, sync: fakeSync(), hash: '#cloud' });
    assert.equal(app.rows().length, 2);
    auth.set(null);
    assert.equal(app.visible('cloud-explorer'), false);
    assert.equal(app.rows().length, 0);
    assert.match(app.status(), /Sign in/);
});

test('popup: data that arrives after sign-out is not shown', async () => {
    let release;
    const slow = new Promise((resolve) => { release = resolve; });
    const auth = fakeAuth({ user: ADA });
    const app = await runApp({ auth, sync: fakeSync({ slowUnits: () => slow }), hash: '#cloud' });
    auth.set(null);
    release(UNITS);
    await settle();
    assert.equal(app.visible('cloud-explorer'), false);
    assert.equal(app.rows().length, 0);
});

test('popup: reopening uses the loaded data', async () => {
    const sync = fakeSync();
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync, hash: '#cloud' });
    app.n('cloud-modal-close').click();
    await app.open();
    assert.equal(sync.calls.filter((c) => c === 'listUnits').length, 1);
    assert.deepEqual(app.rowNames(), ['Library', 'Spa 2026']);
});

/* ---- Explorer ---- */

test('explorer: folders open by click; the tree lists both sharing folders', async () => {
    const sync = fakeSync();
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync, hash: '#cloud' });
    assert.deepEqual(app.treeLabels(), ['My files', 'Library', 'Spa 2026', 'Shared with me', 'Shared with others']);
    await app.openRow('Spa 2026');
    assert.equal(app.location.hash, '#cloud/p=p1');
    await app.openRow('Race');
    assert.equal(app.location.hash, '#cloud/s=s1');
    assert.ok(sync.calls.includes('unitFiles:session:s1'));
    assert.deepEqual(app.rowNames(), ['old.ld', 'race.ibt', 'notes.txt', 'onboard.mp4'], 'RACE Insight files first');
    assert.equal(app.visible('cx-share-btn'), true);
});

test('explorer: a RACE Insight file opens the desktop app', async () => {
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync(), hash: '#cloud/s=s1' });
    await app.openRow('race.ibt');
    assert.deepEqual(app.dom.clicked, [`raceinsight://cloud/open?session=s1&file=${SHA('b')}`]);
    assert.equal(app.n('cx-open-dialog').open, true);
});

test('explorer: with sample data, RACE Insight files do not launch the desktop app', async () => {
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync({ demo: true }), hash: '#cloud/s=s1' });
    assert.equal(app.visible('cloud-demo-badge'), true);
    await app.openRow('race.ibt');
    assert.deepEqual(app.dom.clicked, []);
    assert.match(app.n('cx-open-text').textContent, /With real data/);
});

test('explorer: a video opens the viewer; archived files have no actions', async () => {
    const sync = fakeSync();
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync, hash: '#cloud/s=s1' });
    await app.openRow('onboard.mp4');
    assert.equal(app.n('cx-viewer').open, true);
    assert.equal(app.n('cx-viewer-body').children[0].tagName, 'video');
    app.n('cx-viewer-close').click();
    assert.equal(app.n('cx-viewer').open, false);
    const archived = app.rowByName('old.ld');
    assert.equal(archived.children[0].tagName, 'div');
    assert.equal(app.actionsOf(archived).length, 0);
});

test('explorer: Share sends invitations for the current session', async () => {
    const sync = fakeSync();
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync, hash: '#cloud/s=s1' });
    app.n('cx-share-btn').click();
    assert.equal(app.n('cloud-share-dialog').open, true);
    app.n('cloud-share-emails').value = 'Bo@Example.com, bo@example.com';
    app.n('cloud-share-submit').click();
    await settle();
    assert.ok(sync.calls.includes('createShare:s1:bo@example.com'));
});

test('explorer: Shared with me lists invitations and shared sessions', async () => {
    const shares = {
        inbox: [{ share_id: SHARE_ID, session_name: 'Le Mans', owner_name: 'Ada', status: 'accepted' }],
        pending: [{ share_id: '5'.repeat(32), session_name: 'Daytona', owner_name: 'Bo' }]
    };
    const sync = fakeSync({ shares });
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync, hash: '#cloud/shared' });
    assert.deepEqual(app.rowNames(), ['Daytona', 'Le Mans']);
    app.actionsOf(app.rowByName('Daytona'))[0].click(); // Accept
    await settle();
    assert.ok(sync.calls.includes(`accept:${'5'.repeat(32)}`));
    await app.openRow('Le Mans');
    assert.equal(app.location.hash, `#cloud/sh=${SHARE_ID}`);
    await app.openRow('race.ibt');
    assert.deepEqual(app.dom.clicked, [`raceinsight://cloud/open?share=${SHARE_ID}&file=${SHA('b')}`]);
});

test('explorer: Shared with others lists your shared sessions and their recipients', async () => {
    const shares = {
        outgoing: [
            { share_id: '1'.repeat(32), session_id: 's1', status: 'accepted', recipient_email: 'eng@example.com' },
            { share_id: '2'.repeat(32), session_id: 's1', status: 'pending', recipient_email: 'coach@example.com' },
            { share_id: '3'.repeat(32), session_id: 's2', status: 'revoked', recipient_email: 'old@example.com' }
        ]
    };
    const sync = fakeSync({ shares });
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync, hash: '#cloud/outgoing' });
    assert.deepEqual(app.rowNames(), ['Race'], 'revoked shares are left out');
    const race = app.rowByName('Race');
    assert.match(race.textContent, /eng@example\.com, coach@example\.com \(invited\)/);
    assert.match(race.textContent, /2 people/);
    app.actionsOf(race)[0].click(); // Manage sharing
    await settle();
    assert.equal(app.n('cloud-share-dialog').open, true);
    assert.equal(app.n('cloud-share-name').textContent, 'Race');
    app.n('cloud-share-dialog').close();
    await app.openRow('Race');
    assert.equal(app.location.hash, '#cloud/s=s1');
});

test('explorer: an unknown folder in the URL falls back to My files', async () => {
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync(), hash: '#cloud/s=gone' });
    assert.deepEqual(app.rowNames(), ['Library', 'Spa 2026']);
});

test('popup: a late close event after reopening does not clear the new view', async () => {
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync(), hash: '#cloud/p=p1' });
    const modal = app.n('cloud-modal');
    // Close without dispatching yet, reopen, then deliver the queued close event.
    modal.open = false;
    await app.open({ type: 'session', id: 's1' });
    modal.dispatch('close');
    await settle();
    assert.equal(modal.open, true);
    assert.equal(app.location.hash, '#cloud/s=s1');
});

test('popup: there is no upload control (sessions come from the desktop app)', async () => {
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync({ units: { projects: [], sessions: [] } }), hash: '#cloud' });
    assert.equal(app.n('cx-upload-label'), undefined);
    assert.match(app.n('cx-empty').textContent, /desktop app/);
});
