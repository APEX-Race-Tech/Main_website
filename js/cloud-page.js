/*
 * Cloud files page: lists the signed-in user's synced sessions, downloads
 * verified files, shares sessions with other RACE Insight users and uploads a
 * logger file as a new session. All text from the service is set with
 * textContent, never as HTML.
 */
(function () {
    'use strict';

    var sync = window.RaCloudSync;
    var auth = window.RaAuth;
    var $ = function (id) { return document.getElementById(id); };
    var GIB = 1024 * 1024 * 1024;
    var shareTarget = null;

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

    function button(label, className, onClick) {
        var b = el('button', 'btn ' + (className || 'btn-secondary') + ' cloud-btn', label);
        b.type = 'button';
        b.addEventListener('click', function () {
            b.disabled = true;
            Promise.resolve(onClick()).catch(setError).then(function () { b.disabled = false; });
        });
        return b;
    }

    function formatBytes(bytes) {
        if (bytes >= GIB) return (bytes / GIB).toFixed(bytes >= 10 * GIB ? 0 : 1) + ' GB';
        if (bytes >= 1024 * 1024) return Math.round(bytes / 1024 / 1024) + ' MB';
        return Math.max(0, Math.round(bytes / 1024)) + ' KB';
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

    function fileButtons(files, shareId) {
        var wrap = el('div', 'cloud-files');
        files.forEach(function (file) {
            if (file.storage !== 'standard' && file.storage !== 'restored') {
                wrap.appendChild(el('span', 'cloud-muted', file.name + ' (archived)'));
                return;
            }
            wrap.appendChild(button(file.name + ' · ' + formatBytes(file.size), 'btn-secondary', function () {
                return sync.downloadFile(file, shareId).then(function (buffer) { save(file.name, buffer); });
            }));
        });
        if (!files.length) wrap.appendChild(el('span', 'cloud-muted', 'No files'));
        return wrap;
    }

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

    function renderSessions(units, shares) {
        var list = $('cloud-session-list');
        list.textContent = '';
        var outgoing = shares.outgoing || [];
        (units.sessions || []).forEach(function (unit) {
            var item = el('li', 'cloud-item');
            var head = el('div', 'cloud-row');
            head.appendChild(el('strong', '', unit.name || unit.id));
            var active = outgoing.filter(function (s) { return s.session_id === unit.id && (s.status === 'pending' || s.status === 'accepted'); });
            if (active.length) head.appendChild(el('span', 'cloud-badge', 'Shared with ' + active.length));
            if (unit.updated_at) head.appendChild(el('span', 'cloud-muted', String(unit.updated_at).slice(0, 10)));
            var actions = el('div', 'cloud-actions');
            var filesBox = el('div');
            actions.appendChild(button('Files', 'btn-secondary', function () {
                return sync.unitFiles('session', unit.id).then(function (files) {
                    filesBox.textContent = '';
                    filesBox.appendChild(fileButtons(files));
                });
            }));
            actions.appendChild(button('Share', 'btn-primary', function () { openShare(unit, outgoing); }));
            head.appendChild(actions);
            item.appendChild(head);
            item.appendChild(filesBox);
            list.appendChild(item);
        });
        if (!(units.sessions || []).length) list.appendChild(el('li', 'cloud-muted', 'No synced sessions yet. Sync from the desktop app or upload a file.'));
        show('cloud-sessions', true);
    }

    function renderInbox(shares, account) {
        var list = $('cloud-inbox-list');
        list.textContent = '';
        var subscribed = account && account.entitlement.active;
        (shares.pending || []).forEach(function (invite) {
            var item = el('li', 'cloud-item cloud-row');
            item.appendChild(el('span', '', (invite.owner_name || 'Someone') + ' shared ' + (invite.session_name || 'a session')));
            var actions = el('div', 'cloud-actions');
            if (subscribed) {
                actions.appendChild(button('Accept', 'btn-primary', function () { return sync.acceptShare(invite.share_id).then(load); }));
            } else {
                actions.appendChild(el('span', 'cloud-muted', 'A subscription is needed to open it'));
            }
            actions.appendChild(button('Decline', 'btn-secondary', function () { return sync.removeShare(invite.share_id).then(load); }));
            item.appendChild(actions);
            list.appendChild(item);
        });
        (shares.inbox || []).forEach(function (share) {
            var item = el('li', 'cloud-item');
            var head = el('div', 'cloud-row');
            head.appendChild(el('strong', '', share.session_name || 'Session'));
            head.appendChild(el('span', 'cloud-badge cloud-badge--shared', 'Shared by ' + (share.owner_name || 'another user')));
            var filesBox = el('div');
            if (share.status === 'accepted') {
                head.appendChild(button('Files', 'btn-secondary', function () {
                    return sync.sharedFiles(share.share_id).then(function (files) {
                        filesBox.textContent = '';
                        filesBox.appendChild(fileButtons(files, share.share_id));
                    });
                }));
            } else {
                head.appendChild(el('span', 'cloud-muted', 'No longer shared'));
            }
            head.appendChild(button('Remove', 'btn-secondary', function () { return sync.removeShare(share.share_id).then(load); }));
            item.appendChild(head);
            item.appendChild(filesBox);
            list.appendChild(item);
        });
        show('cloud-inbox', (shares.pending || []).length + (shares.inbox || []).length > 0);
    }

    function renderRecipients(sessionId, outgoing) {
        var list = $('cloud-share-recipients');
        list.textContent = '';
        var active = outgoing.filter(function (s) { return s.session_id === sessionId && (s.status === 'pending' || s.status === 'accepted'); });
        active.forEach(function (share) {
            var item = el('li', 'cloud-row');
            item.appendChild(el('span', '', share.recipient_email));
            item.appendChild(el('span', 'cloud-badge', share.status === 'accepted' ? 'Accepted' : 'Invited'));
            item.appendChild(button('Revoke', 'btn-secondary', function () { return sync.removeShare(share.share_id).then(load); }));
            list.appendChild(item);
        });
        if (!active.length) list.appendChild(el('li', 'cloud-muted', 'Nobody yet.'));
    }

    function openShare(unit, outgoing) {
        shareTarget = unit;
        $('cloud-share-name').textContent = unit.name || unit.id;
        $('cloud-share-emails').value = '';
        $('cloud-share-ai').checked = false;
        $('cloud-share-expires').value = '';
        show('cloud-share-error', false);
        renderRecipients(unit.id, outgoing);
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
                return load().then(function (state) { if (state) renderRecipients(shareTarget.id, state.shares.outgoing || []); });
            })
            .catch(function (err) { shareError(sync.friendlyError(err)); });
    });

    $('cloud-upload-input').addEventListener('change', function (event) {
        var file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        setError(null);
        show('cloud-upload-status', true);
        sync.uploadSession(file, function (step) { $('cloud-upload-status').textContent = step + '…'; })
            .then(function () { $('cloud-upload-status').textContent = 'Uploaded ' + file.name + '.'; return load(); })
            .catch(function (err) { show('cloud-upload-status', false); setError(err); });
    });

    function load() {
        setError(null);
        return Promise.all([sync.account(), sync.listUnits(), sync.listShares()]).then(function (results) {
            var state = { account: results[0], units: results[1], shares: results[2] };
            setStatus('');
            renderAccount(state.account);
            renderInbox(state.shares, state.account);
            renderSessions(state.units, state.shares);
            return state;
        }).catch(function (err) { setStatus(''); setError(err); return null; });
    }

    if (!sync || !sync.configured) {
        setStatus('Cloud sync is not available yet.');
        return;
    }
    if (!auth || !auth.configured) {
        setStatus('Sign-in is not available right now.');
        return;
    }
    auth.onAuthStateChanged(function (user) {
        if (!user) {
            $('cloud-status').textContent = '';
            var link = el('a', '', 'Sign in on the RACE Insight page');
            link.href = 'race-insight.html';
            $('cloud-status').appendChild(link);
            show('cloud-status', true);
            return;
        }
        setStatus('Loading your files…');
        load();
    });
})();
