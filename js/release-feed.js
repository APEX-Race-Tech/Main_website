/*
 * Reads the release feed (latest.json on the release CloudFront address) for the Download button.
 * Classic script. Exposes window.RaRelease. The feed is written by the release workflow:
 *   { version, releaseDate, downloads: { windows, linux, 'mac-arm64', 'mac-x64', ... } }
 * where each download is { file, url, size, sha256 }.
 */
(function (root) {
    'use strict';

    // The release feed address (latest.json on the release hosting). Kept empty until the
    // early access opens on 1 January 2027 so the page does not reveal where installers live.
    // Set it back to the release address's latest.json when downloads open.
    var FEED_URL = '';

    // Which feed entries satisfy each platform button, best first.
    var PLATFORM_KEYS = {
        windows: ['windows'],
        linux: ['linux'],
        apple: ['mac-arm64', 'mac-x64']
    };

    function isHttps(url) {
        return typeof url === 'string' && /^https:\/\//.test(url);
    }

    /** The download for a platform button, or null when there is none or its address is unsafe. */
    function pickDownload(latest, platform) {
        var keys = PLATFORM_KEYS[platform];
        if (!keys || !latest || typeof latest !== 'object' || !latest.downloads) return null;
        for (var i = 0; i < keys.length; i++) {
            var entry = latest.downloads[keys[i]];
            if (entry && isHttps(entry.url)) return entry;
        }
        return null;
    }

    /** Text for the "Latest version" label. formatDate turns an ISO date into display text. */
    function describeVersion(latest, formatDate) {
        var hasDownloads = latest && latest.downloads && Object.keys(latest.downloads).length > 0;
        if (!latest || !latest.version || !hasDownloads) return 'Latest version: not available yet';
        var label = 'Latest version: v' + latest.version;
        return latest.releaseDate ? label + ' (' + formatDate(latest.releaseDate) + ')' : label;
    }

    function describeChecksum(latest, platform) {
        var entry = pickDownload(latest, platform);
        if (!entry || typeof entry.file !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.sha256 || '')) {
            return 'Checksum unavailable. Try again before installing.';
        }
        return entry.file + '\nSHA-256\n' + entry.sha256;
    }

    /**
     * True once the early access has opened. opensAt is an ISO time with an offset, from
     * #download[data-downloads-open-at]. A missing or unreadable value keeps downloads closed.
     */
    function downloadsOpen(opensAt, now) {
        if (typeof opensAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(opensAt)) return false;
        var opens = new Date(opensAt).getTime();
        if (isNaN(opens)) return false;
        return (now || new Date()).getTime() >= opens;
    }

    // A feed request that has not answered after this long is given up, so a stalled request
    // cannot keep the Download button waiting for the rest of the page view.
    var FEED_TIMEOUT_MS = 10000;
    // Longest single timer for scheduleAt. setTimeout overflows above 2^31-1 ms (about 24.8 days)
    // and then fires at once, so long waits are split into steps of at most a day.
    var MAX_TIMER_MS = 24 * 3600 * 1000;

    /**
     * A feed reader that fetches once per page view and shares the answer. A failure or a
     * timeout clears the cache, so a later call (a retry) starts a fresh request.
     *   options.url        the feed address
     *   options.fetch      fetch implementation (tests)
     *   options.timeoutMs  how long to wait for an answer (default 10 s)
     */
    function createFeedClient(options) {
        var url = options.url;
        var timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : FEED_TIMEOUT_MS;
        var doFetch = options.fetch || function (address, init) { return root.fetch(address, init); };
        var pending = null;

        function request() {
            var controller = typeof AbortController === 'function' ? new AbortController() : null;
            var timer = null;
            var timedOut = new Promise(function (_resolve, reject) {
                timer = setTimeout(function () {
                    if (controller) controller.abort();
                    reject(new Error('Release feed timed out'));
                }, timeoutMs);
            });
            var init = { cache: 'no-store' };
            if (controller) init.signal = controller.signal;
            var answer = Promise.resolve()
                .then(function () { return doFetch(url, init); })
                .then(function (response) {
                    if (!response.ok) throw new Error('Release feed error: ' + response.status);
                    return response.json();
                });
            return Promise.race([answer, timedOut]).then(function (latest) {
                clearTimeout(timer);
                return latest;
            }, function (error) {
                clearTimeout(timer);
                throw error;
            });
        }

        function fetchLatest() {
            if (!url) return Promise.reject(new Error('Release feed not published yet'));
            if (!pending) {
                var current = request().catch(function (error) {
                    if (pending === current) pending = null;
                    throw error;
                });
                pending = current;
            }
            return pending;
        }

        return { fetchLatest: fetchLatest };
    }

    /**
     * Calls callback once at the given time (ISO string or epoch ms), for page controls that
     * change at a fixed moment such as the early access opening. Long waits are split into
     * timers of at most a day and re-checked against the clock, so a tab left open for weeks
     * still changes on time. Returns a cancel function. A past or unreadable time does nothing:
     * the caller's first check already covers it.
     *   env.now, env.setTimeout, env.clearTimeout  (tests)
     */
    function scheduleAt(at, callback, env) {
        env = env || {};
        var now = env.now || function () { return Date.now(); };
        var set = env.setTimeout || setTimeout;
        var clear = env.clearTimeout || clearTimeout;
        var target = typeof at === 'number' ? at : (typeof at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(at) ? new Date(at).getTime() : NaN);
        var cancelled = false;
        var timer = null;
        function cancel() {
            cancelled = true;
            if (timer !== null) clear(timer);
            timer = null;
        }
        if (isNaN(target) || target <= now()) return cancel;
        function arm() {
            timer = null;
            if (cancelled) return;
            var delay = target - now();
            if (delay <= 0) {
                cancelled = true;
                callback();
                return;
            }
            timer = set(arm, Math.min(delay, MAX_TIMER_MS));
        }
        arm();
        return cancel;
    }

    var feed = createFeedClient({ url: FEED_URL });

    /** Fetches the feed once per page load. A failure or timeout clears the cache so a later click can retry. */
    function fetchLatest() {
        return feed.fetchLatest();
    }

    var api = { pickDownload: pickDownload, describeVersion: describeVersion, describeChecksum: describeChecksum, downloadsOpen: downloadsOpen, fetchLatest: fetchLatest, createFeedClient: createFeedClient, scheduleAt: scheduleAt, FEED_URL: FEED_URL };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RaRelease = api;
})(typeof window !== 'undefined' ? window : globalThis);
