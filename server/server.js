require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware Setup ---
// Middleware functions are used to add security, parse requests, and handle cross-origin policies.
app.use(helmet());
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5500', // Use environment variable for CORS origin
    optionsSuccessStatus: 200
}));
app.use(bodyParser.json());

// --- Rate Limiting ---
// Basic rate-limiting middleware to prevent abuse of the API endpoints.
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// --- File Paths ---
// Define constant paths for storing data to ensure consistency.
const DATA_DIR = path.join(__dirname, 'data');
const WAITLIST_PATH = path.join(DATA_DIR, 'waitlist.json');
const MESSAGES_PATH = path.join(DATA_DIR, 'messages.json');

/**
 * Ensures that the data directory and necessary JSON files exist before the server starts.
 * This prevents errors that would occur if the server tried to read from or write to a file that doesn't exist.
 */
async function ensureDataDirectory() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        const filesToEnsure = [WAITLIST_PATH, MESSAGES_PATH];
        for (const filePath of filesToEnsure) {
            try {
                await fs.access(filePath);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    await fs.writeFile(filePath, JSON.stringify([], null, 2));
                } else {
                    throw error; // Re-throw other errors
                }
            }
        }
    } catch (error) {
        console.error('Error setting up data directory:', error);
        throw new Error('Failed to set up data directory. Server cannot start.');
    }
}

// --- Email Configuration ---
// Sets up the nodemailer transport for sending emails using Gmail.
// Credentials are loaded from environment variables for security.
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * A helper function to wrap the nodemailer `sendMail` call in a try-catch block.
 * This simplifies error handling when sending emails.
 * @param {object} mailOptions - The mail options object for nodemailer.
 * @returns {Promise<{success: boolean, error?: string}>} - The result of the email sending operation.
 */
async function sendEmail(mailOptions) {
    try {
        await transporter.sendMail(mailOptions);
        return { success: true };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error: error.message };
    }
}

// --- API Endpoint: /api/waitlist ---
/**
 * Handles POST requests to add a new user to the waitlist.
 * 1. Validates the incoming data.
 * 2. Reads the existing waitlist from `waitlist.json`.
 * 3. Checks for duplicate email addresses.
 * 4. Appends the new entry to the waitlist and saves the file.
 * 5. Sends a confirmation email to the user and a notification to the admin.
 * 6. Returns a success or error response.
 */
app.post('/api/waitlist', async (req, res) => {
    try {
        const { name, email, simulator, experience, currentAnalysis, expectations, subscribeToNewsletter } = req.body;
        
        // Basic validation
        if (!name || name.trim().length < 2) {
            return res.status(400).json({ success: false, message: 'Please provide your name' });
        }
        
        if (!email || !email.includes('@')) {
            return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
        }
        
        if (!simulator) {
            return res.status(400).json({ success: false, message: 'Please select your primary simulator' });
        }
        
        if (!experience) {
            return res.status(400).json({ success: false, message: 'Please select your experience level' });
        }
        
        // Read existing waitlist
        let waitlist = [];
        try {
            const fileContent = await fs.readFile(WAITLIST_PATH, 'utf8');
            waitlist = JSON.parse(fileContent);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File does not exist, waitlist remains empty
                waitlist = [];
            } else {
                throw error; // Re-throw other errors
            }
        }
        
        // Check if email already exists
        if (waitlist.some(entry => entry.email === email)) {
            return res.status(409).json({ success: false, message: 'This email is already on the waitlist' }); // 409 Conflict
        }
        
        // Create waitlist entry
        const waitlistEntry = {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            simulator,
            experience,
            currentAnalysis: currentAnalysis || 'Not specified',
            expectations,
            subscribeToNewsletter: !!subscribeToNewsletter,
            timestamp: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        // Add to waitlist
        waitlist.push(waitlistEntry);
        
        // Save to file
        await fs.writeFile(WAITLIST_PATH, JSON.stringify(waitlist, null, 2));
        
        // Send confirmation email to user
        // Email brand color constants
        const BRAND = '#f53518';
        const TEXT = '#333333';
        const PANEL = '#f9f9f9';
        const BORDER = '#eeeeee';
        const MUTED = '#777777';

        await sendEmail({
            from: `"APEX Race Technologies" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'You\'re on the APEX Race Technologies Waitlist!',
            text: `Hi ${name},

Thank you for joining our waitlist! We\'re excited to have you on board.

Here are the details you provided:
- Name: ${name}
- Primary Simulator: ${simulator}
- Experience Level: ${experience}
- Current Analysis: ${currentAnalysis || 'Not specified'}
- Expectations: ${expectations}

We\'ll notify you as soon as we launch our products. In the meantime, feel free to reply to this email if you have any questions!

Best regards,
The APEX Race Technologies Team`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: ${TEXT}; line-height: 1.6;">
                    <h2 style="color: ${BRAND};">Welcome to APEX Race Technologies!</h2>
                    <p>Hi ${name},</p>
                    <p>Thank you for joining our waitlist! We\'re excited to have you on board.</p>
                    
                    <div style="background: ${PANEL}; padding: 15px; border-left: 4px solid ${BRAND}; margin: 20px 0;">
                        <p><strong>Your Details:</strong></p>
                        <ul style="margin: 10px 0 0 20px; padding: 0;">
                            <li><strong>Name:</strong> ${name}</li>
                            <li><strong>Primary Simulator:</strong> ${simulator}</li>
                            <li><strong>Experience Level:</strong> ${experience}</li>
                            <li><strong>Current Analysis:</strong> ${currentAnalysis || 'Not specified'}</li>
                            <li><strong>Your Expectations:</strong> ${expectations}</li>
                        </ul>
                    </div>
                    
                    <p>We\'ll notify you as soon as we launch our products. In the meantime, feel free to reply to this email if you have any questions!</p>
                    
                    <p>Best regards,<br><strong>The APEX Race Technologies Team</strong></p>
                    
                    <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid ${BORDER}; font-size: 12px; color: ${MUTED};">
                        <p>${subscribeToNewsletter ? 'You are subscribed to our newsletter. You can unsubscribe anytime by clicking the link in the email.' : ''}</p>
                        <p>APEX Race Technologies<br>${new Date().getFullYear()}</p>
                    </div>
                </div>
            `
        });
        
        // Send notification to admin
        await sendEmail({
            from: `"APEX Race Technologies Waitlist" <${process.env.EMAIL_USER}>`,
            to: process.env.ADMIN_EMAIL,
            subject: `New Waitlist Signup: ${name}`,
            text: `New waitlist signup:

Name: ${name}
Email: ${email}
Simulator: ${simulator}
Experience: ${experience}
Current Analysis: ${currentAnalysis || 'Not specified'}
Expectations: ${expectations}

Timestamp: ${new Date().toISOString()}`
        });
        
        res.status(201).json({ 
            success: true, 
            message: 'Thank you for joining our waitlist! We\'ll be in touch soon.' 
        }); // 201 Created
        
    } catch (error) {
        console.error('Error adding to waitlist:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred while processing your request. Please try again.' 
        });
    }
});

// --- API Endpoint: /api/contact ---
/**
 * Handles POST requests from the contact form.
 * 1. Validates the incoming data.
 * 2. Appends the new message to `messages.json`.
 * 3. Sends a notification email to the admin and a confirmation email to the user.
 * 4. Returns a success or error response.
 */
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, message } = req.body;
        
        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Name, email, and message are required' });
        }
        
        if (!/\S+@\S+\.\S+/.test(email)) {
            return res.status(400).json({ error: 'Valid email is required' });
        }
        
        const messages = JSON.parse(await fs.readFile(MESSAGES_PATH, 'utf8'));
        const timestamp = new Date().toISOString();
        
        messages.push({ name, email, message, timestamp });
        await fs.writeFile(MESSAGES_PATH, JSON.stringify(messages, null, 2));
        
        // Send email notification
        await sendEmail({
            from: `"${name}" <${email}>`,
            to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
            subject: `New Contact Form Submission from ${name}`,
            text: `
                Name: ${name}
                Email: ${email}
                Message: ${message}
                
                Timestamp: ${timestamp}
            `
        });
        
        // Send confirmation to user
        await sendEmail({
            from: `"APEX Race Technologies" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Message Received - APEX Race Technologies',
            html: `
                <h2>Thank you for contacting APEX Race Technologies!</h2>
                <p>We've received your message and will get back to you as soon as possible.</p>
                <h4>Your Message:</h4>
                <p>${message.replace(/\n/g, '<br>')}</p>
                <p>Best regards,<br>APEX Race Technologies Team</p>
            `
        });
        
        res.status(201).json({ message: 'Message sent successfully' });
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Server Initialization ---
/**
 * Asynchronously starts the server.
 * It first ensures the data directory is set up correctly, then starts listening for requests on the specified port.
 */
async function startServer() {
    await ensureDataDirectory();
    
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

startServer().catch(console.error);
