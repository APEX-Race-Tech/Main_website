/*
 * Cloud files popup on the RACE Insight page, in the layout of the desktop
 * app's Cloud files window: a storage bar, a folder list (My sessions, Shared
 * with me, Shared with others), a searchable session table and a details pane
 * with the session's files and actions.
 *
 * Sessions show the track, car, driver and date from their .risession
 * document; raw file hashes appear only in the details pane. Opens sessions
 * in the desktop app, previews images, videos and PDFs, downloads verified
 * files and shares sessions. Sessions are created by the desktop app only.
 * Exposes window.RaCloudApp ({ open, close }). The folder and selection are
 * kept in the URL hash ("#cloud", "#cloud/s=<id>", ...), so links work.
 * All text from the service is set with textContent, never as HTML.
 */
(function () {
    'use strict';

    var sync = window.RaCloudSync;
    var auth = window.RaAuth;
    var gate = window.RaCloudGate;
    var cx = window.RaCloudExplorer;
    var $ = function (id) { return document.getElementById(id); };
    var dialog = $('cloud-modal');
    if (!dialog || !sync || !gate || !cx) return;

    var GIB = 1024 * 1024 * 1024;
    var DETAIL_CONCURRENCY = 3;
    var model = null;            // from cx.buildModel
    var rawShares = {};          // GET /v1/shares, for recipients and the share dialog
    var folder = 'mine';         // 'mine' | 'shared' | 'outgoing'
    var selectedKey = null;      // row key: 's:<id>', 'sh:<id>', 'inv:<id>', 'out:<id>'
    var query = '';
    var sortBy = 'date';
    var details = {};            // row key -> { files, size, archived, facts } or { error }
    var detailQueue = [];
    var detailActive = 0;
    var detailInFlight = {};
    var dataToken = 0;           // bumps when the loaded data is replaced or cleared
    var fileCache = {};          // 's:<id>' or 'sh:<id>' -> Promise of files
    var loading = null;          // the load() in flight
    var renderQueued = false;
    var shareTarget = null;
    var viewer = { token: 0, url: null, file: null, shareId: null, buffer: null };
    var authSubscribed = false;
    var authSeen = false;
    var currentUid = null;

    function show(id, visible) { $(id).hidden = !visible; }
    function setStatus(text) { $('cloud-status').textContent = text; show('cloud-status', !!text); }
    function setError(err) {
        var message = err ? sync.friendlyError(err) : '';
        $('cloud-error').textContent = message;
        show('cloud-error', !!message);
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function icon(name, extra) {
        var i = el('i', 'fas ' + name + (extra ? ' ' + extra : ''));
        i.setAttribute('aria-hidden', 'true');
        return i;
    }

    /** A button that disables itself while its action runs and reports errors. */
    function button(label, className, onClick, iconName) {
        var b = el('button', className || 'btn btn-secondary cloud-btn');
        b.type = 'button';
        if (iconName) b.appendChild(icon(iconName));
        if (label) b.appendChild(document.createTextNode(iconName ? ' ' + label : label));
        b.addEventListener('click', function (event) {
            if (event && event.stopPropagation) event.stopPropagation();
            b.disabled = true;
            Promise.resolve().then(onClick).catch(setError).then(function () { b.disabled = false; });
        });
        return b;
    }

    function iconButton(label, iconName, onClick) {
        var b = button('', 'cx-icon-btn', onClick, iconName);
        b.setAttribute('aria-label', label);
        b.title = label;
        return b;
    }

    function badge(text, tone) { return el('span', 'cloud-badge cx-badge cx-badge--' + (tone || 'neutral'), text); }

    function formatBytes(bytes) {
        if (bytes >= GIB) return (bytes / GIB).toFixed(bytes >= 10 * GIB ? 0 : 1) + ' GB';
        if (bytes >= 1024 * 1024) return Math.round(bytes / 1024 / 1024) + ' MB';
        return Math.max(0, Math.round(bytes / 1024)) + ' KB';
    }

    /** Storage in GB, as the desktop app shows it: "0.2 GB", "15 GB". */
    function formatGB(bytes) {
        var gb = (bytes || 0) / GIB;
        return (gb >= 10 || gb === Math.round(gb) ? Math.round(gb) : gb.toFixed(1)) + ' GB';
    }

    /** "Jul 13, 2025" for a "yyyy-mm-dd" day (shown as that day everywhere) or an ISO time. */
    function formatDate(value) {
        if (!value) return '';
        var dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
        var date = new Date(dayOnly ? value + 'T00:00:00Z' : value);
        if (isNaN(date.getTime())) return '';
        var options = { year: 'numeric', month: 'short', day: 'numeric' };
        if (dayOnly) options.timeZone = 'UTC';
        return date.toLocaleDateString(undefined, options);
    }

    function editionLabel(edition) {
        if (!edition) return 'No subscription';
        if (edition === 'student') return 'Student plan';
        if (edition === 'trial') return 'Trial';
        return 'Cloud plan';
    }

    function save(name, buffer) {
        var url = URL.createObjectURL(new Blob([buffer]));
        var a = el('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function download(file, shareId) {
        return sync.downloadFile(file, shareId).then(function (buffer) { save(file.name, buffer); });
    }

    /* ---- Location: folder and selection in the hash ---- */

    function stateFromLocation(loc) {
        if (!loc) return;
        if (loc.type === 'shared' || loc.type === 'outgoing') { folder = loc.type; selectedKey = null; return; }
        if (loc.type === 'session') { folder = 'mine'; selectedKey = 's:' + loc.id; return; }
        if (loc.type === 'share') {
            folder = 'shared';
            var pending = !!model && model.pending.some(function (p) { return p.share_id === loc.id; });
            selectedKey = (pending ? 'inv:' : 'sh:') + loc.id;
            return;
        }
        folder = 'mine';
        selectedKey = null;
    }

    function locationFor(row) {
        if (folder === 'shared') return row && row.shareId ? { type: 'share', id: row.shareId } : { type: 'shared' };
        if (folder === 'outgoing') return { type: 'outgoing' };
        return row && row.sessionId ? { type: 'session', id: row.sessionId } : { type: 'mine' };
    }

    /** The location of the current folder and selection (works before anything is loaded). */
    function stateLocation() {
        var match = /^(s|sh|inv):(.+)$/.exec(selectedKey || '');
        if (folder === 'shared') return match && match[1] !== 's' ? { type: 'share', id: match[2] } : { type: 'shared' };
        if (folder === 'outgoing') return { type: 'outgoing' };
        return match && match[1] === 's' ? { type: 'session', id: match[2] } : { type: 'mine' };
    }

    /** Puts the selection in the hash without a new history entry (folders get their own entries). */
    function replaceHash(loc) {
        var hash = cx.locationToHash(loc);
        if (window.location.hash === hash) return;
        if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search + hash);
        } else {
            window.location.hash = hash;
        }
    }

    stateFromLocation(cx.hashToLocation(window.location.hash));

    /* ---- Opening and closing the popup ---- */

    var closingFromHash = false;

    function clearCloudHash() {
        if (!cx.hashToLocation(window.location.hash)) return;
        if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        } else {
            window.location.hash = '';
        }
    }

    /** Opens the popup, optionally at a folder or selection. */
    function open(loc) {
        if (loc) stateFromLocation(loc);
        var hash = cx.locationToHash(loc || stateLocation());
        if (window.location.hash !== hash) {
            window.location.hash = hash; // the hashchange listener renders
        }
        if (!dialog.open) dialog.showModal();
        show('cloud-demo-badge', !!sync.demo);
        start();
        return true;
    }

    function close() {
        if (dialog.open) dialog.close();
    }

    dialog.addEventListener('close', function () {
        // The close event arrives a moment after close(); skip it if the popup was reopened meanwhile.
        if (dialog.open) { closingFromHash = false; return; }
        closeViewer();
        ['cloud-share-dialog', 'cx-open-dialog'].forEach(function (id) { if ($(id).open) $(id).close(); });
        if (!closingFromHash) clearCloudHash();
        closingFromHash = false;
    });
    $('cloud-modal-close').addEventListener('click', close);
    dialog.addEventListener('click', function (event) {
        if (event.target === dialog) close(); // click on the backdrop
    });

    window.addEventListener('hashchange', function () {
        var loc = cx.hashToLocation(window.location.hash);
        if (!loc) {
            if (dialog.open) { closingFromHash = true; dialog.close(); }
            return;
        }
        stateFromLocation(loc);
        if (!dialog.open) { open(); return; }
        if (model) render();
    });

    /** First open: watch sign-in. Later opens: show what is loaded. */
    function start() {
        if (!sync.configured) { showState({ state: 'unavailable' }); return; }
        if (!auth || !auth.configured) { showState({ state: 'auth_unavailable' }); return; }
        if (!authSubscribed) {
            authSubscribed = true;
            auth.onAuthStateChanged(function (user) {
                authSeen = true;
                var uid = user ? user.uid : null;
                if (uid !== currentUid) { currentUid = uid; clearContent(); }
                if (dialog.open) refresh();
            });
        }
        refresh();
    }

    function refresh() {
        if (!authSeen) { setStatus('Loading…'); return; }
        if (!auth.currentUser) { showSignIn(); return; }
        if (model) { render(); return; }
        if (!loading) {
            setStatus('Loading your files…');
            loading = load().then(function (state) { loading = null; return state; });
        }
    }

    /* ---- Storage bar ---- */

    function renderAccount(account) {
        var quota = account.quota || {};
        var used = (quota.bytes_used || 0) + (quota.bytes_reserved || 0);
        var limit = quota.limit || 0;
        var percent = limit ? Math.min(100, (used / limit) * 100) : 0;
        $('cloud-edition').textContent = editionLabel(account.entitlement && account.entitlement.edition);
        $('cloud-quota-text').textContent = formatGB(used) + ' of ' + formatGB(limit);
        $('cloud-quota-bar').style.width = percent + '%';
        $('cloud-quota-bar').classList.toggle('cloud-quota__bar--full', percent >= 90);
        dialog.querySelector('.cloud-quota').setAttribute('aria-valuenow', String(Math.round(percent)));
        show('cloud-consent', !account.consent_version);
        show('cloud-account', true);
    }

    /* ---- Opening a session in the desktop app ---- */

    /**
     * Asks the desktop app to open a session. The link is built to the exact
     * shape the app accepts (cx.openInAppUrl) and clicked from inside the open
     * confirm dialog, so the modal popup does not make it inert. The dialog
     * keeps a "Try again" link and the install fallback.
     */
    function openInApp(target) {
        var url = cx.openInAppUrl(target);
        var label = target.label || 'this session';
        var text = $('cx-open-text');
        var again = $('cx-open-again');
        // race-insight.js renames every "#download" link to "Download" after sign-in; this one is the install fallback.
        $('cx-open-get').textContent = 'Install or update';
        if (!$('cx-open-dialog').open) $('cx-open-dialog').showModal();
        if (sync.demo) {
            text.textContent = 'With real data, this opens “' + label + '” in the RACE Insight desktop app.';
            show('cx-open-again', false);
            return;
        }
        if (!url) {
            text.textContent = '“' + label + '” cannot be opened from the website. Open it from Cloud files in the desktop app.';
            show('cx-open-again', false);
            return;
        }
        text.textContent = 'Your browser may ask to open RACE Insight to show “' + label + '”. Allow it to continue.';
        again.href = url;
        show('cx-open-again', true);
        var a = el('a');
        a.href = url;
        a.rel = 'noopener';
        $('cx-open-dialog').appendChild(a);
        a.click();
        a.remove();
    }

    $('cx-open-get').addEventListener('click', function () { $('cx-open-dialog').close(); close(); });

    /* ---- Viewer ---- */

    function closeViewer() {
        viewer.token += 1;
        if (viewer.url) URL.revokeObjectURL(viewer.url);
        viewer.url = null;
        viewer.file = null;
        viewer.buffer = null;
        $('cx-viewer-body').textContent = '';
        if ($('cx-viewer').open) $('cx-viewer').close();
    }

    /** Previews an image, video or PDF after its SHA-256 is verified. */
    function openViewer(file, shareId) {
        var mime = cx.previewType(file);
        if (!mime) return download(file, shareId);
        closeViewer();
        var token = viewer.token;
        viewer.file = file;
        viewer.shareId = shareId || null;
        $('cx-viewer-title').textContent = file.name;
        var body = $('cx-viewer-body');
        body.appendChild(el('p', 'cloud-muted cx-viewer__loading', 'Loading ' + formatBytes(file.size) + '…'));
        $('cx-viewer').showModal();
        return sync.downloadFile(file, shareId).then(function (buffer) {
            if (token !== viewer.token) return; // closed or replaced meanwhile
            viewer.buffer = buffer;
            viewer.url = URL.createObjectURL(new Blob([buffer], { type: mime }));
            body.textContent = '';
            var node;
            if (mime.indexOf('image/') === 0) {
                node = el('img', 'cx-viewer__media');
                node.alt = file.name;
            } else if (mime.indexOf('video/') === 0) {
                node = el('video', 'cx-viewer__media');
                node.controls = true;
                node.playsInline = true;
            } else {
                node = el('iframe', 'cx-viewer__pdf');
                node.title = file.name;
            }
            node.src = viewer.url;
            body.appendChild(node);
            if (mime === 'application/pdf') {
                // Phone browsers often cannot show a PDF inside the page.
                var tab = el('a', 'cx-viewer__newtab', 'Open the PDF in a new tab');
                tab.href = viewer.url;
                tab.target = '_blank';
                tab.rel = 'noopener';
                body.appendChild(tab);
            }
        }, function (err) {
            if (token !== viewer.token) return;
            body.textContent = '';
            body.appendChild(el('p', 'cloud-error cx-viewer__loading', sync.friendlyError(err)));
        });
    }

    $('cx-viewer-close').addEventListener('click', closeViewer);
    $('cx-viewer').addEventListener('close', function () {
        if (!$('cx-viewer').open) closeViewer(); // not if another file opened meanwhile
    });
    $('cx-viewer').addEventListener('click', function (event) {
        if (event.target === $('cx-viewer')) closeViewer();
    });
    $('cx-viewer-download').addEventListener('click', function () {
        if (!viewer.file) return;
        if (viewer.buffer) { save(viewer.file.name, viewer.buffer); return; }
        download(viewer.file, viewer.shareId).catch(setError);
    });

    /* ---- Session files and documents ---- */

    function filesFor(row) {
        var key = row.kind === 'shared' ? 'sh:' + row.shareId : 's:' + row.sessionId;
        if (!fileCache[key]) {
            fileCache[key] = (row.kind === 'shared' ? sync.sharedFiles(row.shareId) : sync.unitFiles('session', row.sessionId))
                .catch(function (err) { delete fileCache[key]; throw err; });
        }
        return fileCache[key];
    }

    function needsDetails(row) {
        return (row.kind === 'own' || (row.kind === 'shared' && row.live)) && !details[row.key] && !detailInFlight[row.key];
    }

    function scheduleRender() {
        if (renderQueued) return;
        renderQueued = true;
        setTimeout(function () { renderQueued = false; if (model) render(); }, 0);
    }

    /** Reads a session's file list and its .risession document (track, car, driver, date). */
    function fetchDetails(row) {
        var token = dataToken;
        var unitName = row.kind === 'shared' ? (cx.findShare(model, row.shareId) || {}).name
            : ((cx.findSession(model, row.sessionId) || {}).session || {}).name;
        detailInFlight[row.key] = true;
        return filesFor(row).then(function (files) {
            var size = files.reduce(function (sum, f) { return sum + (f.size || 0); }, 0);
            var archived = files.some(function (f) { return !cx.isAvailable(f); });
            var entry = { files: files, size: size, archived: archived, facts: null };
            var docFile = files.filter(function (f) {
                return cx.extension(f.name) === 'risession' && cx.isAvailable(f) && f.size <= cx.MAX_SESSION_DOCUMENT_BYTES;
            })[0];
            if (!docFile) return entry;
            return sync.downloadFile(docFile, row.kind === 'shared' ? row.shareId : null).then(function (buffer) {
                var doc = cx.parseSessionDocument(new TextDecoder().decode(buffer));
                if (doc) entry.facts = cx.sessionFacts(doc, unitName);
                return entry;
            }, function () { return entry; }); // the list still shows; facts stay from the unit name
        }).then(function (entry) {
            if (token !== dataToken) return;
            if (!entry.facts) delete entry.facts;
            details[row.key] = entry;
        }, function (err) {
            if (token !== dataToken) return;
            details[row.key] = { error: sync.friendlyError(err) };
        }).then(function () {
            if (token !== dataToken) return;
            delete detailInFlight[row.key];
            scheduleRender();
        });
    }

    function pumpDetails() {
        while (detailActive < DETAIL_CONCURRENCY && detailQueue.length) {
            var row = detailQueue.shift();
            if (!needsDetails(row)) continue;
            detailActive += 1;
            var token = dataToken;
            fetchDetails(row).then(function () {
                if (token !== dataToken) return;
                detailActive -= 1;
                pumpDetails();
            });
        }
    }

    function queueDetails(rows) {
        rows.forEach(function (row) {
            var queued = detailQueue.some(function (q) { return q.key === row.key; });
            if (needsDetails(row) && !queued) detailQueue.push(row);
        });
        pumpDetails();
    }

    /* ---- Rendering ---- */

    function navigate(target) {
        var hash = cx.locationToHash(target);
        if (window.location.hash === hash) { stateFromLocation(target); render(); return; }
        window.location.hash = hash; // the hashchange listener renders
    }

    function select(row) {
        selectedKey = row ? row.key : null;
        replaceHash(locationFor(row));
        render();
        if (row && needsDetails(row)) fetchDetails(row); // the selected row goes ahead of the queue
    }

    function renderNav() {
        var nav = $('cx-tree');
        nav.textContent = '';
        function item(label, iconName, target, count) {
            var active = folder === target.type || (target.type === 'mine' && folder === 'mine');
            var b = el('button', 'cx-nav__item' + (active ? ' is-active' : ''));
            b.type = 'button';
            if (active) b.setAttribute('aria-current', 'page');
            b.appendChild(icon(iconName));
            b.appendChild(el('span', 'cx-nav__label', label));
            if (count !== null) b.appendChild(el('span', 'cx-nav__count', String(count)));
            b.addEventListener('click', function () { navigate(target); });
            nav.appendChild(b);
        }
        item('My sessions', 'fa-user', { type: 'mine' }, null);
        item('Shared with me', 'fa-inbox', { type: 'shared' }, model.pending.length + model.shared.length);
        item('Shared with others', 'fa-share-nodes', { type: 'outgoing' }, model.outgoing.length);
    }

    function emptyMessage() {
        if (query.trim()) return 'No cloud files match your search.';
        if (folder === 'shared') return 'Nobody has shared a session with you yet.';
        if (folder === 'outgoing') return 'You have not shared any sessions. Select a session and choose Share.';
        return 'No sessions in the cloud yet. Turn on cloud sync in the RACE Insight desktop app.';
    }

    function cell(className, text) {
        var td = el('td', className);
        td.appendChild(el('span', 'cx-cell__text', text || '—'));
        if (text) td.title = text;
        return td;
    }

    function rowElement(row, index, all) {
        var tr = el('tr', 'cx-tr' + (row.key === selectedKey ? ' is-selected' : '') + (row.kind === 'shared' && !row.live ? ' is-muted' : ''));
        tr.tabIndex = 0;
        tr.setAttribute('aria-selected', row.key === selectedKey ? 'true' : 'false');
        tr.setAttribute('data-key', row.key);
        var name = el('td', 'cx-col--name');
        var wrap = el('div', 'cx-cell__name');
        wrap.appendChild(icon(row.kind === 'invitation' ? 'fa-envelope' : row.kind === 'shared' ? 'fa-user-group' : 'fa-file-lines',
            'cx-cell__icon'));
        var texts = el('div', 'cx-cell__texts');
        texts.appendChild(el('span', 'cx-cell__title', row.name));
        if (row.ownerName) texts.appendChild(el('span', 'cx-cell__sub', row.kind === 'invitation' ? row.ownerName + ' invited you' : 'Shared by ' + row.ownerName));
        var meta = [row.track, formatDate(row.date || row.updated_at)].filter(Boolean).join(' · ');
        if (meta) texts.appendChild(el('span', 'cx-cell__meta', meta));
        wrap.appendChild(texts);
        name.appendChild(wrap);
        name.title = row.name;
        tr.appendChild(name);
        tr.appendChild(cell('cx-col--track', row.track));
        tr.appendChild(cell('cx-col--date', formatDate(row.date || row.updated_at)));
        tr.appendChild(cell('cx-col--size', row.size == null ? '' : formatBytes(row.size)));
        var status = el('td', 'cx-col--status');
        var badges = el('span', 'cx-badges');
        badges.appendChild(badge(row.status.label, row.status.tone));
        if (row.sharedWith > 0) badges.appendChild(badge('Shared with ' + row.sharedWith, 'accent'));
        status.appendChild(badges);
        tr.appendChild(status);
        tr.addEventListener('click', function () { select(row); });
        tr.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(row); return; }
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            var next = all[index + (event.key === 'ArrowDown' ? 1 : -1)];
            if (!next) return;
            event.preventDefault();
            var node = $('cx-list').querySelector('[data-key="' + next.key + '"]');
            if (node && node.focus) node.focus();
        });
        return tr;
    }

    function render() {
        renderNav();
        var all = cx.buildRows(model, folder, details);
        var rows = cx.filterAndSort(all, query, sortBy);
        var selected = rows.filter(function (r) { return r.key === selectedKey; })[0] || null;
        var list = $('cx-list');
        list.textContent = '';
        rows.forEach(function (row, i) { list.appendChild(rowElement(row, i, rows)); });
        $('cx-empty').textContent = rows.length ? '' : emptyMessage();
        show('cx-empty', !rows.length);
        $('cloud-explorer').classList.toggle('has-selection', !!selected);
        renderDetails(selected);
        queueDetails(all);
    }

    /* ---- Details pane ---- */

    function fact(list, label, value) {
        var row = el('div', 'cx-facts__row');
        row.appendChild(el('dt', '', label));
        row.appendChild(el('dd', '', value || '—'));
        list.appendChild(row);
    }

    function section(body, title) {
        var s = el('div', 'cx-details__section');
        s.appendChild(el('h4', 'cx-details__heading', title));
        body.appendChild(s);
        return s;
    }

    function recipientsOf(sessionId) {
        return (rawShares.outgoing || []).filter(function (s) {
            return s.session_id === sessionId && (s.status === 'pending' || s.status === 'accepted');
        });
    }

    function renderRecipientsInto(container, shares) {
        var list = el('ul', 'cx-recipients');
        shares.forEach(function (share) {
            var item = el('li', 'cx-recipient');
            var who = el('span', 'cx-recipient__email', share.recipient_email || share.email || '');
            item.appendChild(who);
            item.appendChild(badge(share.status === 'accepted' ? 'Accepted' : 'Invited', share.status === 'accepted' ? 'valid' : 'neutral'));
            item.appendChild(button('Revoke', 'btn btn-secondary cloud-btn cx-btn--small', function () {
                return sync.removeShare(share.share_id).then(load);
            }));
            list.appendChild(item);
        });
        container.appendChild(list);
    }

    var FILE_ICONS = {
        race: ['fa-chart-line', 'cx-icon--race'], image: ['fa-file-image', 'cx-icon--image'],
        video: ['fa-file-video', 'cx-icon--video'], pdf: ['fa-file-pdf', 'cx-icon--pdf'], other: ['fa-file', '']
    };

    function fileItem(file, shareId) {
        var available = cx.isAvailable(file);
        var category = cx.fileCategory(file.name);
        var li = el('li', 'cx-file' + (available ? '' : ' is-muted'));
        var look = FILE_ICONS[category];
        li.appendChild(icon(look[0], 'cx-file__icon ' + look[1]));
        var texts = el('div', 'cx-file__texts');
        texts.appendChild(el('span', 'cx-file__label', cx.typeLabel(file.name)));
        var meta = el('span', 'cx-file__meta');
        var shown = el('span', 'cx-file__name', cx.displayFileName(file.name));
        shown.title = file.name;
        meta.appendChild(shown);
        meta.appendChild(el('span', 'cx-file__size', formatBytes(file.size)));
        if (!available) meta.appendChild(badge('Archived', 'warn'));
        texts.appendChild(meta);
        li.appendChild(texts);
        var actions = el('span', 'cx-file__actions');
        if (available && cx.previewType(file)) actions.appendChild(iconButton('View ' + file.name, 'fa-eye', function () { return openViewer(file, shareId); }));
        if (available) actions.appendChild(iconButton('Download ' + file.name, 'fa-download', function () { return download(file, shareId); }));
        li.appendChild(actions);
        return li;
    }

    function renderDetails(row) {
        var body = $('cx-details-body');
        body.textContent = '';
        if (!row) {
            var empty = el('div', 'cx-details__empty');
            empty.appendChild(icon('fa-file-lines'));
            empty.appendChild(el('p', 'cloud-muted', 'Select a session to see its files.'));
            body.appendChild(empty);
            return;
        }
        var head = el('div', 'cx-details__head');
        head.appendChild(el('h3', 'cx-details__title', row.name));
        if (row.ownerName) head.appendChild(el('span', 'cloud-muted cx-details__owner', row.kind === 'invitation' ? row.ownerName + ' invited you' : 'Shared by ' + row.ownerName));
        var badges = el('span', 'cx-badges');
        badges.appendChild(badge(row.status.label, row.status.tone));
        if (row.sharedWith > 0) badges.appendChild(badge('Shared with ' + row.sharedWith, 'accent'));
        head.appendChild(badges);
        body.appendChild(head);

        var actions = el('div', 'cx-details__actions');
        body.appendChild(actions);
        var shareId = row.kind === 'shared' ? row.shareId : null;
        var d = details[row.key] || null;

        if (row.kind === 'invitation') {
            actions.appendChild(button('Accept', 'btn btn-primary cloud-btn', function () { return sync.acceptShare(row.shareId).then(load); }));
            actions.appendChild(button('Decline', 'btn btn-secondary cloud-btn', function () { return sync.removeShare(row.shareId).then(load); }));
            return;
        }
        if (row.kind === 'deleted') {
            body.appendChild(el('p', 'cloud-muted', 'This session is no longer in your cloud. Revoke the invitations you no longer need.'));
            renderRecipientsInto(section(body, 'Shared with'), recipientsOf(row.key.slice(4)));
            return;
        }
        if (row.live) {
            actions.appendChild(button('Open in RACE Insight', 'btn btn-primary cloud-btn', function () {
                openInApp(row.kind === 'shared' ? { shareId: row.shareId, label: row.name } : { sessionId: row.sessionId, label: row.name });
            }, 'fa-up-right-from-square'));
            var apx = d && d.files ? d.files.filter(function (f) { return cx.extension(f.name) === 'apx' && cx.isAvailable(f); })[0] : null;
            if (apx) {
                actions.appendChild(button('Download', 'btn btn-secondary cloud-btn', function () {
                    // Saved under the session's name; the cloud keeps it as <hash>.apx.
                    return sync.downloadFile(apx, shareId).then(function (buffer) { save(safeName(row.name) + '.apx', buffer); });
                }, 'fa-download'));
            }
        }
        if (row.kind === 'own') {
            actions.appendChild(button('Share', 'btn btn-secondary cloud-btn', function () { openShare(row); }, 'fa-share-nodes'));
        }
        if (row.kind === 'shared') {
            actions.appendChild(button('Remove from my list', 'btn btn-secondary cloud-btn', function () {
                return sync.removeShare(row.shareId).then(load);
            }, 'fa-xmark'));
        }

        if (row.kind === 'own' || row.live) {
            var facts = el('dl', 'cx-facts');
            fact(facts, 'Track', row.track);
            fact(facts, 'Car', row.car);
            fact(facts, 'Driver', row.driver);
            fact(facts, 'Date', formatDate(row.date));
            if (row.laps != null) fact(facts, 'Laps', String(row.laps));
            body.appendChild(facts);
        }

        if (row.kind === 'own') {
            var shares = recipientsOf(row.sessionId);
            if (shares.length) renderRecipientsInto(section(body, 'Shared with'), shares);
        }

        if (!row.live) {
            body.appendChild(el('p', 'cloud-muted', 'This session is no longer shared with you.'));
            return;
        }
        var filesSection = section(body, 'Files');
        if (!d) { filesSection.appendChild(el('p', 'cloud-muted cx-details__note', 'Loading files…')); return; }
        if (d.error) { filesSection.appendChild(el('p', 'cloud-error cx-details__note', d.error)); return; }
        if (!d.files.length) { filesSection.appendChild(el('p', 'cloud-muted cx-details__note', 'No files in this session.')); return; }
        var list = el('ul', 'cx-files');
        cx.sortFiles(d.files).forEach(function (file) { list.appendChild(fileItem(file, shareId)); });
        filesSection.appendChild(list);
    }

    function safeName(name) {
        var clean = String(name || 'session').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ').replace(/[. ]+$/, '').trim();
        return clean.slice(0, 120) || 'session';
    }

    $('cx-details-back').addEventListener('click', function () { select(null); });

    $('cx-search').addEventListener('input', function () {
        query = $('cx-search').value || '';
        if (model) render();
    });
    $('cx-sort').addEventListener('change', function () {
        sortBy = $('cx-sort').value || 'date';
        if (model) render();
    });
    $('cx-refresh').addEventListener('click', function () {
        if (!loading) loading = load().then(function (state) { loading = null; return state; });
    });

    /* ---- Sharing (per session) ---- */

    function renderShareRecipients(sessionId) {
        var list = $('cloud-share-recipients');
        list.textContent = '';
        var active = recipientsOf(sessionId);
        active.forEach(function (share) {
            var item = el('li', 'cloud-row');
            item.appendChild(el('span', '', share.recipient_email));
            item.appendChild(el('span', 'cloud-badge', share.status === 'accepted' ? 'Accepted' : 'Invited'));
            item.appendChild(button('Revoke', 'btn btn-secondary cloud-btn', function () {
                return sync.removeShare(share.share_id).then(load).then(function () { renderShareRecipients(sessionId); });
            }));
            list.appendChild(item);
        });
        if (!active.length) list.appendChild(el('li', 'cloud-muted', 'Nobody yet.'));
    }

    function openShare(row) {
        shareTarget = { id: row.sessionId, name: row.name };
        $('cloud-share-name').textContent = row.name;
        $('cloud-share-emails').value = '';
        $('cloud-share-ai').checked = false;
        $('cloud-share-expires').value = '';
        show('cloud-share-error', false);
        renderShareRecipients(row.sessionId);
        $('cloud-share-dialog').showModal();
    }

    function shareError(text) {
        $('cloud-share-error').textContent = text;
        show('cloud-share-error', !!text);
    }

    $('cloud-share-submit').addEventListener('click', function () {
        var entries = $('cloud-share-emails').value.split(/[\s,;]+/).filter(Boolean);
        var invalid = entries.filter(function (e) { return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); });
        if (invalid.length) return shareError('Not an email address: ' + invalid.join(', '));
        if (!entries.length) return shareError('Enter at least one email address.');
        var expires = $('cloud-share-expires').value ? new Date($('cloud-share-expires').value + 'T23:59:59') : null;
        if (expires && !(expires.getTime() > Date.now())) return shareError('The expiry date must be in the future.');
        shareError('');
        var emails = Array.from(new Set(entries.map(function (e) { return e.toLowerCase(); })));
        sync.createShare(shareTarget.id, emails, $('cloud-share-ai').checked, expires ? expires.toISOString() : null)
            .then(function () {
                $('cloud-share-emails').value = '';
                shareError('');
                return load().then(function (state) { if (state) renderShareRecipients(shareTarget.id); });
            })
            .catch(function (err) { shareError(sync.friendlyError(err)); });
    });

    /* ---- Access and loading ---- */

    function resetData() {
        dataToken += 1;
        details = {};
        detailQueue = [];
        detailActive = 0;
        detailInFlight = {};
        fileCache = {};
    }

    /** Hides and empties everything that shows account data. */
    function clearContent() {
        ['cloud-account', 'cloud-explorer', 'cloud-locked', 'cloud-signin-btn', 'cloud-consent'].forEach(function (id) { show(id, false); });
        model = null;
        rawShares = {};
        resetData();
        $('cx-list').textContent = '';
        $('cx-tree').textContent = '';
        $('cx-details-body').textContent = '';
        closeViewer();
        ['cloud-share-dialog', 'cx-open-dialog'].forEach(function (id) { if ($(id).open) $(id).close(); });
    }

    function showSignIn() {
        clearContent();
        setError(null);
        setStatus('Sign in to see your cloud files.');
        show('cloud-locked', true);
        show('cloud-signin-btn', true);
    }

    $('cloud-signin-btn').addEventListener('click', function () {
        close();
        var signIn = $('nav-signin-btn');
        if (signIn) signIn.click();
    });

    function showNoSubscription() {
        clearContent();
        setError(null);
        setStatus('A RACE Insight subscription is needed to use Cloud files.');
        show('cloud-locked', true);
    }

    function showState(result) {
        if (result.state === 'signed_out') return showSignIn();
        if (result.state === 'no_subscription') return showNoSubscription();
        clearContent();
        if (result.state === 'unavailable') return setStatus('Cloud sync is not available yet.');
        if (result.state === 'auth_unavailable') return setStatus('Sign-in is not available right now.');
        setStatus('');
        setError(result.error);
    }

    /**
     * Loads sessions and shares only after the account is confirmed to have
     * an active subscription. Resolves to the loaded state, or null.
     */
    function load() {
        setError(null);
        var user = auth && auth.currentUser;
        var uid = user && user.uid;
        var stale = function () { var now = auth && auth.currentUser; return (now && now.uid) !== uid; };
        return gate.checkAccess(auth, sync, user).then(function (access) {
            if (stale()) return null; // signed out or switched account meanwhile
            if (access.state !== 'subscribed') { showState(access); return null; }
            return Promise.all([sync.listUnits(), sync.listShares()]).then(function (results) {
                if (stale()) return null;
                var state = { account: access.account, units: results[0], shares: results[1] };
                rawShares = state.shares || {};
                model = cx.buildModel(state.units, state.shares);
                resetData();
                // A selected share may have been an invitation until now (or the other way round).
                var shareMatch = /^(?:sh|inv):(.+)$/.exec(selectedKey || '');
                if (shareMatch) {
                    var pending = model.pending.some(function (p) { return p.share_id === shareMatch[1]; });
                    selectedKey = (pending ? 'inv:' : 'sh:') + shareMatch[1];
                }
                setStatus('');
                renderAccount(state.account);
                show('cloud-explorer', true);
                render();
                return state;
            });
        }).catch(function (err) {
            if (stale()) return null;
            if (err && err.code === 'subscription_required') { showNoSubscription(); return null; }
            if (err && err.code === 'signed_out') { showSignIn(); return null; }
            setStatus('');
            setError(err);
            return null;
        });
    }

    window.RaCloudApp = { open: open, close: close };

    // A link to "#cloud..." (for example from the old cloud.html) opens the popup.
    if (cx.hashToLocation(window.location.hash)) open();
})();
