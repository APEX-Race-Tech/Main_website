/*
 * Account details in the profile window: team, car, class and billing address the
 * user enters, the phone number verified through Cognito by SMS, plus licences, the services plan and billing from the RACE Insight
 * accounts API (GET and PUT /me/profile). The API takes the account from the
 * Cognito ID token, never from the page. Values are written with textContent only.
 *
 * The section stays hidden until an accounts API URL is configured, on
 * #account-profile[data-accounts-api] or, failing that, #beta-checkout.
 */

const MESSAGES = {
    unavailable: 'Account details are unavailable. Please try again later.',
    failed: 'Could not load your account details. Please try again.',
};

const DETAIL_FIELDS = ['full_name', 'team', 'car', 'racing_class'];
const ADDRESS_FIELDS = ['street', 'city', 'state', 'postal_code', 'country'];
const PRODUCT_NAMES = { desktop_beta: 'Beta licence', desktop_v1: 'Version 1 licence' };

/** GET (body null) or PUT (body = details) /me/profile. Returns the profile view. */
export async function requestAccountProfile(apiUrl, idToken, body, fetchProfile = fetch) {
    let api;
    try {
        api = new URL(apiUrl);
    } catch {
        throw new Error(MESSAGES.unavailable);
    }
    if (api.protocol !== 'https:' || api.username || api.password || !idToken) throw new Error(MESSAGES.unavailable);
    const put = body !== null && body !== undefined;
    const response = await fetchProfile(`${api.origin}/me/profile`, {
        method: put ? 'PUT' : 'GET',
        redirect: 'error',
        headers: put ? { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' } : { Authorization: `Bearer ${idToken}` },
        body: put ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => null);
    if (response.status === 401) throw new Error('Sign in again to see your account details.', { cause: 'signed_out' });
    if (response.status === 403 && result?.error === 'email_unverified') {
        throw new Error('Verify your account email first.', { cause: 'email_unverified' });
    }
    // Field errors come from the API's own fixed messages, which are safe to show.
    if (response.status === 400 && typeof result?.message === 'string') throw new Error(result.message.slice(0, 200), { cause: 'invalid' });
    if (!response.ok || !result || typeof result !== 'object') throw new Error(MESSAGES.failed);
    return result;
}

/** The PUT body from form values: trimmed, empty fields left out, country upper case. */
export function detailsFromForm(values) {
    const clean = (value) => String(value ?? '').trim();
    const details = {};
    for (const key of DETAIL_FIELDS) {
        const value = clean(values[key]);
        if (value) details[key] = value;
    }
    const address = {};
    for (const key of ADDRESS_FIELDS) {
        const value = clean(values[key]);
        if (value) address[key] = key === 'country' ? value.toUpperCase() : value;
    }
    if (Object.keys(address).length > 0) details.address = address;
    return details;
}

function formatDate(iso) {
    const date = new Date(iso);
    if (!iso || Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function joinParts(parts) {
    return parts.filter((part) => typeof part === 'string' && part.trim()).join(', ');
}

function licenceTitle(licence) {
    const name = PRODUCT_NAMES[licence.product] || 'Licence';
    const versions = Array.isArray(licence.major_versions) ? licence.major_versions : [];
    if (licence.product === 'desktop_beta' && versions.length > 1) {
        return `${name} (versions ${versions.slice(0, -1).join(', ')} and ${versions[versions.length - 1]})`;
    }
    return name;
}

function describePhone(phone) {
    if (!phone?.number) return 'Not set';
    return `${phone.number} (${phone.verified ? 'verified' : 'not verified'})`;
}

/**
 * Display text for the profile window. phone is the live Cognito value; without it
 * the copy stored from the last ID token is used.
 */
export function describeAccount(view, phone) {
    const storedPhone = { number: view?.cognito?.phone_number, verified: view?.cognito?.phone_number_verified === true };
    const details = view?.details || {};
    const address = details.address || {};
    const notSet = (value) => value || 'Not set';
    const summary = view?.summary || {};
    const services = summary.services || {};
    const billing = view?.billing;
    const billingPlace = billing ? joinParts([billing.street, billing.city, billing.state, billing.zipcode, billing.country]) : '';
    return {
        details: [
            ['Full name', notSet(details.full_name)],
            ['Team', notSet(details.team)],
            ['Car', notSet(details.car)],
            ['Class', notSet(details.racing_class)],
            ['Phone', describePhone(phone || storedPhone)],
            ['Billing address', notSet(joinParts([address.street, address.city, address.state, address.postal_code, address.country]))],
        ],
        licences: (summary.licences || []).map((licence) => {
            const revoked = licence.state === 'revoked';
            return {
                title: licenceTitle(licence),
                state: revoked ? 'Revoked' : 'Active',
                date: revoked ? `Revoked ${formatDate(licence.revoked_at)}` : `Issued ${formatDate(licence.issued_at)}`,
            };
        }),
        services:
            services.plan === 'beta_included'
                ? services.until
                    ? `Services plan included with the beta until ${formatDate(services.until)}`
                    : 'Services plan included with the beta'
                : 'No services plan',
        billing: billing ? [billing.customer_name, billingPlace].filter(Boolean).join(' · ') || null : null,
    };
}

function apiUrlFromPage() {
    const own = document.getElementById('account-profile')?.dataset.accountsApi;
    return own || document.getElementById('beta-checkout')?.dataset.accountsApi || '';
}

function renderDetails(list, rows) {
    list.replaceChildren(
        ...rows.map(([label, value]) => {
            const item = document.createElement('div');
            item.className = 'profile-detail';
            const term = document.createElement('dt');
            term.textContent = label;
            const description = document.createElement('dd');
            description.textContent = value;
            item.append(term, description);
            return item;
        }),
    );
}

function renderLicences(list, licences) {
    if (licences.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'account-list__empty';
        empty.textContent = 'No licence on this account yet.';
        list.replaceChildren(empty);
        return;
    }
    list.replaceChildren(
        ...licences.map((licence) => {
            const item = document.createElement('li');
            item.className = 'account-list__item';
            const title = document.createElement('strong');
            title.textContent = licence.title;
            const state = document.createElement('span');
            state.className = `profile-badge account-state account-state--${licence.state.toLowerCase()}`;
            state.textContent = licence.state;
            const date = document.createElement('small');
            date.textContent = licence.date;
            item.append(title, state, date);
            return item;
        }),
    );
}

function fillForm(form, view, phoneNumber) {
    const details = view?.details || {};
    const address = details.address || {};
    for (const key of DETAIL_FIELDS) if (form.elements[key]) form.elements[key].value = details[key] || '';
    for (const key of ADDRESS_FIELDS) if (form.elements[key]) form.elements[key].value = address[key] || '';
    if (form.elements.phone_number) form.elements.phone_number.value = phoneNumber || '';
}

function bindAccountProfile() {
    const section = document.getElementById('account-profile');
    const auth = window.RaAuth;
    const apiUrl = apiUrlFromPage();
    if (!section || !auth?.configured || !apiUrl) return;

    const status = document.getElementById('account-profile-status');
    const detailsList = document.getElementById('account-details-list');
    const licenceList = document.getElementById('account-licences');
    const servicesLine = document.getElementById('account-services');
    const billingLine = document.getElementById('account-billing');
    // The fields sit inside the Edit profile form; js/race-insight.js calls save() on submit.
    const fields = document.getElementById('account-details-fields');
    const form = document.getElementById('update-profile-form');
    const formStatus = document.getElementById('account-details-form-status');
    const phoneVerify = document.getElementById('phone-verify');
    const phoneVerifyText = document.getElementById('phone-verify-text');
    const phoneCode = document.getElementById('phone-code');
    const phoneVerifyButton = document.getElementById('phone-verify-btn');
    const phoneResendButton = document.getElementById('phone-resend-btn');
    if (!status || !detailsList || !licenceList || !servicesLine || !billingLine || !fields || !form) return;

    section.hidden = false;
    fields.hidden = false;
    let current = null;
    let currentOwner = null;
    let loading = null;

    function livePhone() {
        const user = auth.currentUser;
        return user ? { number: user.phoneNumber, verified: user.phoneVerified } : null;
    }

    /** Shows the code entry while the saved phone number is unverified. */
    function showPhoneVerify(message) {
        if (!phoneVerify) return;
        const phone = livePhone();
        const pending = !!(phone?.number && !phone.verified);
        phoneVerify.hidden = !pending;
        if (phoneVerifyText) {
            phoneVerifyText.textContent = message || (pending ? `Enter the 6-digit code sent by SMS to ${phone.number}.` : '');
        }
        if (!pending && phoneCode) phoneCode.value = '';
    }

    function show(view, owner) {
        current = view;
        currentOwner = owner;
        const shown = describeAccount(view, livePhone());
        renderDetails(detailsList, shown.details);
        renderLicences(licenceList, shown.licences);
        servicesLine.textContent = shown.services;
        billingLine.textContent = shown.billing || 'No payment yet.';
        fillForm(form, view, auth.currentUser?.phoneNumber);
        showPhoneVerify();
        status.textContent = '';
    }

    function authError(error) {
        return typeof auth.friendlyError === 'function' ? auth.friendlyError(error) : MESSAGES.failed;
    }

    function errorText(error) {
        return error instanceof Error && ['signed_out', 'email_unverified', 'invalid'].includes(error.cause) ? error.message : MESSAGES.failed;
    }

    async function load() {
        if (loading) return loading;
        loading = (async () => {
            const owner = auth.currentUser?.uid;
            if (!owner) return;
            status.textContent = 'Loading account details…';
            try {
                const view = await requestAccountProfile(apiUrl, await auth.getIdToken(), null);
                // Ignore a reply that arrives after the account changed.
                if (auth.currentUser?.uid === owner) show(view, owner);
            } catch (error) {
                status.textContent = errorText(error);
            }
        })().finally(() => {
            loading = null;
        });
        return loading;
    }

    /**
     * Saves team, car and billing address, then the phone number, from the Edit
     * profile form. Resolves { phoneCodeSent } when an SMS code is waiting. Throws an
     * Error whose message is safe to show. Refuses to save when the current details
     * were never loaded, so an empty form cannot wipe them.
     */
    async function save() {
        const owner = auth.currentUser?.uid;
        if (!owner) throw new Error('Sign in again to save your account details.');
        if (!current || currentOwner !== owner) throw new Error('Your account details could not be loaded, so they were not saved.');
        if (formStatus) formStatus.textContent = 'Saving…';
        try {
            const values = Object.fromEntries(new FormData(form).entries());
            const view = await requestAccountProfile(apiUrl, await auth.getIdToken(), detailsFromForm(values));
            if (auth.currentUser?.uid === owner) show(view, owner);
            if (formStatus) formStatus.textContent = '';
        } catch (error) {
            const message = errorText(error);
            if (formStatus) formStatus.textContent = message;
            throw new Error(message);
        }
        if (!form.elements.phone_number || typeof auth.setPhoneNumber !== 'function') return { phoneCodeSent: false };
        try {
            const result = await auth.setPhoneNumber(form.elements.phone_number.value);
            if (auth.currentUser?.uid !== owner) return { phoneCodeSent: false };
            renderDetails(detailsList, describeAccount(current, livePhone()).details);
            showPhoneVerify();
            return { phoneCodeSent: !!result?.codeSent };
        } catch (error) {
            const message = `Phone number not saved. ${authError(error)}`;
            if (formStatus) formStatus.textContent = message;
            throw new Error(message);
        }
    }

    phoneVerifyButton?.addEventListener('click', async () => {
        const code = phoneCode?.value.trim() || '';
        if (!/^\d{6}$/.test(code)) {
            showPhoneVerify('Enter the 6-digit code from the SMS.');
            return;
        }
        phoneVerifyButton.disabled = true;
        try {
            await auth.verifyPhoneCode(code);
            renderDetails(detailsList, describeAccount(current, livePhone()).details);
            showPhoneVerify();
            if (formStatus) formStatus.textContent = 'Phone number verified.';
        } catch (error) {
            showPhoneVerify(authError(error));
        } finally {
            phoneVerifyButton.disabled = false;
        }
    });
    phoneResendButton?.addEventListener('click', async () => {
        phoneResendButton.disabled = true;
        try {
            await auth.sendPhoneCode();
            showPhoneVerify(`A new code was sent to ${auth.currentUser?.phoneNumber || 'your phone'}.`);
        } catch (error) {
            showPhoneVerify(authError(error));
        } finally {
            phoneResendButton.disabled = false;
        }
    });

    window.RaAccountProfile = Object.freeze({ save });

    for (const id of ['nav-profile-btn', 'mobile-nav-profile-btn']) document.getElementById(id)?.addEventListener('click', load);
    document.querySelectorAll('a[href="#profile"]').forEach((link) => link.addEventListener('click', load));
    document.getElementById('edit-profile-btn')?.addEventListener('click', () => {
        fillForm(form, current, auth.currentUser?.phoneNumber);
        showPhoneVerify();
        if (formStatus) formStatus.textContent = current ? '' : 'Account details are still loading.';
    });
    auth.onAuthStateChanged((user) => {
        if (user) {
            load();
        } else {
            current = null;
            currentOwner = null;
            status.textContent = '';
            fillForm(form, null, '');
            showPhoneVerify();
        }
    });
}

if (typeof document !== 'undefined') bindAccountProfile();
