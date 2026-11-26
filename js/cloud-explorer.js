/*
 * Cloud files explorer: the session model, table rows and file-type rules
 * behind the Cloud files popup (js/cloud-app.js). Pure functions, no DOM.
 * Exposes window.RaCloudExplorer.
 *
 * Folders, as in the desktop app's Cloud files window:
 *   My sessions          every session the user synced
 *   Shared with me       sessions other users shared, and pending invitations
 *   Shared with others   your sessions with an active invitation or share
 *
 * Track, car, driver and date come from each session's .risession document
 * (race-insight-session v1, written by the desktop app). A value the document
 * does not hold stays null and the page shows a dash; nothing is guessed.
 */
(function (root) {
    'use strict';

    var LIBRARY_PROJECT_ID = '_library';

    /** Formats RACE Insight opens directly (logger files and its own session files). */
    var RACE_EXTENSIONS = ['apx', 'ibt', 'ld', 'xrk', 'drk', 'vbox', 'csv', 'risession'];

    /**
     * Files the browser can preview. SVG and HTML are left out on purpose:
     * a blob URL runs with this page's origin, and those formats can carry script.
     */
    var PREVIEW_TYPES = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
        avif: 'image/avif', bmp: 'image/bmp',
        mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/mp4', webm: 'video/webm',
        pdf: 'application/pdf'
    };

    /** Above this size a file is offered as a download only (previews load the whole file into memory). */
    var MAX_PREVIEW_BYTES = 512 * 1024 * 1024;

    var TYPE_LABELS = {
        ibt: 'iRacing telemetry', ld: 'MoTeC log', xrk: 'AiM log', drk: 'AiM log', vbox: 'VBOX log',
        csv: 'CSV data', risession: 'RACE Insight session', apx: 'RACE Insight session data'
    };

    function extension(name) {
        var match = /\.([A-Za-z0-9]{1,10})$/.exec(String(name || ''));
        return match ? match[1].toLowerCase() : '';
    }

    /** One of: race, image, video, pdf, other. */
    function fileCategory(name) {
        var ext = extension(name);
        if (RACE_EXTENSIONS.indexOf(ext) !== -1) return 'race';
        var mime = PREVIEW_TYPES[ext];
        if (!mime) return 'other';
        if (mime === 'application/pdf') return 'pdf';
        return mime.split('/')[0];
    }

    function typeLabel(name) {
        var ext = extension(name);
        if (TYPE_LABELS[ext]) return TYPE_LABELS[ext];
        var category = fileCategory(name);
        if (category === 'image') return ext.toUpperCase() + ' image';
        if (category === 'video') return ext.toUpperCase() + ' video';
        if (category === 'pdf') return 'PDF document';
        return ext ? ext.toUpperCase() + ' file' : 'File';
    }

    /** MIME type for an in-browser preview, or null when the file cannot be previewed. */
    function previewType(file) {
        if (!file || !file.size || file.size > MAX_PREVIEW_BYTES) return null;
        return PREVIEW_TYPES[extension(file.name)] || null;
    }

    function isAvailable(file) {
        return !!file && (file.storage === 'standard' || file.storage === 'restored' || !file.storage);
    }

    /* The desktop app accepts only these values (electron/cloudOpenLink.cjs in the app). */
    var LINK_SESSION_ID = /^[A-Za-z0-9_-]{1,64}$/;
    var LINK_SHARE_ID = /^[0-9a-f]{32}$/;
    var LINK_SHA256 = /^[0-9a-f]{64}$/;

    /**
     * Link that asks the RACE Insight desktop app to open a cloud session, or
     * one file of it, in exactly the shape the app's strict validator accepts:
     *   raceinsight://cloud/open?session=<id>[&file=<sha256>]    your own session
     *   raceinsight://cloud/open?share=<32 hex>[&file=<sha256>]  one shared with you
     * Returns null when the session or share id is not valid (the app would
     * ignore the link). A file hash that is not valid is left out.
     */
    function openInAppUrl(target) {
        if (!target) return null;
        var shareId = target.shareId == null ? '' : String(target.shareId);
        var sessionId = target.sessionId == null ? '' : String(target.sessionId);
        var query;
        if (shareId) {
            if (!LINK_SHARE_ID.test(shareId)) return null;
            query = 'share=' + shareId;
        } else {
            if (!LINK_SESSION_ID.test(sessionId)) return null;
            query = 'session=' + sessionId;
        }
        var sha = target.sha256 == null ? '' : String(target.sha256).toLowerCase();
        if (LINK_SHA256.test(sha)) query += '&file=' + sha;
        return 'raceinsight://cloud/open?' + query;
    }

    /* ---- Names and session facts ---- */

    var HASH_NAME = /^([0-9a-f]{32,})((?:\.[A-Za-z0-9]{1,10})?)$/i;

    /** "1a2b3c4d…9f0e" for a long hash. */
    function shortHash(sha) {
        var text = String(sha || '');
        return text.length > 16 ? text.slice(0, 8) + '…' + text.slice(-4) : text;
    }

    /** True for names that are only a hash, such as "<64 hex>.apx" or "session_<16 hex>.risession". */
    function looksLikeHash(name) {
        var text = String(name || '').trim();
        return HASH_NAME.test(text) || /^session_[0-9a-f]{16}\.risession$/i.test(text);
    }

    /** A file name with a long hash shortened: "1a2b3c4d…9f0e.apx". */
    function displayFileName(name) {
        var match = HASH_NAME.exec(String(name || ''));
        return match ? shortHash(match[1]) + match[2] : String(name || '');
    }

    var MAX_SESSION_DOCUMENT_BYTES = 4 * 1024 * 1024;

    /**
     * Reads the parts of a race-insight-session v1 document the page shows.
     * Returns null for anything else. Text from the cloud is untrusted: only
     * plain string metadata is kept, and the page sets it with textContent.
     */
    function parseSessionDocument(text) {
        if (typeof text !== 'string' || text.length > MAX_SESSION_DOCUMENT_BYTES) return null;
        var doc;
        try { doc = JSON.parse(text); } catch (e) { return null; }
        if (!doc || typeof doc !== 'object' || doc.schema !== 'race-insight-session' || doc.version !== 1) return null;
        var metadata = {};
        var raw = doc.metadata && typeof doc.metadata === 'object' && !Array.isArray(doc.metadata) ? doc.metadata : {};
        Object.keys(raw).slice(0, 500).forEach(function (key) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') return;
            if (typeof raw[key] === 'string' && key.length <= 200) metadata[key] = raw[key].slice(0, 1000);
        });
        return {
            fileName: typeof doc.file_name === 'string' ? doc.file_name.slice(0, 255) : '',
            metadata: metadata,
            laps: Array.isArray(doc.laps) ? doc.laps.length : null
        };
    }

    function pick(metadata, keys) {
        for (var i = 0; i < keys.length; i += 1) {
            var value = metadata && typeof metadata[keys[i]] === 'string' ? metadata[keys[i]].trim() : '';
            if (value) return value;
        }
        return null;
    }

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    /** A logger date as "yyyy-mm-dd", or null. Accepts ISO, dd/mm/yyyy, dd-mm-yyyy and unix seconds. */
    function normalizeDate(value) {
        var text = String(value == null ? '' : value).trim();
        if (!text) return null;
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
        if (m) return m[1] + '-' + m[2] + '-' + m[3];
        m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
        if (m) return m[3] + '-' + pad(Number(m[2])) + '-' + pad(Number(m[1]));
        var input = /^\d{9,11}(?:\.\d+)?$/.test(text) ? Number(text) * 1000 : text;
        var date = new Date(input);
        if (isNaN(date.getTime())) return null;
        return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate());
    }

    function withoutExtension(name) { return String(name || '').replace(/\.[A-Za-z0-9]{1,10}$/, '').trim(); }

    /**
     * Name, track, car, driver and date of a session, from its document when
     * it loaded and from the cloud unit name otherwise. The date follows the
     * desktop app: the logger "Date", then the date in the file name, then
     * "Log Date" (often the UTC day).
     */
    function sessionFacts(doc, unitName) {
        var meta = (doc && doc.metadata) || {};
        var fileName = doc && doc.fileName ? doc.fileName : '';
        var track = pick(meta, ['Venue', 'Track', 'TrackName', 'venue', 'track']);
        var car = pick(meta, ['Vehicle Desc', 'Vehicle', 'Car', 'VehicleName', 'CarName', 'Vehicle Type', 'vehicle']);
        var driver = pick(meta, ['Driver', 'Racer', 'DriverName', 'driver']);
        var fromName = /(\d{4})-(\d{2})-(\d{2})/.exec(fileName);
        var date = normalizeDate(pick(meta, ['Date', 'date', 'SessionDate']))
            || (fromName ? fromName[1] + '-' + fromName[2] + '-' + fromName[3] : null)
            || normalizeDate(pick(meta, ['Log Date', 'log_date']));
        var unit = String(unitName || '').trim();
        var name = looksLikeHash(fileName) ? '' : withoutExtension(fileName);
        if (!name && unit && !looksLikeHash(unit)) name = unit;
        if (!name) name = track || 'Untitled session';
        return { name: name, track: track, car: car, driver: driver, date: date, laps: doc ? doc.laps : null };
    }

    function projectName(project) {
        if (project.id === LIBRARY_PROJECT_ID) return 'Library';
        return project.name || 'Untitled project';
    }

    function byName(a, b) {
        return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base', numeric: true });
    }

    /** Active outgoing shares (invited or accepted) per session id. */
    function activeShares(shares, sessionId) {
        return ((shares && shares.outgoing) || []).filter(function (s) {
            return s.session_id === sessionId && (s.status === 'pending' || s.status === 'accepted');
        });
    }

    /**
     * Builds the model from GET /v1/projects and GET /v1/shares.
     * Sessions whose project is missing go to Library.
     */
    function buildModel(units, shares) {
        units = units || {};
        shares = shares || {};
        var projects = {};
        var order = [];
        (units.projects || []).forEach(function (p) {
            if (!p || !p.id || projects[p.id]) return;
            projects[p.id] = { id: p.id, name: projectName(p), updated_at: p.updated_at || null, sessions: [] };
            order.push(p.id);
        });
        (units.sessions || []).forEach(function (s) {
            if (!s || !s.id) return;
            var pid = s.project_id && projects[s.project_id] ? s.project_id : LIBRARY_PROJECT_ID;
            if (!projects[pid]) {
                projects[pid] = { id: pid, name: 'Library', updated_at: null, sessions: [] };
                order.push(pid);
            }
            projects[pid].sessions.push({
                id: s.id, name: s.name || 'Untitled session', project_id: pid, updated_at: s.updated_at || null,
                shared_with: activeShares(shares, s.id).length
            });
        });
        var list = order.map(function (id) { return projects[id]; });
        list.forEach(function (p) { p.sessions.sort(byName); });
        list.sort(function (a, b) {
            if (a.id === LIBRARY_PROJECT_ID) return -1;
            if (b.id === LIBRARY_PROJECT_ID) return 1;
            return byName(a, b);
        });
        var shared = (shares.inbox || []).map(function (s) {
            return { share_id: s.share_id, name: s.session_name || 'Shared session', owner_name: s.owner_name || 'another user',
                status: s.status, ai_use: !!s.ai_use };
        }).sort(byName);
        var pending = (shares.pending || []).map(function (s) {
            return { share_id: s.share_id, name: s.session_name || 'a session', owner_name: s.owner_name || 'Someone' };
        });
        // Shared with others: your sessions with an active invitation or accepted share.
        var bySession = {};
        var outgoing = [];
        (shares.outgoing || []).forEach(function (s) {
            if (!s || (s.status !== 'pending' && s.status !== 'accepted')) return;
            var entry = bySession[s.session_id];
            if (!entry) {
                var found = null;
                list.forEach(function (p) {
                    p.sessions.forEach(function (x) { if (x.id === s.session_id) found = { session: x, project: p }; });
                });
                entry = bySession[s.session_id] = {
                    session_id: s.session_id, name: found ? found.session.name : 'Deleted session',
                    project_name: found ? found.project.name : '', exists: !!found, recipients: []
                };
                outgoing.push(entry);
            }
            entry.recipients.push({ share_id: s.share_id, email: s.recipient_email || '', status: s.status,
                expires: s.expires || null });
        });
        outgoing.sort(byName);
        return { projects: list, shared: shared, pending: pending, outgoing: outgoing };
    }

    /* ---- Locations ----
     * A location is one of:
     *   { type: 'mine' }                    My sessions
     *   { type: 'project', id }             a project (older links; shows My sessions)
     *   { type: 'session', id }             My sessions, with that session selected
     *   { type: 'shared' }                  Shared with me
     *   { type: 'share', id }               Shared with me, with that share selected
     *   { type: 'outgoing' }                Shared with others
     * It is kept in the URL hash under "#cloud" (#cloud, #cloud/s=<id>, ...),
     * so links work and the page's other anchors are untouched.
     */
    var HASH_KEYS = { project: 'p', session: 's', share: 'sh' };

    function locationToHash(loc) {
        if (!loc || loc.type === 'mine') return '#cloud';
        if (loc.type === 'shared' || loc.type === 'outgoing') return '#cloud/' + loc.type;
        return '#cloud/' + HASH_KEYS[loc.type] + '=' + encodeURIComponent(loc.id);
    }

    /** The location in a "#cloud..." hash, or null for any other hash. */
    function hashToLocation(hash) {
        var text = String(hash || '');
        if (text !== '#cloud' && text.indexOf('#cloud/') !== 0) return null;
        text = text.slice('#cloud/'.length);
        if (text === 'shared' || text === 'outgoing') return { type: text };
        var match = /^(p|s|sh)=(.+)$/.exec(text);
        if (!match) return { type: 'mine' };
        var id;
        try { id = decodeURIComponent(match[2]); } catch (e) { return { type: 'mine' }; }
        var type = match[1] === 'p' ? 'project' : match[1] === 's' ? 'session' : 'share';
        return { type: type, id: id };
    }

    function findProject(model, id) {
        return model.projects.filter(function (p) { return p.id === id; })[0] || null;
    }

    function findSession(model, id) {
        for (var i = 0; i < model.projects.length; i += 1) {
            var hit = model.projects[i].sessions.filter(function (s) { return s.id === id; })[0];
            if (hit) return { session: hit, project: model.projects[i] };
        }
        return null;
    }

    function findShare(model, id) {
        return model.shared.filter(function (s) { return s.share_id === id; })[0] || null;
    }

    /* ---- Table rows ---- */

    var DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

    function sortTime(row) {
        var value = row.date || row.updated_at;
        if (!value) return 0;
        var t = Date.parse(DAY_ONLY.test(value) ? value + 'T12:00:00Z' : value);
        return isNaN(t) ? 0 : t;
    }

    function blankFacts(name) { return { name: name, track: null, car: null, driver: null, date: null, laps: null }; }

    function baseRow(key, kind) {
        return {
            key: key, kind: kind, sessionId: null, shareId: null, name: '', track: null, car: null, driver: null, date: null,
            laps: null, updated_at: null, size: null, ownerName: null, sharedWith: 0, invited: 0, recipients: null, live: false,
            status: { label: '', tone: 'neutral' }
        };
    }

    function applyFacts(row, facts) {
        row.name = facts.name;
        row.track = facts.track;
        row.car = facts.car;
        row.driver = facts.driver;
        row.date = facts.date;
        row.laps = facts.laps;
        return row;
    }

    /**
     * Rows of one folder ('mine', 'shared' or 'outgoing'). details maps a row
     * key ("s:<session id>", "sh:<share id>") to what was read for it:
     * { facts, size, archived }. Rows keep the cloud unit name until their
     * document loads.
     */
    function buildRows(model, folder, details) {
        details = details || {};
        function own(session, recipients) {
            var row = baseRow('s:' + session.id, 'own');
            var d = details[row.key] || {};
            applyFacts(row, d.facts || sessionFacts(null, session.name));
            row.sessionId = session.id;
            row.updated_at = session.updated_at;
            row.size = d.size == null ? null : d.size;
            row.sharedWith = recipients ? recipients.length : session.shared_with || 0;
            row.invited = recipients ? recipients.filter(function (r) { return r.status !== 'accepted'; }).length : 0;
            row.recipients = recipients || null;
            row.live = true;
            row.status = d.archived ? { label: 'Archived', tone: 'warn' } : { label: 'In cloud', tone: 'valid' };
            return row;
        }
        if (folder === 'shared') {
            var invites = model.pending.map(function (invite) {
                var row = applyFacts(baseRow('inv:' + invite.share_id, 'invitation'), blankFacts(invite.name));
                row.shareId = invite.share_id;
                row.ownerName = invite.owner_name;
                row.status = { label: 'Invitation', tone: 'accent' };
                return row;
            });
            var shared = model.shared.map(function (share) {
                var row = baseRow('sh:' + share.share_id, 'shared');
                var d = details[row.key] || {};
                var facts = d.facts || blankFacts(looksLikeHash(share.name) ? 'Shared session' : share.name);
                applyFacts(row, facts);
                row.shareId = share.share_id;
                row.size = d.size == null ? null : d.size;
                row.ownerName = share.owner_name;
                row.live = share.status === 'accepted';
                row.status = !row.live ? { label: 'No longer shared', tone: 'warn' }
                    : d.archived ? { label: 'Archived', tone: 'warn' } : { label: 'Shared with you', tone: 'accent' };
                return row;
            });
            return invites.concat(shared);
        }
        if (folder === 'outgoing') {
            return model.outgoing.map(function (entry) {
                var found = entry.exists ? findSession(model, entry.session_id) : null;
                if (found) return own(found.session, entry.recipients);
                var row = applyFacts(baseRow('out:' + entry.session_id, 'deleted'), blankFacts(entry.name));
                row.sharedWith = entry.recipients.length;
                row.recipients = entry.recipients;
                row.status = { label: 'Deleted', tone: 'neutral' };
                return row;
            });
        }
        var rows = [];
        model.projects.forEach(function (p) { p.sessions.forEach(function (s) { rows.push(own(s)); }); });
        return rows;
    }

    /** Search over name, track, car, driver and owner; sort by date (newest first), name, or size (largest first). */
    function filterAndSort(rows, query, sort) {
        var words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
        var hits = rows.filter(function (row) {
            if (!words.length) return true;
            var text = [row.name, row.track, row.car, row.driver, row.ownerName].filter(Boolean).join(' ').toLowerCase();
            return words.every(function (w) { return text.indexOf(w) !== -1; });
        });
        var compare = sort === 'name' ? byName
            : sort === 'size' ? function (a, b) { return (b.size || 0) - (a.size || 0) || byName(a, b); }
                : function (a, b) { return sortTime(b) - sortTime(a) || byName(a, b); };
        return hits.map(function (row, i) { return { row: row, i: i }; }).sort(function (a, b) {
            // Invitations stay on top: they wait for an answer.
            var ia = a.row.kind === 'invitation' ? 0 : 1;
            var ib = b.row.kind === 'invitation' ? 0 : 1;
            return ia - ib || compare(a.row, b.row) || a.i - b.i;
        }).map(function (x) { return x.row; });
    }

    /** Files of a session for the details pane: session data, session document, other RACE Insight files, then the rest. */
    function sortFiles(files) {
        var rank = function (f) {
            var ext = extension(f.name);
            return ext === 'apx' ? 0 : ext === 'risession' ? 1 : fileCategory(f.name) === 'race' ? 2 : 3;
        };
        return (files || []).slice().sort(function (a, b) {
            return rank(a) - rank(b) || String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: 'base' });
        });
    }

    var api = {
        LIBRARY_PROJECT_ID: LIBRARY_PROJECT_ID, RACE_EXTENSIONS: RACE_EXTENSIONS, MAX_PREVIEW_BYTES: MAX_PREVIEW_BYTES,
        MAX_SESSION_DOCUMENT_BYTES: MAX_SESSION_DOCUMENT_BYTES,
        extension: extension, fileCategory: fileCategory, typeLabel: typeLabel, previewType: previewType,
        isAvailable: isAvailable, openInAppUrl: openInAppUrl, buildModel: buildModel,
        locationToHash: locationToHash, hashToLocation: hashToLocation,
        findProject: findProject, findSession: findSession, findShare: findShare,
        shortHash: shortHash, looksLikeHash: looksLikeHash, displayFileName: displayFileName,
        parseSessionDocument: parseSessionDocument, normalizeDate: normalizeDate, sessionFacts: sessionFacts,
        buildRows: buildRows, filterAndSort: filterAndSort, sortFiles: sortFiles
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RaCloudExplorer = api;
})(typeof window !== 'undefined' ? window : globalThis);
