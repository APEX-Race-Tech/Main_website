// Run with: node --test js/cloud-sync.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto, createHash } from 'node:crypto';
import vm from 'node:vm';

const source = readFileSync(new URL('./cloud-sync.js', import.meta.url), 'utf8');
const API = 'https://abc.execute-api.eu-central-1.amazonaws.com';
const BUCKET = 'https://race-insight-sync-958951263029-eu-central-1.s3.eu-central-1.amazonaws.com';

function loadModule() {
    const sandbox = { module: { exports: {} }, console, Promise, TextDecoder, TextEncoder, Blob, JSON };
    vm.runInNewContext(source, sandbox);
    return sandbox.module.exports;
}

const sha = (bytes) => createHash('sha256').update(Buffer.from(bytes)).digest('hex');

function json(status, body) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A tiny in-memory sync API and bucket with the server's blob and revision rules. */
function fakeCloud({ rawOptIn = true } = {}) {
    const blobs = new Map();
    const pending = new Map();
    const units = new Map();
    const calls = [];
    const fetch = async (url, init = {}) => {
        const u = new URL(url);
        calls.push(`${init.method || 'GET'} ${u.pathname}`);
        if (u.origin === BUCKET) {
            const [, , key] = u.pathname.split('/');
            if (init.method === 'PUT') {
                const part = Number(u.searchParams.get('part'));
                pending.get(key).parts.set(part, new Uint8Array(await init.body.arrayBuffer()));
                return new Response(null, { status: 200, headers: { etag: `"${part}"` } });
            }
            const data = blobs.get(key);
            return data ? new Response(data, { status: 200 }) : new Response('', { status: 404 });
        }
        assert.equal(init.headers.Authorization, 'Bearer access-jwt');
        assert.equal('x-ri-device' in init.headers, false, 'the website is not a device');
        const body = init.body ? JSON.parse(init.body) : {};
        const path = u.pathname;
        if (path === '/v1/projects') return json(200, { projects: [{ id: '_library', raw_opt_in: rawOptIn, head_rev: '0000000001' }], sessions: [] });
        if (path === '/v1/blobs/upload-init') {
            if (blobs.has(body.sha256)) return json(200, { exists: true });
            const partSize = 4;
            const partCount = Math.ceil(body.size / partSize);
            if (!pending.has(body.sha256)) pending.set(body.sha256, { size: body.size, parts: new Map() });
            const first = body.first_part || 1;
            const parts = [];
            for (let n = first; n <= Math.min(partCount, first + 1); n += 1) parts.push({ part_number: n, url: `${BUCKET}/u/${body.sha256}?part=${n}` });
            return json(200, { exists: false, upload_id: 'u', part_size: partSize, part_count: partCount, parts });
        }
        if (path === '/v1/blobs/upload-complete') {
            const p = pending.get(body.sha256);
            const data = Buffer.concat(body.parts.map((x) => Buffer.from(p.parts.get(x.part_number))));
            assert.equal(sha(data), body.sha256);
            blobs.set(body.sha256, data);
            return json(200, { state: 'complete' });
        }
        let m = path.match(/^\/v1\/blobs\/([0-9a-f]{64})\/download-url$/);
        if (m) return json(200, { sha256: m[1], size: blobs.get(m[1]).length, url: `${BUCKET}/u/${m[1]}` });
        m = path.match(/^\/v1\/sessions\/([^/]+)\/revisions$/);
        if (m) {
            const head = units.get(m[1]);
            if ((head?.head_rev ?? null) !== body.parent) return json(409, { error: 'conflict', message: 'changed', head_rev: head?.head_rev });
            const rev = String((head ? Number(head.head_rev) : 0) + 1).padStart(10, '0');
            units.set(m[1], { id: m[1], head_rev: rev, manifest_hash: body.manifest_hash, blobs: body.blobs.map((s) => ({ sha256: s, size: 1, storage: 'standard' })) });
            return json(200, { rev });
        }
        m = path.match(/^\/v1\/sessions\/([^/]+)$/);
        if (m && init.method === 'DELETE') {
            const head = units.get(m[1]);
            if (!head) return json(404, { error: 'not_found' });
            if (head.head_rev !== body.parent) return json(409, { error: 'conflict', message: 'changed' });
            units.delete(m[1]);
            return json(200, { id: m[1], deleted: true });
        }
        if (m) return units.has(m[1]) ? json(200, units.get(m[1])) : json(404, { error: 'not_found' });
        if (path === '/v1/shares' && init.method === 'POST') return json(202, { status: 'invite_sent', echo: body });
        return json(404, { error: 'not_found', message: path });
    };
    return { fetch, blobs, units, calls };
}

function client(cloud, overrides = {}) {
    const { createRaCloudSync } = loadModule();
    return createRaCloudSync({ fetch: cloud.fetch, crypto: webcrypto, apiUrl: API, getAccessToken: async () => 'access-jwt', ...overrides });
}

test('is not configured without an HTTPS API URL and refuses calls clearly', async () => {
    const sync = client(fakeCloud(), { apiUrl: 'http://insecure.example' });
    assert.equal(sync.configured, false);
    await assert.rejects(sync.account(), (e) => e.code === 'not_configured');
});

test('signed out users get a clear error and no request is sent', async () => {
    const cloud = fakeCloud();
    await assert.rejects(client(cloud, { getAccessToken: async () => null }).listUnits(), (e) => e.code === 'signed_out');
    assert.deepEqual(cloud.calls, []);
});

test('uploads a logger file as a desktop-compatible session, then lists and downloads it verified', async () => {
    const cloud = fakeCloud();
    const sync = client(cloud);
    const bytes = new TextEncoder().encode('0123456789abcdefXYZ telemetry');
    const result = await sync.uploadSession(new File([bytes], 'run.ld'));
    assert.equal(result.sessionId, sha(bytes));
    assert.equal(result.rev, '0000000001');

    const files = await sync.unitFiles('session', result.sessionId);
    assert.deepEqual(files.map((f) => [f.name, f.kind]), [[`session_${result.sessionId.slice(0, 16)}.risession`, 'session'], ['run.ld', 'raw']]);
    const raw = await sync.downloadFile(files[1]);
    assert.equal(new TextDecoder().decode(raw), '0123456789abcdefXYZ telemetry');
    const doc = JSON.parse(new TextDecoder().decode(await sync.downloadFile(files[0])));
    assert.equal(doc.schema, 'race-insight-session');
    assert.equal(doc.sources[0].sha256, result.sessionId);
});

test('a second upload of the same file sends no bytes again and moves the head', async () => {
    const cloud = fakeCloud();
    const sync = client(cloud);
    const file = new File([new TextEncoder().encode('same bytes')], 'a.csv');
    await sync.uploadSession(file);
    cloud.calls.length = 0;
    const second = await sync.uploadSession(file);
    assert.equal(cloud.calls.filter((c) => c.startsWith('PUT')).length, 0);
    assert.equal(second.rev, '0000000002');
});

test('upload needs the raw-file opt-in and a plain file name', async () => {
    await assert.rejects(client(fakeCloud({ rawOptIn: false })).uploadSession(new File(['x'], 'run.ld')), (e) => e.code === 'raw_opt_in_required');
    await assert.rejects(client(fakeCloud()).uploadSession(new File(['x'], '__internal.ld')), (e) => e.code === 'invalid_parameter');
});

test('a tampered download is refused', async () => {
    const cloud = fakeCloud();
    const sync = client(cloud);
    const bytes = new TextEncoder().encode('original');
    const { sessionId } = await sync.uploadSession(new File([bytes], 'x.ld'));
    cloud.blobs.set(sessionId, Buffer.from('tamperd'));
    await assert.rejects(sync.downloadFile({ sha256: sessionId }), (e) => e.code === 'digest_mismatch');
});

test('shares send the session, recipients, AI opt-in and expiry; ids are validated', async () => {
    const cloud = fakeCloud();
    const sync = client(cloud);
    const answer = await sync.createShare('s1', ['a@b.co'], true, '2026-12-31T00:00:00.000Z');
    assert.deepEqual(answer.echo, { session_id: 's1', recipient_emails: ['a@b.co'], ai_use: true, expires: '2026-12-31T00:00:00.000Z' });
    assert.throws(() => sync.acceptShare('../x'), (e) => e.code === 'invalid_parameter');
});

test('unit documents with paths or internal names are refused', () => {
    const { decodeUnitDocument } = loadModule();
    const doc = (name) => JSON.stringify({ schema: 'race-insight-sync-unit', version: 1, kind: 'session', id: 's', files: [{ name, sha256: 'a'.repeat(64), size: 1, kind: 'raw' }] });
    assert.throws(() => decodeUnitDocument(doc('../x.ld'), 'session', 's'));
    assert.throws(() => decodeUnitDocument(doc('__cache.tcache'), 'session', 's'));
    assert.throws(() => decodeUnitDocument(doc('ok.ld'), 'session', 'other'));
    assert.equal(decodeUnitDocument(doc('ok.ld'), 'session', 's')[0].name, 'ok.ld');
});

test('removeSession deletes at the current head and validates its input', async () => {
    const cloud = fakeCloud();
    const sync = client(cloud);
    cloud.units.set('s1', { id: 's1', head_rev: '0000000003', blobs: [] });
    await assert.rejects(sync.removeSession('s1', '0000000002'), (e) => e.code === 'conflict');
    assert.equal((await sync.removeSession('s1', '0000000003')).deleted, true);
    assert.equal(cloud.units.has('s1'), false);
    assert.throws(() => sync.removeSession('../x', '1'), (e) => e.code === 'invalid_parameter');
    await assert.rejects(sync.removeSession('s1', null), (e) => e.code === 'invalid_parameter');
});
