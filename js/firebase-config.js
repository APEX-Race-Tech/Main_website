// Firebase Configuration
// This file reads Firebase configuration from environment variables ONLY
// All values must be set in the .env file - no hardcoded values are stored here
//
// REQUIRED: Create a .env file in the project root with all Firebase configuration values
// See .env.example for the required variables

/**
 * Gets an environment variable value - REQUIRED, no fallback
 * Works with Vite (import.meta.env) or Webpack (process.env)
 * Throws an error if the variable is not found
 */
const getEnvVar = (name) => {
    let value = null;
    
    // Try Vite environment variables first
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        value = import.meta.env[name];
    }
    // Try Node.js/Webpack environment variables
    else if (typeof process !== 'undefined' && process.env) {
        value = process.env[name];
    }
    
    // Throw error if variable is not found
    if (!value || value === '') {
        throw new Error(
            `Firebase configuration error: Environment variable ${name} is not set. ` +
            `Please create a .env file in the project root with all required Firebase configuration values. ` +
            `See .env.example for the required variables.`
        );
    }
    
    return value;
};

// Firebase configuration object - reads ONLY from environment variables
// All values must be provided via .env file
const firebaseConfig = {
    apiKey: getEnvVar('VITE_FIREBASE_API_KEY'),
    authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: getEnvVar('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getEnvVar('VITE_FIREBASE_APP_ID'),
    measurementId: getEnvVar('VITE_FIREBASE_MEASUREMENT_ID')
};

// Export as global variable for use in race-insight.js (static sites)
if (typeof window !== 'undefined') {
    window.firebaseConfig = firebaseConfig;
    console.log('Firebase configuration loaded successfully');
}

// Export for CommonJS modules (Node.js/Webpack)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = firebaseConfig;
}
