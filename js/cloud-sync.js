/*
 * RACE Insight cloud sync client for the website.
 *
 * Classic script. Needs js/cognito-auth.js (window.RaAuth) and
 * js/cloud-config.js (window.RACE_INSIGHT_SYNC) loaded first. Exposes
 * window.RaCloudSync. The website is not a device: it sends no device header
 * and never takes the desktop's one-device lease.
 *
 * Files move straight between the browser and presigned S3 URLs. Every
 * download is checked against its SHA-256 before it is offered to save. The
 * document formats match the desktop app (race-insight-sync-unit v1 and
 * race-insight-session v1), so a session uploaded here opens on the desktop.
 */
(function (root) {
    'use strict';

    var SHA256 = /^[0-9a-f]{64}$/;
    var UNIT_ID = /^[A-Za-z0-9_-]{1,64}$/;
    var SHARE_ID = /^[0-9a-f]{32}$/;
    var LIBRARY_PROJECT_ID = '_library';
    var MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // whole-file hashing in the browser
    var MAX_DOCUMENT_BYTES = 1024 * 1024;
    var PART_CONCURRENCY = 3;

    function SyncError(status, code, message, extra) {
        this.name = 'SyncError';
        this.status = status;
        this.code = code;
        this.message = message || code;
        this.extra = extra || {};
    }
    SyncError.prototype = Object.create(Error.prototype);

    var MESSAGES = {
        signed_out: 'Sign in to use cloud sync.',
        not_configured: 'Cloud sync is not available yet.',
        consent_required: 'Agree to cloud sync in the desktop app first.',
        subscription_required: 'This needs an active subscription.',
        quota_exceeded: 'Not enough cloud storage left.',
        raw_opt_in_required: 'Turn on "Sync raw logger files" in the desktop app first.',
        archived: 'This file is archived. Request a restore in the desktop app.',
        network: 'No connection to the sync service. Please try again.',
        conflict: 'This was changed on another device. Refresh and try again.',
        email_not_verified: 'Verify your email address first.',
        already_handled: 'This invitation was already handled.',
        share_unavailable: 'This session is no longer shared with you.',
        digest_mismatch: 'A downloaded file failed its integrity check. Please try again.',
        too_large: 'Files up to 1 GB can be uploaded from the website. Use the desktop app for larger files.'
    };

    function friendlyError(err) {
        if (err && err.code && MESSAGES[err.code]) return MESSAGES[err.code];
        return (err && err.message) || 'Cloud sync failed.';
    }

    function isPlainFileName(value) {
        return typeof value === 'string' && value.length > 0 && value.length <= 255
            && !/[<>:"/\\|?*\u0000-\u001f]/.test(value) && !/[. ]$/.test(value)
            && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value);
    }

    function hex(buffer) {
        return Array.prototype.map.call(new Uint8Array(buffer), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }

    function sessionDocumentFileName(sessionId) { return 'session_' + sessionId.slice(0, 16) + '.risession'; }

    /** Validates a desktop unit document; returns its file list. */
    function decodeUnitDocument(text, expectKind, expectId) {
        var doc;
        try { doc = JSON.parse(text); } catch (e) { throw new SyncError(0, 'invalid_document', 'Invalid unit document'); }
        if (!doc || doc.schema !== 'race-insight-sync-unit' || doc.version !== 1 || doc.kind !== expectKind || doc.id !== expectId
            || !Array.isArray(doc.files) || doc.files.length > 199) {
            throw new SyncError(0, 'invalid_document', 'Invalid unit document');
        }
        return doc.files.map(function (file) {
            if (!file || !isPlainFileName(file.name) || file.name.indexOf('__') === 0 || !SHA256.test(file.sha256)
                || !Number.isSafeInteger(file.size) || file.size < 1) {
                throw new SyncError(0, 'invalid_document', 'Invalid file in unit document');
            }
            return { name: file.name, sha256: file.sha256, size: file.size, kind: file.kind };
        });
    }

    function createRaCloudSync(deps) {
        var fetchImpl = deps.fetch;
        var subtle = deps.crypto && deps.crypto.subtle;
        var getAccessToken = deps.getAccessToken;
        var apiUrl = typeof deps.apiUrl === 'string' ? deps.apiUrl.replace(/\/+$/, '') : '';
        var configured = /^https:\/\/[^/@]+/.test(apiUrl) && !!fetchImpl && !!subtle && typeof getAccessToken === 'function';

        function sha256(data) {
            return subtle.digest('SHA-256', data).then(hex);
        }

        function call(method, route, body) {
            if (!configured) return Promise.reject(new SyncError(0, 'not_configured', MESSAGES.not_configured));
            return Promise.resolve(getAccessToken()).catch(function () { return null; }).then(function (token) {
                if (!token) throw new SyncError(401, 'signed_out', MESSAGES.signed_out);
                var headers = { Authorization: 'Bearer ' + token };
                if (body !== undefined) headers['Content-Type'] = 'application/json';
                return fetchImpl(apiUrl + route, { method: method, headers: headers, redirect: 'error', cache: 'no-store',
                    body: body === undefined ? undefined : JSON.stringify(body) })
                    .catch(function (e) { throw new SyncError(0, 'network', e && e.message); });
            }).then(function (response) {
                return response.text().then(function (text) {
                    var payload = {};
                    if (text) {
                        try { payload = JSON.parse(text); } catch (e) { throw new SyncError(response.status, 'invalid_response', 'Unexpected response'); }
                    }
                    if (!response.ok) {
                        throw new SyncError(response.status, payload.error || 'http_error', payload.message || ('HTTP ' + response.status), payload);
                    }
                    return payload;
                });
            });
        }

        function checkUnitId(id) {
            if (!UNIT_ID.test(id)) throw new SyncError(0, 'invalid_parameter', 'Invalid id');
            return id;
        }
        function checkShareId(id) {
            if (!SHARE_ID.test(id)) throw new SyncError(0, 'invalid_parameter', 'Invalid share id');
            return id;
        }
        function checkSha(sha) {
            if (!SHA256.test(sha)) throw new SyncError(0, 'invalid_parameter', 'Invalid file hash');
            return sha;
        }

        /** Fetches a presigned URL and returns the bytes only if size and SHA-256 match. */
        function fetchVerified(link, expectSha) {
            if (link.sha256 !== expectSha) return Promise.reject(new SyncError(0, 'digest_mismatch', MESSAGES.digest_mismatch));
            return fetchImpl(link.url, { method: 'GET', redirect: 'error', cache: 'no-store' })
                .catch(function (e) { throw new SyncError(0, 'network', e && e.message); })
                .then(function (response) {
                    if (response.status !== 200) throw new SyncError(response.status, 'download_failed', 'Download failed (HTTP ' + response.status + ')');
                    return response.arrayBuffer();
                })
                .then(function (buffer) {
                    if (buffer.byteLength !== link.size) throw new SyncError(0, 'digest_mismatch', MESSAGES.digest_mismatch);
                    return sha256(buffer).then(function (digest) {
                        if (digest !== expectSha) throw new SyncError(0, 'digest_mismatch', MESSAGES.digest_mismatch);
                        return buffer;
                    });
                });
        }

        function readFiles(head, linkFor, expectKind) {
            if (!head.head_rev || !head.manifest_hash) return Promise.resolve([]);
            var manifest = checkSha(head.manifest_hash);
            return linkFor(manifest).then(function (link) {
                if (link.size > MAX_DOCUMENT_BYTES) throw new SyncError(0, 'invalid_document', 'Unit document too large');
                return fetchVerified(link, manifest);
            }).then(function (buffer) {
                var files = decodeUnitDocument(new TextDecoder().decode(buffer), expectKind, head.id || head.session_id);
                var states = {};
                (head.blobs || []).forEach(function (b) { if (b && typeof b === 'object') states[b.sha256] = b.storage || 'standard'; });
                return files.map(function (file) {
                    if (!(file.sha256 in states)) throw new SyncError(0, 'invalid_document', 'Unit document names a file outside the revision');
                    return { name: file.name, sha256: file.sha256, size: file.size, kind: file.kind, storage: states[file.sha256] };
                });
            });
        }

        /** Hashes and uploads one Blob/File by content; a blob the cloud already holds is not sent again. */
        function uploadFile(blob, kind, projectId) {
            if (blob.size > MAX_UPLOAD_BYTES) return Promise.reject(new SyncError(0, 'too_large', MESSAGES.too_large));
            return blob.arrayBuffer().then(sha256).then(function (digest) {
                var body = { sha256: digest, size: blob.size, kind: kind };
                if (projectId) body.project_id = projectId;
                return call('POST', '/v1/blobs/upload-init', body).then(function (init) {
                    if (init.exists) return digest;
                    var stored = {};
                    (init.uploaded_parts || []).forEach(function (p) { stored[p.part_number] = p; });
                    var done = [];
                    function sendBatch(batch) {
                        var queue = batch.parts.slice();
                        function lane() {
                            var part = queue.shift();
                            if (!part) return Promise.resolve();
                            var start = (part.part_number - 1) * batch.part_size;
                            var end = Math.min(start + batch.part_size, blob.size);
                            var prior = stored[part.part_number];
                            if (prior && prior.size === end - start) {
                                done.push({ part_number: part.part_number, etag: prior.etag });
                                return lane();
                            }
                            if (!/^https:\/\//.test(part.url)) return Promise.reject(new SyncError(0, 'invalid_response', 'Bad part URL'));
                            return fetchImpl(part.url, { method: 'PUT', body: blob.slice(start, end), redirect: 'error' })
                                .catch(function (e) { throw new SyncError(0, 'network', e && e.message); })
                                .then(function (response) {
                                    var etag = response.headers.get('etag');
                                    if (response.status !== 200 || !etag) throw new SyncError(response.status, 'upload_failed', 'Upload of part ' + part.part_number + ' failed');
                                    done.push({ part_number: part.part_number, etag: etag });
                                    return lane();
                                });
                        }
                        var lanes = [];
                        for (var i = 0; i < PART_CONCURRENCY; i += 1) lanes.push(lane());
                        return Promise.all(lanes).then(function () {
                            var last = batch.parts.length ? batch.parts[batch.parts.length - 1].part_number : batch.part_count;
                            if (last >= batch.part_count) return null;
                            var next = { sha256: digest, size: blob.size, kind: kind, first_part: last + 1 };
                            if (projectId) next.project_id = projectId;
                            return call('POST', '/v1/blobs/upload-init', next).then(function (more) {
                                return more.exists ? 'exists' : sendBatch(more);
                            });
                        });
                    }
                    return sendBatch(init).then(function (result) {
                        if (result === 'exists') return digest;
                        done.sort(function (a, b) { return a.part_number - b.part_number; });
                        return call('POST', '/v1/blobs/upload-complete', { sha256: digest, parts: done }).then(function () { return digest; });
                    });
                });
            });
        }

        function jsonBlob(value) {
            return new Blob([JSON.stringify(value)], { type: 'application/json' });
        }

        return {
            get configured() { return configured; },
            account: function () { return call('GET', '/v1/account'); },
            listUnits: function () { return call('GET', '/v1/projects'); },
            listShares: function () { return call('GET', '/v1/shares'); },
            createShare: function (sessionId, emails, aiUse, expires) {
                var body = { session_id: checkUnitId(sessionId), recipient_emails: emails, ai_use: aiUse === true };
                if (expires) body.expires = expires;
                return call('POST', '/v1/shares', body);
            },
            acceptShare: function (id) { return call('POST', '/v1/shares/' + checkShareId(id) + '/accept'); },
            /**
             * Moves one of your sessions to Recently deleted (restorable from the
             * desktop app for a while). parent is its current head revision.
             */
            removeSession: function (id, parent) {
                checkUnitId(id);
                if (typeof parent !== 'string' || !/^\d+$/.test(parent)) {
                    return Promise.reject(new SyncError(0, 'invalid_parameter', 'Invalid revision'));
                }
                return call('DELETE', '/v1/sessions/' + id, { parent: parent });
            },
            /** Owner: revoke. Recipient: remove an accepted share or decline an invitation. */
            removeShare: function (id) { return call('DELETE', '/v1/shares/' + checkShareId(id)); },

            /** Files of a project or session head, read from its verified unit document. */
            unitFiles: function (kind, id) {
                if (kind !== 'project' && kind !== 'session') return Promise.reject(new SyncError(0, 'invalid_parameter', 'Invalid kind'));
                return call('GET', '/v1/' + kind + 's/' + checkUnitId(id)).then(function (head) {
                    return readFiles(head, function (sha) { return call('GET', '/v1/blobs/' + checkSha(sha) + '/download-url'); }, kind);
                });
            },
            sharedFiles: function (shareId) {
                checkShareId(shareId);
                return call('GET', '/v1/shares/' + shareId + '/session').then(function (head) {
                    return readFiles(head, function (sha) {
                        return call('GET', '/v1/shares/' + shareId + '/blobs/' + checkSha(sha) + '/download-url');
                    }, 'session');
                });
            },
            /** Verified bytes of one file, from the owner's own or a shared session. */
            downloadFile: function (file, shareId) {
                var route = shareId ? '/v1/shares/' + checkShareId(shareId) + '/blobs/' + checkSha(file.sha256) + '/download-url'
                    : '/v1/blobs/' + checkSha(file.sha256) + '/download-url';
                return call('GET', route).then(function (link) { return fetchVerified(link, file.sha256); });
            },

            /**
             * Uploads a logger file as a new session in the library project, in the
             * same shape the desktop app writes. Needs the raw-file opt-in.
             */
            uploadSession: function (file, onProgress) {
                if (!isPlainFileName(file.name) || file.name.indexOf('__') === 0) {
                    return Promise.reject(new SyncError(0, 'invalid_parameter', 'Rename the file to a plain name first.'));
                }
                var progress = typeof onProgress === 'function' ? onProgress : function () {};
                var rawSha;
                progress('Checking your library');
                return call('GET', '/v1/projects').then(function (units) {
                    var library = (units.projects || []).filter(function (p) { return p.id === LIBRARY_PROJECT_ID; })[0];
                    if (!library || !library.raw_opt_in) throw new SyncError(403, 'raw_opt_in_required', MESSAGES.raw_opt_in_required);
                    progress('Uploading ' + file.name);
                    return uploadFile(file, 'raw', LIBRARY_PROJECT_ID);
                }).then(function (digest) {
                    rawSha = digest;
                    var sessionDoc = jsonBlob({ schema: 'race-insight-session', version: 1, file_name: file.name, metadata: {},
                        is_user_edited: false, laps: [], run_record: null, corner_phase_annotations: null, lap_overrides: [],
                        track_splits: [], sources: [{ original_name: file.name, role: 'primary', size_bytes: file.size, sha256: rawSha,
                            storage_ref: file.name }] });
                    progress('Saving the session');
                    return uploadFile(sessionDoc, 'session').then(function (docSha) {
                        var name = file.name.replace(/\.[^.]*$/, '').slice(0, 200) || 'Session';
                        var unitDoc = jsonBlob({ schema: 'race-insight-sync-unit', version: 1, kind: 'session', id: rawSha, name: name,
                            projectId: LIBRARY_PROJECT_ID, files: [
                                { name: sessionDocumentFileName(rawSha), sha256: docSha, size: sessionDoc.size, kind: 'session' },
                                { name: file.name, sha256: rawSha, size: file.size, kind: 'raw' }] });
                        return uploadFile(unitDoc, 'session').then(function (unitSha) {
                            return call('GET', '/v1/sessions/' + rawSha).then(function (head) { return head.head_rev || null; }, function (err) {
                                if (err && err.status === 404) return null;
                                throw err;
                            }).then(function (parent) {
                                return call('POST', '/v1/sessions/' + rawSha + '/revisions', { parent: parent, name: name,
                                    project_id: LIBRARY_PROJECT_ID, blobs: [docSha, rawSha, unitSha], manifest_hash: unitSha });
                            });
                        });
                    });
                }).then(function (result) { return { sessionId: rawSha, rev: result.rev }; });
            },
            friendlyError: friendlyError
        };
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createRaCloudSync: createRaCloudSync, friendlyError: friendlyError, decodeUnitDocument: decodeUnitDocument,
            isPlainFileName: isPlainFileName };
    } else {
        var auth = root.RaAuth;
        root.RaCloudSync = createRaCloudSync({
            fetch: root.fetch && root.fetch.bind(root),
            crypto: root.crypto,
            apiUrl: (root.RACE_INSIGHT_SYNC || {}).apiUrl,
            getAccessToken: function () { return auth && auth.getAccessToken ? auth.getAccessToken() : null; }
        });
    }
})(typeof window !== 'undefined' ? window : globalThis);
