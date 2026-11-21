const checkoutHosts = {
    test: 'test.checkout.dodopayments.com',
    live: 'checkout.dodopayments.com',
};

export const ALREADY_LICENSED_MESSAGE = 'Your account already has an early access licence. Use "Already have a licence? Download" below.';

/**
 * Stores the selected operating system before leaving for checkout, so the page can start that
 * installer when Dodo sends the buyer back (js/download-flow.js reads it).
 */
export function rememberSelectedPlatform(doc, flow) {
    const platform = doc.querySelector?.('.platform-btn.selected')?.dataset?.platform;
    if (!platform || !flow) return false;
    let storage = null;
    try { storage = globalThis.localStorage; } catch { storage = null; }
    return flow.rememberPlatform(storage, platform);
}

/**
 * The server decides whether the early access is open. This only chooses what the page
 * shows, so a visitor with a wrong clock cannot buy early or late.
 */
export function betaPhase(opensAt, endsAt, now = new Date()) {
    const opens = opensAt ? new Date(opensAt) : null;
    const ends = endsAt ? new Date(endsAt) : null;
    if (opens && !Number.isNaN(opens.getTime()) && now < opens) return 'not_open';
    if (ends && !Number.isNaN(ends.getTime()) && now >= ends) return 'closed';
    return 'open';
}

export async function requestBetaCheckout(apiUrl, mode, idToken, fetchCheckout = fetch) {
    const api = new URL(apiUrl);
    if (api.protocol !== 'https:' || api.username || api.password || !Object.hasOwn(checkoutHosts, mode) || !idToken) {
        throw new Error('Checkout is unavailable. Please try again later.');
    }
    const response = await fetchCheckout(`${api.origin}/checkout`, {
        method: 'POST',
        redirect: 'error',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: 'desktop_beta' }),
        signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => null);
    if (response.status === 409 && result?.error === 'already_licensed') {
        throw new Error(ALREADY_LICENSED_MESSAGE, { cause: 'already_licensed' });
    }
    if (response.status === 403 && result?.error === 'beta_not_open') {
        throw new Error('Early access purchases open on 1 January 2027.', { cause: 'beta_not_open' });
    }
    if (response.status === 403 && result?.error === 'beta_closed') {
        throw new Error('The early access has ended. The full licence will be on sale after the early access.', { cause: 'beta_closed' });
    }
    if (response.status === 401) throw new Error('Sign in again, then retry checkout.', { cause: 'signed_out' });
    if (response.status === 403 && result?.error === 'email_unverified') {
        throw new Error('Verify your account email before buying a licence.', { cause: 'email_unverified' });
    }
    if (!response.ok || typeof result?.url !== 'string') {
        throw new Error('Could not open checkout. Please try again.');
    }
    const checkout = new URL(result.url);
    if (checkout.protocol !== 'https:' || checkout.host !== checkoutHosts[mode] || checkout.username ||
        checkout.password || !checkout.pathname.startsWith('/session/')) {
        throw new Error('Could not open checkout. Please try again.');
    }
    return checkout.href;
}

/** Status text for the panel when the buy button cannot open checkout. */
export function unavailableMessage(phase, checkoutConfigured) {
    if (phase === 'not_open') return 'Early access purchases open on 1 January 2027.';
    if (phase === 'closed') return 'The early access has ended. The full licence will be on sale after the early access.';
    return checkoutConfigured ? '' : 'Online checkout opens soon. Until then, email info@apexracetech.in to buy a licence.';
}

/**
 * Shows the panel and keeps the buy button in step with the early access window. A tab opened
 * before the opening (or left open past the end) changes at that instant, and again whenever the
 * visitor comes back to the tab, because timers can stop while a computer sleeps.
 *   env.document, env.window  the page (tests pass fakes)
 *   env.now                   function returning the current Date (tests)
 *   env.schedule              function (isoTime, callback) returning a cancel function;
 *                             defaults to RaRelease.scheduleAt from js/release-feed.js
 */
export function bindBetaCheckout(env = {}) {
    const doc = env.document ?? globalThis.document;
    const win = env.window ?? globalThis.window;
    const now = env.now ?? (() => new Date());
    const panel = doc.getElementById('beta-checkout');
    const button = doc.getElementById('buy-beta-licence');
    const status = doc.getElementById('beta-checkout-status');
    if (!panel || !button || !status) return;
    const apiUrl = panel.dataset.accountsApi;
    const mode = panel.dataset.checkoutMode;
    const auth = win?.RaAuth;
    const checkoutConfigured = Boolean(apiUrl) && Object.hasOwn(checkoutHosts, mode) && Boolean(auth?.configured);
    const opensAt = panel.dataset.betaOpensAt;
    const endsAt = panel.dataset.betaEndsAt;

    // The panel (opening date and price) shows even without checkout; only the button stays disabled.
    panel.hidden = false;
    if (!checkoutConfigured) {
        button.disabled = true;
        status.textContent = unavailableMessage(betaPhase(opensAt, endsAt, now()), checkoutConfigured);
        return;
    }

    let busy = false;
    let labelled = false;
    let shownPhase = null;
    // The server decides; this only chooses whether the button can be pressed right now.
    function applyPhase() {
        const phase = betaPhase(opensAt, endsAt, now());
        if (phase !== 'open') {
            button.disabled = true;
            status.textContent = unavailableMessage(phase, checkoutConfigured);
        } else {
            if (!busy) button.disabled = false;
            if (shownPhase !== 'open') status.textContent = '';
            if (mode === 'test' && !labelled) {
                // Test checkout drops the price so the label does not promise a real charge.
                button.textContent = 'Open test checkout';
                button.removeAttribute?.('aria-label');
                labelled = true;
            }
        }
        shownPhase = phase;
        return phase;
    }
    applyPhase();
    const schedule = env.schedule ?? win?.RaRelease?.scheduleAt;
    if (typeof schedule === 'function') {
        for (const at of [opensAt, endsAt]) if (at) schedule(at, applyPhase);
    }
    win?.addEventListener?.('pageshow', applyPhase);
    doc.addEventListener?.('visibilitychange', () => {
        if (doc.visibilityState !== 'hidden') applyPhase();
    });

    button.addEventListener('click', async () => {
        if (busy || applyPhase() !== 'open') return;
        busy = true;
        button.disabled = true;
        status.textContent = 'Opening checkout…';
        const buyer = auth.currentUser?.uid;
        try {
            const idToken = await auth.getIdToken();
            if (!buyer || !idToken) {
                status.textContent = 'Sign in, then select the checkout button again.';
                doc.getElementById('nav-signin-btn')?.click();
                return;
            }
            if (auth.currentUser?.uid !== buyer) {
                status.textContent = 'Your account changed. Select the checkout button again.';
                return;
            }
            const url = await requestBetaCheckout(apiUrl, mode, idToken);
            if (auth.currentUser?.uid !== buyer) {
                status.textContent = 'Your account changed. Select the checkout button again.';
                return;
            }
            status.textContent = '';
            rememberSelectedPlatform(doc, win?.RaDownloadFlow);
            win.location.assign(url);
        } catch (error) {
            status.textContent = error instanceof Error && ['already_licensed', 'signed_out', 'email_unverified', 'beta_not_open', 'beta_closed'].includes(error.cause)
                ? error.message
                : 'Could not open checkout. Sign in again or try shortly.';
        } finally {
            busy = false;
            if (betaPhase(opensAt, endsAt, now()) === 'open') button.disabled = false;
        }
    });
}

if (typeof document !== 'undefined') bindBetaCheckout();
