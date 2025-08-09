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