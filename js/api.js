/**
 * The base URL for all API requests.
 * This should be configured to point to the backend server.
 */
const API_BASE_URL = 'http://localhost:3001/api';

/**
 * Submits the waitlist form data to the backend API.
 * @param {FormData} formData The data from the waitlist form.
 * @returns {Promise<{success: boolean, message: string}>} An object indicating the result of the API call.
 */
export const joinWaitlist = async (formData) => {
    try {
        const response = await fetch(`${API_BASE_URL}/waitlist`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: formData.get('name'),
                email: formData.get('email'),
                simulator: formData.get('simulator'),
                experience: formData.get('experience'),
                currentAnalysis: formData.get('analysis') || 'Not specified',
                expectations: formData.get('expectations'),
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
        const response = await fetch(`${API_BASE_URL}/contact`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: formData.get('name'),
                email: formData.get('email'),
                message: formData.get('message')
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
