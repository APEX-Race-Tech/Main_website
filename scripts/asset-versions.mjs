#!/usr/bin/env node
/*
 * Sets the ?v= cache tag on every local script and stylesheet link to a hash
 * of that file's contents, so browsers fetch new files as soon as they change.
 * (The host caches js/ and css/ for 4 hours but always revalidates pages.)
 *
 * Covers the site's pages (<script src>, <link href>) and the @import links
 * inside CSS files. A stylesheet's tag also changes when a file it imports
 * changes, because its own @import tags change first.
 *
 *   node scripts/asset-versions.mjs           update the files in the working tree
 *   node scripts/asset-versions.mjs --check   exit 1 if any tag is out of date
 *   node scripts/asset-versions.mjs --staged  update the commit being made (git pre-commit hook):
 *                                             reads and writes the git index, then applies the
 *                                             same tags to the working tree without staging
 *                                             any other edits in those files
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAGES = [
    'race-insight.html', 'index.html', 'kineticsports.html', 'racing.html', 'cloud.html',
    'race-insight/eula.html', 'race-insight/terms.html', 'race-insight/privacy-policy.html',
    'race-insight/third-party-licenses.html'
];

// <script src="js/x.js"> and <link href="css/x.css">, optionally ../ and an existing ?v=.
const PAGE_REF = /((?:src|href)=")((?:\.\.\/)*(?:js|css)\/[^"?#]+\.(?:js|css))(?:\?v=[^"#]*)?(")/g;
// @import url('x.css'), @import url("x.css"), @import 'x.css' with a relative path.
const CSS_IMPORT = /(@import\s+(?:url\(\s*)?['"])([^'"?#:]+\.css)(?:\?v=[^'"#]*)?(['"])/g;

const toPosix = (p) => p.split(path.sep).join('/');

/** First 10 hex characters of the SHA-256 of a string. */
export function hashOf(text) {
    return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 10);
}

/**
 * Rewrites the tags in one file. `read(path)` returns a repo-relative file's
 * text or null; `versionFor(path)` returns the tag for a referenced file, or
 * null to leave that reference alone (missing file).
 */
export function rewrite(file, text, versionFor) {
    const dir = path.posix.dirname(file);
    const pattern = file.endsWith('.css') ? CSS_IMPORT : PAGE_REF;
    return text.replace(pattern, (whole, before, ref, after) => {
        const target = path.posix.normalize(path.posix.join(dir, ref));
        const version = versionFor(target);
        return version ? `${before}${ref}?v=${version}${after}` : whole;
    });
}

/** Builds the tag for every file, following CSS @imports first. */
export function versioner(read) {
    const memo = new Map();
    const visiting = new Set();
    function versionFor(file) {
        if (memo.has(file)) return memo.get(file);
        const text = read(file);
        if (text === null) { memo.set(file, null); return null; }
        let content = text;
        if (file.endsWith('.css') && !visiting.has(file)) {
            visiting.add(file);
            content = rewrite(file, text, versionFor);
            visiting.delete(file);
        }
        const version = hashOf(content);
        memo.set(file, version);
        return version;
    }
    return versionFor;
}

/** Files whose text would change: Map(path -> new text). */
export function plan(read, pages = PAGES) {
    const versionFor = versioner(read);
    const changes = new Map();
    const queue = [...pages];
    const seen = new Set();
    while (queue.length) {
        const file = queue.shift();
        if (seen.has(file)) continue;
        seen.add(file);
        const text = read(file);
        if (text === null) continue;
        const next = rewrite(file, text, (target) => {
            if (target.endsWith('.css')) queue.push(target); // its @imports need tags too
            return versionFor(target);
        });
        if (next !== text) changes.set(file, next);
    }
    return changes;
}

/* ---- Command line ---- */

function git(args, input) {
    return execFileSync('git', args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function readWorkingTree(root) {
    return (file) => {
        const full = path.join(root, file);
        return existsSync(full) ? readFileSync(full, 'utf8') : null;
    };
}

function readIndex(root) {
    const working = readWorkingTree(root);
    return (file) => {
        try {
            return git(['-C', root, 'show', `:${file}`]);
        } catch {
            return working(file); // not staged: fall back to the working copy
        }
    };
}

function stageText(root, file, text) {
    const blob = git(['-C', root, 'hash-object', '-w', '--stdin'], text).trim();
    const entry = git(['-C', root, 'ls-files', '-s', '--', file]).trim();
    const mode = entry ? entry.split(/\s+/)[0] : '100644';
    git(['-C', root, 'update-index', '--add', '--cacheinfo', `${mode},${blob},${file}`]);
}

function main(argv) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const mode = argv.includes('--check') ? 'check' : argv.includes('--staged') ? 'staged' : 'write';

    if (mode === 'staged') {
        const indexRead = readIndex(root);
        const staged = plan(indexRead);
        for (const [file, text] of staged) stageText(root, file, text);
        // Apply the same tags to the working copies, keeping their other edits.
        const versionFor = versioner(indexRead);
        const workRead = readWorkingTree(root);
        for (const file of staged.keys()) {
            const text = workRead(file);
            if (text === null) continue;
            const next = rewrite(file, text, versionFor);
            if (next !== text) writeFileSync(path.join(root, file), next);
        }
        if (staged.size) console.log(`asset-versions: updated cache tags in ${[...staged.keys()].join(', ')}`);
        return 0;
    }

    const changes = plan(readWorkingTree(root));
    if (mode === 'check') {
        if (!changes.size) return 0;
        console.error(`asset-versions: cache tags are out of date in ${[...changes.keys()].join(', ')}.`);
        console.error('Run: node scripts/asset-versions.mjs');
        return 1;
    }
    for (const [file, text] of changes) writeFileSync(path.join(root, file), text);
    console.log(changes.size ? `asset-versions: updated ${[...changes.keys()].join(', ')}` : 'asset-versions: all tags up to date');
    return 0;
}

if (process.argv[1] && toPosix(path.resolve(process.argv[1])) === toPosix(fileURLToPath(import.meta.url))) {
    process.exitCode = main(process.argv.slice(2));
}
