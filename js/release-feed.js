/*
 * Reads the release feed (latest.json on the release CloudFront address) for the Download button.
 * Classic script. Exposes window.RaRelease. The feed is written by the release workflow:
 *   { version, releaseDate, downloads: { windows, linux, 'mac-arm64', 'mac-x64', ... } }
 * where each download is { file, url, size, sha256 }.
 */
(function (root) {
    'use strict';

    // The site's release address. Change here when the release hosting gets a custom domain.
    var FEED_URL = 'https://d397u0o5fj06jy.cloudfront.net/latest.json';

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

    var pending = null;

    /** Fetches the feed once per page load. A failure clears the cache so a later click can retry. */
    function fetchLatest() {
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

    var api = { pickDownload: pickDownload, describeVersion: describeVersion, fetchLatest: fetchLatest, FEED_URL: FEED_URL };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RaRelease = api;
})(typeof window !== 'undefined' ? window : globalThis);
