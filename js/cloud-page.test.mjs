// Run with: node --test js/cloud-page.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const gateSource = read('./cloud-gate.js');
const explorerSource = read('./cloud-explorer.js');
const pageSource = read('./cloud-page.js');

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async (n = 8) => { for (let i = 0; i < n; i += 1) await tick(); };

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

function fakeSync({ configured = true, account = SUBSCRIBED, units = UNITS, shares = {}, files = FILES, slowUnits = null } = {}) {
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
        listUnits: () => answer('listUnits', slowUnits || units),
        listShares: () => answer('listShares', shares),
        unitFiles: (kind, id) => answer(`unitFiles:${kind}:${id}`, files),
        sharedFiles: (id) => answer(`sharedFiles:${id}`, files),
        downloadFile: (file, shareId) => answer(`download:${file.name}:${shareId || ''}`, new ArrayBuffer(file.size)),
        createShare: (...args) => answer(`createShare:${args[0]}:${args[1].join(',')}`, {}),
        acceptShare: (id) => answer(`accept:${id}`, {}),
        removeShare: (id) => answer(`remove:${id}`, {}),
        uploadSession: () => answer('upload', { sessionId: 's2' }),
        friendlyError: (err) => (err && err.message) || 'Cloud sync failed.'
    };
}

/** A small DOM: enough elements and events for cloud-page.js. */
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
            setAttribute(name, value) { this.attrs[name] = value; },
            close() { this.open = false; this.dispatch('close'); },
            showModal() { this.open = true; },
            remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
        };
        if (id) nodes.set(id, node);
        return node;
    }
    ['cloud-status', 'cloud-error', 'cloud-locked', 'cloud-account', 'cloud-edition', 'cloud-quota-text', 'cloud-quota-bar',
        'cloud-consent', 'cloud-explorer', 'cx-breadcrumbs', 'cx-open-btn', 'cx-share-btn', 'cx-upload-label',
        'cloud-upload-input', 'cloud-upload-status', 'cx-tree', 'cx-list', 'cx-empty',
        'cx-viewer', 'cx-viewer-title', 'cx-viewer-body', 'cx-viewer-download', 'cx-viewer-close',
        'cx-open-dialog', 'cx-open-text',
        'cloud-share-dialog', 'cloud-share-name', 'cloud-share-emails', 'cloud-share-ai', 'cloud-share-expires',
        'cloud-share-error', 'cloud-share-recipients', 'cloud-share-submit'].forEach((id) => make('div', id));
    ['cloud-account', 'cloud-explorer', 'cloud-locked', 'cloud-error', 'cloud-consent', 'cloud-upload-status',
        'cx-open-btn', 'cx-share-btn', 'cx-empty'].forEach((id) => { nodes.get(id).hidden = true; });
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

async function runPage({ auth, sync, hash = '' }) {
    const dom = fakeDom();
    const hashListeners = [];
    const location = {
        _hash: hash,
        get hash() { return this._hash; },
        set hash(value) { this._hash = value; setTimeout(() => hashListeners.forEach((cb) => cb()), 0); }
    };
    const window = {
        RaAuth: auth, RaCloudSync: sync, document: dom.document, location,
        addEventListener: (type, cb) => { if (type === 'hashchange') hashListeners.push(cb); }
    };
    window.RaCloudGate = loadModule(gateSource);
    window.RaCloudExplorer = loadModule(explorerSource);
    const URL = { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} };
    class Blob { constructor(parts, options) { this.parts = parts; this.type = options && options.type; } }
    vm.runInNewContext(pageSource, { window, document: dom.document, Promise, setTimeout, URL, Blob, Date, Array, Math, String, Set, isNaN });
    await settle();
    const n = (id) => dom.nodes.get(id);
    const rows = () => n('cx-list').children;
    const rowNames = () => rows().map((r) => r.children[0].children[1].children[0].textContent);
    const rowByName = (name) => rows().find((r) => r.children[0].children[1].children[0].textContent === name);
    const actionsOf = (row) => row.children[4].children;
    return {
        dom, n, rows, rowNames, rowByName, actionsOf, location,
        status: () => (n('cloud-status').hidden ? '' : n('cloud-status').textContent),
        visible: (id) => !n(id).hidden,
        go: async (h) => { location.hash = h; await settle(); },
        openRow: async (name) => { rowByName(name).children[0].click(); await settle(); }
    };
}

/* ---- Access ---- */

test('page: API not configured shows "not available yet" and no data', async () => {
    const sync = fakeSync({ configured: false });
    const page = await runPage({ auth: fakeAuth({ user: ADA }), sync });
    assert.equal(page.status(), 'Cloud sync is not available yet.');
    assert.equal(page.visible('cloud-explorer'), false);
    assert.equal(page.visible('cloud-locked'), false);
    assert.deepEqual(sync.calls, []);
});

test('page: signed out shows a sign-in link, the feature card, and asks for no data', async () => {
    const sync = fakeSync();
    const page = await runPage({ auth: fakeAuth(), sync });
    assert.match(page.status(), /Sign in/);
    assert.equal(page.visible('cloud-locked'), true);
    assert.equal(page.visible('cloud-explorer'), false);
    assert.deepEqual(sync.calls, []);
});

test('page: no subscription shows the message and never lists projects or files', async () => {
    const sync = fakeSync({ account: LAPSED });
    const page = await runPage({ auth: fakeAuth({ user: ADA }), sync, hash: '#s=s1' });
    assert.equal(page.status(), 'A RACE Insight subscription is needed to use Cloud files.');
    assert.equal(page.visible('cloud-explorer'), false);
    assert.equal(page.visible('cloud-locked'), true);
    assert.deepEqual(sync.calls, ['account']);
});

test('page: subscription_required from the API shows the subscription message', async () => {
    const page = await runPage({ auth: fakeAuth({ user: ADA }), sync: fakeSync({ account: syncError('subscription_required') }) });
    assert.equal(page.status(), 'A RACE Insight subscription is needed to use Cloud files.');
    assert.equal(page.visible('cloud-explorer'), false);
});

test('page: sign-out clears the explorer', async () => {
    const auth = fakeAuth({ user: ADA });
    const page = await runPage({ auth, sync: fakeSync() });
    assert.equal(page.visible('cloud-explorer'), true);
    assert.equal(page.rows().length, 2);
    auth.set(null);
    assert.equal(page.visible('cloud-explorer'), false);
    assert.equal(page.rows().length, 0);
    assert.match(page.status(), /Sign in/);
});

test('page: data that arrives after sign-out is not shown', async () => {
    let release;
    const slow = new Promise((resolve) => { release = resolve; });
    const auth = fakeAuth({ user: ADA });
    const page = await runPage({ auth, sync: fakeSync({ slowUnits: () => slow }) });
    auth.set(null);
    release(UNITS);
    await settle();
    assert.equal(page.visible('cloud-explorer'), false);
    assert.equal(page.rows().length, 0);
});

/* ---- Explorer ---- */

test('explorer: My files lists projects, Library first; folders open by click', async () => {
    const sync = fakeSync();
    const page = await runPage({ auth: fakeAuth({ user: ADA }), sync });
    assert.deepEqual(page.rowNames(), ['Library', 'Spa 2026']);
    assert.equal(page.n('cx-breadcrumbs').textContent, 'My files');

    await page.openRow('Spa 2026');
    assert.equal(page.location.hash, '#p=p1');
    assert.deepEqual(page.rowNames(), ['Race']);
    assert.match(page.n('cx-breadcrumbs').textContent, /My files.*Spa 2026/);

    await page.openRow('Race');
    assert.equal(page.location.hash, '#s=s1');
    assert.ok(sync.calls.includes('unitFiles:session:s1'));
    assert.deepEqual(page.rowNames(), ['old.ld', 'race.ibt', 'notes.txt', 'onboard.mp4'], 'RACE Insight files first');
    assert.equal(page.visible('cx-share-btn'), true);
    assert.equal(page.visible('cx-open-btn'), true);
});

test('explorer: a RACE Insight file opens the desktop app', async () => {
    const page = await runPage({ auth: fakeAuth({ user: ADA }), sync: fakeSync(), hash: '#s=s1' });
    await page.openRow('race.ibt');
    assert.deepEqual(page.dom.clicked, [`raceinsight://cloud/open?session=s1&file=${SHA('b')}`]);
    assert.equal(page.n('cx-open-dialog').open, true);
    assert.match(page.n('cx-open-text').textContent, /race\.ibt/);
});

test('explorer: a video opens the viewer after download; archived files do nothing', async () => {
    const sync = fakeSync();
    const page = await runPage({ auth: fakeAuth({ user: ADA }), sync, hash: '#s=s1' });
    await page.openRow('onboard.mp4');
    assert.equal(page.n('cx-viewer').open, true);
    assert.equal(page.n('cx-viewer-title').textContent, 'onboard.mp4');
    const media = page.n('cx-viewer-body').children[0];
    assert.equal(media.tagName, 'video');
    assert.equal(media.src, 'blob:fake');
    assert.ok(sync.calls.includes('download:onboard.mp4:'));

    page.n('cx-viewer-close').click();
    assert.equal(page.n('cx-viewer').open, false);
    assert.equal(page.n('cx-viewer-body').children.length, 0);

    const archived = page.rowByName('old.ld');
    assert.equal(archived.children[0].tagName, 'div', 'no open action');
    assert.equal(page.actionsOf(archived).length, 0);
});

test('explorer: other files download', async () => {
    const sync = fakeSync();
    const page = await runPage({ auth: fakeAuth({ user: ADA }), sync, hash: '#s=s1' });
    await page.openRow('notes.txt');
    assert.ok(sync.calls.includes('download:notes.txt:'));
    assert.equal(page.n('cx-viewer').open, false);
});

test('explorer: Share opens the dialog for the current session and sends invitations', async () => {
    const sync = fakeSync();
    const page = await runPage({ auth: fakeAuth({ user: ADA }), sync, hash: '#s=s1' });
    page.n('cx-share-btn').click();
    assert.equal(page.n('cloud-share-dialog').open, true);
    assert.equal(page.n('cloud-share-name').textContent, 'Race');
    page.n('cloud-share-emails').value = 'Bo@Example.com, bo@example.com';
    page.n('cloud-share-submit').click();
    await settle();
    assert.ok(sync.calls.includes('createShare:s1:bo@example.com'));
});

test('explorer: Shared with me lists invitations and shared sessions', async () => {
    const shares = {
        inbox: [{ share_id: SHARE_ID, session_name: 'Le Mans', owner_name: 'Ada', status: 'accepted' }],
        pending: [{ share_id: '5'.repeat(32), session_name: 'Daytona', owner_name: 'Bo' }]
    };
    const sync = fakeSync({ shares });
    const page = await runPage({ auth: fakeAuth({ user: ADA }), sync, hash: '#shared' });
    assert.deepEqual(page.rowNames(), ['Daytona', 'Le Mans']);
    assert.equal(page.n('cx-upload-label').hidden, true);

    page.actionsOf(page.rowByName('Daytona'))[0].click(); // Accept
    await settle();
    assert.ok(sync.calls.includes(`accept:${'5'.repeat(32)}`));

    await page.openRow('Le Mans');
    assert.equal(page.location.hash, `#sh=${SHARE_ID}`);
    assert.ok(sync.calls.includes(`sharedFiles:${SHARE_ID}`));
    assert.equal(page.visible('cx-share-btn'), false, 'only the owner shares');
    await page.openRow('race.ibt');
    assert.deepEqual(page.dom.clicked, [`raceinsight://cloud/open?share=${SHARE_ID}&file=${SHA('b')}`]);
});

test('explorer: an unknown folder in the URL falls back to My files', async () => {
    const page = await runPage({ auth: fakeAuth({ user: ADA }), sync: fakeSync(), hash: '#s=gone' });
    assert.deepEqual(page.rowNames(), ['Library', 'Spa 2026']);
});
