import assert from 'node:assert/strict';
import test from 'node:test';
import { describeAccount, detailsFromForm, requestAccountProfile } from './account-profile.js';

const api = 'https://accounts.example.com';

const view = {
    sub: 'sub-1',
    email: 'driver@example.com',
    cognito: { name: 'Vignesh D', phone_number: '+919876543210', phone_number_verified: false },
    details: {
        full_name: 'Vignesh D',
        team: 'APEX Race Tech',
        car: 'Formula Vee',
        racing_class: 'FV1600',
        address: { street: '1 Pit Lane', city: 'Chennai', postal_code: '600001', country: 'IN' },
    },
    billing: { customer_name: 'Vignesh D', country: 'IN', state: 'Tamil Nadu', city: 'Chennai', street: null, zipcode: '600001', payment_id: 'pay_1', updated_at: '2027-01-02T10:00:00.000Z' },
    summary: {
        active_licences: 1,
        licences: [
            { licence_id: 'lic_1', product: 'desktop_beta', edition: 'standard', major_versions: [0, 1], state: 'active', issued_at: '2027-01-02T10:00:00.000Z', revoked_at: null },
            { licence_id: 'lic_0', product: 'desktop_v1', edition: 'standard', major_versions: [1], state: 'revoked', issued_at: '2026-12-01T10:00:00.000Z', revoked_at: '2026-12-05T10:00:00.000Z' },
        ],
        services: { plan: 'beta_included', until: '2027-03-31T18:29:59.000Z' },
    },
};

test('reads the profile with the ID token and saves details with PUT', async () => {
    const calls = [];
    const fetchProfile = async (url, options) => {
        calls.push({ url, options });
        return Response.json(view);
    };
    assert.deepEqual(await requestAccountProfile(api, 'id-token', null, fetchProfile), view);
    assert.equal(calls[0].url, `${api}/me/profile`);
    assert.equal(calls[0].options.method, 'GET');
    assert.equal(calls[0].options.redirect, 'error');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer id-token');
    assert.equal(calls[0].options.body, undefined);

    await requestAccountProfile(api, 'id-token', { team: 'APEX' }, fetchProfile);
    assert.equal(calls[1].options.method, 'PUT');
    assert.equal(calls[1].options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[1].options.body), { team: 'APEX' });
});

test('refuses a non-https API or a missing token without calling it', async () => {
    let called = false;
    const spy = async () => { called = true; return Response.json(view); };
    await assert.rejects(requestAccountProfile('http://accounts.example.com', 'id-token', null, spy), /unavailable/i);
    await assert.rejects(requestAccountProfile('https://user:pw@accounts.example.com', 'id-token', null, spy), /unavailable/i);
    await assert.rejects(requestAccountProfile(api, '', null, spy), /unavailable/i);
    assert.equal(called, false);
});

test('explains sign-in, unverified email and field errors, and hides other server details', async () => {
    const reply = (status, body) => async () => Response.json(body, { status });
    await assert.rejects(requestAccountProfile(api, 't', null, reply(401, {})), (e) => e.cause === 'signed_out');
    await assert.rejects(requestAccountProfile(api, 't', null, reply(403, { error: 'email_unverified' })), (e) => e.cause === 'email_unverified');
    await assert.rejects(
        requestAccountProfile(api, 't', {}, reply(400, { error: 'invalid_country', message: 'address.country must be a two-letter ISO country code.' })),
        (e) => e.cause === 'invalid' && /two-letter/.test(e.message),
    );
    await assert.rejects(requestAccountProfile(api, 't', null, reply(500, { message: 'stack trace here' })), (e) => !/stack/.test(e.message));
});

test('turns form values into a details body: trimmed, empties dropped, country upper case', () => {
    assert.deepEqual(
        detailsFromForm({
            full_name: ' Vignesh D ', team: 'APEX', car: '', racing_class: 'FV', phone_number: '+919876543210',
            street: '1 Pit Lane', city: 'Chennai', state: '', postal_code: '600001', country: 'in',
        }),
        { full_name: 'Vignesh D', team: 'APEX', racing_class: 'FV', address: { street: '1 Pit Lane', city: 'Chennai', postal_code: '600001', country: 'IN' } },
    );
    assert.deepEqual(detailsFromForm({ team: '', street: '', country: '' }), {});
});

test('describes details, licences, services and billing for display', () => {
    const shown = describeAccount(view);
    assert.deepEqual(shown.details, [
        ['Full name', 'Vignesh D'],
        ['Team', 'APEX Race Tech'],
        ['Car', 'Formula Vee'],
        ['Class', 'FV1600'],
        ['Phone', '+919876543210 (not verified)'],
        ['Billing address', '1 Pit Lane, Chennai, 600001, IN'],
    ]);
    assert.deepEqual(shown.licences, [
        { title: 'Beta licence (versions 0 and 1)', state: 'Active', date: 'Issued 2 Jan 2027' },
        { title: 'Version 1 licence', state: 'Revoked', date: 'Revoked 5 Dec 2026' },
    ]);
    assert.equal(shown.services, 'Services plan included with the beta until 31 Mar 2027');
    assert.equal(shown.billing, 'Vignesh D · Chennai, Tamil Nadu, 600001, IN');

    const empty = describeAccount({ details: {}, billing: null, summary: { active_licences: 0, licences: [], services: { plan: null, until: null } } });
    assert.deepEqual(empty.licences, []);
    assert.equal(empty.services, 'No services plan');
    assert.equal(empty.billing, null);
    assert.equal(empty.details[5][1], 'Not set');
    assert.equal(empty.details[4][1], 'Not set');
    // The live Cognito user wins over the stored token copy, which lags until the token refreshes.
    assert.equal(describeAccount(view, { number: '+919876543210', verified: true }).details[4][1], '+919876543210 (verified)');
});
