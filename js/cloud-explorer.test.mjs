// Run with: node --test js/cloud-explorer.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./cloud-explorer.js', import.meta.url), 'utf8');

function load() {
    const sandbox = { module: { exports: {} } };
    vm.runInNewContext(source, sandbox);
    return sandbox.module.exports;
}

const cx = load();
const plain = (value) => JSON.parse(JSON.stringify(value));

test('fileCategory: RACE Insight formats, previews and other files', () => {
    for (const name of ['lap.ibt', 'RUN.LD', 'a.xrk', 'a.drk', 'a.vbox', 'data.csv', 'session_ab.risession']) {
        assert.equal(cx.fileCategory(name), 'race', name);
    }
    assert.equal(cx.fileCategory('onboard.MP4'), 'video');
    assert.equal(cx.fileCategory('clip.webm'), 'video');
    assert.equal(cx.fileCategory('setup.jpeg'), 'image');
    assert.equal(cx.fileCategory('report.pdf'), 'pdf');
    assert.equal(cx.fileCategory('notes.txt'), 'other');
    assert.equal(cx.fileCategory('noextension'), 'other');
    assert.equal(cx.fileCategory('logo.svg'), 'other', 'SVG can carry script, so no preview');
    assert.equal(cx.fileCategory('page.html'), 'other');
});

test('typeLabel names the format', () => {
    assert.equal(cx.typeLabel('lap.ibt'), 'iRacing telemetry');
    assert.equal(cx.typeLabel('x.risession'), 'RACE Insight session');
    assert.equal(cx.typeLabel('a.png'), 'PNG image');
    assert.equal(cx.typeLabel('a.pdf'), 'PDF document');
    assert.equal(cx.typeLabel('a.zip'), 'ZIP file');
    assert.equal(cx.typeLabel('README'), 'File');
});

test('previewType: only allowed types, not empty, not too large', () => {
    assert.equal(cx.previewType({ name: 'a.png', size: 10 }), 'image/png');
    assert.equal(cx.previewType({ name: 'a.mov', size: 10 }), 'video/mp4');
    assert.equal(cx.previewType({ name: 'a.pdf', size: 10 }), 'application/pdf');
    assert.equal(cx.previewType({ name: 'a.svg', size: 10 }), null);
    assert.equal(cx.previewType({ name: 'a.ibt', size: 10 }), null);
    assert.equal(cx.previewType({ name: 'a.png', size: 0 }), null);
    assert.equal(cx.previewType({ name: 'a.mp4', size: cx.MAX_PREVIEW_BYTES + 1 }), null);
});

test('isAvailable: archived files are not', () => {
    assert.equal(cx.isAvailable({ storage: 'standard' }), true);
    assert.equal(cx.isAvailable({ storage: 'restored' }), true);
    assert.equal(cx.isAvailable({ storage: 'archived' }), false);
    assert.equal(cx.isAvailable(null), false);
});

test('openInAppUrl: own session, shared session, one file', () => {
    const sha = 'a'.repeat(64);
    assert.equal(cx.openInAppUrl({ sessionId: 'abc_1' }), 'raceinsight://cloud/open?session=abc_1');
    assert.equal(cx.openInAppUrl({ sessionId: 'abc_1', sha256: sha }), `raceinsight://cloud/open?session=abc_1&file=${sha}`);
    assert.equal(cx.openInAppUrl({ shareId: 'f'.repeat(32), sha256: sha }), `raceinsight://cloud/open?share=${'f'.repeat(32)}&file=${sha}`);
    assert.equal(cx.openInAppUrl({ sessionId: 'a&b=c' }), 'raceinsight://cloud/open?session=a%26b%3Dc', 'values are encoded');
});

const UNITS = {
    projects: [
        { id: 'p2', name: 'Spa 2026', updated_at: '2026-11-01T10:00:00Z' },
        { id: '_library', name: '' },
        { id: 'p1', name: 'Monza' }
    ],
    sessions: [
        { id: 's1', name: 'Race', project_id: 'p2', updated_at: '2026-11-02T10:00:00Z' },
        { id: 's2', name: 'Qualifying', project_id: 'p2' },
        { id: 's3', name: 'Upload', project_id: '_library' },
        { id: 's4', name: '', project_id: 'gone' }
    ]
};
const SHARES = {
    outgoing: [
        { share_id: '1'.repeat(32), session_id: 's1', status: 'accepted' },
        { share_id: '2'.repeat(32), session_id: 's1', status: 'pending' },
        { share_id: '3'.repeat(32), session_id: 's2', status: 'revoked' }
    ],
    inbox: [{ share_id: '4'.repeat(32), session_name: 'Le Mans', owner_name: 'Ada', status: 'accepted' }],
    pending: [{ share_id: '5'.repeat(32), session_name: 'Daytona', owner_name: 'Bo' }]
};

test('buildModel: Library first, sessions in their projects, orphans in Library', () => {
    const model = plain(cx.buildModel(UNITS, SHARES));
    assert.deepEqual(model.projects.map((p) => p.name), ['Library', 'Monza', 'Spa 2026']);
    const library = model.projects[0];
    assert.deepEqual(library.sessions.map((s) => s.name), ['Untitled session', 'Upload']);
    const spa = model.projects[2];
    assert.deepEqual(spa.sessions.map((s) => [s.name, s.shared_with]), [['Qualifying', 0], ['Race', 2]]);
    assert.deepEqual(model.shared, [{ share_id: '4'.repeat(32), name: 'Le Mans', owner_name: 'Ada', status: 'accepted', ai_use: false }]);
    assert.deepEqual(model.pending, [{ share_id: '5'.repeat(32), name: 'Daytona', owner_name: 'Bo' }]);
});

test('buildModel: empty and missing input', () => {
    assert.deepEqual(plain(cx.buildModel(null, null)), { projects: [], shared: [], pending: [] });
    const model = plain(cx.buildModel({ sessions: [{ id: 'x', name: 'Lone' }] }, {}));
    assert.deepEqual(model.projects.map((p) => [p.id, p.name, p.sessions.length]), [['_library', 'Library', 1]]);
});

test('locations round-trip through the URL hash', () => {
    for (const loc of [{ type: 'mine' }, { type: 'shared' }, { type: 'project', id: 'p 1' },
        { type: 'session', id: 's1' }, { type: 'share', id: '4'.repeat(32) }]) {
        assert.deepEqual(plain(cx.hashToLocation(cx.locationToHash(loc))), loc);
    }
    assert.deepEqual(plain(cx.hashToLocation('')), { type: 'mine' });
    assert.deepEqual(plain(cx.hashToLocation('#nonsense')), { type: 'mine' });
    assert.deepEqual(plain(cx.hashToLocation('#p=%E0%A4%A')), { type: 'mine' }, 'bad encoding');
});

test('trail: breadcrumbs, and null for something that no longer exists', () => {
    const model = cx.buildModel(UNITS, SHARES);
    const labels = (loc) => { const t = cx.trail(model, loc); return t && plain(t.map((s) => s.label)); };
    assert.deepEqual(labels({ type: 'mine' }), ['My files']);
    assert.deepEqual(labels({ type: 'project', id: 'p2' }), ['My files', 'Spa 2026']);
    assert.deepEqual(labels({ type: 'session', id: 's1' }), ['My files', 'Spa 2026', 'Race']);
    assert.deepEqual(labels({ type: 'shared' }), ['Shared with me']);
    assert.deepEqual(labels({ type: 'share', id: '4'.repeat(32) }), ['Shared with me', 'Le Mans']);
    assert.equal(labels({ type: 'session', id: 'nope' }), null);
    assert.equal(labels({ type: 'project', id: 'nope' }), null);
    assert.equal(labels({ type: 'share', id: 'nope' }), null);
});
