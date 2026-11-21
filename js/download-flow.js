/*
 * Download and purchase flow for the RACE Insight download section.
 * Classic script. Exposes window.RaDownloadFlow (module.exports under Node for the tests).
 *
 * The visitor picks an operating system, buys early access on the Dodo checkout and comes
 * back to this page. Dodo appends ?payment_id=...&status=... (and the buyer's email) to the
 * return URL. The page then waits until the accounts API lists the early access licence
 * (GET /me/entitlements), and starts the installer download for the operating system chosen
 * before checkout, once per payment. Any other status shows a calm message.
 *
 * The pending payment is kept in sessionStorage, so a reload after the address bar was
 * cleaned still finishes the purchase. "Payment confirmed" and "licence ready" are separate
 * states: Dodo's return says the payment went through; the licence exists only once the
 * server has processed Dodo's webhook.
 *
 * The return parameters only choose what the page shows. The licence itself is granted on the
 * server from Dodo's webhook, and the installer is public, so a forged return URL gains nothing.
 */
(function (root) {
    'use strict';

    var PLATFORM_KEY = 'ri-download-platform';
    var PENDING_KEY = 'ri-checkout-pending';
    // localStorage, per payment: "attempted" once a download was tried, "initiated" once the
    // browser was actually sent to the installer. Only "initiated" stops the automatic download.
    var DOWNLOAD_PREFIX = 'ri-checkout-download:';
    var PENDING_MAX_AGE_MS = 24 * 3600 * 1000;
    var PLATFORMS = ['windows', 'linux', 'apple'];
    // Query parameters Dodo adds to the return URL. They are removed from the address bar after
    // reading so the buyer's email does not stay in the history and a reload does not repeat.
    var RETURN_PARAMS = ['payment_id', 'subscription_id', 'status', 'email', 'license_key'];
    var PAYMENT_ID = /^[A-Za-z0-9_-]{1,100}$/;
    // Gaps between licence checks: about two minutes in all, checked at the start of each gap.
    var POLL_DELAYS_MS = [2000, 3000, 5000, 8000, 10000, 15000, 15000, 20000, 20000, 20000];
    var POLL_MAX_WAIT_MS = 120000;
    var SUPPORT_EMAIL = 'info@apexracetech.in';

    var MESSAGES = {
        confirming: 'Your payment is being confirmed. This page updates when your licence is ready, usually within a minute. Keep this tab open.',
        paid: 'Payment confirmed. Getting your licence ready…',
        readyStarted: 'Payment confirmed. Your licence is ready and your download has started. Sign in to RACE Insight with the same account to activate it.',
        readyAgain: 'Payment confirmed. Your licence is ready. Use "Download again" to get the installer, then sign in to RACE Insight with the same account to activate it.',
        readyMobile: "Payment confirmed. Your licence is ready. RACE Insight runs on Windows 10/11. Open this page on your Windows PC and use 'Already have a licence? Download'.",
        downloadFailed: 'Your licence is ready, but the installer could not be fetched just now. Try the download again, or use "Already have a licence? Download" below. If it keeps failing, write to ' + SUPPORT_EMAIL + '.',
        signIn: 'Sign in with the account you used at checkout to get your licence and the download.',
        paidStarted: 'Thanks — your download has started. Sign in to RACE Insight with the same account to activate your licence.',
        paidAgain: 'Thanks for your purchase. Use "Download again" to get the installer, then sign in to RACE Insight with the same account to activate your licence.',
        paidMobile: "Thanks for your purchase. RACE Insight runs on Windows 10/11. Open this page on your Windows PC and use 'Already have a licence? Download'.",
        failed: 'The payment did not go through. You can try again below. If you were charged, write to ' + SUPPORT_EMAIL + '.',
        cancelled: 'Checkout was cancelled. You can buy early access whenever you are ready.',
        pending: 'Your payment is still being confirmed. Once it completes, sign in and use "Already have a licence? Download" below.'
    };

    function timeoutMessage(paymentId) {
        return 'Your licence is taking longer than usual to appear. Check again in a minute. If it still does not appear, write to ' +
            SUPPORT_EMAIL + (paymentId ? ' with your payment ID ' + paymentId + '.' : '.');
    }

    function isPlatform(value) {
        return PLATFORMS.indexOf(value) !== -1;
    }

    function storageGet(storage, key) {
        try {
            return storage ? storage.getItem(key) : null;
        } catch (error) {
            return null;
        }
    }

    function storageSet(storage, key, value) {
        try {
            if (!storage) return false;
            storage.setItem(key, value);
            return true;
        } catch (error) {
            return false;
        }
    }

    function storageRemove(storage, key) {
        try {
            if (storage && typeof storage.removeItem === 'function') storage.removeItem(key);
        } catch (error) { /* nothing to clean */ }
    }

    /** Remembers the chosen operating system across the checkout redirect. */
    function rememberPlatform(storage, platform) {
        if (!isPlatform(platform) || !storage) return false;
        return storageSet(storage, PLATFORM_KEY, platform);
    }

    /** The operating system chosen before checkout, or the fallback. */
    function recallPlatform(storage, fallback) {
        var value = storageGet(storage, PLATFORM_KEY);
        return isPlatform(value) ? value : (fallback === undefined ? 'windows' : fallback);
    }

    /**
     * Reads Dodo's return parameters. Returns null when the page was not opened from checkout,
     * otherwise { outcome, paymentId } where outcome is succeeded, failed, cancelled or pending.
     * Only status=succeeded with a well-formed payment_id counts as a successful payment.
     */
    function readCheckoutReturn(search) {
        var params;
        try {
            params = new URLSearchParams(typeof search === 'string' ? search : '');
        } catch (error) {
            return null;
        }
        var status = (params.get('status') || '').toLowerCase();
        var paymentId = params.get('payment_id') || '';
        if (!status && !paymentId) return null;
        if (!PAYMENT_ID.test(paymentId)) paymentId = '';
        if (status === 'succeeded') return { outcome: paymentId ? 'succeeded' : 'pending', paymentId: paymentId };
        if (status === 'failed') return { outcome: 'failed', paymentId: paymentId };
        if (status === 'cancelled' || status === 'canceled' || status === 'expired') {
            return { outcome: 'cancelled', paymentId: paymentId };
        }
        return { outcome: 'pending', paymentId: paymentId };
    }

    /** Message for the download section for a failed, cancelled or unconfirmed return. */
    function returnMessage(outcome) {
        return MESSAGES[outcome] || '';
    }

    /** Keeps the payment being finished in this tab (sessionStorage). No email or licence key. */
    function savePendingPayment(session, pending, now) {
        return storageSet(session, PENDING_KEY, JSON.stringify({
            paymentId: pending.paymentId || '',
            outcome: pending.outcome === 'succeeded' ? 'succeeded' : 'pending',
            savedAt: now
        }));
    }

    /** The payment being finished in this tab, or null (none, unreadable or older than a day). */
    function loadPendingPayment(session, now) {
        var raw = storageGet(session, PENDING_KEY);
        if (!raw) return null;
        var value = null;
        try {
            value = JSON.parse(raw);
        } catch (error) {
            value = null;
        }
        var valid = value && typeof value === 'object' &&
            (value.outcome === 'succeeded' || value.outcome === 'pending') &&
            (value.paymentId === '' || PAYMENT_ID.test(value.paymentId)) &&
            typeof value.savedAt === 'number' && now - value.savedAt <= PENDING_MAX_AGE_MS && value.savedAt <= now;
        if (!valid) {
            storageRemove(session, PENDING_KEY);
            return null;
        }
        return { outcome: value.paymentId ? value.outcome : 'pending', paymentId: value.paymentId };
    }

    function clearPendingPayment(session) {
        storageRemove(session, PENDING_KEY);
    }

    /** "initiated", "attempted" or null for a payment's download on this browser. */
    function downloadState(storage, paymentId) {
        if (!paymentId) return null;
        var value = storageGet(storage, DOWNLOAD_PREFIX + paymentId);
        return value === 'initiated' || value === 'attempted' ? value : null;
    }

    function markDownload(storage, paymentId, state) {
        if (paymentId) storageSet(storage, DOWNLOAD_PREFIX + paymentId, state);
    }

    /** The page address without Dodo's return parameters. */
    function cleanReturnUrl(href) {
        var url;
        try {
            url = new URL(href);
        } catch (error) {
            return href;
        }
        for (var i = 0; i < RETURN_PARAMS.length; i++) url.searchParams.delete(RETURN_PARAMS[i]);
        if (!url.hash) url.hash = '#download';
        return url.pathname + url.search + url.hash;
    }

    /**
     * True on phones and tablets, which cannot run the Windows installer: UA-CH mobile,
     * Android/iOS user agents, iPadOS (a "Mac" with touch points), or a coarse pointer with
     * no fine pointer. A Windows PC is never treated as mobile, touch screen or not.
     *   nav       navigator-like { userAgent, userAgentData, platform, maxTouchPoints }
     *   matches   function (mediaQuery) returning a boolean, or null
     */
    function isMobileDevice(nav, matches) {
        if (!nav) return false;
        var ua = String(nav.userAgent || '');
        if (/Windows NT/.test(ua) && !/Windows Phone/.test(ua)) return false;
        if (nav.userAgentData && nav.userAgentData.mobile === true) return true;
        if (/Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua)) return true;
        if (nav.platform === 'MacIntel' && Number(nav.maxTouchPoints) > 1) return true;
        if (typeof matches === 'function') {
            try {
                return matches('(pointer: coarse)') === true && matches('(any-pointer: fine)') !== true;
            } catch (error) {
                return false;
            }
        }
        return false;
    }

    /** True when the entitlements view lists an active early access licence. */
    function hasEarlyAccessLicence(view) {
        var licences = view && Array.isArray(view.licences) ? view.licences : [];
        for (var i = 0; i < licences.length; i++) {
            var licence = licences[i];
            if (licence && licence.product === 'desktop_beta' && licence.state === 'active') return true;
        }
        return false;
    }

    /**
     * A function asking the accounts API whether the signed-in account has its licence:
     * resolves 'ready', 'not_yet' or 'signed_out', and rejects on a network or server error
     * (the caller retries). Uses GET <apiUrl>/me/entitlements with the Cognito ID token.
     *   options.apiUrl      the accounts API (#beta-checkout[data-accounts-api]), https only
     *   options.getIdToken  async function returning the ID token, or null when signed out
     *   options.fetch       fetch implementation (tests)
     */
    function createLicenceCheck(options) {
        var doFetch = options.fetch || function (url, init) { return root.fetch(url, init); };
        return function checkLicence() {
            var api;
            try {
                api = new URL(options.apiUrl);
            } catch (error) {
                return Promise.reject(new Error('Accounts API unavailable'));
            }
            if (api.protocol !== 'https:' || api.username || api.password) {
                return Promise.reject(new Error('Accounts API unavailable'));
            }
            return Promise.resolve(options.getIdToken()).then(function (idToken) {
                if (!idToken) return 'signed_out';
                var init = { method: 'GET', redirect: 'error', headers: { Authorization: 'Bearer ' + idToken } };
                if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') init.signal = AbortSignal.timeout(15000);
                return doFetch(api.origin + '/me/entitlements', init).then(function (response) {
                    if (response.status === 401) return 'signed_out';
                    if (!response.ok) throw new Error('Entitlements error: ' + response.status);
                    return response.json().then(function (view) {
                        return hasEarlyAccessLicence(view) ? 'ready' : 'not_yet';
                    });
                });
            });
        };
    }

    function defaultSleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function defaultNow() {
        return Date.now();
    }

    /**
     * Handles a checkout return on page load, or resumes the payment kept in sessionStorage.
     *   options.location     { search, href }
     *   options.history      object with replaceState (optional)
     *   options.storage      localStorage-like object (operating system, download state)
     *   options.session      sessionStorage-like object (the payment being finished)
     *   options.start        async function (platform) starting the installer download and
     *                        showing "Download again"; resolves true once the browser was sent
     *   options.offer        async function (platform) showing "Download again" only
     *   options.show         function (state, message, platform, actions) updating the page;
     *                        actions.retry is a button label, or null for no retry button
     *   options.checkLicence function from createLicenceCheck, or null without an accounts API
     *   options.isMobile     true on phones and tablets: never download there
     *   options.sleep, options.now, options.delays, options.maxWaitMs  timing (tests)
     * Returns null when there is nothing to finish, otherwise a controller
     *   { outcome, state, finished (promise of the final state), retry() }.
     * States: confirming, paid, ready, download_failed, timeout, sign_in, failed, cancelled.
     */
    function handleCheckoutReturn(options) {
        var now = options.now || defaultNow;
        var sleep = options.sleep || defaultSleep;
        var delays = options.delays || POLL_DELAYS_MS;
        var maxWaitMs = typeof options.maxWaitMs === 'number' ? options.maxWaitMs : POLL_MAX_WAIT_MS;

        var result = readCheckoutReturn(options.location && options.location.search);
        if (result) {
            if (options.history && typeof options.history.replaceState === 'function') {
                try {
                    options.history.replaceState(null, '', cleanReturnUrl(options.location.href));
                } catch (error) { /* the message still shows */ }
            }
        } else {
            result = loadPendingPayment(options.session, now());
            if (!result) return null;
        }

        var paymentId = result.paymentId;
        var platform = recallPlatform(options.storage, 'windows');
        var control = { outcome: result.outcome, state: null, finished: null, retry: retry };
        var running = null;

        function show(state, message, retryLabel) {
            control.state = state;
            options.show(state, message, platform, { retry: retryLabel || null });
            return state;
        }

        if (result.outcome === 'failed' || result.outcome === 'cancelled') {
            clearPendingPayment(options.session);
            show(result.outcome, returnMessage(result.outcome));
            control.finished = Promise.resolve(control.state);
            return control;
        }

        savePendingPayment(options.session, result, now());

        function deliver(verified) {
            var readyMobile = verified ? MESSAGES.readyMobile : MESSAGES.paidMobile;
            if (options.isMobile) return Promise.resolve(show(verified ? 'ready' : 'paid', readyMobile));
            var state = downloadState(options.storage, paymentId);
            if (!paymentId || state === 'initiated') {
                return Promise.resolve(options.offer ? options.offer(platform) : false).then(function (ok) {
                    if (!ok) return show('download_failed', MESSAGES.downloadFailed, 'Try the download again');
                    return show(verified ? 'ready' : 'paid', verified ? MESSAGES.readyAgain : MESSAGES.paidAgain);
                });
            }
            markDownload(options.storage, paymentId, 'attempted');
            return Promise.resolve(options.start(platform)).then(function (ok) {
                if (!ok) return show('download_failed', MESSAGES.downloadFailed, 'Try the download again');
                markDownload(options.storage, paymentId, 'initiated');
                return show(verified ? 'ready' : 'paid', verified ? MESSAGES.readyStarted : MESSAGES.paidStarted);
            }, function () {
                return show('download_failed', MESSAGES.downloadFailed, 'Try the download again');
            });
        }

        function poll() {
            var startedAt = now();
            var attempt = 0;
            var signedOut = 0;
            function next() {
                return Promise.resolve()
                    .then(function () { return options.checkLicence(); })
                    .then(function (answer) { return answer; }, function () { return 'error'; })
                    .then(function (answer) {
                        if (answer === 'ready') return deliver(true);
                        signedOut = answer === 'signed_out' ? signedOut + 1 : 0;
                        if (signedOut >= 2) return show('sign_in', MESSAGES.signIn, 'Check again');
                        if (attempt >= delays.length || now() - startedAt >= maxWaitMs) {
                            return show('timeout', timeoutMessage(paymentId), 'Check again');
                        }
                        var wait = delays[attempt];
                        attempt += 1;
                        return sleep(wait).then(next);
                    });
            }
            return next();
        }

        function run() {
            if (!options.checkLicence) {
                // No accounts API on this page: the licence is still granted on the server.
                if (result.outcome === 'succeeded') return deliver(false);
                return Promise.resolve(show('confirming', MESSAGES.pending));
            }
            show(result.outcome === 'succeeded' ? 'paid' : 'confirming', result.outcome === 'succeeded' ? MESSAGES.paid : MESSAGES.confirming);
            return poll();
        }

        function begin() {
            running = run().then(function (state) {
                running = null;
                return state;
            }, function (error) {
                running = null;
                if (root.console) root.console.error('Checkout return failed:', error);
                return show('timeout', timeoutMessage(paymentId), 'Check again');
            });
            return running;
        }

        /** Checks again after a timeout, sign-in or failed download. A running check is reused. */
        function retry() {
            return running || begin();
        }

        control.finished = begin();
        return control;
    }

    /** The tone of the download notice for a state: succeeded, failed or pending (css). */
    function noticeTone(state) {
        if (state === 'ready' || state === 'paid') return 'succeeded';
        if (state === 'failed' || state === 'download_failed') return 'failed';
        if (state === 'cancelled') return 'cancelled';
        return 'pending';
    }

    var api = {
        PLATFORM_KEY: PLATFORM_KEY,
        PENDING_KEY: PENDING_KEY,
        rememberPlatform: rememberPlatform,
        recallPlatform: recallPlatform,
        readCheckoutReturn: readCheckoutReturn,
        returnMessage: returnMessage,
        savePendingPayment: savePendingPayment,
        loadPendingPayment: loadPendingPayment,
        clearPendingPayment: clearPendingPayment,
        downloadState: downloadState,
        cleanReturnUrl: cleanReturnUrl,
        isMobileDevice: isMobileDevice,
        hasEarlyAccessLicence: hasEarlyAccessLicence,
        createLicenceCheck: createLicenceCheck,
        handleCheckoutReturn: handleCheckoutReturn,
        noticeTone: noticeTone
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RaDownloadFlow = api;
})(typeof window !== 'undefined' ? window : globalThis);
