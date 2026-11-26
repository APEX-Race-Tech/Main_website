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

        // Real session units hold <session id>.apx (the id is the SHA-256 of the
        // logger file) and the session_<id prefix>.risession document with the
        // logger metadata.
        var ids = {
            s1: '3f9a1c7e5b2d4a6081f2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6a7b8',
            s2: '8c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d',
            s3: '0b7e6d5c4b3a29180f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6e5f4a3b2',
            s4: 'd4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3',
            s5: '5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b'
        };
        var docs = {};
        function session(key, info) {
            var id = ids[key];
            var docName = 'session_' + id.slice(0, 16) + '.risession';
            docs[docName] = {
                schema: 'race-insight-session', version: 1, file_name: info.file, laps: new Array(info.laps).fill({}),
                metadata: { Venue: info.track, Vehicle: info.car, Driver: info.driver, Date: info.date }
            };
            return [
                { name: id + '.apx', sha256: id, size: info.size, storage: 'standard' },
                { name: docName, sha256: sha(info.docChar), size: 182000, storage: info.archived ? 'archived' : 'standard' }
            ];
        }
        var sessionFiles = {};
        sessionFiles[ids.s1] = session('s1', { track: 'Spa-Francorchamps', car: 'Formula Vee', driver: 'Sample Driver',
            date: '2026-11-22', file: 'spa 2026-11-22 14-05-10_Race_1.ld', laps: 14, size: 31500000, docChar: 'e' });
        sessionFiles[ids.s2] = session('s2', { track: 'Spa-Francorchamps', car: 'Formula Vee', driver: 'Sample Driver',
            date: '2026-11-21', file: 'spa 2026-11-21 10-30-00_Qualifying.ld', laps: 8, size: 14800000, docChar: '6' });
        sessionFiles[ids.s3] = session('s3', { track: 'Spa-Francorchamps', car: 'Formula Vee', driver: 'Alex Teammate',
            date: '2026-11-20', file: 'spa 2026-11-20 15-45-12_FP2.ld', laps: 11, size: 11200000, docChar: '3' });
        sessionFiles[ids.s4] = session('s4', { track: 'Anglesey Coastal', car: 'Clio Cup', driver: 'Sample Driver',
            date: '2026-10-18', file: 'anglesey_lap.vbo', laps: 3, size: 600000, docChar: '8' });
        sessionFiles[ids.s5] = session('s5', { track: 'Monza', car: 'Formula Vee', driver: 'Sample Driver',
            date: '2026-10-27', file: 'monza 2026-10-27 11-02-44_Long_run.ld', laps: 22, size: 40100000, docChar: 'd', archived: true });

        // The desktop app names each session unit after its venue.
        var units = {
            projects: [
                { id: '_library', name: '', updated_at: iso(1) }
            ],
            sessions: [
                { id: ids.s1, name: 'Spa-Francorchamps', project_id: '_library', updated_at: iso(1), head_rev: '0000000003' },
                { id: ids.s2, name: 'Spa-Francorchamps', project_id: '_library', updated_at: iso(2), head_rev: '0000000002' },
                { id: ids.s3, name: 'Spa-Francorchamps', project_id: '_library', updated_at: iso(3), head_rev: '0000000001' },
                { id: ids.s5, name: 'Monza', project_id: '_library', updated_at: iso(30), head_rev: '0000000001' },
                { id: ids.s4, name: 'Anglesey Coastal', project_id: '_library', updated_at: iso(40), head_rev: '0000000001' }
            ]
        };

        var shareSeq = 10;
        var shareId = function () { shareSeq += 1; return ('00000000000000000000000000000000' + shareSeq.toString(16)).slice(-32); };
        var shares = {
            outgoing: [
                { share_id: shareId(), session_id: ids.s1, status: 'accepted', recipient_email: 'engineer@example.com' },
                { share_id: shareId(), session_id: ids.s1, status: 'pending', recipient_email: 'coach@example.com' },
                { share_id: shareId(), session_id: ids.s2, status: 'accepted', recipient_email: 'teammate@example.com' }
            ],
            inbox: [
                { share_id: shareId(), session_name: 'Le Mans', owner_name: 'Ada', status: 'accepted' }
            ],
            pending: [
                { share_id: shareId(), session_name: 'Daytona', owner_name: 'Bo' }
            ]
        };
        var inboxId = '9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d';
        ids.inbox = inboxId;
        var inboxFiles = session('inbox', { track: 'Circuit de la Sarthe', car: 'LMP3', driver: 'Ada',
            date: '2026-06-14', file: 'lemans 2026-06-14 03-12-40_Stint_3.ld', laps: 12, size: 52400000, docChar: '4' });

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
            if (ext === 'risession' && docs[file.name]) return Promise.resolve(new TextEncoder().encode(JSON.stringify(docs[file.name])).buffer);
            return Promise.resolve(new TextEncoder().encode('Sample file: ' + file.name + '\n').buffer);
        }

        var sync = {
            demo: true,
            configured: true,
            account: function () {
                return later({ entitlement: { active: true, edition: 'paid' },
                    quota: { bytes_used: 0.2 * 1024 * 1024 * 1024, bytes_reserved: 0, limit: 15 * 1024 * 1024 * 1024 }, consent_version: 1 });
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
            removeSession: function (id) {
                units.sessions = units.sessions.filter(function (x) { return x.id !== id; });
                shares.outgoing.forEach(function (x) { if (x.session_id === id) x.status = 'revoked'; });
                return later({ id: id, deleted: true });
            },
            removeShare: function (id) {
                shares.outgoing.forEach(function (s) { if (s.share_id === id) s.status = 'revoked'; });
                shares.inbox = shares.inbox.filter(function (s) { return s.share_id !== id; });
                shares.pending = shares.pending.filter(function (s) { return s.share_id !== id; });
                return later({ share_id: id });
            },
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
        return { sync: sync, auth: demoAuth, ids: ids };
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
