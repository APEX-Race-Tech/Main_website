const checkoutHosts = {
    test: 'test.checkout.dodopayments.com',
    live: 'checkout.dodopayments.com',
};

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
        throw new Error('Your account already has a beta licence.', { cause: 'already_licensed' });
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

function bindBetaCheckout() {
    const panel = document.getElementById('beta-checkout');
    const apiUrl = panel?.dataset.accountsApi;
    const mode = panel?.dataset.checkoutMode;
    const auth = window.RaAuth;
    if (!panel || !apiUrl || !Object.hasOwn(checkoutHosts, mode) || !auth?.configured) return;

    const button = document.getElementById('buy-beta-licence');
    const status = document.getElementById('beta-checkout-status');
    if (!button || !status) return;
    panel.hidden = false;
    if (mode === 'test') button.textContent = 'Open test checkout';
    button.addEventListener('click', async () => {
        button.disabled = true;
        status.textContent = 'Opening checkout…';
        const buyer = auth.currentUser?.uid;
        try {
            const idToken = await auth.getIdToken();
            if (!buyer || !idToken) {
                status.textContent = 'Sign in, then select the checkout button again.';
                document.getElementById('nav-signin-btn')?.click();
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
            window.location.assign(url);
        } catch (error) {
            status.textContent = error instanceof Error && ['already_licensed', 'signed_out', 'email_unverified'].includes(error.cause)
                ? error.message
                : 'Could not open checkout. Sign in again or try shortly.';
        } finally {
            button.disabled = false;
        }
    });
}

if (typeof document !== 'undefined') bindBetaCheckout();
