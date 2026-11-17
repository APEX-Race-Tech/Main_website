// Run with: node --test js/asset-versions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashOf, plan, rewrite, versioner, PAGES } from '../scripts/asset-versions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reader = (files) => (file) => (file in files ? files[file] : null);

test('every cache tag on the site matches its file (run node scripts/asset-versions.mjs if this fails)', () => {
    const read = (file) => {
        const full = path.join(root, file);
        return existsSync(full) ? readFileSync(full, 'utf8') : null;
    };
    assert.deepEqual([...plan(read).keys()], []);
});

test('pages get content-hash tags; existing tags are replaced; missing files are left alone', () => {
    const files = {
        'page.html': '<link href="css/a.css"><script src="js/b.js?v=old"></script><script src="js/gone.js"></script>',
        'css/a.css': 'body{}',
        'js/b.js': 'console.log(1)'
    };
    const out = plan(reader(files), ['page.html']).get('page.html');
    assert.equal(out, `<link href="css/a.css?v=${hashOf('body{}')}"><script src="js/b.js?v=${hashOf('console.log(1)')}"></script><script src="js/gone.js"></script>`);
});

test('links from a subfolder (../css) resolve to the same file', () => {
    const files = { 'sub/p.html': '<link href="../css/a.css">', 'css/a.css': 'x' };
    assert.equal(plan(reader(files), ['sub/p.html']).get('sub/p.html'), `<link href="../css/a.css?v=${hashOf('x')}">`);
});

test('a change in an imported stylesheet changes the importing stylesheet tag', () => {
    const base = { 'p.html': '<link href="css/main.css">', 'css/main.css': "@import url('_v.css');\nbody{}", 'css/_v.css': ':root{--a:1}' };
    const first = versioner(reader(base))('css/main.css');
    const second = versioner(reader({ ...base, 'css/_v.css': ':root{--a:2}' }))('css/main.css');
    assert.notEqual(first, second);
    const changes = plan(reader(base), ['p.html']);
    assert.equal(changes.get('css/main.css'), `@import url('_v.css?v=${hashOf(':root{--a:1}')}');\nbody{}`);
    assert.match(changes.get('p.html'), new RegExp(`main\\.css\\?v=${first}`));
});

test('tags only change when content changes', () => {
    const files = { 'p.html': '<script src="js/a.js"></script>', 'js/a.js': 'a' };
    const once = plan(reader(files), ['p.html']).get('p.html');
    assert.equal(plan(reader({ ...files, 'p.html': once }), ['p.html']).size, 0);
    assert.equal(rewrite('p.html', once, () => hashOf('a')), once);
});

test('the site page list matches the build inputs', () => {
    const config = readFileSync(path.join(root, 'vite.config.js'), 'utf8');
    const inputs = [...config.matchAll(/'\.\/([^']+\.html)'/g)].map((m) => m[1]).sort();
    assert.deepEqual([...PAGES].sort(), inputs);
});

test('--staged tags the commit and keeps other unstaged edits out of it', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'asset-versions-'));
    const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
    try {
        mkdirSync(path.join(dir, 'scripts'));
        mkdirSync(path.join(dir, 'js'));
        copyFileSync(path.join(root, 'scripts', 'asset-versions.mjs'), path.join(dir, 'scripts', 'asset-versions.mjs'));
        writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
        writeFileSync(path.join(dir, 'index.html'), '<script src="js/a.js"></script>\n<p>one</p>\n');
        writeFileSync(path.join(dir, 'js', 'a.js'), 'v1');
        git('init', '-q');
        git('add', '.');

        // Stage a new script version, but leave an unrelated page edit unstaged.
        writeFileSync(path.join(dir, 'js', 'a.js'), 'v2');
        git('add', 'js/a.js');
        writeFileSync(path.join(dir, 'index.html'), '<script src="js/a.js"></script>\n<p>two (not staged)</p>\n');

        execFileSync(process.execPath, [path.join(dir, 'scripts', 'asset-versions.mjs'), '--staged'], { cwd: dir });

        const staged = git('show', ':index.html');
        assert.equal(staged, `<script src="js/a.js?v=${hashOf('v2')}"></script>\n<p>one</p>\n`, 'commit gets the tag, not the unstaged edit');
        const working = readFileSync(path.join(dir, 'index.html'), 'utf8');
        assert.equal(working, `<script src="js/a.js?v=${hashOf('v2')}"></script>\n<p>two (not staged)</p>\n`, 'working copy keeps its edit');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
