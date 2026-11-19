/*
 * Download and purchase flow for the RACE Insight download section.
 * Classic script. Exposes window.RaDownloadFlow (module.exports under Node for the tests).
 *
 * The visitor picks an operating system, buys early access on the Dodo checkout and comes
 * back to this page. Dodo appends ?payment_id=...&status=... (and the buyer's email) to the
 * return URL. On status=succeeded the page starts the installer download for the operating
 * system chosen before checkout, once per payment. Any other status shows a calm message.
 *
 * The return parameters only choose what the page shows. The licence itself is granted on the
 * server from Dodo's webhook, and the installer is public, so a forged return URL gains nothing.
 */
(function (root) {
    'use strict';

    var PLATFORM_KEY = 'ri-download-platform';
    var DOWNLOADED_PREFIX = 'ri-checkout-downloaded:';
    var PLATFORMS = ['windows', 'linux', 'apple'];
    // Query parameters Dodo adds to the return URL. They are removed from the address bar after
    // reading so the buyer's email does not stay in the history and a reload does not repeat.
    var RETURN_PARAMS = ['payment_id', 'subscription_id', 'status', 'email', 'license_key'];
    var PAYMENT_ID = /^[A-Za-z0-9_-]{1,100}$/;

    function isPlatform(value) {
        return PLATFORMS.indexOf(value) !== -1;
    }

    /** Remembers the chosen operating system across the checkout redirect. */
    function rememberPlatform(storage, platform) {
        if (!isPlatform(platform) || !storage) return false;
        try {
            storage.setItem(PLATFORM_KEY, platform);
            return true;
        } catch (error) {
            return false;
        }
    }

    /** The operating system chosen before checkout, or the fallback. */
    function recallPlatform(storage, fallback) {
        var value = null;
        try {
            value = storage ? storage.getItem(PLATFORM_KEY) : null;
        } catch (error) {
            value = null;
        }
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

    /** Message for the download section after a checkout return. */
    function returnMessage(outcome, started) {
        if (outcome === 'succeeded' && started === false) {
            return 'Thanks for your purchase. Use "Download again" to get the installer, then sign in to RACE Insight with the same account to activate your licence.';
        }
        if (outcome === 'succeeded') {
            return 'Thanks — your download has started. Sign in to RACE Insight with the same account to activate your licence.';
        }
        if (outcome === 'failed') {
            return 'The payment did not go through. You can try again below. If you were charged, write to info@apexracetech.in.';
        }
        if (outcome === 'cancelled') {
            return 'Checkout was cancelled. You can buy early access whenever you are ready.';
        }
        if (outcome === 'pending') {
            return 'Your payment is still being confirmed. Once it completes, sign in and use "Already have a licence? Download" below.';
        }
        return '';
    }

    /**
     * True the first time a payment's download is started on this browser, false after that.
     * When storage is unavailable it allows the download; the address is cleaned regardless.
     */
    function claimAutoDownload(storage, paymentId) {
        if (!paymentId) return false;
        var key = DOWNLOADED_PREFIX + paymentId;
        try {
            if (storage.getItem(key)) return false;
            storage.setItem(key, '1');
        } catch (error) {
            return true;
        }
        return true;
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
     * Handles a checkout return on page load.
     *   options.location  { search, href }
     *   options.history   object with replaceState (optional)
     *   options.storage   localStorage-like object
     *   options.start     function (platform) starting the installer download
     *   options.show      function (outcome, message, platform) updating the page
     * Returns the outcome, or null when the page was not opened from checkout.
     */
    function handleCheckoutReturn(options) {
        var result = readCheckoutReturn(options.location && options.location.search);
        if (!result) return null;
        if (options.history && typeof options.history.replaceState === 'function') {
            try {
                options.history.replaceState(null, '', cleanReturnUrl(options.location.href));
            } catch (error) { /* the message still shows */ }
        }
        var platform = recallPlatform(options.storage, 'windows');
        var started = false;
        if (result.outcome === 'succeeded' && claimAutoDownload(options.storage, result.paymentId)) {
            options.start(platform);
            started = true;
        }
        options.show(result.outcome, returnMessage(result.outcome, result.outcome === 'succeeded' ? started : undefined), platform);
        return result.outcome;
    }

    var api = {
        PLATFORM_KEY: PLATFORM_KEY,
        rememberPlatform: rememberPlatform,
        recallPlatform: recallPlatform,
        readCheckoutReturn: readCheckoutReturn,
        returnMessage: returnMessage,
        claimAutoDownload: claimAutoDownload,
        cleanReturnUrl: cleanReturnUrl,
        handleCheckoutReturn: handleCheckoutReturn
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RaDownloadFlow = api;
})(typeof window !== 'undefined' ? window : globalThis);
