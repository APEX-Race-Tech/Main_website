// Run with: node --test js/cognito-auth.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./cognito-auth.js', import.meta.url), 'utf8');

function loadModule() {
    const sandbox = { module: { exports: {} }, console, setTimeout, clearTimeout, Promise };
    vm.runInNewContext(source, sandbox);
    return sandbox.module.exports;
}

const config = { region: 'us-east-1', userPoolId: 'us-east-1_abc', clientId: 'client123' };

function attr(Name, Value) {
    return { Name, Value, getName: () => Name, getValue: () => Value };
}

function idToken(payload) {
    return { decodePayload: () => payload, getJwtToken: () => 'id-jwt' };
}

function session(payload = { sub: 'sub-1' }) {
    return { isValid: () => true, getIdToken: () => idToken(payload), getAccessToken: () => ({ getJwtToken: () => 'access-jwt' }) };
}

/** Fake of the pieces of amazon-cognito-identity-js the adapter uses. */
function makeSdk(overrides = {}) {
    const calls = { signUp: [], updateAttributes: [], deleteAttributes: [] };
    const stored = { attrs: [attr('email', 'ada@example.com'), attr('name', 'Ada'), attr('custom:simulator', 'iRacing')], user: null };

    class CognitoUser {
        constructor({ Username }) { this.Username = Username; }
        authenticateUser(_d, cb) {
            if (overrides.authenticate) return overrides.authenticate(cb);
            stored.user = this;
            cb.onSuccess(session());
        }
        getSession(cb) { cb(overrides.sessionError || null, overrides.sessionError ? null : session(overrides.payload)); }
        getUserAttributes(cb) { cb(overrides.attributesError || null, overrides.attributesError ? null : stored.attrs); }
        updateAttributes(list, cb) {
            calls.updateAttributes.push(list.map((a) => [a.Name, a.Value]));
            list.forEach((a) => {
                stored.attrs = stored.attrs.filter((x) => x.Name !== a.Name).concat(attr(a.Name, a.Value));
            });
            cb(null, 'SUCCESS');
        }
        deleteAttributes(names, cb) {
            calls.deleteAttributes.push(names);
            stored.attrs = stored.attrs.filter((x) => !names.includes(x.Name));
            cb(null, 'SUCCESS');
        }
        changePassword(o, n, cb) { calls.changePassword = [o, n]; cb(null, 'SUCCESS'); }
        deleteUser(cb) { calls.deleted = true; cb(null, 'SUCCESS'); }
        signOut() { calls.signedOut = true; }
        confirmRegistration(code, _f, cb) { calls.confirm = [this.Username, code]; cb(null, 'SUCCESS'); }
        resendConfirmationCode(cb) { calls.resend = this.Username; cb(null, {}); }
        forgotPassword(cb) { calls.forgot = this.Username; cb.onSuccess({}); }
        confirmPassword(code, pw, cb) { calls.reset = [code, pw]; cb.onSuccess(); }
    }
    class CognitoUserPool {
        signUp(username, password, attributes, _v, cb) {
            calls.signUp.push({ username, password, attributes: attributes.map((a) => [a.Name, a.Value]) });
            cb(null, { userConfirmed: false });
        }
        getCurrentUser() { return overrides.noStoredUser ? null : new CognitoUser({ Username: 'ada@example.com' }); }
    }
    return {
        calls,
        sdk: {
            CognitoUser,
            CognitoUserPool,
            AuthenticationDetails: class { constructor(d) { Object.assign(this, d); } },
            CognitoUserAttribute: class { constructor(d) { Object.assign(this, d); } },
        },
    };
}

function firstState(auth) {
    return new Promise((resolve) => auth.onAuthStateChanged(resolve));
}

test('restores the stored session with profile fields from Cognito attributes', async () => {
    const { createRaAuth } = loadModule();
    const { sdk } = makeSdk();
    const user = await firstState(createRaAuth(sdk, config));
    assert.equal(user.uid, 'sub-1');
    assert.equal(user.email, 'ada@example.com');
    assert.equal(user.displayName, 'Ada');
    assert.equal(user.profile.simulator, 'iRacing');
    assert.equal(user.profile.experience, '');
});

test('reports signed out when nothing is stored', async () => {
    const { createRaAuth } = loadModule();
    const { sdk } = makeSdk({ noStoredUser: true });
    assert.equal(await firstState(createRaAuth(sdk, config)), null);
});

test('exposes the Cognito ID token for checkout and the access token for cloud sync', async () => {
    const { createRaAuth } = loadModule();
    const auth = createRaAuth(makeSdk().sdk, config);
    assert.equal(await auth.getIdToken(), 'id-jwt');
    assert.equal(await auth.getAccessToken(), 'access-jwt');
    const signedOut = createRaAuth(makeSdk({ noStoredUser: true }).sdk, config);
    assert.equal(await signedOut.getIdToken(), null);
});

test('clears a dead stored session whose refresh token was rejected', async () => {
    const { createRaAuth } = loadModule();
    const { sdk, calls } = makeSdk({ sessionError: { code: 'NotAuthorizedException', message: 'Refresh Token has expired' } });
    assert.equal(await firstState(createRaAuth(sdk, config)), null);
    assert.equal(calls.signedOut, true);
});

test('without configuration it reports signed out and rejects sign-in clearly', async () => {
    const { createRaAuth } = loadModule();
    const auth = createRaAuth(undefined, { region: '', userPoolId: '', clientId: '' });
    assert.equal(auth.configured, false);
    assert.equal(await firstState(auth), null);
    await assert.rejects(auth.signIn('a@b.co', 'x'), { code: 'NotConfigured' });
});

test('signIn updates the current user and tells listeners', async () => {
    const { createRaAuth } = loadModule();
    const { sdk } = makeSdk({ noStoredUser: true });
    const auth = createRaAuth(sdk, config);
    await firstState(auth);
    const seen = [];
    auth.onAuthStateChanged((u) => seen.push(u && u.email));
    const user = await auth.signIn(' ADA@Example.com ', 'Passw0rdx');
    assert.equal(user.email, 'ada@example.com');
    assert.equal(auth.currentUser.uid, 'sub-1');
    assert.ok(seen.includes('ada@example.com'));
});

test('signIn rejects with the Cognito error and maps it to plain text', async () => {
    const { createRaAuth, friendlyError } = loadModule();
    const err = { code: 'NotAuthorizedException' };
    const { sdk } = makeSdk({ noStoredUser: true, authenticate: (cb) => cb.onFailure(err) });
    const auth = createRaAuth(sdk, config);
    await assert.rejects(auth.signIn('a@b.co', 'bad'), err);
    assert.equal(friendlyError(err), 'Incorrect email or password.');
    assert.equal(friendlyError({}), 'An error occurred. Please try again.');
});

test('signUp sends email, name and a join date, and asks for confirmation', async () => {
    const { createRaAuth } = loadModule();
    const { sdk, calls } = makeSdk({ noStoredUser: true });
    const auth = createRaAuth(sdk, config);
    const result = await auth.signUp('Ada@Example.com', 'Passw0rdx', { name: 'Ada L' });
    assert.equal(result.needsConfirmation, true);
    const sent = calls.signUp[0];
    assert.equal(sent.username, 'ada@example.com');
    const attrs = Object.fromEntries(sent.attributes);
    assert.equal(attrs.email, 'ada@example.com');
    assert.equal(attrs.name, 'Ada L');
    assert.ok(!isNaN(Date.parse(attrs['custom:joined'])));
});

test('signUp stores the profile answers as custom attributes and skips empty ones', async () => {
    const { createRaAuth } = loadModule();
    const { sdk, calls } = makeSdk({ noStoredUser: true });
    const auth = createRaAuth(sdk, config);
    await auth.signUp('ada@example.com', 'Passw0rdx', {
        name: 'Ada L',
        profile: { simulator: 'iRacing', experience: 'Advanced', location: 'Berlin, Germany', referral: '', bio: undefined },
    });
    const attrs = Object.fromEntries(calls.signUp[0].attributes);
    assert.equal(attrs['custom:simulator'], 'iRacing');
    assert.equal(attrs['custom:experience'], 'Advanced');
    assert.equal(attrs['custom:location'], 'Berlin, Germany');
    assert.ok(!('custom:referral' in attrs));
    assert.ok(!('custom:bio' in attrs));
});

test('confirms sign-up and runs the password reset flow', async () => {
    const { createRaAuth } = loadModule();
    const { sdk, calls } = makeSdk({ noStoredUser: true });
    const auth = createRaAuth(sdk, config);
    await auth.confirmSignUp('a@b.co', ' 123456 ');
    assert.deepEqual(calls.confirm, ['a@b.co', '123456']);
    await auth.resendConfirmationCode('a@b.co');
    assert.equal(calls.resend, 'a@b.co');
    await auth.requestPasswordReset('a@b.co');
    await auth.confirmPasswordReset('a@b.co', '654321', 'NewPassw0rd');
    assert.deepEqual(calls.reset, ['654321', 'NewPassw0rd']);
});

test('updateProfile sets filled fields, removes emptied ones and refreshes the user', async () => {
    const { createRaAuth } = loadModule();
    const { sdk, calls } = makeSdk();
    const auth = createRaAuth(sdk, config);
    await firstState(auth);
    const user = await auth.updateProfile({ displayName: 'Ada B', experience: 'Advanced', bio: '', simulator: 'ACC' });
    assert.deepEqual(Object.fromEntries(calls.updateAttributes[0]), { 'custom:experience': 'Advanced', 'custom:simulator': 'ACC', name: 'Ada B' });
    assert.deepEqual([...calls.deleteAttributes[0]], ['custom:bio']);
    assert.equal(user.displayName, 'Ada B');
    assert.equal(user.profile.simulator, 'ACC');
    assert.equal(auth.currentUser.profile.experience, 'Advanced');
});

test('changePassword, signOut and deleteAccount reach Cognito and clear the user', async () => {
    const { createRaAuth } = loadModule();
    const { sdk, calls } = makeSdk();
    const auth = createRaAuth(sdk, config);
    await firstState(auth);
    await auth.changePassword('old', 'NewPassw0rd');
    assert.deepEqual(calls.changePassword, ['old', 'NewPassw0rd']);
    await auth.deleteAccount();
    assert.equal(calls.deleted, true);
    assert.equal(auth.currentUser, null);
    await auth.signOut();
    assert.equal(calls.signedOut, true);
});

test('getAccessToken returns the access token, or null when signed out', async () => {
    const { createRaAuth } = loadModule();
    assert.equal(await createRaAuth(makeSdk().sdk, config).getAccessToken(), 'access-jwt');
    assert.equal(await createRaAuth(makeSdk({ noStoredUser: true }).sdk, config).getAccessToken(), null);
    assert.equal(await createRaAuth(null, null).getAccessToken(), null);
});

test('setPhoneNumber normalises to E.164 and saves it without sending an SMS code', async () => {
    const { createRaAuth } = loadModule();
    const { sdk, calls } = makeSdk();
    const auth = createRaAuth(sdk, config);
    await firstState(auth);
    const user = await auth.setPhoneNumber(' +91 98765-43210 ');
    assert.deepEqual(JSON.parse(JSON.stringify(calls.updateAttributes.at(-1))), [['phone_number', '+919876543210']]);
    assert.equal(calls.codeRequested, undefined);
    assert.equal(user.phoneNumber, '+919876543210');
    assert.equal(auth.currentUser.phoneNumber, '+919876543210');
    assert.equal(auth.currentUser.phoneVerified, false);
});

test('setPhoneNumber refuses numbers without a country code, and an empty value removes the number', async () => {
    const { createRaAuth } = loadModule();
    const { sdk, calls } = makeSdk();
    const auth = createRaAuth(sdk, config);
    await firstState(auth);
    await assert.rejects(auth.setPhoneNumber('98765 43210'), (e) => e.code === 'InvalidPhoneNumber');
    assert.equal(calls.updateAttributes.length, 0);
    await auth.setPhoneNumber('+919876543210');
    const cleared = await auth.setPhoneNumber('');
    assert.deepEqual(JSON.parse(JSON.stringify(calls.deleteAttributes.at(-1))), ['phone_number']);
    assert.equal(cleared.phoneNumber, '');
});


test('a network error while restoring keeps the stored session and retries later', async () => {
    const { createRaAuth } = loadModule();
    const overrides = { sessionError: { code: 'NetworkError', name: 'NetworkError', message: 'Network error' } };
    const { sdk, calls } = makeSdk(overrides);
    const auth = createRaAuth(sdk, config);
    assert.equal(await firstState(auth), null);
    assert.equal(calls.signedOut, undefined, 'a network error must not sign the user out');
    assert.equal(auth.restorePending, true);
    // Connection back: the retry restores the same account without a new sign-in.
    delete overrides.sessionError;
    const user = await auth.retryRestore();
    assert.equal(user.email, 'ada@example.com');
    assert.equal(auth.currentUser.uid, 'sub-1');
    assert.equal(auth.restorePending, false);
});

test('throttling while restoring keeps the stored session', async () => {
    const { createRaAuth } = loadModule();
    for (const code of ['TooManyRequestsException', 'LimitExceededException', 'InternalErrorException']) {
        const { sdk, calls } = makeSdk({ sessionError: { code, message: 'Rate exceeded' } });
        assert.equal(await firstState(createRaAuth(sdk, config)), null);
        assert.equal(calls.signedOut, undefined, code);
    }
});

test('a network error reading the attributes keeps the user signed in from the ID token', async () => {
    const { createRaAuth } = loadModule();
    const overrides = {
        attributesError: { code: 'NetworkError', message: 'Network error' },
        payload: { sub: 'sub-1', email: 'ada@example.com', name: 'Ada', 'custom:simulator': 'iRacing' },
    };
    const { sdk, calls } = makeSdk(overrides);
    const user = await firstState(createRaAuth(sdk, config));
    assert.equal(calls.signedOut, undefined);
    assert.equal(user.uid, 'sub-1');
    assert.equal(user.email, 'ada@example.com');
    assert.equal(user.profile.simulator, 'iRacing');
});

test('a deleted account or an invalid refresh token still clears the stored session', async () => {
    const { createRaAuth } = loadModule();
    for (const overrides of [
        { attributesError: { code: 'UserNotFoundException', message: 'User does not exist.' } },
        { sessionError: { code: 'NotAuthorizedException', message: 'Invalid Refresh Token' } },
        { sessionError: { code: 'NotAuthorizedException', message: 'Refresh Token has been revoked' } },
    ]) {
        const { sdk, calls } = makeSdk(overrides);
        assert.equal(await firstState(createRaAuth(sdk, config)), null);
        assert.equal(calls.signedOut, true, JSON.stringify(overrides));
    }
});

test('restoring retries on its own after a transient failure', async () => {
    const { createRaAuth } = loadModule();
    const overrides = { sessionError: { code: 'NetworkError', message: 'Network error' } };
    const { sdk } = makeSdk(overrides);
    const auth = createRaAuth(sdk, config, { restoreRetryDelaysMs: [5] });
    const seen = [];
    auth.onAuthStateChanged((user) => seen.push(user && user.email));
    await firstState(auth);
    delete overrides.sessionError;
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.ok(seen.includes('ada@example.com'), JSON.stringify(seen));
});

test('passwordPolicyError enforces the Cognito policy: 8+ chars, upper, lower, digit', () => {
    const { passwordPolicyError, friendlyError } = loadModule();
    assert.equal(typeof passwordPolicyError, 'function');
    const message = friendlyError({ code: 'InvalidPasswordException' });
    assert.equal(passwordPolicyError('Abcdef12'), null);
    for (const bad of ['', 'Ab1', 'abcdefgh1', 'ABCDEFGH1', 'Abcdefgh', 'abcdefgh']) {
        assert.equal(passwordPolicyError(bad), message, bad);
    }
});
