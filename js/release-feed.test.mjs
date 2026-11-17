// Run with: node --test js/release-feed.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./release-feed.js', import.meta.url), 'utf8');
const sandbox = { module: { exports: {} } };
vm.runInNewContext(source, sandbox);
const { pickDownload, describeVersion, describeChecksum } = sandbox.module.exports;

const latest = {
  version: '0.2.8',
  releaseDate: '2026-11-02T10:00:00.000Z',
  downloads: {
    windows: { file: 'RACE-Insight-Setup-0.2.8.exe', url: 'https://cdn.example/RACE-Insight-Setup-0.2.8.exe', size: 1, sha256: 'a' },
    linux: { file: 'RACE-Insight-0.2.8.AppImage', url: 'https://cdn.example/RACE-Insight-0.2.8.AppImage', size: 1, sha256: 'b' },
    'mac-arm64': { file: 'RACE-Insight-0.2.8-arm64.dmg', url: 'https://cdn.example/RACE-Insight-0.2.8-arm64.dmg', size: 1, sha256: 'c' },
  },
};

test('picks the download for each platform button', () => {
  assert.equal(pickDownload(latest, 'windows').file, 'RACE-Insight-Setup-0.2.8.exe');
  assert.equal(pickDownload(latest, 'linux').file, 'RACE-Insight-0.2.8.AppImage');
  assert.equal(pickDownload(latest, 'apple').file, 'RACE-Insight-0.2.8-arm64.dmg');
});

test('falls back to the Intel Mac build when there is no Apple Silicon build', () => {
  const intelOnly = { ...latest, downloads: { 'mac-x64': { file: 'x.dmg', url: 'https://cdn.example/x.dmg' } } };
  assert.equal(pickDownload(intelOnly, 'apple').file, 'x.dmg');
});

test('returns null for unknown platforms, missing builds and malformed data', () => {
  assert.equal(pickDownload(latest, 'beos'), null);
  assert.equal(pickDownload({ ...latest, downloads: {} }, 'windows'), null);
  assert.equal(pickDownload(null, 'windows'), null);
  assert.equal(pickDownload({ version: '1' }, 'windows'), null);
});

test('refuses any download address that is not https', () => {
  const unsafe = { ...latest, downloads: { windows: { file: 'a.exe', url: 'javascript:alert(1)' } } };
  assert.equal(pickDownload(unsafe, 'windows'), null);
  const http = { ...latest, downloads: { windows: { file: 'a.exe', url: 'http://cdn.example/a.exe' } } };
  assert.equal(pickDownload(http, 'windows'), null);
});

test('describes the version for the label, or says it is unavailable', () => {
  assert.equal(describeVersion(latest, (iso) => '2 Nov 2026'), 'Latest version: v0.2.8 (2 Nov 2026)');
  assert.equal(describeVersion({ version: '0.2.8', downloads: latest.downloads }, () => 'x'), 'Latest version: v0.2.8');
  assert.equal(describeVersion({ version: '0.0.0', downloads: {} }, () => 'x'), 'Latest version: not available yet');
  assert.equal(describeVersion(null, () => 'x'), 'Latest version: not available yet');
});

test('checksum describes the exact selected download and rejects malformed hashes', () => {
  const windows = { file: 'RACE-Insight-Setup-0.3.0-beta.1.exe', sha256: 'a'.repeat(64) };
  const release = { downloads: { windows: { ...windows, url: 'https://cdn.example/setup.exe' } } };
  assert.equal(describeChecksum(release, 'windows'), windows.file + '\nSHA-256\n' + windows.sha256);
  assert.equal(describeChecksum(release, 'linux'), 'Checksum unavailable. Try again before installing.');
  for (const sha256 of ['', 'a'.repeat(63), 'g'.repeat(64), null]) {
    release.downloads.windows.sha256 = sha256;
    assert.equal(describeChecksum(release, 'windows'), 'Checksum unavailable. Try again before installing.');
  }
});

const { downloadsOpen } = sandbox.module.exports;

test('downloads stay closed before the beta opens and open from that moment', () => {
  const opensAt = '2027-01-01T00:00:00+05:30';
  assert.equal(downloadsOpen(opensAt, new Date('2026-12-31T18:29:59.000Z')), false);
  assert.equal(downloadsOpen(opensAt, new Date('2026-12-31T18:30:00.000Z')), true);
  assert.equal(downloadsOpen(opensAt, new Date('2027-02-01T00:00:00.000Z')), true);
});

test('a missing or unreadable opening time keeps downloads closed', () => {
  const now = new Date('2030-01-01T00:00:00.000Z');
  assert.equal(downloadsOpen('', now), false);
  assert.equal(downloadsOpen(undefined, now), false);
  assert.equal(downloadsOpen('next year', now), false);
});

test('no release address is in the site before the beta opens, and fetchLatest refuses without one', async () => {
  assert.equal(sandbox.module.exports.FEED_URL, '');
  assert.doesNotMatch(source, /cloudfront\.net/);
  await assert.rejects(sandbox.module.exports.fetchLatest(), /not published yet/);
});
