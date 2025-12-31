/**
 * The base URL for all API requests.
 * This should be configured to point to the backend server.
 * Security: In production, use HTTPS and environment variables.
 */
const API_BASE_URL = 'http://localhost:3001/api';

// Security: Input sanitization helper
function sanitizeInput(input, maxLength = 1000) {
    if (!input || typeof input !== 'string') return '';
    return input.trim().slice(0, maxLength).replace(/[<>\"']/g, '');
}

function validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim()) && email.length <= 254;
}

/**
 * Submits the waitlist form data to the backend API.
 * @param {FormData} formData The data from the waitlist form.
 * @returns {Promise<{success: boolean, message: string}>} An object indicating the result of the API call.
 */
export const joinWaitlist = async (formData) => {
    try {
        // Security: Sanitize and validate inputs
        const name = sanitizeInput(formData.get('name') || '', 100);
        const email = formData.get('email') || '';
        if (!validateEmail(email)) {
            return { success: false, message: 'Invalid email address.' };
        }
        const simulator = sanitizeInput(formData.get('simulator') || '', 50);
        const experience = sanitizeInput(formData.get('experience') || '', 50);
        const currentAnalysis = sanitizeInput(formData.get('analysis') || 'Not specified', 200);
        const expectations = sanitizeInput(formData.get('expectations') || '', 500);
        
        const response = await fetch(`${API_BASE_URL}/waitlist`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: name,
                email: email.trim(),
                simulator: simulator,
                experience: experience,
                currentAnalysis: currentAnalysis,
                expectations: expectations,
                subscribeToNewsletter: formData.get('newsletter') === 'on',
                timestamp: new Date().toISOString()
            }),
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to join waitlist');
        }

        return { success: true, message: data.message };
    } catch (error) {
        console.error('Error joining waitlist:', error);
        return { success: false, message: error.message };
    }
};

/**
 * Submits the contact form data to the backend API.
 * @param {FormData} formData The data from the contact form.
 * @returns {Promise<{success: boolean, message: string}>} An object indicating the result of the API call.
 */
export async function sendContactForm(formData) {
    try {
        // Security: Sanitize and validate inputs
        const name = sanitizeInput(formData.get('name') || '', 100);
        const email = formData.get('email') || '';
        if (!validateEmail(email)) {
            return { success: false, message: 'Invalid email address.' };
        }
        const message = sanitizeInput(formData.get('message') || '', 2000);
        
        if (!message || message.length < 10) {
            return { success: false, message: 'Message must be at least 10 characters long.' };
        }
        
        const response = await fetch(`${API_BASE_URL}/contact`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: name,
                email: email.trim(),
                message: message
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to send message');
        }

        return { success: true, message: data.message };
    } catch (error) {
        console.error('Contact form error:', error);
        return { 
            success: false, 
            message: error.message || 'An error occurred. Please try again.'
        };
    }
}
