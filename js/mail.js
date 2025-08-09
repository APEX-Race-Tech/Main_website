// Toast with null-safe fallback
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) {
        type === 'error' ? alert(message) : console.log(message);
        return;
    }
    toast.textContent = message;
    toast.className = `show ${type}`;
    setTimeout(() => {
        toast.className = toast.className.replace(`show ${type}`, '');
    }, 3000);
}

// GA4 tracking helper (no-op if gtag unavailable)
function trackEvent(eventName, params = {}) {
    try {
        if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
            window.gtag('event', eventName, params);
        }
    } catch (_) { /* no-op */ }
}

// Lightweight confetti burst (uses canvas-confetti CDN injected in index.html)
function fireConfetti() {
    if (typeof window === 'undefined' || typeof window.confetti !== 'function') return;
    const duration = 1200;
    const end = Date.now() + duration;

    (function frame() {
        // Left and right bursts
        window.confetti({ particleCount: 2, angle: 60, spread: 55, origin: { x: 0 } });
        window.confetti({ particleCount: 2, angle: 120, spread: 55, origin: { x: 1 } });
        if (Date.now() < end) requestAnimationFrame(frame);
    })();
    // Center pop
    window.confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 }
    });
}

// Enhance waitlist form UX
(function initWaitlistForm() {
    const form = document.getElementById('waitlist-form');
    if (!form) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    const defaultBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    let submitting = false;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (submitting) return; // prevent double submits

        // Basic front-end validation
        if (!form.checkValidity()) {
            showToast('Please complete the required fields.', 'error');
            return;
        }

        try {
            submitting = true;
            if (submitBtn) {
                submitBtn.classList.add('btn-disabled');
                submitBtn.setAttribute('aria-disabled', 'true');
                submitBtn.innerHTML = '<span class="loader"></span> Submitting...';
            }

            const formData = new FormData(form);
            const res = await fetch(form.action, { method: 'POST', body: formData });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            await res.text();
            showToast('Successfully submitted! Thank you for joining.', 'success');
            trackEvent('waitlist_submit', {
                form_name: 'waitlist',
                method: 'google_apps_script'
            });
            fireConfetti();
            form.reset();
        } catch (err) {
            console.error(err);
            showToast('❌ Submission failed. Please try again.', 'error');
        } finally {
            submitting = false;
            if (submitBtn) {
                submitBtn.classList.remove('btn-disabled');
                submitBtn.removeAttribute('aria-disabled');
                submitBtn.innerHTML = defaultBtnHtml;
            }
        }
    });
})();

// Track CTA clicks (e.g., Join Waitlist buttons)
(function initCTAEvents() {
    const ctaSelectors = [
        'a[href="#waitlist"]',
        '.sticky-cta a',
        '.btn.btn-primary[href="#waitlist"]'
    ];
    const ctas = document.querySelectorAll(ctaSelectors.join(','));
    if (!ctas.length) return;

    ctas.forEach((el) => {
        el.addEventListener('click', () => {
            const section = el.closest('section');
            const location = section ? section.id : 'global';
            const text = (el.textContent || '').trim().toLowerCase();
            trackEvent('cta_click', {
                cta_label: text || 'join_waitlist',
                destination: '#waitlist',
                location
            });
        }, { passive: true });
    });
})();

// Track section views for FAQ / Waitlist / Contact
(function initSectionViews() {
    const targets = ['faq', 'waitlist', 'contact']
        .map((id) => document.getElementById(id))
        .filter(Boolean);
    if (!targets.length || !('IntersectionObserver' in window)) return;

    const seen = new Set();
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                const id = entry.target.id || 'unknown';
                if (seen.has(id)) return;
                seen.add(id);
                trackEvent('section_view', { section_id: id });
            }
        });
    }, { threshold: [0.5] });

    targets.forEach((el) => observer.observe(el));
})();
// Enhance contact form UX (Web3Forms) with AJAX and confetti
(function initContactForm() {
    const form = document.querySelector('form.contact-form');
    if (!form) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    const defaultBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    let submitting = false;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (submitting) return;

        if (!form.checkValidity()) {
            showToast('Please complete the required fields.', 'error');
            return;
        }

        try {
            submitting = true;
            if (submitBtn) {
                submitBtn.classList.add('btn-disabled');
                submitBtn.setAttribute('aria-disabled', 'true');
                submitBtn.innerHTML = '<span class="loader"></span> Sending...';
            }

            const formData = new FormData(form);
            const res = await fetch(form.action, { method: 'POST', body: formData, headers: { Accept: 'application/json' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            // Web3Forms returns JSON when Accept header is set
            await res.json().catch(() => null);
            showToast("Thanks! We'll get back to you soon.", 'success');
            trackEvent('contact_submit', {
                form_name: 'contact',
                method: 'web3forms'
            });
            fireConfetti();
            form.reset();
        } catch (err) {
            console.error(err);
            showToast('❌ Message failed to send. Please try again.', 'error');
        } finally {
            submitting = false;
            if (submitBtn) {
                submitBtn.classList.remove('btn-disabled');
                submitBtn.removeAttribute('aria-disabled');
                submitBtn.innerHTML = defaultBtnHtml;
            }
        }
    });
})();