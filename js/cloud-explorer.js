/*
 * Cloud files explorer: the folder model and file-type rules behind the
 * explorer on cloud.html. Pure functions, no DOM. Exposes window.RaCloudExplorer.
 *
 * Folders:
 *   My files            every project the user synced
 *     <project>         its sessions (the "_library" project is "Library")
 *       <session>       the session's files
 *   Shared with me      sessions other users shared, and pending invitations
 *     <shared session>  its files
 */
(function (root) {
    'use strict';

    var LIBRARY_PROJECT_ID = '_library';

    /** Formats RACE Insight opens directly (logger files and its own session files). */
    var RACE_EXTENSIONS = ['ibt', 'ld', 'xrk', 'drk', 'vbox', 'csv', 'risession'];

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
        csv: 'CSV data', risession: 'RACE Insight session'
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

    /**
     * Link that asks the RACE Insight desktop app to open a cloud session, or
     * one file of it: raceinsight://cloud/open?session=<id>&file=<sha256> for
     * your own session, ?share=<share id>&file=<sha256> for one shared with you.
     */
    function openInAppUrl(target) {
        var params = [];
        if (target.shareId) params.push('share=' + encodeURIComponent(target.shareId));
        else params.push('session=' + encodeURIComponent(target.sessionId));
        if (target.sha256) params.push('file=' + encodeURIComponent(target.sha256));
        return 'raceinsight://cloud/open?' + params.join('&');
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
     * Builds the folder model from GET /v1/projects and GET /v1/shares.
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
     *   { type: 'mine' }                    My files
     *   { type: 'project', id }             a project
     *   { type: 'session', id }             one of your sessions
     *   { type: 'shared' }                  Shared with me
     *   { type: 'share', id }               a session shared with you (id = share id)
     *   { type: 'outgoing' }                Shared with others
     * It is kept in the URL hash under "#cloud" (#cloud, #cloud/p=<id>, ...),
     * so the back button works and the page's other anchors are untouched.
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

    /**
     * Breadcrumb trail for a location: [{ label, location }]. Returns null
     * when the location points at something that no longer exists.
     */
    function trail(model, loc) {
        var mine = { label: 'My files', location: { type: 'mine' } };
        var shared = { label: 'Shared with me', location: { type: 'shared' } };
        if (!loc || loc.type === 'mine') return [mine];
        if (loc.type === 'shared') return [shared];
        if (loc.type === 'outgoing') return [{ label: 'Shared with others', location: loc }];
        if (loc.type === 'project') {
            var project = findProject(model, loc.id);
            return project ? [mine, { label: project.name, location: loc }] : null;
        }
        if (loc.type === 'session') {
            var found = findSession(model, loc.id);
            if (!found) return null;
            return [mine, { label: found.project.name, location: { type: 'project', id: found.project.id } },
                { label: found.session.name, location: loc }];
        }
        if (loc.type === 'share') {
            var share = findShare(model, loc.id);
            return share ? [shared, { label: share.name, location: loc }] : null;
        }
        return null;
    }

    var api = {
        LIBRARY_PROJECT_ID: LIBRARY_PROJECT_ID, RACE_EXTENSIONS: RACE_EXTENSIONS, MAX_PREVIEW_BYTES: MAX_PREVIEW_BYTES,
        extension: extension, fileCategory: fileCategory, typeLabel: typeLabel, previewType: previewType,
        isAvailable: isAvailable, openInAppUrl: openInAppUrl, buildModel: buildModel,
        locationToHash: locationToHash, hashToLocation: hashToLocation, trail: trail,
        findProject: findProject, findSession: findSession, findShare: findShare
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RaCloudExplorer = api;
})(typeof window !== 'undefined' ? window : globalThis);
