/*
 * Cloud files page: a file explorer over the signed-in user's synced
 * projects, sessions and files, plus sessions other users shared with them.
 * Opens RACE Insight files in the desktop app, previews images, videos and
 * PDFs, downloads verified files, shares sessions and uploads a logger file.
 * All text from the service is set with textContent, never as HTML.
 */
(function () {
    'use strict';

    var sync = window.RaCloudSync;
    var auth = window.RaAuth;
    var gate = window.RaCloudGate;
    var cx = window.RaCloudExplorer;
    var $ = function (id) { return document.getElementById(id); };
    var GIB = 1024 * 1024 * 1024;

    var model = null;            // folder model from cx.buildModel
    var rawShares = {};          // GET /v1/shares, for the share dialog
    var current = cx.hashToLocation(window.location.hash);
    var fileCache = {};          // 's:<id>' or 'sh:<id>' -> Promise of files
    var renderToken = 0;
    var shareTarget = null;
    var viewer = { token: 0, url: null, file: null, shareId: null };

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
        if (text !== undefined) node.textContent = text;
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

    function formatBytes(bytes) {
        if (bytes >= GIB) return (bytes / GIB).toFixed(bytes >= 10 * GIB ? 0 : 1) + ' GB';
        if (bytes >= 1024 * 1024) return Math.round(bytes / 1024 / 1024) + ' MB';
        return Math.max(0, Math.round(bytes / 1024)) + ' KB';
    }

    function formatDate(value) {
        if (!value) return '';
        var date = new Date(value);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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

    /* ---- Account ---- */

    function renderAccount(account) {
        var used = (account.quota.bytes_used || 0) + (account.quota.bytes_reserved || 0);
        var limit = account.quota.limit || 0;
        var percent = limit ? Math.min(100, (used / limit) * 100) : 0;
        $('cloud-edition').textContent = account.entitlement.edition || 'No subscription';
        $('cloud-quota-text').textContent = formatBytes(used) + ' of ' + formatBytes(limit) + ' used'
            + (account.entitlement.active ? '' : ' · subscription inactive');
        $('cloud-quota-bar').style.width = percent + '%';
        $('cloud-quota-bar').classList.toggle('cloud-quota__bar--full', percent >= 90);
        document.querySelector('.cloud-quota').setAttribute('aria-valuenow', String(Math.round(percent)));
        show('cloud-consent', !account.consent_version);
        show('cloud-account', true);
    }

    /* ---- Opening files ---- */

    /** Asks the desktop app to open a session or one of its files. */
    function openInApp(target) {
        var a = el('a');
        a.href = cx.openInAppUrl(target);
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        $('cx-open-text').textContent = 'Your browser may ask to open RACE Insight to show '
            + (target.label || 'this file') + '. Allow it to continue.';
        if (!$('cx-open-dialog').open) $('cx-open-dialog').showModal();
    }

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
        }, function (err) {
            if (token !== viewer.token) return;
            body.textContent = '';
            body.appendChild(el('p', 'cloud-error', sync.friendlyError(err)));
        });
    }

    $('cx-viewer-close').addEventListener('click', closeViewer);
    $('cx-viewer').addEventListener('close', closeViewer);
    $('cx-viewer').addEventListener('click', function (event) {
        if (event.target === $('cx-viewer')) closeViewer();
    });
    $('cx-viewer-download').addEventListener('click', function () {
        if (!viewer.file) return;
        if (viewer.buffer && viewer.url) { save(viewer.file.name, viewer.buffer); return; }
        download(viewer.file, viewer.shareId).catch(setError);
    });

    /* ---- Explorer ---- */

    function filesFor(loc) {
        var key = (loc.type === 'share' ? 'sh:' : 's:') + loc.id;
        if (!fileCache[key]) {
            fileCache[key] = (loc.type === 'share' ? sync.sharedFiles(loc.id) : sync.unitFiles('session', loc.id))
                .catch(function (err) { delete fileCache[key]; throw err; });
        }
        return fileCache[key];
    }

    function navigate(loc) {
        var hash = cx.locationToHash(loc);
        if (window.location.hash === hash) { current = loc; render(); return; }
        window.location.hash = hash; // the hashchange listener renders
    }

    window.addEventListener('hashchange', function () {
        current = cx.hashToLocation(window.location.hash);
        if (model) render();
    });

    function sameLocation(a, b) { return a.type === b.type && (a.id || null) === (b.id || null); }

    function renderTree() {
        var tree = $('cx-tree');
        tree.textContent = '';
        var activeProject = null;
        if (current.type === 'project') activeProject = current.id;
        if (current.type === 'session') {
            var found = cx.findSession(model, current.id);
            activeProject = found && found.project.id;
        }
        function item(label, iconName, loc, active, depth, count) {
            var b = el('button', 'cx-tree__item' + (active ? ' is-active' : '') + (depth ? ' cx-tree__item--child' : ''));
            b.type = 'button';
            if (active) b.setAttribute('aria-current', 'true');
            b.appendChild(icon(iconName));
            b.appendChild(el('span', 'cx-tree__label', label));
            if (count) b.appendChild(el('span', 'cx-tree__count', String(count)));
            b.addEventListener('click', function () { navigate(loc); });
            tree.appendChild(b);
        }
        item('My files', 'fa-hard-drive', { type: 'mine' }, current.type === 'mine', 0);
        model.projects.forEach(function (p) {
            item(p.name, p.id === cx.LIBRARY_PROJECT_ID ? 'fa-book' : 'fa-folder', { type: 'project', id: p.id },
                activeProject === p.id, 1);
        });
        var invites = model.pending.length;
        item('Shared with me', 'fa-user-group', { type: 'shared' }, current.type === 'shared' || current.type === 'share', 0, invites);
    }

    function renderBreadcrumbs(steps) {
        var nav = $('cx-breadcrumbs');
        nav.textContent = '';
        steps.forEach(function (step, index) {
            if (index) nav.appendChild(icon('fa-chevron-right', 'cx-breadcrumbs__sep'));
            if (index === steps.length - 1) {
                var here = el('span', 'cx-breadcrumbs__here', step.label);
                here.setAttribute('aria-current', 'page');
                nav.appendChild(here);
            } else {
                var b = el('button', 'cx-breadcrumbs__link', step.label);
                b.type = 'button';
                b.addEventListener('click', function () { navigate(step.location); });
                nav.appendChild(b);
            }
        });
    }

    /**
     * One explorer row. options: { iconName, iconClass, name, badge, type, size,
     * date, onOpen, actions: [nodes], muted }
     */
    function row(options) {
        var li = el('li', 'cx-row' + (options.muted ? ' cx-row--muted' : ''));
        var main = el(options.onOpen ? 'button' : 'div', 'cx-row__main');
        if (options.onOpen) {
            main.type = 'button';
            main.title = options.openLabel || options.name;
            main.addEventListener('click', function () {
                Promise.resolve().then(options.onOpen).catch(setError);
            });
        }
        main.appendChild(icon(options.iconName, 'cx-row__icon ' + (options.iconClass || '')));
        var name = el('span', 'cx-row__name');
        name.appendChild(el('span', 'cx-row__title', options.name));
        if (options.badge) name.appendChild(el('span', 'cloud-badge cx-row__badge', options.badge));
        if (options.sub) name.appendChild(el('span', 'cx-row__sub', options.sub));
        main.appendChild(name);
        li.appendChild(main);
        li.appendChild(el('span', 'cx-col cx-col--type', options.type || ''));
        li.appendChild(el('span', 'cx-col cx-col--size', options.size || ''));
        li.appendChild(el('span', 'cx-col cx-col--date', options.date || ''));
        var actions = el('span', 'cx-col--actions');
        (options.actions || []).forEach(function (node) { actions.appendChild(node); });
        li.appendChild(actions);
        return li;
    }

    var FILE_ICONS = {
        race: ['fa-chart-line', 'cx-icon--race'], image: ['fa-file-image', 'cx-icon--image'],
        video: ['fa-file-video', 'cx-icon--video'], pdf: ['fa-file-pdf', 'cx-icon--pdf'], other: ['fa-file', '']
    };

    function fileRow(file, sessionId, shareId) {
        var category = cx.fileCategory(file.name);
        var available = cx.isAvailable(file);
        var canPreview = available && !!cx.previewType(file);
        var actions = [];
        var onOpen = null;
        var openLabel = '';
        if (available && category === 'race') {
            onOpen = function () { openInApp({ sessionId: sessionId, shareId: shareId, sha256: file.sha256, label: file.name }); };
            openLabel = 'Open ' + file.name + ' in RACE Insight';
            actions.push(iconButton('Open in RACE Insight', 'fa-up-right-from-square', onOpen));
        } else if (canPreview) {
            onOpen = function () { return openViewer(file, shareId); };
            openLabel = 'View ' + file.name;
            actions.push(iconButton('View', 'fa-eye', onOpen));
        } else if (available) {
            onOpen = function () { return download(file, shareId); };
            openLabel = 'Download ' + file.name;
        }
        if (available) actions.push(iconButton('Download', 'fa-download', function () { return download(file, shareId); }));
        var look = FILE_ICONS[category];
        return row({
            iconName: look[0], iconClass: look[1], name: file.name, onOpen: onOpen, openLabel: openLabel,
            badge: available ? '' : 'Archived', type: cx.typeLabel(file.name), size: formatBytes(file.size),
            actions: actions, muted: !available
        });
    }

    function setToolbar(loc) {
        var inSession = loc.type === 'session';
        var inShare = loc.type === 'share';
        show('cx-open-btn', inSession || (inShare && isAccepted(loc.id)));
        show('cx-share-btn', inSession);
        $('cx-upload-label').hidden = loc.type === 'shared' || inShare;
    }

    function isAccepted(shareId) {
        var share = cx.findShare(model, shareId);
        return !!share && share.status === 'accepted';
    }

    function empty(text) {
        $('cx-empty').textContent = text;
        show('cx-empty', !!text);
    }

    function render() {
        var token = ++renderToken;
        var steps = cx.trail(model, current);
        if (!steps) { current = { type: 'mine' }; steps = cx.trail(model, current); }
        renderTree();
        renderBreadcrumbs(steps);
        setToolbar(current);
        var list = $('cx-list');
        list.textContent = '';
        empty('');

        if (current.type === 'mine') {
            model.projects.forEach(function (p) {
                list.appendChild(row({
                    iconName: p.id === cx.LIBRARY_PROJECT_ID ? 'fa-book' : 'fa-folder', iconClass: 'cx-icon--folder',
                    name: p.name, onOpen: function () { navigate({ type: 'project', id: p.id }); },
                    type: 'Project', size: p.sessions.length + (p.sessions.length === 1 ? ' session' : ' sessions'),
                    date: formatDate(p.updated_at)
                }));
            });
            if (!model.projects.length) empty('Nothing synced yet. Sync from the desktop app, or upload a logger file.');
            return;
        }

        if (current.type === 'project') {
            var project = cx.findProject(model, current.id);
            project.sessions.forEach(function (s) {
                list.appendChild(row({
                    iconName: 'fa-folder', iconClass: 'cx-icon--folder', name: s.name,
                    badge: s.shared_with ? 'Shared with ' + s.shared_with : '',
                    onOpen: function () { navigate({ type: 'session', id: s.id }); },
                    type: 'Session', date: formatDate(s.updated_at),
                    actions: [
                        iconButton('Open in RACE Insight', 'fa-up-right-from-square', function () {
                            openInApp({ sessionId: s.id, label: s.name });
                        }),
                        iconButton('Share', 'fa-share-nodes', function () { openShare(s); })
                    ]
                }));
            });
            if (!project.sessions.length) empty('This project has no synced sessions.');
            return;
        }

        if (current.type === 'shared') {
            model.pending.forEach(function (invite) {
                list.appendChild(row({
                    iconName: 'fa-envelope', iconClass: 'cx-icon--invite', name: invite.name,
                    sub: invite.owner_name + ' invited you', type: 'Invitation',
                    actions: [
                        button('Accept', 'btn btn-primary cloud-btn', function () { return sync.acceptShare(invite.share_id).then(load); }),
                        button('Decline', 'btn btn-secondary cloud-btn', function () { return sync.removeShare(invite.share_id).then(load); })
                    ]
                }));
            });
            model.shared.forEach(function (share) {
                var accepted = share.status === 'accepted';
                var actions = [];
                if (accepted) {
                    actions.push(iconButton('Open in RACE Insight', 'fa-up-right-from-square', function () {
                        openInApp({ sessionId: '', shareId: share.share_id, label: share.name });
                    }));
                }
                actions.push(iconButton('Remove from my list', 'fa-xmark', function () { return sync.removeShare(share.share_id).then(load); }));
                list.appendChild(row({
                    iconName: 'fa-folder', iconClass: accepted ? 'cx-icon--shared' : '', name: share.name,
                    sub: 'Shared by ' + share.owner_name, badge: accepted ? '' : 'No longer shared', muted: !accepted,
                    onOpen: accepted ? function () { navigate({ type: 'share', id: share.share_id }); } : null,
                    type: 'Shared session', actions: actions
                }));
            });
            if (!model.pending.length && !model.shared.length) empty('Nobody has shared a session with you yet.');
            return;
        }

        // A session's files: yours, or one shared with you.
        var shareId = current.type === 'share' ? current.id : null;
        if (shareId && !isAccepted(shareId)) { empty('This session is no longer shared with you.'); return; }
        var sessionId = shareId ? '' : current.id;
        empty('Loading files…');
        filesFor(current).then(function (files) {
            if (token !== renderToken) return;
            empty(files.length ? '' : 'This session has no files.');
            files.slice().sort(function (a, b) {
                var ra = cx.fileCategory(a.name) === 'race' ? 0 : 1;
                var rb = cx.fileCategory(b.name) === 'race' ? 0 : 1;
                return ra - rb || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            }).forEach(function (file) { list.appendChild(fileRow(file, sessionId, shareId)); });
        }, function (err) {
            if (token !== renderToken) return;
            empty('');
            setError(err);
        });
    }

    $('cx-open-btn').addEventListener('click', function () {
        if (current.type === 'session') {
            var found = cx.findSession(model, current.id);
            openInApp({ sessionId: current.id, label: found ? found.session.name : 'this session' });
        } else if (current.type === 'share') {
            var share = cx.findShare(model, current.id);
            openInApp({ sessionId: '', shareId: current.id, label: share ? share.name : 'this session' });
        }
    });

    $('cx-share-btn').addEventListener('click', function () {
        if (current.type !== 'session') return;
        var found = cx.findSession(model, current.id);
        if (found) openShare(found.session);
    });

    /* ---- Sharing (per session) ---- */

    function outgoingFor(sessionId) {
        return (rawShares.outgoing || []).filter(function (s) {
            return s.session_id === sessionId && (s.status === 'pending' || s.status === 'accepted');
        });
    }

    function renderRecipients(sessionId) {
        var list = $('cloud-share-recipients');
        list.textContent = '';
        var active = outgoingFor(sessionId);
        active.forEach(function (share) {
            var item = el('li', 'cloud-row');
            item.appendChild(el('span', '', share.recipient_email));
            item.appendChild(el('span', 'cloud-badge', share.status === 'accepted' ? 'Accepted' : 'Invited'));
            item.appendChild(button('Revoke', 'btn btn-secondary cloud-btn', function () {
                return sync.removeShare(share.share_id).then(load).then(function () { renderRecipients(sessionId); });
            }));
            list.appendChild(item);
        });
        if (!active.length) list.appendChild(el('li', 'cloud-muted', 'Nobody yet.'));
    }

    function openShare(session) {
        shareTarget = session;
        $('cloud-share-name').textContent = session.name || session.id;
        $('cloud-share-emails').value = '';
        $('cloud-share-ai').checked = false;
        $('cloud-share-expires').value = '';
        show('cloud-share-error', false);
        renderRecipients(session.id);
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
                return load().then(function (state) { if (state) renderRecipients(shareTarget.id); });
            })
            .catch(function (err) { shareError(sync.friendlyError(err)); });
    });

    /* ---- Upload ---- */

    $('cloud-upload-input').addEventListener('change', function (event) {
        var file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        setError(null);
        show('cloud-upload-status', true);
        sync.uploadSession(file, function (step) { $('cloud-upload-status').textContent = step + '…'; })
            .then(function (result) {
                $('cloud-upload-status').textContent = 'Uploaded ' + file.name + ' to Library.';
                return load().then(function () { if (result && result.sessionId) navigate({ type: 'session', id: result.sessionId }); });
            })
            .catch(function (err) { show('cloud-upload-status', false); setError(err); });
    });

    /* ---- Access and loading ---- */

    var CONTENT_SECTIONS = ['cloud-account', 'cloud-explorer', 'cloud-locked'];

    /** Hides and empties everything that shows account data. */
    function clearContent() {
        CONTENT_SECTIONS.forEach(function (id) { show(id, false); });
        model = null;
        rawShares = {};
        fileCache = {};
        renderToken += 1;
        $('cx-list').textContent = '';
        $('cx-tree').textContent = '';
        $('cx-breadcrumbs').textContent = '';
        closeViewer();
        ['cloud-share-dialog', 'cx-open-dialog'].forEach(function (id) { if ($(id).open) $(id).close(); });
    }

    function showSignIn() {
        clearContent();
        setError(null);
        $('cloud-status').textContent = 'Sign in to see your cloud files. ';
        var link = el('a', '', 'Sign in on the RACE Insight page');
        link.href = 'race-insight.html';
        $('cloud-status').appendChild(link);
        show('cloud-status', true);
        show('cloud-locked', true);
    }

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
     * Loads projects, sessions and shares only after the account is confirmed
     * to have an active subscription. Resolves to the loaded state, or null.
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
                fileCache = {};
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

    var initial = gate.checkAccess(auth, sync, null);
    initial.then(function (result) {
        if (result.state === 'unavailable' || result.state === 'auth_unavailable') { showState(result); return; }
        auth.onAuthStateChanged(function (user) {
            if (!user) { showSignIn(); return; }
            clearContent();
            setStatus('Loading your files…');
            load();
        });
    });
})();
