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

    /**
     * Shows the "Cloud files" link to every signed-in user. It is locked
     * (lock icon, tooltip, "locked" class) unless the API confirms an active
     * subscription, so non-subscribers see the feature but the page only
     * shows them the subscription message. Hidden while signed out.
     * Returns a function that stops watching.
     */
    function bindLink(link, auth, sync) {
        if (!link) return function () {};
        var lock = link.querySelector ? link.querySelector('.cloud-link__lock') : null;
        function render(visible, locked) {
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
        render(false, true);
        if (!auth || !auth.configured) return function () {};
        var generation = 0;
        return auth.onAuthStateChanged(function (user) {
            var mine = ++generation;
            if (!user) { render(false, true); return; }
            render(true, true); // locked until the API says otherwise
            checkAccess(auth, sync, user).then(function (result) {
                if (mine !== generation) return; // a newer sign-in or sign-out won
                render(true, result.state !== 'subscribed');
            });
        });
    }

    var api = { STATES: STATES, LOCKED_TITLE: LOCKED_TITLE, isActive: isActive, checkAccess: checkAccess, bindLink: bindLink };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.RaCloudGate = api;
        var link = root.document && root.document.getElementById('profile-cloud-link');
        if (link) bindLink(link, root.RaAuth, root.RaCloudSync);
    }
})(typeof window !== 'undefined' ? window : globalThis);
