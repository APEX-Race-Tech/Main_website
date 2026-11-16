// Run with: node --test js/cloud-demo.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./cloud-demo.js', import.meta.url), 'utf8');

function load() {
    const sandbox = { module: { exports: {} }, TextEncoder, TextDecoder, Promise, setTimeout, JSON, Date, Object };
    vm.runInNewContext(source, sandbox);
    return sandbox.module.exports;
}

const demo = load();

test('sample data only on localhost with ?cloud-demo', () => {
    assert.equal(demo.isDemo({ hostname: 'localhost', search: '?cloud-demo' }), true);
    assert.equal(demo.isDemo({ hostname: '127.0.0.1', search: '?x=1&cloud-demo' }), true);
    assert.equal(demo.isDemo({ hostname: 'localhost', search: '?cloud-demo=1' }), true);
    assert.equal(demo.isDemo({ hostname: 'localhost', search: '' }), false);
    assert.equal(demo.isDemo({ hostname: 'localhost', search: '?cloud-demos' }), false);
    assert.equal(demo.isDemo({ hostname: 'apexracetech.in', search: '?cloud-demo' }), false, 'never on the live site');
    assert.equal(demo.isDemo({ hostname: 'localhost.example.com', search: '?cloud-demo' }), false);
    assert.equal(demo.isDemo(null), false);
});

test('the sample PDF is a well-formed one-page PDF', () => {
    const text = new TextDecoder().decode(demo.samplePdf(['Title', 'Line (with) brackets']));
    assert.ok(text.startsWith('%PDF-1.4\n'));
    assert.ok(text.trimEnd().endsWith('%%EOF'));
    const xref = Number(/startxref\n(\d+)\n/.exec(text)[1]);
    assert.equal(text.slice(xref, xref + 4), 'xref', 'startxref points at the xref table');
    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((offset, i) => assert.equal(text.slice(offset, offset + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
    assert.ok(!text.includes('(with)'), 'brackets are stripped from text');
});

test('sample sync: subscribed account, sharing changes Shared with others, uploads are refused', async () => {
    const { sync, auth } = demo.createDemo({ fetch: async () => ({ arrayBuffer: async () => new ArrayBuffer(4) }) });
    assert.equal(sync.demo, true);
    assert.equal((await sync.account()).entitlement.active, true);
    const before = (await sync.listShares()).outgoing.filter((s) => s.session_id === 's3').length;
    await sync.createShare('s3', ['new@example.com']);
    const after = (await sync.listShares()).outgoing.filter((s) => s.session_id === 's3').length;
    assert.equal(after, before + 1);
    await assert.rejects(sync.uploadSession({ name: 'x.ibt' }), /off in the preview/);
    await assert.rejects(sync.downloadFile({ name: 'clip.mp4' }), /no sample video/);
    assert.equal(auth.currentUser.uid, 'sample-user');
    await auth.signOut();
    assert.equal(auth.currentUser, null);
});
