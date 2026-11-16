/*
 * Who may see RACE Insight Cloud files on the website.
 *
 * Classic script. Exposes window.RaCloudGate. Cloud files are for signed-in
 * users with an active subscription. The sync API is the source of truth:
 * GET /v1/account -> entitlement.active. While the API is not configured it
 * cannot answer, so nobody is treated as subscribed.
 *
 * This is presentation only. The API refuses data to signed-out users and to
 * accounts without an active subscription, whatever the page shows.
 */
(function (root) {
    'use strict';

    /**
     * Access states, in the order they are checked:
     *   unavailable      cloud sync API URL not configured yet
     *   auth_unavailable sign-in not configured
     *   signed_out       nobody signed in
     *   no_subscription  signed in, no active subscription
     *   subscribed       signed in with an active subscription
     *   error            the API could not answer (network, server)
     */
    var STATES = ['unavailable', 'auth_unavailable', 'signed_out', 'no_subscription', 'subscribed', 'error'];

    function isActive(account) {
        return !!(account && account.entitlement && account.entitlement.active === true);
    }

    /**
     * Asks the sync API whether the signed-in user may use Cloud files.
     * Resolves to { state, account, error }; never rejects.
     */
    function checkAccess(auth, sync, user) {
        if (!sync || !sync.configured) return Promise.resolve({ state: 'unavailable' });
        if (!auth || !auth.configured) return Promise.resolve({ state: 'auth_unavailable' });
        if (!user) return Promise.resolve({ state: 'signed_out' });
        return Promise.resolve()
            .then(function () { return sync.account(); })
            .then(function (account) {
                return { state: isActive(account) ? 'subscribed' : 'no_subscription', account: account };
            }, function (err) {
                var code = err && err.code;
                if (code === 'subscription_required') return { state: 'no_subscription' };
                if (code === 'signed_out') return { state: 'signed_out' };
                return { state: 'error', error: err };
            });
    }

    var LOCKED_TITLE = 'Cloud files need a RACE Insight subscription';

    /** What the popup says when a locked Cloud link is clicked. */
    var LOCKED_MESSAGES = {
        no_subscription: {
            title: 'Cloud files need a subscription',
            body: 'Cloud files are part of a RACE Insight subscription. Your account does not have an active one.',
            contact: true
        },
        unavailable: {
            title: 'Cloud files are coming soon',
            body: 'Cloud sync is not available on the website yet. It will appear here for subscribers when it launches.',
            contact: false
        },
        error: {
            title: 'Could not check your subscription',
            body: 'The cloud service did not answer. Please try again in a moment.',
            contact: false
        }
    };

    function lockedMessage(state) {
        return LOCKED_MESSAGES[state] || LOCKED_MESSAGES.error;
    }

    /**
     * Opens the "no access" popup (a <dialog>) with the text for this state.
     * Returns false when the page has no such dialog, so the link opens the
     * Cloud files page instead.
     */
    function openLockedDialog(doc, state) {
        var dialog = doc && doc.getElementById('cloud-locked-dialog');
        if (!dialog || typeof dialog.showModal !== 'function') return false;
        var message = lockedMessage(state);
        var title = doc.getElementById('cloud-locked-title');
        var body = doc.getElementById('cloud-locked-body');
        var contact = doc.getElementById('cloud-locked-contact');
        if (title) title.textContent = message.title;
        if (body) body.textContent = message.body;
        if (contact) contact.style.display = message.contact ? '' : 'none';
        if (!dialog.open) dialog.showModal();
        return true;
    }

    /**
     * Shows the "Cloud files" link to every signed-in user. It is locked
     * (lock icon, tooltip, "locked" class) unless the API confirms an active
     * subscription. Clicking a locked link calls options.onLocked(state);
     * clicking it when subscribed, or while the check is still running, calls
     * options.onOpen(). Either one returning true stops the link's navigation.
     * Hidden while signed out. Returns a function that stops watching.
     */
    function bindLink(link, auth, sync, options) {
        if (!link) return function () {};
        var onLocked = options && options.onLocked;
        var lock = link.querySelector ? link.querySelector('.cloud-link__lock') : null;
        var lockedState = 'pending';
        function render(visible, state) {
            var locked = state !== 'subscribed';
            lockedState = locked ? state : null;
            link.style.display = visible ? '' : 'none';
            if (link.classList) link.classList.toggle('cloud-link--locked', locked);
            if (lock) lock.style.display = locked ? '' : 'none';
            if (locked) {
                link.title = LOCKED_TITLE;
                link.setAttribute('aria-label', 'Cloud files (subscription needed)');
            } else {
                link.title = '';
                if (link.removeAttribute) link.removeAttribute('aria-label');
            }
        }
        var onOpen = options && options.onOpen;
        if (link.addEventListener) {
            link.addEventListener('click', function (event) {
                if (lockedState === 'signed_out') return;
                var handled = false;
                if (lockedState && lockedState !== 'pending') {
                    handled = !!(onLocked && onLocked(lockedState, link));
                } else if (onOpen) {
                    // Subscribed, or the check is still running: Cloud files checks again itself.
                    handled = !!onOpen(link);
                }
                if (handled && event.preventDefault) event.preventDefault();
            });
        }
        render(false, 'signed_out');
        if (!auth || !auth.configured) return function () {};
        var generation = 0;
        return auth.onAuthStateChanged(function (user) {
            var mine = ++generation;
            if (!user) { render(false, 'signed_out'); return; }
            render(true, 'pending'); // locked until the API says otherwise
            checkAccess(auth, sync, user).then(function (result) {
                if (mine !== generation) return; // a newer sign-in or sign-out won
                render(true, result.state);
            });
        });
    }

    var api = {
        STATES: STATES, LOCKED_TITLE: LOCKED_TITLE, LOCKED_MESSAGES: LOCKED_MESSAGES, isActive: isActive,
        checkAccess: checkAccess, bindLink: bindLink, lockedMessage: lockedMessage, openLockedDialog: openLockedDialog
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.RaCloudGate = api;
        var doc = root.document;
        var links = doc ? doc.querySelectorAll('[data-cloud-link]') : [];
        var options = {
            onLocked: function (state) { return openLockedDialog(doc, state); },
            // js/cloud-app.js loads after this file; look it up at click time.
            onOpen: function () { return !!(root.RaCloudApp && root.RaCloudApp.open()); }
        };
        var dialog = doc && doc.getElementById('cloud-locked-dialog');
        if (dialog && dialog.addEventListener) {
            dialog.addEventListener('click', function (event) {
                if (event.target === dialog) dialog.close(); // click on the backdrop
            });
        }
        Array.prototype.forEach.call(links, function (link) { bindLink(link, root.RaAuth, root.RaCloudSync, options); });
    }
})(typeof window !== 'undefined' ? window : globalThis);
