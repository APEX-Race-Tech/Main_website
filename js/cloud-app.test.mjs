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
const settle = async (n = 20) => { for (let i = 0; i < n; i += 1) await tick(); };

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

const GIB = 1024 ** 3;
const ADA = { uid: 'sub-ada' };
const SUBSCRIBED = { entitlement: { active: true, edition: 'paid' }, quota: { bytes_used: 0.2 * GIB, limit: 15 * GIB }, consent_version: 1 };
const LAPSED = { entitlement: { active: false }, quota: {} };
const SHA = (c) => c.repeat(64);
const S1 = 'a1'.repeat(32); // session ids are the SHA-256 of the logger file
const S2 = 'b2'.repeat(32);
const SHARE_ID = '4'.repeat(32);
const INVITE_ID = '5'.repeat(32);

const UNITS = {
    projects: [{ id: '_library', name: '' }],
    sessions: [
        { id: S1, name: 'Spa-Francorchamps', project_id: '_library', updated_at: '2026-11-20T10:00:00Z', head_rev: '0000000002' },
        { id: S2, name: 'Monza', project_id: '_library', updated_at: '2026-11-01T10:00:00Z', head_rev: '0000000001' }
    ]
};
const DOC_S1 = `session_${S1.slice(0, 16)}.risession`;
const DOC_S2 = `session_${S2.slice(0, 16)}.risession`;
const DOCS = {
    [DOC_S1]: { schema: 'race-insight-session', version: 1, file_name: 'spa 2026-11-22 14-05-10_Race_1.ld', laps: [{}, {}, {}],
        metadata: { Venue: 'Spa-Francorchamps', Vehicle: 'Formula Vee', Driver: 'Ada Driver' } },
    [DOC_S2]: { schema: 'race-insight-session', version: 1, file_name: 'monza_long_run.ld', laps: [],
        metadata: { Venue: 'Monza', Vehicle: 'GT3', Driver: 'Bo', Date: '27/10/2026' } }
};
const FILES = {
    [S1]: [
        { name: `${S1}.apx`, sha256: S1, size: 31 * 1024 * 1024, storage: 'standard' },
        { name: DOC_S1, sha256: SHA('e'), size: 2048, storage: 'standard' },
        { name: 'onboard.mp4', sha256: SHA('a'), size: 2048, storage: 'standard' },
        { name: 'old.ld', sha256: SHA('c'), size: 10, storage: 'archived' }
    ],
    [S2]: [
        { name: `${S2}.apx`, sha256: S2, size: 14 * 1024 * 1024, storage: 'standard' },
        { name: DOC_S2, sha256: SHA('6'), size: 1024, storage: 'standard' }
    ]
};

function syncError(code) { const err = new Error(code); err.code = code; return err; }

function fakeSync({ configured = true, account = SUBSCRIBED, units = UNITS, shares = {}, files = FILES, sharedFiles = FILES[S2],
    slowUnits = null, demo = false } = {}) {
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
        unitFiles: (kind, id) => answer(`unitFiles:${kind}:${id}`, files[id] || []),
        sharedFiles: (id) => answer(`sharedFiles:${id}`, sharedFiles),
        downloadFile: (file, shareId) => answer(`download:${file.name}:${shareId || ''}`, DOCS[file.name]
            ? new TextEncoder().encode(JSON.stringify(DOCS[file.name])).buffer : new ArrayBuffer(file.size)),
        createShare: (...args) => answer(`createShare:${args[0]}:${args[1].join(',')}`, {}),
        acceptShare: (id) => answer(`accept:${id}`, {}),
        removeShare: (id) => answer(`remove:${id}`, {}),
        removeSession: (id, parent) => answer(`removeSession:${id}:${parent}`, {}),
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
            disabled: false, type: '', title: '', src: '', alt: '', download: '', rel: '', tabIndex: -1,
            children: [], style: {}, listeners: {}, attrs: {}, parent: null,
            classes: new Set(),
            get classList() {
                const self = this;
                return { toggle(name, on) { if (on) self.classes.add(name); else self.classes.delete(name); }, contains: (n) => self.classes.has(n) };
            },
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
                if (this.tagName === 'a') clicked.push({ href: this.href, download: this.download, parentId: this.parent && this.parent.id });
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
        'cloud-consent', 'cloud-explorer', 'cx-tree', 'cx-search', 'cx-sort', 'cx-refresh', 'cx-list', 'cx-empty',
        'cx-details', 'cx-details-back', 'cx-details-body',
        'cx-open-dialog', 'cx-open-text', 'cx-open-get', 'cx-open-again', 'nav-signin-btn',
        'cloud-share-dialog', 'cloud-share-name', 'cloud-share-emails', 'cloud-share-ai', 'cloud-share-expires',
        'cloud-share-error', 'cloud-share-recipients', 'cloud-share-submit'].forEach((id) => make('div', id));
    ['cloud-account', 'cloud-explorer', 'cloud-locked', 'cloud-signin-btn', 'cloud-error', 'cloud-consent',
        'cx-empty', 'cloud-demo-badge'].forEach((id) => { nodes.get(id).hidden = true; });
    nodes.get('cloud-status')._text = 'Loading…';
    nodes.get('cx-sort').value = 'date';
    const document = {
        getElementById: (id) => nodes.get(id) || null,
        createElement: (tag) => make(tag),
        createTextNode: (text) => ({ textContent: text }),
        querySelector: () => make('div'),
        body: make('body')
    };
    return { nodes, document, clicked };
}

function find(node, predicate) {
    if (!node || !node.children) return null;
    for (const child of node.children) {
        if (predicate(child)) return child;
        const hit = find(child, predicate);
        if (hit) return hit;
    }
    return null;
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
    vm.runInNewContext(appSource, { window, document: dom.document, Promise, setTimeout, URL, Blob, Date, Array, Math, String,
        Set, isNaN, TextDecoder });
    await settle();
    const n = (id) => dom.nodes.get(id);
    const rows = () => n('cx-list').children;
    const titleOf = (tr) => tr.children[0].children[0].children[1].children[0].textContent;
    const rowNames = () => rows().map(titleOf);
    const rowByName = (name) => rows().find((r) => titleOf(r) === name);
    const navLabels = () => n('cx-tree').children.map((b) => b.children[1].textContent);
    const navButton = (label) => n('cx-tree').children.find((b) => b.children[1].textContent === label);
    const details = () => n('cx-details-body');
    const detailButton = (text) => find(details(), (c) => c.tagName === 'button' && c.textContent.trim() === text);
    return {
        dom, n, rows, rowNames, rowByName, navLabels, navButton, details, detailButton, location, window,
        status: () => (n('cloud-status').hidden ? '' : n('cloud-status').textContent),
        visible: (id) => !n(id).hidden,
        open: async (loc) => { window.RaCloudApp.open(loc); await settle(); },
        go: async (h) => { location.hash = h; await settle(); },
        select: async (name) => { rowByName(name).click(); await settle(); },
        press: async (button) => { button.click(); await settle(); },
        appLinks: () => dom.clicked.filter((c) => c.href.startsWith('raceinsight:')).map((c) => c.href)
    };
}

/* ---- Opening and access ---- */

test('popup: stays closed until opened; open() shows the storage bar, folders and My sessions', async () => {
    const sync = fakeSync();
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync });
    assert.equal(app.n('cloud-modal').open, false);
    assert.deepEqual(sync.calls, [], 'nothing loads before the popup opens');
    await app.open();
    assert.equal(app.n('cloud-modal').open, true);
    assert.equal(app.location.hash, '#cloud');
    assert.equal(app.n('cloud-quota-text').textContent, '0.2 GB of 15 GB');
    assert.equal(app.n('cloud-edition').textContent, 'Cloud plan');
    assert.deepEqual(app.navLabels(), ['My sessions', 'Shared with me', 'Shared with others']);
    assert.equal(app.rows().length, 2);
    assert.match(app.details().textContent, /Select a session to see its details/);
});

test('table: sessions show human names, track and date from their documents, never a hash', async () => {
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync(), hash: '#cloud' });
    assert.deepEqual(app.rowNames(), ['spa 2026-11-22 14-05-10_Race_1', 'monza_long_run'], 'newest first');
    const spa = app.rowByName('spa 2026-11-22 14-05-10_Race_1');
    const cells = spa.children.map((td) => td.textContent);
    assert.equal(cells[1], 'Spa-Francorchamps');
    assert.match(cells[2], /2026/);
    assert.equal(cells[3], '31 MB');
    assert.match(cells[4], /Archived/, 'one of its files is archived');
    assert.match(app.rowByName('monza_long_run').children[2].textContent, /Oct/);
    assert.match(app.rowByName('monza_long_run').children[4].textContent, /In cloud/);
    const tableText = app.n('cx-list').textContent;
    assert.ok(!tableText.includes(S1) && !tableText.includes('a1a1a1a1'), 'no hash in the table');
});

test('table: a session whose document is archived keeps its cloud name and shows Archived', async () => {
    const files = { ...FILES, [S2]: [{ name: `${S2}.apx`, sha256: S2, size: 10, storage: 'standard' },
        { name: DOC_S2, sha256: SHA('6'), size: 10, storage: 'archived' }] };
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync({ files }), hash: '#cloud' });
    const monza = app.rowByName('Monza');
    assert.ok(monza, 'falls back to the unit name');
    assert.match(monza.children[4].textContent, /Archived/);
});

test('popup: a #cloud/s= link opens with that session selected; closing removes the hash', async () => {
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync(), hash: `#cloud/s=${S1}` });
    assert.equal(app.n('cloud-modal').open, true);
    assert.equal(app.rowByName('spa 2026-11-22 14-05-10_Race_1').attrs['aria-selected'], 'true');
    assert.match(app.details().textContent, /Formula Vee/);
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

test('popup: no subscription shows the message and never lists sessions or files', async () => {
    const sync = fakeSync({ account: LAPSED });
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync, hash: `#cloud/s=${S1}` });
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
    const app = await runApp({ auth, sync: fakeSync(), hash: `#cloud/s=${S1}` });
    assert.equal(app.rows().length, 2);
    auth.set(null);
    assert.equal(app.visible('cloud-explorer'), false);
    assert.equal(app.rows().length, 0);
    assert.equal(app.details().children.length, 0);
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
    assert.equal(app.rows().length, 2);
});

/* ---- Selection and details ---- */

test('details: a session is one item: facts, sharing and actions, no file list', async () => {
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync(), hash: '#cloud' });
    await app.select('spa 2026-11-22 14-05-10_Race_1');
    assert.equal(app.location.hash, `#cloud/s=${S1}`, 'the selection is in the link; no folder is opened');
    assert.equal(app.rows().length, 2, 'the table still lists the sessions');
    const text = app.details().textContent;
    for (const value of ['Spa-Francorchamps', 'Formula Vee', 'Ada Driver', 'Laps3', 'Size31 MB', 'SyncArchived']) {
        assert.ok(text.includes(value), value);
    }
    for (const hidden of ['.apx', '.risession', 'a1a1a1a1', 'onboard.mp4', 'Files']) {
        assert.ok(!text.includes(hidden), `no ${hidden} in the details`);
    }
    for (const label of ['Open in RACE Insight', 'Download', 'Share', 'Delete from cloud']) assert.ok(app.detailButton(label), label);
    assert.equal(app.n('cloud-explorer').classList.contains('has-selection'), true);
    app.n('cx-details-back').click();
    await settle();
    assert.equal(app.location.hash, '#cloud');
    assert.match(app.details().textContent, /Select a session/);
});

test('open in app: builds the exact link and names the session, not a hash', async () => {
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync(), hash: `#cloud/s=${S1}` });
    await app.press(app.detailButton('Open in RACE Insight'));
    assert.deepEqual(app.appLinks(), [`raceinsight://cloud/open?session=${S1}`]);
    assert.equal(app.dom.clicked.find((c) => c.href.startsWith('raceinsight:')).parentId, 'cx-open-dialog',
        'clicked inside the open dialog, so the modal popup does not make it inert');
    assert.equal(app.n('cx-open-dialog').open, true);
    const message = app.n('cx-open-text').textContent;
    assert.match(message, /spa 2026-11-22 14-05-10_Race_1/);
    assert.ok(!message.includes(S1), 'no hash in the message');
    assert.equal(app.n('cx-open-again').href, `raceinsight://cloud/open?session=${S1}`);
    assert.equal(app.visible('cx-open-again'), true);
});

test('open in app: an id the desktop app would refuse opens nothing and says so', async () => {
    const units = { projects: [], sessions: [{ id: 'not a valid id!', name: 'Odd', project_id: '_library' }] };
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync({ units }), hash: '#cloud' });
    await app.select('Odd');
    await app.press(app.detailButton('Open in RACE Insight'));
    assert.deepEqual(app.appLinks(), []);
    assert.match(app.n('cx-open-text').textContent, /cannot be opened from the website/);
    assert.equal(app.visible('cx-open-again'), false);
});

test('open in app: with sample data the desktop app is not launched', async () => {
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync({ demo: true }), hash: `#cloud/s=${S1}` });
    assert.equal(app.visible('cloud-demo-badge'), true);
    await app.press(app.detailButton('Open in RACE Insight'));
    assert.deepEqual(app.appLinks(), []);
    assert.match(app.n('cx-open-text').textContent, /With real data/);
});

test('details: Download saves the one .apx as "<track> <date>.apx"', async () => {
    const sync = fakeSync();
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync, hash: `#cloud/s=${S2}` });
    await app.press(app.detailButton('Download'));
    assert.ok(sync.calls.includes(`download:${S2}.apx:`));
    assert.equal(app.dom.clicked.at(-1).download, 'Monza 2026-10-27.apx');
});

test('details: Delete from cloud asks first, then deletes at the current head', async () => {
    const sync = fakeSync();
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync, hash: `#cloud/s=${S2}` });
    await app.press(app.detailButton('Delete from cloud'));
    assert.match(app.details().textContent, /Recently deleted/);
    assert.ok(!sync.calls.some((c) => c.startsWith('removeSession')), 'nothing is deleted before the confirmation');
    await app.press(app.detailButton('Cancel'));
    assert.ok(!app.details().textContent.includes('Recently deleted'));
    await app.press(app.detailButton('Delete from cloud'));
    await app.press(app.detailButton('Delete'));
    assert.ok(sync.calls.includes(`removeSession:${S2}:0000000001`));
    assert.equal(app.location.hash, '#cloud');
    assert.equal(sync.calls.filter((c) => c === 'listUnits').length, 2, 'the list reloads');
});

test('toolbar: search filters by name, track, car and driver; sort by name', async () => {
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync(), hash: '#cloud' });
    app.n('cx-search').value = 'gt3';
    app.n('cx-search').dispatch('input');
    assert.deepEqual(app.rowNames(), ['monza_long_run']);
    app.n('cx-search').value = 'nothing like this';
    app.n('cx-search').dispatch('input');
    assert.deepEqual(app.rowNames(), []);
    assert.equal(app.n('cx-empty').textContent, 'No cloud files match your search.');
    app.n('cx-search').value = '';
    app.n('cx-search').dispatch('input');
    app.n('cx-sort').value = 'name';
    app.n('cx-sort').dispatch('change');
    assert.deepEqual(app.rowNames(), ['monza_long_run', 'spa 2026-11-22 14-05-10_Race_1']);
});

test('share: Share in the details pane sends invitations for that session', async () => {
    const sync = fakeSync();
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync, hash: `#cloud/s=${S1}` });
    await app.press(app.detailButton('Share'));
    assert.equal(app.n('cloud-share-dialog').open, true);
    assert.equal(app.n('cloud-share-name').textContent, 'spa 2026-11-22 14-05-10_Race_1');
    app.n('cloud-share-emails').value = 'Bo@Example.com, bo@example.com';
    app.n('cloud-share-submit').click();
    await settle();
    assert.ok(sync.calls.includes(`createShare:${S1}:bo@example.com`));
});

test('Shared with me: counts, accepts invitations and opens shared sessions by share id', async () => {
    const shares = {
        inbox: [{ share_id: SHARE_ID, session_name: 'Le Mans', owner_name: 'Ada', status: 'accepted' }],
        pending: [{ share_id: INVITE_ID, session_name: 'Daytona', owner_name: 'Bo' }]
    };
    const sync = fakeSync({ shares });
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync, hash: '#cloud' });
    assert.equal(app.navButton('Shared with me').children[2].textContent, '2');
    await app.press(app.navButton('Shared with me'));
    assert.equal(app.location.hash, '#cloud/shared');
    assert.deepEqual(app.rowNames(), ['Daytona', 'monza_long_run'], 'invitation first; the shared session shows its document name');
    await app.select('Daytona');
    await app.press(app.detailButton('Accept'));
    assert.ok(sync.calls.includes(`accept:${INVITE_ID}`));
    await app.select('monza_long_run');
    assert.equal(app.location.hash, `#cloud/sh=${SHARE_ID}`);
    assert.match(app.details().textContent, /Shared by Ada/);
    assert.ok(!app.details().textContent.includes('.apx'), 'no file list for a shared session either');
    await app.press(app.detailButton('Download'));
    assert.ok(sync.calls.includes(`download:${S2}.apx:${SHARE_ID}`));
    assert.ok(app.detailButton('Remove from my list'));
    await app.press(app.detailButton('Open in RACE Insight'));
    assert.deepEqual(app.appLinks(), [`raceinsight://cloud/open?share=${SHARE_ID}`]);
});

test('Shared with others: your shared sessions with recipients you can revoke', async () => {
    const shares = {
        outgoing: [
            { share_id: '1'.repeat(32), session_id: S1, status: 'accepted', recipient_email: 'eng@example.com' },
            { share_id: '2'.repeat(32), session_id: S1, status: 'pending', recipient_email: 'coach@example.com' },
            { share_id: '3'.repeat(32), session_id: S2, status: 'revoked', recipient_email: 'old@example.com' }
        ]
    };
    const sync = fakeSync({ shares });
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync, hash: '#cloud/outgoing' });
    assert.deepEqual(app.rowNames(), ['spa 2026-11-22 14-05-10_Race_1'], 'revoked shares are left out');
    assert.match(app.rows()[0].children[4].textContent, /Shared with 2/);
    await app.select('spa 2026-11-22 14-05-10_Race_1');
    assert.equal(app.location.hash, '#cloud/outgoing', 'stays in the folder');
    const text = app.details().textContent;
    assert.match(text, /eng@example\.comAccepted/);
    assert.match(text, /coach@example\.comInvited/);
    const revoke = find(app.details(), (c) => c.tagName === 'button' && c.textContent === 'Revoke');
    await app.press(revoke);
    assert.ok(sync.calls.includes(`remove:${'1'.repeat(32)}`));
});

test('explorer: an unknown session in the URL shows My sessions with nothing selected', async () => {
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync(), hash: '#cloud/s=gone' });
    assert.equal(app.rows().length, 2);
    assert.match(app.details().textContent, /Select a session/);
});

test('popup: a late close event after reopening does not clear the new view', async () => {
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync(), hash: '#cloud' });
    const modal = app.n('cloud-modal');
    // Close without dispatching yet, reopen, then deliver the queued close event.
    modal.open = false;
    await app.open({ type: 'session', id: S1 });
    modal.dispatch('close');
    await settle();
    assert.equal(modal.open, true);
    assert.equal(app.location.hash, `#cloud/s=${S1}`);
});

test('popup: there is no upload control (sessions come from the desktop app)', async () => {
    const app = await runApp({ auth: fakeAuth({ user: ADA }), sync: fakeSync({ units: { projects: [], sessions: [] } }), hash: '#cloud' });
    assert.equal(app.n('cx-upload-label'), undefined);
    assert.match(app.n('cx-empty').textContent, /desktop app/);
});
