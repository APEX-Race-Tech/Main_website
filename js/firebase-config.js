// Firebase Configuration
// 
// SECURITY NOTE: Firebase API keys are PUBLIC by design and are safe to include in client-side code.
// Security is enforced through:
// 1. Domain restrictions in Firebase Console (Authentication → Settings → Authorized domains)
// 2. Firestore Security Rules (Firestore Database → Rules)
// 3. Authentication requirements for sensitive operations
//
// See FIREBASE_SECURITY_EXPLAINED.md for details on how Firebase security works.
//
// This configuration works without Vite - you can deploy the files directly to your server.

// Firebase configuration for race-insight-app project
const firebaseConfig = {
    apiKey: "AIzaSyBGrOI8vnV2GKDgk_9aOY6P8_7hGz-SqGg",
    authDomain: "race-insight-app.firebaseapp.com",
    projectId: "race-insight-app",
    storageBucket: "race-insight-app.firebasestorage.app",
    messagingSenderId: "762507339296",
    appId: "1:762507339296:web:6bed7e38a493920871be45",
    measurementId: "G-V9X5P0EFZQ"
};

// Export as global variable for use in race-insight.js (static sites)
if (typeof window !== 'undefined') {
    window.firebaseConfig = firebaseConfig;
    console.log('Firebase configuration loaded successfully');
    console.log('[Firebase Config] API Key:', firebaseConfig.apiKey ? `${firebaseConfig.apiKey.substring(0, 10)}...` : 'MISSING');
    console.log('[Firebase Config] Project ID:', firebaseConfig.projectId || 'MISSING');
    
    // Validate API key format
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey.length < 20) {
        console.error('[Firebase Config] WARNING: API key appears to be invalid or too short!');
    }
}

// Export for CommonJS modules (Node.js/Webpack)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = firebaseConfig;
}
