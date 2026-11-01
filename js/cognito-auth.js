/*
 * RACE Insight website sign-in: AWS Cognito, email + password.
 *
 * Classic script. Needs js/vendor/amazon-cognito-identity.min.js (global
 * AmazonCognitoIdentity) and js/cognito-config.js loaded first. Exposes
 * window.RaAuth. The app client is public and signs in with SRP, so the password
 * never travels in clear text and the page holds no secret.
 *
 * Profile fields live in Cognito attributes: name, custom:simulator,
 * custom:experience, custom:location, custom:referral, custom:bio, custom:joined.
 */
(function (root) {
    'use strict';

    var PROFILE_ATTRIBUTES = {
        simulator: 'custom:simulator',
        experience: 'custom:experience',
        location: 'custom:location',
        referral: 'custom:referral',
        bio: 'custom:bio'
    };

    var MESSAGES = {
        NotAuthorizedException: 'Incorrect email or password.',
        UserNotFoundException: 'Incorrect email or password.',
        UserNotConfirmedException: 'Confirm your email first. Check your inbox for the code.',
        UsernameExistsException: 'This email is already registered. Please sign in instead.',
        InvalidPasswordException: 'Password must be at least 8 characters with upper case, lower case and a number.',
        CodeMismatchException: 'That verification code is wrong.',
        ExpiredCodeException: 'That verification code has expired. Request a new one.',
        LimitExceededException: 'Too many attempts. Please try again later.',
        TooManyRequestsException: 'Too many attempts. Please try again later.',
        TooManyFailedAttemptsException: 'Too many attempts. Please try again later.',
        PasswordResetRequiredException: 'Your password needs to be reset. Use Forgot password.',
        NewPasswordRequired: 'This account needs a new password. Use Forgot password.',
        NetworkError: 'Network error. Please check your connection and try again.',
        NotConfigured: 'Sign-in is not available right now. Please try again later.'
    };

    function friendlyError(err) {
        var code = err && (err.code || err.name);
        if (code && MESSAGES[code]) return MESSAGES[code];
        if (code === 'InvalidParameterException' && err.message) return err.message;
        return 'An error occurred. Please try again.';
    }

    function normalizeEmail(email) {
        return String(email || '').trim().toLowerCase();
    }

    function createRaAuth(sdk, config) {
        var configured = !!(sdk && config && config.region && config.userPoolId && config.clientId);
        var pool = configured
            ? new sdk.CognitoUserPool({ UserPoolId: config.userPoolId, ClientId: config.clientId })
            : null;

        var currentUser = null;
        var ready = false;
        var listeners = [];

        function notify() {
            listeners.slice().forEach(function (cb) {
                try { cb(currentUser); } catch (e) { console.error('Auth listener failed:', e); }
            });
        }

        function notConfigured() {
            return { code: 'NotConfigured' };
        }

        function attributesToMap(list) {
            var map = {};
            (list || []).forEach(function (a) { map[a.getName ? a.getName() : a.Name] = a.getValue ? a.getValue() : a.Value; });
            return map;
        }

        function buildUser(sub, attrs) {
            var email = attrs.email || null;
            var joined = attrs['custom:joined'] ? new Date(attrs['custom:joined']) : null;
            var displayName = attrs.name || (email ? email.split('@')[0] : '');
            var profile = { displayName: displayName, createdAt: joined && !isNaN(joined) ? joined : null };
            Object.keys(PROFILE_ATTRIBUTES).forEach(function (key) {
                profile[key] = attrs[PROFILE_ATTRIBUTES[key]] || '';
            });
            return { uid: sub, email: email, displayName: displayName, photoURL: null, profile: profile };
        }

        /** Resolves the signed-in CognitoUser with a valid session, or rejects. */
        function activeSession() {
            return new Promise(function (resolve, reject) {
                if (!pool) { reject(notConfigured()); return; }
                var cu = pool.getCurrentUser();
                if (!cu) { reject({ code: 'NotAuthorizedException', message: 'Not signed in' }); return; }
                cu.getSession(function (err, session) {
                    if (err || !session || !session.isValid()) {
                        reject(err || { code: 'NotAuthorizedException', message: 'Session expired' });
                    } else {
                        resolve({ cognitoUser: cu, session: session });
                    }
                });
            });
        }

        function loadUser(cognitoUser, session) {
            return new Promise(function (resolve, reject) {
                cognitoUser.getUserAttributes(function (err, list) {
                    if (err) { reject(err); return; }
                    var sub = String(session.getIdToken().decodePayload().sub);
                    resolve(buildUser(sub, attributesToMap(list)));
                });
            });
        }

        // Restore the stored session once, then tell listeners.
        function restore() {
            activeSession()
                .then(function (s) { return loadUser(s.cognitoUser, s.session); })
                .then(function (user) { currentUser = user; })
                .catch(function (err) {
                    if (pool && err && err.code !== 'NotConfigured') {
                        var stale = pool.getCurrentUser();
                        // A rejected refresh token means the stored session is dead.
                        if (stale && err.message && err.message !== 'Not signed in') stale.signOut();
                    }
                    currentUser = null;
                })
                .then(function () {
                    ready = true;
                    notify();
                });
        }

        function signIn(email, password) {
            return new Promise(function (resolve, reject) {
                if (!pool) { reject(notConfigured()); return; }
                var username = normalizeEmail(email);
                var cu = new sdk.CognitoUser({ Username: username, Pool: pool });
                var details = new sdk.AuthenticationDetails({ Username: username, Password: password });
                cu.authenticateUser(details, {
                    onSuccess: function (session) {
                        loadUser(cu, session).then(function (user) {
                            currentUser = user;
                            notify();
                            resolve(user);
                        }, reject);
                    },
                    onFailure: reject,
                    newPasswordRequired: function () { reject({ code: 'NewPasswordRequired' }); }
                });
            });
        }

        function signUp(email, password, options) {
            return new Promise(function (resolve, reject) {
                if (!pool) { reject(notConfigured()); return; }
                var username = normalizeEmail(email);
                var name = options && options.name ? String(options.name).trim() : username.split('@')[0];
                var attributes = [
                    new sdk.CognitoUserAttribute({ Name: 'email', Value: username }),
                    new sdk.CognitoUserAttribute({ Name: 'name', Value: name }),
                    new sdk.CognitoUserAttribute({ Name: 'custom:joined', Value: new Date().toISOString() })
                ];
                pool.signUp(username, password, attributes, [], function (err, result) {
                    if (err || !result) reject(err || notConfigured());
                    else resolve({ needsConfirmation: !result.userConfirmed });
                });
            });
        }

        function withUser(email, run) {
            return new Promise(function (resolve, reject) {
                if (!pool) { reject(notConfigured()); return; }
                var cu = new sdk.CognitoUser({ Username: normalizeEmail(email), Pool: pool });
                run(cu, resolve, reject);
            });
        }

        function confirmSignUp(email, code) {
            return withUser(email, function (cu, resolve, reject) {
                cu.confirmRegistration(String(code).trim(), true, function (err) { err ? reject(err) : resolve(); });
            });
        }

        function resendConfirmationCode(email) {
            return withUser(email, function (cu, resolve, reject) {
                cu.resendConfirmationCode(function (err) { err ? reject(err) : resolve(); });
            });
        }

        function requestPasswordReset(email) {
            return withUser(email, function (cu, resolve, reject) {
                cu.forgotPassword({ onSuccess: function () { resolve(); }, onFailure: reject });
            });
        }

        function confirmPasswordReset(email, code, newPassword) {
            return withUser(email, function (cu, resolve, reject) {
                cu.confirmPassword(String(code).trim(), newPassword, {
                    onSuccess: function () { resolve(); },
                    onFailure: reject
                });
            });
        }

        function signOut() {
            if (pool) {
                var cu = pool.getCurrentUser();
                if (cu) cu.signOut();
            }
            currentUser = null;
            notify();
            return Promise.resolve();
        }

        function changePassword(oldPassword, newPassword) {
            return activeSession().then(function (s) {
                return new Promise(function (resolve, reject) {
                    s.cognitoUser.changePassword(oldPassword, newPassword, function (err) { err ? reject(err) : resolve(); });
                });
            });
        }

        /** Saves profile fields. Empty values remove the attribute. Keys: displayName, simulator, experience, location, referral, bio. */
        function updateProfile(fields) {
            return activeSession().then(function (s) {
                var set = [];
                var remove = [];
                if (fields.displayName !== undefined && String(fields.displayName).trim()) {
                    set.push(new sdk.CognitoUserAttribute({ Name: 'name', Value: String(fields.displayName).trim() }));
                }
                Object.keys(PROFILE_ATTRIBUTES).forEach(function (key) {
                    if (fields[key] === undefined) return;
                    var value = String(fields[key]).trim();
                    if (value) set.push(new sdk.CognitoUserAttribute({ Name: PROFILE_ATTRIBUTES[key], Value: value }));
                    else remove.push(PROFILE_ATTRIBUTES[key]);
                });
                function call(method, arg) {
                    return new Promise(function (resolve, reject) {
                        s.cognitoUser[method](arg, function (err) { err ? reject(err) : resolve(); });
                    });
                }
                return Promise.resolve()
                    .then(function () { return set.length ? call('updateAttributes', set) : null; })
                    .then(function () { return remove.length ? call('deleteAttributes', remove) : null; })
                    .then(function () { return loadUser(s.cognitoUser, s.session); })
                    .then(function (user) { currentUser = user; return user; });
            });
        }

        function deleteAccount() {
            return activeSession().then(function (s) {
                return new Promise(function (resolve, reject) {
                    s.cognitoUser.deleteUser(function (err) {
                        if (err) { reject(err); return; }
                        currentUser = null;
                        notify();
                        resolve();
                    });
                });
            });
        }

        function onAuthStateChanged(cb) {
            listeners.push(cb);
            if (ready) setTimeout(function () { cb(currentUser); }, 0);
            return function unsubscribe() {
                listeners = listeners.filter(function (l) { return l !== cb; });
            };
        }

        if (configured) restore();
        else { ready = true; setTimeout(notify, 0); }

        return {
            get configured() { return configured; },
            get currentUser() { return currentUser; },
            onAuthStateChanged: onAuthStateChanged,
            signIn: signIn,
            signUp: signUp,
            confirmSignUp: confirmSignUp,
            resendConfirmationCode: resendConfirmationCode,
            requestPasswordReset: requestPasswordReset,
            confirmPasswordReset: confirmPasswordReset,
            signOut: signOut,
            changePassword: changePassword,
            updateProfile: updateProfile,
            deleteAccount: deleteAccount,
            friendlyError: friendlyError
        };
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createRaAuth: createRaAuth, friendlyError: friendlyError };
    } else {
        root.RaAuth = createRaAuth(root.AmazonCognitoIdentity, root.RACE_INSIGHT_COGNITO);
    }
})(typeof window !== 'undefined' ? window : globalThis);
