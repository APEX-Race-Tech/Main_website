/*
 * Sample data for previewing Cloud files on a local copy of the site.
 *
 * Active only when BOTH hold:
 *   - the page is served from localhost or 127.0.0.1, and
 *   - the address has ?cloud-demo, e.g. http://localhost:5180/race-insight.html?cloud-demo#cloud
 * Everywhere else, including the live site, this file does nothing.
 *
 * It replaces window.RaAuth with a signed-in sample user and window.RaCloudSync
 * with an in-memory copy of the sync API, so nothing is sent anywhere. Load it
 * after cloud-sync.js and before cloud-gate.js and race-insight.js.
 */
(function (root) {
    'use strict';

    var LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

    function isDemo(location) {
        if (!location || LOCAL_HOSTS.indexOf(location.hostname) === -1) return false;
        return /(?:^|[?&])cloud-demo(?:[=&]|$)/.test(String(location.search || '').replace(/^\?/, '&'));
    }

    /** A one-page PDF with a few lines of text, built by hand (ASCII only). */
    function samplePdf(lines) {
        var text = lines.map(function (line, i) {
            return 'BT /F1 ' + (i ? 14 : 22) + ' Tf 72 ' + (760 - i * 28) + ' Td (' + line.replace(/[()\\]/g, '') + ') Tj ET';
        }).join('\n');
        var objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
            '<< /Length ' + text.length + ' >>\nstream\n' + text + '\nendstream',
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
        ];
        var out = '%PDF-1.4\n';
        var offsets = [];
        objects.forEach(function (body, i) {
            offsets.push(out.length);
            out += (i + 1) + ' 0 obj\n' + body + '\nendobj\n';
        });
        var xref = out.length;
        out += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
        offsets.forEach(function (o) { out += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
        out += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
        return new TextEncoder().encode(out).buffer;
    }

    function createDemo(deps) {
        var fetchImpl = deps.fetch;
        var sha = function (c) { return new Array(65).join(c); };
        var DAY = 24 * 3600 * 1000;
        var now = Date.now();
        var iso = function (daysAgo) { return new Date(now - daysAgo * DAY).toISOString(); };

        var sessionFiles = {
            s1: [
                { name: 'session_spa_r1.risession', sha256: sha('e'), size: 182000, storage: 'standard' },
                { name: 'Spa_Race1_Stint1.ibt', sha256: sha('b'), size: 48500000, storage: 'standard' },
                { name: 'Spa_Race1_Stint2.ibt', sha256: sha('9'), size: 51200000, storage: 'standard' },
                { name: 'onboard_cam.mp4', sha256: sha('a'), size: 310000000, storage: 'standard' },
                { name: 'setup_sheet.pdf', sha256: sha('f'), size: 2400, storage: 'standard' },
                { name: 'pit_board.png', sha256: sha('c'), size: 141000, storage: 'standard' },
                { name: 'notes.txt', sha256: sha('7'), size: 1200, storage: 'standard' }
            ],
            s2: [
                { name: 'session_spa_q.risession', sha256: sha('6'), size: 95000, storage: 'standard' },
                { name: 'Spa_Quali.ld', sha256: sha('5'), size: 22000000, storage: 'standard' },
                { name: 'Spa_Quali.ldx', sha256: sha('4'), size: 3000, storage: 'standard' }
            ],
            s3: [
                { name: 'session_spa_fp2.risession', sha256: sha('3'), size: 88000, storage: 'standard' },
                { name: 'Spa_FP2.xrk', sha256: sha('2'), size: 17000000, storage: 'standard' }
            ],
            s4: [
                { name: 'Anglesey_lap.vbox', sha256: sha('1'), size: 900000, storage: 'standard' }
            ],
            s5: [
                { name: 'Monza_long_run.ibt', sha256: sha('0'), size: 61000000, storage: 'standard' },
                { name: '2025_test_day.ld', sha256: sha('d'), size: 9000000, storage: 'archived' }
            ]
        };

        var units = {
            projects: [
                { id: '_library', name: '', updated_at: iso(40) },
                { id: 'p1', name: 'Spa-Francorchamps 2026', updated_at: iso(1) },
                { id: 'p2', name: 'Monza Test Day', updated_at: iso(30) }
            ],
            sessions: [
                { id: 's1', name: 'Race 1', project_id: 'p1', updated_at: iso(1) },
                { id: 's2', name: 'Qualifying', project_id: 'p1', updated_at: iso(2) },
                { id: 's3', name: 'FP2', project_id: 'p1', updated_at: iso(3) },
                { id: 's5', name: 'Long run', project_id: 'p2', updated_at: iso(30) },
                { id: 's4', name: 'Anglesey VBOX lap', project_id: '_library', updated_at: iso(40) }
            ]
        };

        var shareSeq = 10;
        var shareId = function () { shareSeq += 1; return ('00000000000000000000000000000000' + shareSeq.toString(16)).slice(-32); };
        var shares = {
            outgoing: [
                { share_id: shareId(), session_id: 's1', status: 'accepted', recipient_email: 'engineer@example.com' },
                { share_id: shareId(), session_id: 's1', status: 'pending', recipient_email: 'coach@example.com' },
                { share_id: shareId(), session_id: 's2', status: 'accepted', recipient_email: 'teammate@example.com' }
            ],
            inbox: [
                { share_id: shareId(), session_name: 'Le Mans Stint 3', owner_name: 'Ada', status: 'accepted' }
            ],
            pending: [
                { share_id: shareId(), session_name: 'Daytona Night Practice', owner_name: 'Bo' }
            ]
        };
        var inboxFiles = sessionFiles.s1.slice(1, 4);

        var copy = function (value) { return JSON.parse(JSON.stringify(value)); };
        var later = function (value) { return new Promise(function (resolve) { setTimeout(function () { resolve(copy(value)); }, 150); }); };
        var fail = function (message) {
            return Promise.reject(Object.assign(new Error(message), { code: 'demo' }));
        };

        var logo = null;
        function bytesFor(file) {
            var ext = (/\.([a-z0-9]+)$/i.exec(file.name) || [])[1] || '';
            ext = ext.toLowerCase();
            if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') {
                if (!logo) logo = fetchImpl('apex_art_mark.png').then(function (r) { return r.arrayBuffer(); });
                return logo;
            }
            if (ext === 'pdf') {
                return Promise.resolve(samplePdf(['Setup sheet (sample)', 'Spa-Francorchamps, Race 1',
                    'Front wing: 4    Rear wing: 7', 'Tyre pressures, hot: 26.5 psi', 'Brake bias: 56.5 %']));
            }
            if (ext === 'mp4' || ext === 'mov' || ext === 'webm') return fail('There is no sample video in the preview.');
            return Promise.resolve(new TextEncoder().encode('Sample file: ' + file.name + '\n').buffer);
        }

        var sync = {
            demo: true,
            configured: true,
            account: function () {
                return later({ entitlement: { active: true, edition: 'Pro (sample)' },
                    quota: { bytes_used: 3.2e9, bytes_reserved: 0, limit: 10 * 1024 * 1024 * 1024 }, consent_version: 1 });
            },
            listUnits: function () { return later(units); },
            listShares: function () { return later(shares); },
            unitFiles: function (kind, id) { return later(sessionFiles[id] || []); },
            sharedFiles: function () { return later(inboxFiles); },
            downloadFile: function (file) { return bytesFor(file); },
            createShare: function (sessionId, emails) {
                emails.forEach(function (email) {
                    var exists = shares.outgoing.some(function (s) {
                        return s.session_id === sessionId && s.recipient_email === email && (s.status === 'pending' || s.status === 'accepted');
                    });
                    if (!exists) shares.outgoing.push({ share_id: shareId(), session_id: sessionId, status: 'pending', recipient_email: email });
                });
                return later({ status: 'invite_sent' });
            },
            acceptShare: function (id) {
                var invite = shares.pending.filter(function (s) { return s.share_id === id; })[0];
                shares.pending = shares.pending.filter(function (s) { return s.share_id !== id; });
                if (invite) shares.inbox.push({ share_id: id, session_name: invite.session_name, owner_name: invite.owner_name, status: 'accepted' });
                return later({ share_id: id, status: 'accepted' });
            },
            removeShare: function (id) {
                shares.outgoing.forEach(function (s) { if (s.share_id === id) s.status = 'revoked'; });
                shares.inbox = shares.inbox.filter(function (s) { return s.share_id !== id; });
                shares.pending = shares.pending.filter(function (s) { return s.share_id !== id; });
                return later({ share_id: id });
            },
            uploadSession: function () { return fail('Uploads are off in the preview.'); },
            friendlyError: function (err) { return (err && err.message) || 'Cloud sync failed.'; }
        };

        var user = {
            uid: 'sample-user', email: 'driver@example.com', displayName: 'Sample Driver', photoURL: null,
            profile: { displayName: 'Sample Driver', createdAt: new Date(now - 200 * DAY), simulator: 'iRacing',
                experience: 'Intermediate', referral: 'Search', location: 'Spa, Belgium', bio: '' }
        };
        var listeners = [];
        var signedIn = user;
        var notReal = function () { return fail('This does nothing in the preview.'); };
        var demoAuth = {
            demo: true,
            configured: true,
            get currentUser() { return signedIn; },
            onAuthStateChanged: function (cb) {
                listeners.push(cb);
                setTimeout(function () { cb(signedIn); }, 0);
                return function () { listeners = listeners.filter(function (l) { return l !== cb; }); };
            },
            signOut: function () {
                signedIn = null;
                listeners.slice().forEach(function (cb) { cb(null); });
                return Promise.resolve();
            },
            signIn: function () {
                signedIn = user;
                listeners.slice().forEach(function (cb) { cb(user); });
                return Promise.resolve(user);
            },
            getAccessToken: function () { return Promise.resolve(signedIn ? 'sample-token' : null); },
            signUp: notReal, confirmSignUp: notReal, resendConfirmationCode: notReal, requestPasswordReset: notReal,
            confirmPasswordReset: notReal, changePassword: notReal, updateProfile: notReal, deleteAccount: notReal,
            friendlyError: function (err) { return (err && err.message) || 'Something went wrong.'; }
        };
        return { sync: sync, auth: demoAuth };
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { isDemo: isDemo, createDemo: createDemo, samplePdf: samplePdf };
    } else if (isDemo(root.location)) {
        var demo = createDemo({ fetch: root.fetch && root.fetch.bind(root) });
        root.RaCloudSync = demo.sync;
        root.RaAuth = demo.auth;
        if (root.console) root.console.info('[cloud-demo] Showing sample Cloud files data (localhost only).');
    }
})(typeof window !== 'undefined' ? window : globalThis);
