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

    var pending = null;

    /** Fetches the feed once per page load. A failure clears the cache so a later click can retry. */
    function fetchLatest() {
        if (!FEED_URL) return Promise.reject(new Error('Release feed not published yet'));
        if (!pending) {
            pending = fetch(FEED_URL, { cache: 'no-store' })
                .then(function (response) {
                    if (!response.ok) throw new Error('Release feed error: ' + response.status);
                    return response.json();
                })
                .catch(function (error) {
                    pending = null;
                    throw error;
                });
        }
        return pending;
    }

    var api = { pickDownload: pickDownload, describeVersion: describeVersion, describeChecksum: describeChecksum, downloadsOpen: downloadsOpen, fetchLatest: fetchLatest, FEED_URL: FEED_URL };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RaRelease = api;
})(typeof window !== 'undefined' ? window : globalThis);
