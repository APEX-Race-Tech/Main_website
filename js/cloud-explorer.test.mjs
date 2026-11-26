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
    for (const name of ['lap.ibt', 'RUN.LD', 'a.xrk', 'a.drk', 'a.vbox', 'data.csv', 'session_ab.risession', 'abc123.apx']) {
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
    assert.equal(cx.typeLabel('abc123.apx'), 'RACE Insight session data');
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

test('openInAppUrl: exactly the shape the desktop validator accepts', () => {
    const sha = 'a'.repeat(64);
    const id = '3f9a1c7e5b2d4a6081f2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6a7b8';
    assert.equal(cx.openInAppUrl({ sessionId: id }), `raceinsight://cloud/open?session=${id}`);
    assert.equal(cx.openInAppUrl({ sessionId: 'abc_1-X' }), 'raceinsight://cloud/open?session=abc_1-X');
    assert.equal(cx.openInAppUrl({ sessionId: id, sha256: sha }), `raceinsight://cloud/open?session=${id}&file=${sha}`);
    assert.equal(cx.openInAppUrl({ shareId: 'f'.repeat(32), sha256: sha }), `raceinsight://cloud/open?share=${'f'.repeat(32)}&file=${sha}`);
    assert.equal(cx.openInAppUrl({ sessionId: id, sha256: sha.toUpperCase() }), `raceinsight://cloud/open?session=${id}&file=${sha}`,
        'the file hash is sent in lower case');
});

test('openInAppUrl: refuses ids the desktop app would ignore; drops a bad file hash', () => {
    const id = 'b'.repeat(64);
    assert.equal(cx.openInAppUrl({ sessionId: 'a&b=c' }), null);
    assert.equal(cx.openInAppUrl({ sessionId: 'x'.repeat(65) }), null, 'longer than 64');
    assert.equal(cx.openInAppUrl({ sessionId: '' }), null);
    assert.equal(cx.openInAppUrl({ sessionId: 'my session' }), null);
    assert.equal(cx.openInAppUrl({ shareId: 'F'.repeat(32) }), null, 'share ids are lower-case hex');
    assert.equal(cx.openInAppUrl({ shareId: 'f'.repeat(31) }), null);
    assert.equal(cx.openInAppUrl(null), null);
    assert.equal(cx.openInAppUrl({ sessionId: id, sha256: 'zz' }), `raceinsight://cloud/open?session=${id}`);
    assert.equal(cx.openInAppUrl({ sessionId: id, label: 'Spa' }), `raceinsight://cloud/open?session=${id}`, 'no other keys');
    for (const url of [cx.openInAppUrl({ sessionId: id, sha256: 'c'.repeat(64) }), cx.openInAppUrl({ shareId: '1'.repeat(32) })]) {
        assert.ok(url.length <= 512);
        assert.match(url, /^raceinsight:\/\/cloud\/open\?(session=[A-Za-z0-9_-]{1,64}|share=[0-9a-f]{32})(&file=[0-9a-f]{64})?$/);
    }
});

test('names: hashes are recognised and shortened', () => {
    const sha = '3f9a1c7e5b2d4a6081f2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6a7b8';
    assert.equal(cx.looksLikeHash(sha + '.apx'), true);
    assert.equal(cx.looksLikeHash(sha), true);
    assert.equal(cx.looksLikeHash('session_3f9a1c7e5b2d4a60.risession'), true);
    assert.equal(cx.looksLikeHash('Spa-Francorchamps'), false);
    assert.equal(cx.looksLikeHash('race.ld'), false);
    assert.equal(cx.shortHash(sha), '3f9a1c7e…a7b8');
});

test('parseSessionDocument: reads file name, string metadata and lap count; refuses anything else', () => {
    const doc = cx.parseSessionDocument(JSON.stringify({ schema: 'race-insight-session', version: 1, file_name: 'spa.ld',
        metadata: { Venue: 'Spa', Laps: 3 }, laps: [{}, {}] }));
    assert.equal(doc.fileName, 'spa.ld');
    assert.deepEqual(plain(doc.metadata), { Venue: 'Spa' }, 'numbers are dropped');
    assert.equal(doc.laps, 2);
    assert.equal(cx.parseSessionDocument('{"schema":"race-insight-session","version":2}'), null);
    assert.equal(cx.parseSessionDocument('{"schema":"other","version":1}'), null);
    assert.equal(cx.parseSessionDocument('not json'), null);
    assert.equal(cx.parseSessionDocument(null), null);
    const polluted = cx.parseSessionDocument('{"schema":"race-insight-session","version":1,"metadata":{"__proto__":"x"}}');
    assert.equal(Object.keys(polluted.metadata).length, 0);
    assert.equal(Object.getPrototypeOf(polluted.metadata), Object.getPrototypeOf(cx.parseSessionDocument(
        '{"schema":"race-insight-session","version":1}').metadata));
});

test('normalizeDate: ISO, day-first and unix seconds', () => {
    assert.equal(cx.normalizeDate('2025-07-13'), '2025-07-13');
    assert.equal(cx.normalizeDate('2025-07-13T22:15:00Z'), '2025-07-13');
    assert.equal(cx.normalizeDate('13/07/2025'), '2025-07-13');
    assert.equal(cx.normalizeDate('3-7-2025'), '2025-07-03');
    assert.equal(cx.normalizeDate('1752364800'), '2025-07-13');
    assert.equal(cx.normalizeDate(''), null);
    assert.equal(cx.normalizeDate('soon'), null);
});

test('sessionFacts: human name, track, car, driver and date like the desktop app', () => {
    const facts = cx.sessionFacts({ fileName: 'formulavee_rudskogen 2025-07-13 00-43-53_Stint_1.ld', laps: 4,
        metadata: { Venue: 'Rudskogen', Vehicle: 'Formula Vee', Driver: 'Vignesh D', 'Log Date': '12/07/2025' } }, 'Rudskogen');
    assert.deepEqual(plain(facts), { name: 'formulavee_rudskogen 2025-07-13 00-43-53_Stint_1', track: 'Rudskogen',
        car: 'Formula Vee', driver: 'Vignesh D', date: '2025-07-13', laps: 4 }, 'the file-name date beats Log Date');
    assert.equal(cx.sessionFacts({ fileName: 'a.ld', metadata: { Date: '01/08/2025', 'Log Date': '2025-07-31' } }, '').date, '2025-08-01');
    const hashOnly = cx.sessionFacts({ fileName: 'b'.repeat(64) + '.apx', metadata: { Track: 'Monza' } }, 'c'.repeat(64));
    assert.equal(hashOnly.name, 'Monza', 'never a hash as the name');
    assert.equal(cx.sessionFacts(null, 'Spa').name, 'Spa');
    assert.equal(cx.sessionFacts(null, 'd'.repeat(64)).name, 'Untitled session');
    assert.equal(cx.sessionFacts(null, 'Spa').track, null, 'nothing is guessed without the document');
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
    assert.deepEqual(plain(cx.buildModel(null, null)), { projects: [], shared: [], pending: [], outgoing: [] });
    const model = plain(cx.buildModel({ sessions: [{ id: 'x', name: 'Lone' }] }, {}));
    assert.deepEqual(model.projects.map((p) => [p.id, p.name, p.sessions.length]), [['_library', 'Library', 1]]);
});

test('locations round-trip through the #cloud hash; other hashes are not cloud locations', () => {
    for (const loc of [{ type: 'mine' }, { type: 'shared' }, { type: 'outgoing' }, { type: 'project', id: 'p 1' },
        { type: 'session', id: 's1' }, { type: 'share', id: '4'.repeat(32) }]) {
        const hash = cx.locationToHash(loc);
        assert.ok(hash === '#cloud' || hash.startsWith('#cloud/'), hash);
        assert.deepEqual(plain(cx.hashToLocation(hash)), loc);
    }
    assert.equal(cx.locationToHash({ type: 'mine' }), '#cloud');
    assert.equal(cx.hashToLocation(''), null);
    assert.equal(cx.hashToLocation('#features'), null);
    assert.equal(cx.hashToLocation('#cloudy'), null);
    assert.deepEqual(plain(cx.hashToLocation('#cloud/nonsense')), { type: 'mine' });
    assert.deepEqual(plain(cx.hashToLocation('#cloud/p=%E0%A4%A')), { type: 'mine' }, 'bad encoding');
});

test('buildModel: Shared with others groups active shares by session', () => {
    const model = plain(cx.buildModel(UNITS, { ...SHARES, outgoing: [...SHARES.outgoing,
        { share_id: '6'.repeat(32), session_id: 'gone', status: 'accepted', recipient_email: 'x@example.com' }] }));
    assert.deepEqual(model.outgoing.map((o) => [o.name, o.project_name, o.recipients.length, o.exists]),
        [['Deleted session', '', 1, false], ['Race', 'Spa 2026', 2, true]]);
    assert.deepEqual(model.outgoing[1].recipients.map((r) => r.status), ['accepted', 'pending']);
});

test('buildRows: My sessions use document facts once loaded, and show sharing', () => {
    const model = cx.buildModel(UNITS, SHARES);
    const before = cx.buildRows(model, 'mine', {});
    assert.deepEqual(plain(before.map((r) => r.key)), ['s:s4', 's:s3', 's:s2', 's:s1']);
    const race = before.find((r) => r.sessionId === 's1');
    assert.equal(race.name, 'Race');
    assert.equal(race.sharedWith, 2);
    assert.deepEqual(plain(race.status), { label: 'In cloud', tone: 'valid' });
    assert.equal(cx.buildRows(cx.buildModel({ sessions: [{ id: 'z', name: 'Z', head_rev: '0000000004' }] }, {}), 'mine', {})[0].headRev,
        '0000000004', 'the head revision a delete needs');
    const details = { 's:s1': { size: 3000, archived: true, facts: { name: 'spa race', track: 'Spa', car: 'F4', driver: 'Ada', date: '2026-11-02', laps: 9 } } };
    const after = cx.buildRows(model, 'mine', details).find((r) => r.sessionId === 's1');
    assert.equal(after.name, 'spa race');
    assert.equal(after.track, 'Spa');
    assert.equal(after.size, 3000);
    assert.deepEqual(plain(after.status), { label: 'Archived', tone: 'warn' });
});

test('buildRows: Shared with me lists invitations first; Shared with others has recipients', () => {
    const model = cx.buildModel(UNITS, SHARES);
    const shared = cx.buildRows(model, 'shared', {});
    assert.deepEqual(plain(shared.map((r) => [r.key, r.kind, r.name, r.ownerName, r.status.label])), [
        ['inv:' + '5'.repeat(32), 'invitation', 'Daytona', 'Bo', 'Invitation'],
        ['sh:' + '4'.repeat(32), 'shared', 'Le Mans', 'Ada', 'Shared with you']]);
    const outgoing = cx.buildRows(model, 'outgoing', {});
    assert.deepEqual(plain(outgoing.map((r) => [r.key, r.sharedWith, r.invited])), [['s:s1', 2, 1]]);
});

test('filterAndSort: search over name, track, car, driver and owner; three sorts', () => {
    const rows = [
        { key: 'a', kind: 'own', name: 'Alpha', track: 'Spa', car: 'F4', driver: 'Ada', date: '2026-01-01', size: 10 },
        { key: 'b', kind: 'own', name: 'Bravo', track: 'Monza', car: 'GT3', driver: 'Bo', date: '2026-03-01', size: 30 },
        { key: 'c', kind: 'own', name: 'Charlie', track: 'Spa', car: 'GT3', driver: 'Cy', date: null, updated_at: '2026-02-01T00:00:00Z', size: 20 },
        { key: 'i', kind: 'invitation', name: 'Zulu', ownerName: 'Dee', date: null, size: null }
    ];
    const keys = (list) => plain(list.map((r) => r.key));
    assert.deepEqual(keys(cx.filterAndSort(rows, '', 'date')), ['i', 'b', 'c', 'a'], 'newest first, invitations on top');
    assert.deepEqual(keys(cx.filterAndSort(rows, '', 'name')), ['i', 'a', 'b', 'c']);
    assert.deepEqual(keys(cx.filterAndSort(rows, '', 'size')), ['i', 'b', 'c', 'a']);
    assert.deepEqual(keys(cx.filterAndSort(rows, 'spa gt3', 'date')), ['c']);
    assert.deepEqual(keys(cx.filterAndSort(rows, 'ADA', 'date')), ['a']);
    assert.deepEqual(keys(cx.filterAndSort(rows, 'dee', 'date')), ['i']);
});

test('downloadName: "<track> <date>.apx", sanitised, never a hash', () => {
    assert.equal(cx.downloadName({ track: 'Spa-Francorchamps', date: '2026-11-22', name: 'x' }), 'Spa-Francorchamps 2026-11-22.apx');
    assert.equal(cx.downloadName({ track: 'Monza', date: null, updated_at: '2026-10-27T09:00:00Z', name: 'x' }), 'Monza 2026-10-27.apx');
    assert.equal(cx.downloadName({ track: null, date: null, name: 'spa race 1' }), 'spa race 1.apx');
    assert.equal(cx.downloadName({ track: 'A/B: "C"?', date: '2026-01-02' }), 'A B C 2026-01-02.apx');
    assert.equal(cx.downloadName({ track: null, name: 'e'.repeat(64) }), 'RACE Insight session.apx');
    assert.equal(cx.downloadName({ track: 'CON', date: null, name: 'x' }), 'CON session.apx');
});
