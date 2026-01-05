// Force data-section to avoid 'home' logic from stopping animation initially
// Wait for DOM to be ready before accessing document.body
if (document.body) {
    document.body.setAttribute('data-section', 'race-insight-hero');
} else {
    document.addEventListener('DOMContentLoaded', () => {
        document.body.setAttribute('data-section', 'race-insight-hero');
    });
}

// Safety: Force content visibility if animation fails
setTimeout(() => {
    document.querySelectorAll('.animate-on-scroll').forEach(el => {
        if (getComputedStyle(el).opacity === '0') {
            el.style.opacity = '1';
            el.style.transform = 'none';
        }
    });
}, 1000);

// --- Firebase Configuration ---
// Security Note: Firebase API keys are meant to be public and are restricted by domain in Firebase Console.
// However, ensure Firebase Security Rules are properly configured for Firestore and Storage.
//
// Configuration is loaded from js/firebase-config.js which reads from .env file
// All Firebase keys must be stored in .env file - no hardcoded values in code

// Wait for firebaseConfig to be available (loaded from firebase-config.js module)
function waitForFirebaseConfig() {
    return new Promise((resolve, reject) => {
        if (window.firebaseConfig) {
            resolve(window.firebaseConfig);
            return;
        }
        
        // Wait up to 5 seconds for config to load
        let attempts = 0;
        const maxAttempts = 50; // 50 * 100ms = 5 seconds
        const checkInterval = setInterval(() => {
            attempts++;
            if (window.firebaseConfig) {
                clearInterval(checkInterval);
                resolve(window.firebaseConfig);
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                reject(new Error('Firebase configuration not found. Make sure js/firebase-config.js is loaded and .env file is configured.'));
            }
        }, 100);
    });
}

// Initialize Firebase after config is available
// firebaseConfig is loaded from firebase-config.js via window.firebaseConfig
waitForFirebaseConfig()
    .then(config => {
        const firebaseConfig = config;
        
        // Wait for Firebase SDK to be loaded before initializing
        function waitForFirebaseSDK() {
            return new Promise((resolve) => {
                if (typeof firebase !== 'undefined' && firebase.apps) {
                    resolve();
                    return;
                }
                
                // Wait up to 5 seconds for Firebase SDK to load
                let attempts = 0;
                const maxAttempts = 50;
                const checkInterval = setInterval(() => {
                    attempts++;
                    if (typeof firebase !== 'undefined' && firebase.apps) {
                        clearInterval(checkInterval);
                        resolve();
                    } else if (attempts >= maxAttempts) {
                        clearInterval(checkInterval);
                        console.warn('Firebase SDK not loaded, but continuing...');
                        resolve();
                    }
                }, 100);
            });
        }
        
        return waitForFirebaseSDK().then(() => {
            // Initialize Firebase (Compat Syntax)
            if (typeof firebase !== 'undefined' && firebase.apps && !firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            
            // Continue with rest of initialization
            initializeFirebaseServices();
        });
    })
    .catch(error => {
        console.error('Firebase initialization error:', error);
    });

// Initialize Firebase services after config is loaded
function initializeFirebaseServices() {
    // Set Firebase Auth persistence to 'local' to keep users signed in across sessions
    // This persists authentication state in IndexedDB, so users stay logged in even after closing the browser
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => {
            console.log("Firebase Auth persistence set to LOCAL - users will stay signed in");
        })
        .catch((error) => {
            console.error("Error setting auth persistence:", error);
        });

    // Initialize Firestore
    const db = firebase.firestore();
    
    // Make db available globally for the rest of the script
    window.db = db;
    
    // Trigger any code that was waiting for Firebase to initialize
    if (window.onFirebaseReady) {
        window.onFirebaseReady(db);
    }
    
    console.log('Firebase services initialized successfully');
}

// db will be available after Firebase initializes via window.db
// For code that needs db immediately, use: window.db or wait for Firebase initialization
// All existing code using 'db' should be updated to use 'window.db' or wait for initialization

// --- Cookie Utility Functions ---
// Security: Properly encode cookie values and use Secure flag in production
function setCookie(name, value, days = 30) {
    // Encode cookie value to prevent XSS
    const encodedValue = encodeURIComponent(value);
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + date.toUTCString();
    // Use Secure flag in HTTPS, SameSite=Lax for CSRF protection
    const isSecure = window.location.protocol === 'https:';
    const secureFlag = isSecure ? ';Secure' : '';
    document.cookie = name + "=" + encodedValue + ";" + expires + ";path=/;SameSite=Lax" + secureFlag;
}

function getCookie(name) {
    const nameEQ = encodeURIComponent(name) + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) {
            const value = c.substring(nameEQ.length, c.length);
            return decodeURIComponent(value);
        }
    }
    return null;
}

function deleteCookie(name) {
    const isSecure = window.location.protocol === 'https:';
    const secureFlag = isSecure ? ';Secure' : '';
    document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Lax" + secureFlag;
}

// --- Input Validation & Sanitization Functions ---
// Security: Validate and sanitize user inputs to prevent XSS and injection attacks
function validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    // RFC 5322 compliant email regex (simplified)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim()) && email.length <= 254; // Max email length
}

function sanitizeInput(input, maxLength = 1000) {
    if (!input || typeof input !== 'string') return '';
    // Remove potentially dangerous characters and limit length
    return input.trim().slice(0, maxLength).replace(/[<>\"']/g, '');
}

function validatePassword(password) {
    if (!password || typeof password !== 'string') return { valid: false, message: 'Password is required' };
    if (password.length < 8) return { valid: false, message: 'Password must be at least 8 characters long' };
    if (password.length > 128) return { valid: false, message: 'Password must be less than 128 characters' };
    // Check for at least one letter and one number
    if (!/[a-zA-Z]/.test(password)) return { valid: false, message: 'Password must contain at least one letter' };
    if (!/[0-9]/.test(password)) return { valid: false, message: 'Password must contain at least one number' };
    return { valid: true, message: '' };
}

// --- Auth Logic ---
document.addEventListener('DOMContentLoaded', async () => {
    // Wait for Firebase to be fully initialized before proceeding
    // db will be available via window.db after Firebase initializes
    if (!window.db) {
        // Wait a bit for Firebase to initialize
        await new Promise(resolve => {
            const checkDb = setInterval(() => {
                if (window.db) {
                    clearInterval(checkDb);
                    resolve();
                }
            }, 50);
            // Timeout after 5 seconds
            setTimeout(() => {
                clearInterval(checkDb);
                resolve();
            }, 5000);
        });
    }
    
    // Create local db reference for use in this scope
    // Wait for db to be available from Firebase initialization
    const db = window.db;
    if (!db) {
        console.error('Firestore database not initialized. Firebase may not be ready yet.');
        return; // Exit early if Firebase isn't ready
    }
    // Check if user was logged in via cookies (quick check before Firebase auth restores)
    // This allows us to show logged-in UI immediately while Firebase auth is restoring
    const userLoggedIn = getCookie('userLoggedIn');
    const userEmail = getCookie('userEmail');
    const userId = getCookie('userId');
    
    if (userLoggedIn === 'true' && userEmail && userId) {
        console.log("Cookie indicates user was logged in, showing logged-in UI while Firebase auth restores...");
        
        // Create a temporary user object from cookies to update UI immediately
        // This provides instant feedback while Firebase auth state is being restored
        const tempUser = {
            email: userEmail,
            uid: userId
        };
        
        // Update UI immediately based on cookies
        // Firebase will restore the actual auth state shortly and update UI again if needed
        try {
            updateUIForLoggedInUser(tempUser);
            console.log("UI updated from cookies - Firebase auth will restore shortly");
        } catch (error) {
            console.error("Error updating UI from cookies:", error);
        }
    }
    
    const authModal = document.getElementById('auth-modal');
    // Ensure modals are hidden initially
    if (authModal) {
        authModal.style.display = 'none';
    } else {
        console.error('Auth modal not found in DOM!');
    }
    const closeAuthModal = document.getElementById('close-auth-modal');
    const googleBtn = document.getElementById('google-signin-btn');
    const emailForm = document.getElementById('email-auth-form');
    const toggleAuthMode = document.getElementById('toggle-auth-mode');
    const authTitle = document.getElementById('auth-title');
    const authSubtitle = document.getElementById('auth-subtitle');
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const authError = document.getElementById('auth-error');
    const authSuccess = document.getElementById('auth-success');
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    const forgotPasswordBtn = document.getElementById('forgot-password-btn');
    const authSubmitBtn = document.getElementById('auth-submit-btn');

    let isSignUp = false;
    let pendingDownloadAction = null;
    let isNewUserSignup = false; // Track if this is a new user signup

    // Helper function to show error
    function showAuthError(message) {
        authError.textContent = message;
        authError.style.display = 'block';
        authSuccess.style.display = 'none';
    }

    // Helper function to show success
    function showAuthSuccess(message) {
        authSuccess.textContent = message;
        authSuccess.style.display = 'block';
        authError.style.display = 'none';
    }

    // Helper function to hide messages
    function hideAuthMessages() {
        authError.style.display = 'none';
        authSuccess.style.display = 'none';
    }

    // Helper function to reset modal to sign-in state
    function resetAuthModalToSignIn() {
        isSignUp = false;
        const titleEl = document.getElementById('auth-title');
        const subtitleEl = document.getElementById('auth-subtitle');
        const submitBtnEl = document.getElementById('auth-submit-btn');
        const switchTextEl = document.getElementById('auth-switch-text');
        const forgotPwdLinkEl = document.getElementById('forgot-password-link');
        const confirmPwdGroup = document.getElementById('confirm-password-group');
        const confirmPwdInput = document.getElementById('auth-confirm-password');
        
        if (titleEl) titleEl.textContent = "Sign In to Download";
        if (subtitleEl) subtitleEl.textContent = "Create an account to access downloads and save your preferences.";
        if (submitBtnEl) submitBtnEl.textContent = "Sign In";
        if (switchTextEl) switchTextEl.innerHTML = 'Don\'t have an account? <a href="#" id="toggle-auth-mode">Sign Up</a>';
        if (forgotPwdLinkEl) forgotPwdLinkEl.style.display = 'block';
        if (confirmPwdGroup) {
            confirmPwdGroup.style.display = 'none';
            if (confirmPwdInput) {
                confirmPwdInput.required = false;
                confirmPwdInput.value = '';
            }
        }
        hideAuthMessages();
    }

    // Create or update user profile in Firestore
    // Always resolves successfully, even if Firestore operations fail (offline mode)
    async function createUserProfile(user, additionalData = {}) {
        try {
            const userRef = db.collection('users').doc(user.uid);
            
            // Try to get user document, but don't fail if offline or API not enabled
            let snapshot;
            try {
                snapshot = await userRef.get();
            } catch (getError) {
                // Handle different error types
                if (getError.code === 'permission-denied') {
                    console.warn('Firestore permission denied. Make sure Firestore database is created and security rules allow access:', getError.message);
                } else if (getError.code === 'failed-precondition') {
                    console.warn('Firestore API may not be fully enabled yet. Please wait a few minutes:', getError.message);
                } else {
                    console.warn('Firestore get() failed (offline/API issue), will attempt to create profile:', getError.message);
                }
                snapshot = { exists: false };
            }

            if (!snapshot.exists) {
                // Create new user profile
                const { displayName, email, photoURL } = user;
                const createdAt = new Date();
                try {
                    await userRef.set({
                        displayName: displayName || email.split('@')[0],
                        email,
                        photoURL: photoURL || '',
                        createdAt,
                        bio: '',
                        location: '',
                        simulator: additionalData.simulator || 'Not selected',
                        experience: additionalData.experience || 'Not selected',
                        referral: additionalData.referral || 'Not selected',
                        downloadCount: 0,
                        sessionCount: 0,
                        lastLogin: createdAt,
                        ...additionalData
                    });
                    console.log('User profile created successfully');
                    return { isNewUser: true };
                } catch (setError) {
                    // ... existing catch ...
                }
            } else {
                // Update existing user profile
                const currentData = snapshot.data();
                await userRef.update({
                    lastLogin: new Date(),
                    sessionCount: (currentData.sessionCount || 0) + 1
                });
                console.log('User profile updated successfully');
                return { isNewUser: false };
            }
            return { isNewUser: false };
        } catch (error) {
            console.warn('Firestore operation failed (non-fatal):', error.message);
            return { isNewUser: false };
        }
    }

    // Onboarding Logic
    const onboardingModal = document.getElementById('onboarding-modal');
    const onboardingForm = document.getElementById('onboarding-form');

    async function checkOnboarding(user, profileResult) {
        if (!onboardingModal) {
            console.warn("Onboarding modal not found");
            return;
        }
        
        if (profileResult && profileResult.isNewUser) {
            console.log("Showing onboarding modal for new user");
            onboardingModal.style.display = 'flex';
            onboardingModal.offsetHeight;
            setTimeout(() => {
                onboardingModal.classList.add('active');
            }, 10);
        }
    }

    if (onboardingForm) {
        onboardingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = firebase.auth().currentUser;
            if (!user) return;

            const simulatorEl = document.getElementById('onboarding-simulator');
            const experienceEl = document.getElementById('onboarding-experience');
            const locationEl = document.getElementById('onboarding-location');
            const referralEl = document.getElementById('onboarding-referral');
            
            if (!simulatorEl || !experienceEl || !locationEl || !referralEl) {
                console.error('Onboarding form elements not found');
                return;
            }

            const simulator = simulatorEl.value;
            const experience = experienceEl.value;
            const location = locationEl.value;
            const referral = referralEl.value;

            try {
                // Ensure user profile exists first (create if it doesn't)
                const userRef = db.collection('users').doc(user.uid);
                const userDoc = await userRef.get();
                
                if (!userDoc.exists) {
                    // Create basic profile if it doesn't exist
                    const { displayName, email, photoURL } = user;
                    await userRef.set({
                        displayName: displayName || email.split('@')[0],
                        email: email,
                        photoURL: photoURL || '',
                        createdAt: new Date(),
                        bio: '',
                        downloadCount: 0,
                        sessionCount: 0,
                        lastLogin: new Date()
                    });
                }
                
                // Use set with merge to update onboarding fields
                await userRef.set({
                    simulator: simulator,
                    experience: experience,
                    location: location,
                    referral: referral
                }, { merge: true });
                
                console.log('Onboarding data saved successfully');
                
                // Close onboarding modal
                if (onboardingModal) {
                    onboardingModal.classList.remove('active');
                    setTimeout(() => {
                        onboardingModal.style.display = 'none';
                    
                        // Execute pending download action after onboarding completes
                        if (pendingDownloadAction) {
                            setTimeout(() => {
                                pendingDownloadAction();
                                pendingDownloadAction = null;
                            }, 100);
                        }
                    }, 300);
                }
                
                // Try to load profile data, but don't fail if it errors (non-critical)
                try {
                    await loadProfileData(user);
                } catch (loadError) {
                    // Log but don't show error - data was saved successfully
                    console.warn('Profile data loaded with warnings (non-fatal):', loadError);
                }
            } catch (error) {
                console.error('Error saving onboarding data:', error);
                // Provide more helpful error message - only show if save actually failed
                const errorMessage = error.code === 'permission-denied' 
                    ? 'Permission denied. Please check your account permissions.'
                    : error.code === 'unavailable'
                    ? 'Service temporarily unavailable. Please try again later.'
                    : 'Failed to save information. You can update it later in your profile.';
                alert(errorMessage);
                if (onboardingModal) {
                    onboardingModal.classList.remove('active');
                    setTimeout(() => {
                        onboardingModal.style.display = 'none';
                        
                        // Still execute download action even if onboarding fails
                        if (pendingDownloadAction) {
                            setTimeout(() => {
                                pendingDownloadAction();
                                pendingDownloadAction = null;
                            }, 100);
                        }
                    }, 300);
                }
            }
        });
    }


    // Load user profile data
    async function loadUserProfile(user) {
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                return userDoc.data();
            }
        } catch (error) {
            console.error('Error loading user profile:', error);
        }
        return null;
    }

    // Update UI for logged in user (defined before use)
    function updateUIForLoggedInUser(user) {
        console.log("=== updateUIForLoggedInUser called ===");
        try {
            const navProfileBtn = document.getElementById('nav-profile-btn');
            const mobileNavProfileBtn = document.getElementById('mobile-nav-profile-btn');
            const navSignInBtn = document.getElementById('nav-signin-btn');
            const downloadBtns = document.querySelectorAll('a[href="#download"]');

            console.log("Elements found:", {
                navProfileBtn: !!navProfileBtn,
                mobileNavProfileBtn: !!mobileNavProfileBtn,
                navSignInBtn: !!navSignInBtn,
                downloadBtns: downloadBtns.length
            });

            // Hide sign-in button
            if (navSignInBtn) {
                navSignInBtn.style.setProperty('display', 'none', 'important');
            }

            // Show profile icon buttons in nav
            if (navProfileBtn) {
                navProfileBtn.style.setProperty('display', 'inline-flex', 'important');
                console.log("✓ navProfileBtn shown");
            }
            if (mobileNavProfileBtn) {
                mobileNavProfileBtn.style.setProperty('display', 'block', 'important');
                console.log("✓ mobileNavProfileBtn shown");
            }

            // Update download button text
            downloadBtns.forEach(btn => {
                btn.textContent = "Download";
            });

            // Update simulator and experience in profile
            loadProfileData(user);
            
            console.log("=== UI update complete ===");
        } catch (error) {
            console.error("Error in updateUIForLoggedInUser:", error);
        }
    }

    // Sign-in button functionality
    const navSignInBtn = document.getElementById('nav-signin-btn');
    if (navSignInBtn) {
        navSignInBtn.addEventListener('click', () => {
            resetAuthModalToSignIn();
            if (authModal) {
                authModal.style.display = 'flex';
                authModal.offsetHeight;
                setTimeout(() => authModal.classList.add('active'), 10);
            }
        });
    }

    // Ensure profile buttons are hidden initially (before auth state is determined)
    // Show sign-in button by default (will be hidden if user is logged in)
    const navSignInBtnDefault = document.getElementById('nav-signin-btn');
    if (navSignInBtnDefault) {
        navSignInBtnDefault.style.display = 'inline-block';
    }
    updateUIForLoggedOutUser();

    // Monitor Auth State
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            console.log("=== User is signed in:", user.email, "===");
            
            // Store login state in cookies (30 days expiration)
            // These cookies help maintain session state and provide quick UI updates on page load
            setCookie('userLoggedIn', 'true', 30);
            setCookie('userEmail', user.email || '', 30);
            setCookie('userId', user.uid || '', 30);
            
            console.log("User session saved to cookies - will persist for 30 days");
            
            // Try to create/update profile, but don't fail if Firestore is offline
            let profileResult = null;
            try {
                profileResult = await createUserProfile(user);
            } catch (profileError) {
                console.error("Profile creation error in auth state change (non-fatal):", profileError);
            }
            
            // Update UI first
            try {
                console.log("About to call updateUIForLoggedInUser");
                updateUIForLoggedInUser(user);
                console.log("updateUIForLoggedInUser call completed");
            } catch (error) {
                console.error("Error calling updateUIForLoggedInUser:", error);
            }
            
            // Close modal with slight delay to show success message
            if (authModal) {
                console.log("Closing modal, active class:", authModal.classList.contains('active'));
                
                // Wait a bit longer if it's a new signup to show success message
                const delay = isNewUserSignup ? 1500 : 800;
                
                setTimeout(() => {
                    // Remove active class to trigger fade out
                    authModal.classList.remove('active');
                    // Hide modal after animation
                    setTimeout(() => {
                        authModal.style.setProperty('display', 'none', 'important');
                        console.log("✓ Modal display set to none");
                        
                        // Reset modal to sign-in state
                        resetAuthModalToSignIn();
                        
                        // Check if we need to show onboarding for new users
                        // Use isNewUserSignup flag OR check if profile was just created
                        const shouldShowOnboarding = isNewUserSignup || (profileResult && profileResult.isNewUser);
                        
                        if (shouldShowOnboarding) {
                            console.log("Showing onboarding for new user");
                            setTimeout(() => {
                                checkOnboarding(user, { isNewUser: true });
                            }, 100);
                        } else {
                            // Execute pending download action if not showing onboarding
                            if (pendingDownloadAction) {
                                setTimeout(() => {
                                    pendingDownloadAction();
                                    pendingDownloadAction = null;
                                }, 100);
                            }
                        }
                        
                        // Reset the flag
                        isNewUserSignup = false;
                    }, 300);
                }, delay);
            }
        } else {
            console.log("=== User is signed out ===");
            
            // Clear login cookies when user signs out
            deleteCookie('userLoggedIn');
            deleteCookie('userEmail');
            deleteCookie('userId');
            
            console.log("User session cookies cleared");
            
            updateUIForLoggedOutUser();
            // Ensure modal is hidden when logged out
            if (authModal) {
                authModal.classList.remove('active');
                authModal.style.setProperty('display', 'none', 'important');
            }
        }
    });

    // Close Modal
    if (closeAuthModal) {
        closeAuthModal.addEventListener('click', () => {
            // Reset Google button state when closing modal
            if (googleBtn) resetGoogleButton();
            
            // Reset confirm password field
            const confirmPwdInput = document.getElementById('auth-confirm-password');
            const confirmPwdGroup = document.getElementById('confirm-password-group');
            if (confirmPwdInput) confirmPwdInput.value = '';
            if (confirmPwdGroup) confirmPwdGroup.style.display = 'none';
            
            if (authModal) {
                authModal.classList.remove('active');
                setTimeout(() => {
                    authModal.style.display = 'none';
                }, 300);
            }
        });
    }

    // Update UI for logged out user
    function updateUIForLoggedOutUser() {
        const navProfileBtn = document.getElementById('nav-profile-btn');
        const mobileNavProfileBtn = document.getElementById('mobile-nav-profile-btn');
        const navSignInBtn = document.getElementById('nav-signin-btn');

        // Hide profile buttons when logged out
        if (navProfileBtn) {
            navProfileBtn.style.setProperty('display', 'none', 'important');
        }
        if (mobileNavProfileBtn) {
            mobileNavProfileBtn.style.setProperty('display', 'none', 'important');
        }

        // Show sign-in button when logged out
        if (navSignInBtn) {
            navSignInBtn.style.setProperty('display', 'inline-block', 'important');
        }
    }

    // Toggle Sign In / Sign Up
    const confirmPasswordGroup = document.getElementById('confirm-password-group');
    const confirmPasswordInput = document.getElementById('auth-confirm-password');
    const authSwitchText = document.getElementById('auth-switch-text');
    
    // Use event delegation on the parent to handle clicks on dynamically updated link
    if (authSwitchText) {
        authSwitchText.addEventListener('click', (e) => {
            const link = e.target.closest('#toggle-auth-mode') || (e.target.id === 'toggle-auth-mode' ? e.target : null);
            if (link) {
                e.preventDefault();
                hideAuthMessages();
                isSignUp = !isSignUp;
                if (isSignUp) {
                    if (authTitle) authTitle.textContent = "Create Account";
                    if (authSubtitle) authSubtitle.textContent = "Join Race Insight to start downloading.";
                    if (authSubmitBtn) authSubmitBtn.textContent = "Create Account";
                    authSwitchText.innerHTML = 'Already have an account? <a href="#" id="toggle-auth-mode">Sign In</a>';
                    if (forgotPasswordLink) forgotPasswordLink.style.display = 'none';
                    if (confirmPasswordGroup) confirmPasswordGroup.style.display = 'block';
                    if (confirmPasswordInput) confirmPasswordInput.required = true;
                } else {
                    if (authTitle) authTitle.textContent = "Sign In to Download";
                    if (authSubtitle) authSubtitle.textContent = "Create an account to access downloads and save your preferences.";
                    if (authSubmitBtn) authSubmitBtn.textContent = "Sign In";
                    authSwitchText.innerHTML = 'Don\'t have an account? <a href="#" id="toggle-auth-mode">Sign Up</a>';
                    if (forgotPasswordLink) forgotPasswordLink.style.display = 'block';
                    if (confirmPasswordGroup) confirmPasswordGroup.style.display = 'none';
                    if (confirmPasswordInput) {
                        confirmPasswordInput.required = false;
                        confirmPasswordInput.value = '';
                    }
                }
            }
        });
    }

    // Store original Google button HTML
    const googleBtnOriginalHTML = googleBtn ? googleBtn.innerHTML : '';
    
    // Function to reset Google button to original state
    function resetGoogleButton() {
        if (googleBtn) {
            googleBtn.disabled = false;
            googleBtn.innerHTML = googleBtnOriginalHTML;
        }
    }
    
    // Google Sign In
    if (googleBtn) {
        googleBtn.addEventListener('click', () => {
        hideAuthMessages();
        
        // Disable the Google button to prevent multiple clicks
        googleBtn.disabled = true;
        googleBtn.innerHTML = '<span style="opacity: 0.7;">Signing in...</span>';
        
        // Set a timeout to restore button if sign-in takes too long (60 seconds)
        const timeoutId = setTimeout(() => {
            console.warn("Google sign-in timeout - restoring button");
            resetGoogleButton();
            showAuthError("Sign in took too long. Please check if popup was blocked and try again.");
        }, 60000);
        
        const provider = new firebase.auth.GoogleAuthProvider();
        firebase.auth().signInWithPopup(provider)
            .then(async (result) => {
                clearTimeout(timeoutId);
                console.log("Google sign-in successful:", result.user.email);
                const profileResult = await createUserProfile(result.user).catch(() => {
                    console.warn("Profile creation completed with warnings (non-fatal)");
                    return { isNewUser: false };
                });
                
                if (profileResult && profileResult.isNewUser) {
                    await checkOnboarding(result.user, profileResult);
                }
                // Sign-in succeeded - modal will close via onAuthStateChanged
                // Button will be reset when modal reopens, so no need to restore here
            })
            .catch((error) => {
                clearTimeout(timeoutId);
                console.error("Google Sign In Error:", error);
                
                // Re-enable the button
                resetGoogleButton();
                
                // Handle different error types
                let errorMessage = "Sign in failed. Please try again.";
                
                if (error.code) {
                    if (error.code === 'auth/popup-closed-by-user') {
                        errorMessage = "Sign in was cancelled. Please try again.";
                    } else if (error.code === 'auth/popup-blocked') {
                        errorMessage = "Popup was blocked. Please allow popups for this site and try again.";
                    } else if (error.code === 'auth/cancelled-popup-request') {
                        errorMessage = "Only one popup request is allowed at a time. Please try again.";
                    } else if (error.code === 'auth/network-request-failed') {
                        errorMessage = "Network error. Please check your connection and try again.";
                    } else if (error.code.startsWith('auth/')) {
                        errorMessage = "Authentication error: " + error.message;
                    } else {
                        errorMessage = "Sign in error: " + error.message;
                    }
                }
                
                showAuthError(errorMessage);
            });
    });

    // Forgot Password - DISABLED (email auth removed)
    if (false && forgotPasswordBtn) { // Disabled - email auth removed
        forgotPasswordBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const email = emailInput ? emailInput.value.trim() : '';
            if (!email) {
                showAuthError("Please enter your email address first.");
                return;
            }
            // Security: Validate email format
            if (!validateEmail(email)) {
                showAuthError("Please enter a valid email address.");
                return;
            }
            hideAuthMessages();
            firebase.auth().sendPasswordResetEmail(email)
                .then(() => {
                    showAuthSuccess("Password reset email sent! Check your inbox.");
                })
                .catch((error) => {
                    console.error("Password Reset Error:", error);
                    // Security: Use sanitized error message
                    showAuthError(getErrorMessage(error));
                });
        });
    }

    // Email Sign In / Sign Up - DISABLED (only Google auth enabled)
    // Email authentication has been disabled. Only Google sign-in is available.
    if (false && emailForm) { // Disabled - email auth removed
        emailForm.addEventListener('submit', (e) => {
        e.preventDefault();
        hideAuthMessages();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        // Security: Validate email format
        if (!email) {
            showAuthError("Please enter your email address.");
            return;
        }
        if (!validateEmail(email)) {
            showAuthError("Please enter a valid email address.");
            return;
        }

        // Security: Validate password
        if (!password) {
            showAuthError("Please enter your password.");
            return;
        }

        // Security: Enhanced password validation for signup
        if (isSignUp) {
            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                showAuthError(passwordValidation.message);
                return;
            }
            if (!confirmPassword) {
                showAuthError("Please confirm your password.");
                return;
            }
            if (password !== confirmPassword) {
                showAuthError("Passwords do not match.");
                return;
            }
        }

        if (authSubmitBtn) {
            authSubmitBtn.disabled = true;
            authSubmitBtn.textContent = isSignUp ? "Creating Account..." : "Signing In...";
        }

        if (isSignUp) {
            firebase.auth().createUserWithEmailAndPassword(email, password)
                .then(async (userCredential) => {
                    // Mark as new user signup - this will be used in onAuthStateChanged
                    isNewUserSignup = true;
                    
                    // Try to create profile, but don't fail sign-up if it errors
                    try {
                        await createUserProfile(userCredential.user);
                    } catch (profileError) {
                        console.error("Profile creation error (non-fatal):", profileError);
                    }
                    
                    // Show success message
                    showAuthSuccess("Account created successfully! Logging you in...");
                    
                    // Clear form fields
                    if (emailInput) emailInput.value = '';
                    if (passwordInput) passwordInput.value = '';
                    if (confirmPasswordInput) confirmPasswordInput.value = '';
                    
                    // Note: User is automatically signed in by Firebase after createUserWithEmailAndPassword
                    // The onAuthStateChanged handler will take care of closing modal and showing onboarding
                    
                    if (authSubmitBtn) {
                        authSubmitBtn.textContent = "Create Account";
                        authSubmitBtn.disabled = false;
                    }
                })
                .catch((error) => {
                    console.error("Sign Up Error:", error);
                    showAuthError(getErrorMessage(error));
                    if (authSubmitBtn) {
                        authSubmitBtn.textContent = "Create Account";
                        authSubmitBtn.disabled = false;
                    }
                    isNewUserSignup = false; // Reset flag on error
                });
        } else {
            firebase.auth().signInWithEmailAndPassword(email, password)
                .then(async (userCredential) => {
                    // Try to create/update profile, but don't fail sign-in if it errors
                    try {
                        await createUserProfile(userCredential.user);
                    } catch (profileError) {
                        console.error("Profile creation error (non-fatal):", profileError);
                    }
                    
                    // Show success message briefly
                    showAuthSuccess("Signing in...");
                    
                    // Clear form fields
                    if (emailInput) emailInput.value = '';
                    if (passwordInput) passwordInput.value = '';
                    
                    // Note: User is automatically signed in by Firebase
                    // The onAuthStateChanged handler will take care of closing modal
                    
                    if (authSubmitBtn) {
                        authSubmitBtn.textContent = "Sign In";
                        authSubmitBtn.disabled = false;
                    }
                })
                .catch((error) => {
                    console.error("Sign In Error:", error);
                    showAuthError(getErrorMessage(error));
                    if (authSubmitBtn) {
                        authSubmitBtn.textContent = "Sign In";
                        authSubmitBtn.disabled = false;
                    }
                });
        }
        });
    }

    // Helper function to get user-friendly error messages
    // Security: Sanitize error messages to prevent information leakage
    function getErrorMessage(error) {
        // Don't expose internal error details to users
        if (!error || !error.code) {
            return 'An error occurred. Please try again.';
        }
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                return 'This email is already registered. Please sign in instead.';
            case 'auth/invalid-email':
                return 'Invalid email address format.';
            case 'auth/operation-not-allowed':
                return 'This operation is not allowed. Please contact support.';
            case 'auth/weak-password':
                return 'Password must be at least 8 characters and contain both letters and numbers.';
            case 'auth/user-disabled':
                return 'This account has been disabled. Please contact support.';
            case 'auth/user-not-found':
                return 'No account found with this email. Please sign up first.';
            case 'auth/wrong-password':
                return 'Incorrect password. Please try again.';
            case 'auth/invalid-login-credentials':
                return 'Invalid email or password. Please check your credentials and try again.';
            case 'auth/invalid-credential':
                return 'Invalid email or password. Please check your credentials and try again.';
            case 'auth/too-many-requests':
                return 'Too many failed attempts. Please try again later.';
            case 'auth/network-request-failed':
                return 'Network error. Please check your connection and try again.';
            default:
                // Security: Don't expose internal error messages
                return 'An error occurred. Please try again.';
        }
    }

    // Sign-in is now triggered by the Download button when user is not signed in
    // Auth buttons removed - users sign in via download button

    // Logout functionality (only in profile modal)
    const logoutBtns = [
        document.getElementById('modal-logout-btn')
    ];
    logoutBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                firebase.auth().signOut().then(() => {
                    console.log("User signed out");
                    // Close modals if open
                    if (profileModal) {
                        profileModal.classList.remove('active');
                        setTimeout(() => profileModal.style.display = 'none', 300);
                    }
                    // Clear login cookies on logout
                    deleteCookie('userLoggedIn');
                    deleteCookie('userEmail');
                    deleteCookie('userId');
                    
                    console.log("User session cookies cleared on logout");
                }).catch((error) => {
                    console.error("Sign out error:", error);
                });
            });
        }
    });

    // --- Download Counter Logic ---
    const downloadCountElement = document.getElementById('download-count');
    
    // Function to format number with commas
    function formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    
    // Function to animate number change
    function animateCount(element, targetCount) {
        const currentCount = parseInt(element.textContent.replace(/,/g, '')) || 0;
        const increment = targetCount > currentCount ? 1 : -1;
        const duration = 1000; // 1 second
        const steps = 30;
        const stepValue = Math.abs(targetCount - currentCount) / steps;
        const stepDuration = duration / steps;
        
        let current = currentCount;
        const timer = setInterval(() => {
            current += increment * stepValue;
            if ((increment > 0 && current >= targetCount) || (increment < 0 && current <= targetCount)) {
                current = targetCount;
                clearInterval(timer);
            }
            element.textContent = formatNumber(Math.round(current));
        }, stepDuration);
    }
    
    // Fetch and display download count
    const downloadCountRef = db.collection('stats').doc('downloads');
    const totalDownloadContainer = document.getElementById('total-download-container');
    const DOWNLOAD_THRESHOLD = 50; // Big number threshold
    
    // Listen for real-time updates
    downloadCountRef.onSnapshot((doc) => {
        if (doc && doc.exists) {
            const count = doc.data().count || 0;
            
            if (count >= DOWNLOAD_THRESHOLD) {
                if (totalDownloadContainer) totalDownloadContainer.style.display = 'block';
                
                const currentText = downloadCountElement.textContent.trim();
                const currentCount = parseInt(currentText.replace(/,/g, '')) || 0;
                
                if (currentText === 'Loading...' || currentText === '') {
                    downloadCountElement.textContent = formatNumber(count);
                } else if (count !== currentCount) {
                    animateCount(downloadCountElement, count);
                }
            } else {
                if (totalDownloadContainer) totalDownloadContainer.style.display = 'none';
            }
        } else {
            if (totalDownloadContainer) totalDownloadContainer.style.display = 'none';
        }
    }, (error) => {
        console.error('Error fetching download count:', error);
        downloadCountElement.innerHTML = '<span style="opacity: 0.5;">Unable to load</span>';
    });
    
    // Function to increment download count
    async function incrementDownloadCount() {
        try {
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(downloadCountRef);
                if (doc && doc.exists) {
                    const currentCount = doc.data().count || 0;
                    transaction.update(downloadCountRef, {
                        count: currentCount + 1
                    });
                } else {
                    transaction.set(downloadCountRef, {
                        count: 1
                    });
                }
            });
        } catch (error) {
            console.error('Error incrementing download count:', error);
        }
    }

    // --- Download Logic ---
    const downloadBtn = document.getElementById('download-btn');
    const navDownloadBtn = document.getElementById('nav-download-btn');
    const mobileNavDownloadBtn = document.getElementById('mobile-nav-download-btn');
    const platformBtns = document.querySelectorAll('.platform-btn');
    let selectedPlatform = null;

    // Auto-select Windows on page load
    const windowsBtn = document.querySelector('.platform-btn[data-platform="windows"]');
    if (windowsBtn) {
        windowsBtn.classList.add('selected');
        selectedPlatform = 'windows';
    }

    // Ensure platform buttons are clickable
    platformBtns.forEach(btn => {
        // Remove any pointer-events blocking
        btn.style.pointerEvents = 'auto';
        btn.style.cursor = 'pointer';
        btn.style.position = 'relative';
        btn.style.zIndex = '10';
        
        // Remove disabled attribute if it exists (except for actually disabled buttons)
        if (!btn.classList.contains('disabled') && btn.dataset.platform === 'windows') {
            btn.disabled = false;
        }
        
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Prevent clicking on disabled buttons
            if (btn.disabled || btn.classList.contains('disabled')) {
                console.log('Button is disabled, ignoring click');
                return;
            }
            platformBtns.forEach(b => {
                if (b !== btn) b.classList.remove('selected');
            });
            btn.classList.add('selected');
            selectedPlatform = btn.dataset.platform;
            console.log('Platform selected:', selectedPlatform);
        });
        
        // Also handle mousedown for better responsiveness
        btn.addEventListener('mousedown', (e) => {
            if (!btn.disabled && !btn.classList.contains('disabled')) {
                e.preventDefault();
            }
        });
    });

    // Function to handle download button click (opens modal if not logged in)
    function handleDownloadClick(e) {
        if (e) e.preventDefault();
        const user = firebase.auth().currentUser;
        if (!user) {
            pendingDownloadAction = () => {
                // Scroll to download section and trigger download
                const downloadSection = document.getElementById('download');
                if (downloadSection) {
                    downloadSection.scrollIntoView({ behavior: 'smooth' });
                    setTimeout(() => {
                        if (downloadBtn) downloadBtn.click();
                    }, 500);
                }
            };
            resetAuthModalToSignIn();
            if (authModal) {
                authModal.style.display = 'flex';
                authModal.offsetHeight;
                setTimeout(() => authModal.classList.add('active'), 10);
            }
            return;
        }
        // If logged in, scroll to download section
        const downloadSection = document.getElementById('download');
        if (downloadSection) {
            downloadSection.scrollIntoView({ behavior: 'smooth' });
        }
    }

    // Add event listeners to nav download buttons
    if (navDownloadBtn) {
        navDownloadBtn.addEventListener('click', handleDownloadClick);
    }
    if (mobileNavDownloadBtn) {
        mobileNavDownloadBtn.addEventListener('click', handleDownloadClick);
    }
    // Also handle other download links
    document.querySelectorAll('a[href="#download"]').forEach(link => {
        if (link.id !== 'nav-download-btn' && link.id !== 'mobile-nav-download-btn') {
            link.addEventListener('click', handleDownloadClick);
        }
    });

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            if (!selectedPlatform) {
                alert('Please select your platform (Windows, Linux, or Mac) first.');
                return;
            }
            const user = firebase.auth().currentUser;
            if (!user) {
                pendingDownloadAction = () => triggerDownload();
                resetAuthModalToSignIn();
                if (authModal) {
                    authModal.style.display = 'flex';
                    authModal.offsetHeight;
                    setTimeout(() => authModal.classList.add('active'), 10);
                }
                return;
            }
            triggerDownload();
        });
    }

    // Helper function to show thank you modal
    function showThankYouModal() {
        const thankYouModal = document.getElementById('thank-you-modal');
        if (thankYouModal) {
            thankYouModal.style.display = 'flex';
            thankYouModal.offsetHeight;
            setTimeout(() => thankYouModal.classList.add('active'), 10);
        }
    }

    async function triggerDownload() {
        // Detect Edge browser
        const isEdge = /Edg/.test(navigator.userAgent);
        const isIE = /Trident/.test(navigator.userAgent);
        const isOldEdge = /Edge/.test(navigator.userAgent) && !isEdge;
        
        // ===== GitHub Releases API (Primary method for PUBLIC repositories) =====
        // Repository is now public: https://github.com/APEX-Race-Tech/RACE-Insight-Public
        // This method automatically fetches the LATEST release - no manual updates needed!
        // When you publish a new release on GitHub, it will automatically be used here.
        
        const GITHUB_OWNER = 'APEX-Race-Tech';
        const GITHUB_REPO = 'RACE-Insight-Public';
        
        const filePatterns = {
            'windows': /RACE-Insight.*Setup.*\.exe$/i,
            'linux': /RaceInsight.*\.AppImage$/i,
            'apple': /RaceInsight.*\.dmg$/i
        };
        
        let downloadUrl = null;
        
        try {
            const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`);
            
            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }
            
            const release = await response.json();
            const pattern = filePatterns[selectedPlatform];
            const asset = release.assets.find(asset => pattern.test(asset.name));
            
            if (!asset) {
                // Fallback to hardcoded URLs if API doesn't find the asset
                throw new Error(`No release file found for ${selectedPlatform}`);
            }
            
            downloadUrl = asset.browser_download_url;
            console.log(`Downloading ${asset.name} (${release.tag_name}) from GitHub Releases`);
            
        } catch (error) {
            console.error('GitHub API download error:', error);
            
            // ===== Fallback: Direct Download URLs =====
            // Fallback to hardcoded URLs if GitHub API fails
            const downloadUrls = {
                'windows': 'https://github.com/APEX-Race-Tech/RACE-Insight-Public/releases/download/v0.1.27/RACE-Insight-Setup-0.1.27.exe',
                'linux': 'https://github.com/APEX-Race-Tech/RACE-Insight-Public/releases/download/v0.1.27/RaceInsight_Setup_Linux.AppImage',
                'apple': 'https://github.com/APEX-Race-Tech/RACE-Insight-Public/releases/download/v0.1.27/RaceInsight_Setup_Mac.dmg'
            };
            
            downloadUrl = downloadUrls[selectedPlatform];
            if (!downloadUrl) {
                alert('Platform not available yet. Please contact support.');
                return;
            }
            
            console.log(`Using fallback download URL: ${downloadUrl}`);
        }
        
        // Edge-compatible download method
        // Edge and IE have issues with programmatic link clicks for cross-origin downloads
        if (isEdge || isOldEdge || isIE) {
            // For Edge, use window.location or window.open directly
            console.log('Using Edge-compatible download method');
            window.location.href = downloadUrl;
        } else {
            // For other browsers, try programmatic link click
            try {
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                // Don't set download attribute for cross-origin - Edge doesn't support it
                document.body.appendChild(link);
                link.click();
                // Remove link after a short delay to ensure click is processed
                setTimeout(() => {
                    if (link.parentNode) {
                        document.body.removeChild(link);
                    }
                }, 100);
            } catch (linkError) {
                // Fallback for browsers that block programmatic clicks
                console.warn('Programmatic click failed, using window.location:', linkError);
                window.location.href = downloadUrl;
            }
        }
            
        // Do async operations after opening the download (non-blocking)
        try {
            // Increment download count (fire and forget - don't block download)
            incrementDownloadCount().catch(error => {
                console.error('Error incrementing download count:', error);
            });
            
            // Increment user download count (fire and forget)
            const user = firebase.auth().currentUser;
            if (user) {
                db.collection('users').doc(user.uid).update({
                    downloadCount: firebase.firestore.FieldValue.increment(1)
                }).catch(error => {
                    console.error('Error updating user download count:', error);
                });
            }
            
            // Show thank you modal
            showThankYouModal();
            
        } catch (trackingError) {
            console.error('Download tracking error:', trackingError);
            // Don't show error to user - download already started
        }
    }

    // --- Thank You Modal Functionality ---
    const thankYouModal = document.getElementById('thank-you-modal');
    const closeThankYouModal = document.getElementById('close-thank-you-modal');
    const closeThankYouBtn = document.getElementById('close-thank-you-btn');

    function closeThankYouModalFunc() {
        if (thankYouModal) {
            thankYouModal.classList.remove('active');
            setTimeout(() => {
                thankYouModal.style.setProperty('display', 'none', 'important');
            }, 300);
        }
    }

    if (closeThankYouModal) {
        closeThankYouModal.addEventListener('click', closeThankYouModalFunc);
    }

    if (closeThankYouBtn) {
        closeThankYouBtn.addEventListener('click', closeThankYouModalFunc);
    }

    // Close modal when clicking backdrop
    if (thankYouModal) {
        thankYouModal.addEventListener('click', (e) => {
            if (e.target === thankYouModal) {
                closeThankYouModalFunc();
            }
        });
    }

    // --- Profile Modal Functionality ---
    const profileModal = document.getElementById('profile-modal');
    const closeProfileModal = document.getElementById('close-profile-modal');
    const editProfileBtn = document.getElementById('edit-profile-btn');
    const changePasswordBtn = document.getElementById('change-password-btn');
    const profileEditForm = document.getElementById('profile-edit-form');
    const changePasswordForm = document.getElementById('change-password-form');
    const updateProfileForm = document.getElementById('update-profile-form');
    const updatePasswordForm = document.getElementById('update-password-form');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const cancelPasswordBtn = document.getElementById('cancel-password-btn');

    // Close Profile Modal
    if (closeProfileModal) {
        closeProfileModal.addEventListener('click', () => {
            profileModal.classList.remove('active');
            setTimeout(() => {
                profileModal.style.setProperty('display', 'none', 'important');
            }, 300);
        });
    }

    // Close modal when clicking backdrop
    if (profileModal) {
        profileModal.addEventListener('click', (e) => {
            if (e.target === profileModal) {
                profileModal.classList.remove('active');
                setTimeout(() => {
                    profileModal.style.setProperty('display', 'none', 'important');
                }, 300);
            }
        });
    }

    // Navigation to profile (open as modal)
    document.querySelectorAll('a[href="#profile"]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const user = firebase.auth().currentUser;
            if (user) {
                if (profileModal) {
                    profileModal.style.display = 'flex';
                    profileModal.offsetHeight;
                    setTimeout(() => profileModal.classList.add('active'), 10);
                    loadProfileData(user);
                }
            } else {
                resetAuthModalToSignIn();
                if (authModal) {
                    authModal.style.display = 'flex';
                    authModal.offsetHeight;
                    setTimeout(() => authModal.classList.add('active'), 10);
                }
            }
        });
    });

    // Profile button click handlers
    const navProfileBtn = document.getElementById('nav-profile-btn');
    const mobileNavProfileBtn = document.getElementById('mobile-nav-profile-btn');
    
    if (navProfileBtn) {
        navProfileBtn.addEventListener('click', () => {
            const user = firebase.auth().currentUser;
            if (user) {
                if (profileModal) {
                    profileModal.style.display = 'flex';
                    profileModal.offsetHeight;
                    setTimeout(() => profileModal.classList.add('active'), 10);
                    loadProfileData(user);
                }
            } else {
                resetAuthModalToSignIn();
                if (authModal) {
                    authModal.style.display = 'flex';
                    authModal.offsetHeight;
                    setTimeout(() => authModal.classList.add('active'), 10);
                }
            }
        });
    }

    if (mobileNavProfileBtn) {
        mobileNavProfileBtn.addEventListener('click', () => {
            const user = firebase.auth().currentUser;
            if (user) {
                if (profileModal) {
                    profileModal.style.display = 'flex';
                    profileModal.offsetHeight;
                    setTimeout(() => profileModal.classList.add('active'), 10);
                    loadProfileData(user);
                }
            } else {
                resetAuthModalToSignIn();
                if (authModal) {
                    authModal.style.display = 'flex';
                    authModal.offsetHeight;
                    setTimeout(() => authModal.classList.add('active'), 10);
                }
            }
        });
    }

    // Load and display profile data
    async function loadProfileData(user) {
        try {
            const profileData = await loadUserProfile(user);
            const displayName = document.getElementById('profile-display-name');
            const profileEmail = document.getElementById('profile-email');
            const memberSince = document.getElementById('profile-member-since');
            const avatarInitials = document.getElementById('profile-avatar-initials');
            const avatarImg = document.getElementById('profile-avatar-img');
            const statDownloads = document.getElementById('stat-downloads');
            const statSessions = document.getElementById('stat-sessions');

            // Use safe property access for Edge compatibility (avoid optional chaining)
            const profileDisplayName = profileData && profileData.displayName ? profileData.displayName : null;
            if (displayName) displayName.textContent = profileDisplayName || user.displayName || user.email.split('@')[0];
            if (profileEmail) profileEmail.textContent = user.email;
            if (memberSince && profileData && profileData.createdAt) {
                const date = profileData.createdAt.toDate ? profileData.createdAt.toDate() : new Date(profileData.createdAt);
                memberSince.textContent = 'Member since: ' + date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            }

            // Avatar
            const profilePhotoURL = profileData && profileData.photoURL ? profileData.photoURL : null;
            if (user.photoURL || profilePhotoURL) {
                avatarImg.src = user.photoURL || profilePhotoURL;
                avatarImg.style.display = 'block';
                avatarInitials.style.display = 'none';
            } else {
                const displayNameForInitials = profileDisplayName || user.displayName || user.email.split('@')[0];
                const initials = displayNameForInitials
                    .split(' ').map(function(n) { return n[0]; }).join('').toUpperCase().substring(0, 2);
                avatarInitials.textContent = initials;
                avatarInitials.style.display = 'flex';
                avatarImg.style.display = 'none';
            }

            // Stats
            if (statSessions) statSessions.textContent = (profileData && profileData.sessionCount) ? profileData.sessionCount : 0;
            
            const profileSim = document.getElementById('profile-simulator');
            const profileExp = document.getElementById('profile-experience');
            const profileRef = document.getElementById('profile-referral');
            const profileLoc = document.getElementById('profile-location-display');
            if (profileSim) profileSim.textContent = (profileData && profileData.simulator) ? profileData.simulator : 'Not selected';
            if (profileExp) profileExp.textContent = (profileData && profileData.experience) ? profileData.experience : 'Not selected';
            if (profileRef) profileRef.textContent = (profileData && profileData.referral) ? profileData.referral : 'Not selected';
            if (profileLoc) profileLoc.textContent = (profileData && profileData.location) ? profileData.location : 'Not selected';

            // Pre-fill edit form
            const profileNameEl = document.getElementById('profile-name');
            if (profileNameEl) {
                profileNameEl.value = profileDisplayName || user.displayName || '';
            }
            const profileBioEl = document.getElementById('profile-bio');
            if (profileBioEl) {
                profileBioEl.value = (profileData && profileData.bio) ? profileData.bio : '';
            }
            const profileLocationEl = document.getElementById('profile-location');
            if (profileLocationEl) {
                profileLocationEl.value = (profileData && profileData.location) ? profileData.location : '';
            }
            const profileSimulatorEditEl = document.getElementById('profile-simulator-edit');
            if (profileSimulatorEditEl) {
                profileSimulatorEditEl.value = (profileData && profileData.simulator) ? profileData.simulator : '';
            }
            const profileExperienceEditEl = document.getElementById('profile-experience-edit');
            if (profileExperienceEditEl) {
                profileExperienceEditEl.value = (profileData && profileData.experience) ? profileData.experience : '';
            }
        } catch (error) {
            console.error('Error loading profile data:', error);
        }
    }

    // Edit profile button
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', () => {
            if (profileEditForm) profileEditForm.style.display = 'block';
            if (changePasswordForm) changePasswordForm.style.display = 'none';
        });
    }

    // Change password button
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', () => {
            if (changePasswordForm) changePasswordForm.style.display = 'block';
            if (profileEditForm) profileEditForm.style.display = 'none';
        });
    }

    // Cancel edit
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            if (profileEditForm) profileEditForm.style.display = 'none';
        });
    }

    // Cancel password change
    if (cancelPasswordBtn) {
        cancelPasswordBtn.addEventListener('click', () => {
            if (changePasswordForm) changePasswordForm.style.display = 'none';
            if (updatePasswordForm) updatePasswordForm.reset();
        });
    }

    // Update profile form
    if (updateProfileForm) {
        updateProfileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = firebase.auth().currentUser;
            if (!user) return;

            const nameEl = document.getElementById('profile-name');
            const bioEl = document.getElementById('profile-bio');
            const locationEl = document.getElementById('profile-location');
            const simulatorEl = document.getElementById('profile-simulator-edit');
            const experienceEl = document.getElementById('profile-experience-edit');
            
            if (!nameEl || !bioEl || !locationEl || !simulatorEl || !experienceEl) {
                console.error('Profile form elements not found');
                return;
            }
            
            // Security: Sanitize and validate inputs
            const displayName = sanitizeInput(nameEl.value, 100);
            const bio = sanitizeInput(bioEl.value, 500);
            const location = sanitizeInput(locationEl.value, 100);
            const simulator = sanitizeInput(simulatorEl.value, 50);
            const experience = sanitizeInput(experienceEl.value, 50);
 
            try {
                await db.collection('users').doc(user.uid).update({
                    displayName: displayName || user.email.split('@')[0],
                    bio: bio,
                    location: location,
                    simulator: simulator,
                    experience: experience
                });

                // Update Firebase Auth display name
                if (displayName && displayName !== user.displayName) {
                    await user.updateProfile({ displayName: displayName });
                }

                if (profileEditForm) profileEditForm.style.display = 'none';
                await loadProfileData(user);
                alert('Profile updated successfully!');
            } catch (error) {
                console.error('Error updating profile:', error);
                // Security: Don't expose internal error details
                alert('Failed to update profile. Please try again.');
            }
        });
    }

    // Update password form
    if (updatePasswordForm) {
        updatePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = firebase.auth().currentUser;
            if (!user) return;

            const currentPwdEl = document.getElementById('current-password');
            const newPwdEl = document.getElementById('new-password');
            
            if (!currentPwdEl || !newPwdEl) {
                console.error('Password form elements not found');
                return;
            }
            
            const currentPassword = currentPwdEl.value;
            const newPassword = newPwdEl.value;
            const confirmPwdEl = document.getElementById('confirm-password');
            if (!confirmPwdEl) {
                console.error('Confirm password field not found');
                return;
            }
            const confirmPassword = confirmPwdEl.value;

            // Security: Enhanced password validation
            const passwordValidation = validatePassword(newPassword);
            if (!passwordValidation.valid) {
                alert(passwordValidation.message);
                return;
            }

            if (newPassword !== confirmPassword) {
                alert('New passwords do not match!');
                return;
            }

            try {
                // Re-authenticate user
                const credential = firebase.auth.EmailAuthProvider.credential(
                    user.email,
                    currentPassword
                );
                await user.reauthenticateWithCredential(credential);

                // Update password
                await user.updatePassword(newPassword);
                if (updatePasswordForm) updatePasswordForm.reset();
                if (changePasswordForm) changePasswordForm.style.display = 'none';
                alert('Password updated successfully!');
            } catch (error) {
                console.error('Error updating password:', error);
                alert('Failed to update password: ' + getErrorMessage(error));
            }
        });
    }

    // Delete Account Logic
    const deleteAccountBtn = document.getElementById('delete-account-btn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', async () => {
            const user = firebase.auth().currentUser;
            if (!user) return;

            const confirmed = confirm("WARNING: This will permanently delete your account and all associated data. This action cannot be undone. Are you sure?");
            
            if (confirmed) {
                try {
                    // 1. Delete Firestore data
                    await db.collection('users').doc(user.uid).delete();
                    console.log("User data deleted from Firestore");

                    // 2. Delete Firebase Auth user
                    await user.delete();
                    console.log("User account deleted");

                    alert("Your account has been successfully deleted.");
                    
                    // 3. UI cleanup
                    if (profileModal) {
                        profileModal.classList.remove('active');
                        setTimeout(() => profileModal.style.display = 'none', 300);
                    }
                    deleteCookie('userLoggedIn');
                    deleteCookie('userEmail');
                    deleteCookie('userId');
                    location.reload(); // Refresh to update nav/state
                } catch (error) {
                    console.error("Error deleting account:", error);
                    if (error.code === 'auth/requires-recent-login') {
                        alert("For security reasons, this action requires a recent login. Please log out and log back in, then try again.");
                    } else {
                        alert("Failed to delete account: " + error.message);
                    }
                }
            }
        });
    }

    // --- Shrunk Navigation Icons Functionality ---
    // Removed - shrunk nav icons container has been removed

    // Auth step navigation buttons (for potential two-step signup flow)
    // Note: These are kept for potential future two-step signup flow
    // Currently, signup is handled in one step via auth-submit-btn
    const authNextBtn = document.getElementById('auth-next-btn');
    const authBackBtn = document.getElementById('auth-back-btn');
    const authSignupSubmitBtn = document.getElementById('auth-signup-submit-btn');
    const authStep1 = document.getElementById('auth-step-1');
    const authStep2 = document.getElementById('auth-step-2');
    const authStepIndicator = document.getElementById('auth-step-indicator');

    if (authNextBtn && authStep1 && authStep2) {
        authNextBtn.addEventListener('click', () => {
            // Get input elements
            const emailInputEl = document.getElementById('auth-email');
            const passwordInputEl = document.getElementById('auth-password');
            const confirmPasswordInputEl = document.getElementById('auth-confirm-password');
            
            // Validate step 1 fields before proceeding
            const email = emailInputEl ? emailInputEl.value.trim() : '';
            const password = passwordInputEl ? passwordInputEl.value : '';
            const confirmPassword = confirmPasswordInputEl ? confirmPasswordInputEl.value : '';
            
            if (!email || !password) {
                showAuthError("Please fill in email and password.");
                return;
            }
            
            if (password !== confirmPassword) {
                showAuthError("Passwords do not match.");
                return;
            }
            
            // Hide step 1, show step 2
            if (authStep1) authStep1.style.display = 'none';
            if (authStep2) authStep2.style.display = 'block';
            if (authStepIndicator) authStepIndicator.style.display = 'block';
        });
    }

    if (authBackBtn && authStep1 && authStep2) {
        authBackBtn.addEventListener('click', () => {
            // Go back to step 1
            if (authStep2) authStep2.style.display = 'none';
            if (authStep1) authStep1.style.display = 'block';
            if (authStepIndicator) authStepIndicator.style.display = 'none';
        });
    }

    if (authSignupSubmitBtn && authStep2) {
        authSignupSubmitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // This would handle the second step of signup
            // Currently, signup is handled in one step via auth-submit-btn
            // This is kept for potential future two-step flow
            console.log('Two-step signup submit clicked (not currently active)');
        });
    }

    // Innovative Card Functionality (works for all style variations)
    function initInnovativeCards() {
        // Get all feature sections with any innovative style
        const styleSelectors = [
            '.feature-details.style-overlapping',
            '.feature-details.style-accordion',
            '.feature-details.style-glassmorphism',
            '.feature-details.style-particles',
            '.feature-details.style-isometric',
            '.feature-details.style-minimal',
            '.feature-details.innovative-layout'
        ];
        
        styleSelectors.forEach(selector => {
            const layouts = document.querySelectorAll(selector);
            
            layouts.forEach(layout => {
                const cards = layout.querySelectorAll('.innovative-card');
                
                cards.forEach(card => {
                    card.addEventListener('click', function(e) {
                        // Don't trigger card activation if clicking on image wrapper
                        if (e.target.closest('.card-image-wrapper')) {
                            return;
                        }
                        // Remove active class from all cards in this layout
                        cards.forEach(c => c.classList.remove('active'));
                        // Add active class to clicked card
                        this.classList.add('active');
                    });
                });
            });
        });
    }

    // Initialize innovative cards
    initInnovativeCards();

    // --- Image Modal Functionality ---
    function initImageModal() {
        const imageModal = document.getElementById('image-modal');
        const modalImage = document.getElementById('modal-image');
        const closeImageModal = document.getElementById('close-image-modal');
        const imageWrappers = document.querySelectorAll('.card-image-wrapper');

        if (!imageModal || !modalImage) return;

        // Function to open image modal
        function openImageModal(imageSrc, imageAlt) {
            modalImage.src = imageSrc;
            modalImage.alt = imageAlt || 'Expanded view';
            imageModal.style.display = 'flex';
            imageModal.offsetHeight; // Force reflow
            setTimeout(() => imageModal.classList.add('active'), 10);
            document.body.style.overflow = 'hidden'; // Prevent scrolling
        }

        // Function to close image modal
        function closeImageModalFunc() {
            imageModal.classList.remove('active');
            setTimeout(() => {
                imageModal.style.display = 'none';
                document.body.style.overflow = ''; // Restore scrolling
            }, 300);
        }

        // Add click handlers to all image wrappers
        imageWrappers.forEach(wrapper => {
            wrapper.addEventListener('click', function(e) {
                e.stopPropagation(); // Prevent card click event
                const img = wrapper.querySelector('.card-image');
                if (img && img.src) {
                    openImageModal(img.src, img.alt);
                }
            });
        });

        // Close modal handlers
        if (closeImageModal) {
            closeImageModal.addEventListener('click', closeImageModalFunc);
        }

        // Close modal when clicking backdrop
        imageModal.addEventListener('click', function(e) {
            if (e.target === imageModal) {
                closeImageModalFunc();
            }
        });

        // Close modal on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && imageModal.classList.contains('active')) {
                closeImageModalFunc();
            }
        });
    }

    // Initialize image modal
    // initImageModal(); // Disabled - image expanded modal is not needed

    // --- Hero Slideshow Functionality ---
    function initSlideshow() {
        const slides = document.querySelectorAll('.slide');
        const indicators = document.querySelectorAll('.indicator');
        const prevBtn = document.querySelector('.slideshow-prev');
        const nextBtn = document.querySelector('.slideshow-next');
        
        // Check if slides exist
        if (!slides || slides.length === 0) {
            console.warn('No slides found for slideshow');
            return;
        }
        
        let currentSlide = 0;
        let slideshowInterval;
        let isAnimating = false;

        // Function to show a specific slide with card shuffle animation
        function showSlide(index, direction = 'next', skipAnimation = false) {
            // Normalize index
            index = index % slides.length;
            if (index < 0) index = slides.length + index;
            
            // Skip if already on this slide (unless it's initial setup)
            if (!skipAnimation && (isAnimating || index === currentSlide)) return;
            isAnimating = true;

            const prevIndex = currentSlide;
            const prevSlideEl = slides[prevIndex];
            const nextSlideEl = slides[index];

            if (!prevSlideEl || !nextSlideEl) {
                isAnimating = false;
                return;
            }

            // Remove all classes from slides
            slides.forEach(slide => {
                slide.classList.remove('active', 'prev', 'next');
            });

            // Remove active class from indicators
            indicators.forEach(indicator => indicator.classList.remove('active'));

            // Set initial transform positions based on direction
            if (direction === 'next') {
                // Next slide starts from right
                nextSlideEl.style.transform = 'translateX(100%) scale(0.95)';
                nextSlideEl.style.opacity = '0';
                nextSlideEl.style.transition = 'none';
            } else {
                // Next slide starts from left
                nextSlideEl.style.transform = 'translateX(-100%) scale(0.95)';
                nextSlideEl.style.opacity = '0';
                nextSlideEl.style.transition = 'none';
            }

            // Force reflow to apply initial position
            void nextSlideEl.offsetWidth;

            // Enable transitions and animate
            prevSlideEl.style.transition = 'all 0.7s cubic-bezier(0.4, 0, 0.2, 1)';
            nextSlideEl.style.transition = 'all 0.7s cubic-bezier(0.4, 0, 0.2, 1)';

            // Animate to final positions
            requestAnimationFrame(() => {
                if (direction === 'next') {
                    prevSlideEl.style.transform = 'translateX(-100%) scale(0.95)';
                    prevSlideEl.style.opacity = '0';
                } else {
                    prevSlideEl.style.transform = 'translateX(100%) scale(0.95)';
                    prevSlideEl.style.opacity = '0';
                }

                nextSlideEl.style.transform = 'translateX(0) scale(1)';
                nextSlideEl.style.opacity = '1';

                // After animation completes
                setTimeout(() => {
                    // Clean up and set final state
                    prevSlideEl.classList.remove('active');
                    prevSlideEl.style.transform = '';
                    prevSlideEl.style.opacity = '';
                    prevSlideEl.style.transition = '';

                    nextSlideEl.classList.add('active');
                    nextSlideEl.style.transform = '';
                    nextSlideEl.style.opacity = '';
                    nextSlideEl.style.transition = '';
                    
                    // Update current slide index
                    currentSlide = index;
                    
                    // Update indicators
                    if (indicators[currentSlide]) {
                        indicators[currentSlide].classList.add('active');
                    }

                    // Update prev/next classes
                    updatePrevNextClasses();
                    
                    isAnimating = false;
                }, 700);
            });
        }

        // Update prev/next classes for visual effect
        function updatePrevNextClasses() {
            slides.forEach((slide, index) => {
                slide.classList.remove('prev', 'next');
                if (index === currentSlide) return;
                
                const prevIndex = (currentSlide - 1 + slides.length) % slides.length;
                const nextIndex = (currentSlide + 1) % slides.length;
                
                if (index === prevIndex) {
                    slide.classList.add('prev');
                } else if (index === nextIndex) {
                    slide.classList.add('next');
                }
            });
        }

        // Function to go to next slide
        function nextSlide() {
            if (isAnimating) {
                console.log('Already animating, skipping nextSlide');
                return;
            }
            const nextIndex = (currentSlide + 1) % slides.length;
            console.log('Moving to next slide:', nextIndex, 'from', currentSlide);
            showSlide(nextIndex, 'next');
        }

        // Function to go to previous slide
        function prevSlide() {
            const prevIndex = (currentSlide - 1 + slides.length) % slides.length;
            showSlide(prevIndex, 'prev');
        }

        // Function to start auto-play
        function startAutoPlay() {
            // Clear any existing interval first
            if (slideshowInterval) {
                clearInterval(slideshowInterval);
            }
            slideshowInterval = setInterval(() => {
                if (!isAnimating) {
                    nextSlide();
                }
            }, 5000); // Change slide every 5 seconds
            console.log('Auto-play started, interval:', slideshowInterval);
        }

        // Function to stop auto-play
        function stopAutoPlay() {
            if (slideshowInterval) {
                clearInterval(slideshowInterval);
                slideshowInterval = null;
                console.log('Auto-play stopped');
            }
        }

        // Event listeners for navigation buttons
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                nextSlide();
                stopAutoPlay();
                startAutoPlay(); // Restart auto-play after manual navigation
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                prevSlide();
                stopAutoPlay();
                startAutoPlay(); // Restart auto-play after manual navigation
            });
        }

        // Event listeners for indicators
        indicators.forEach((indicator, index) => {
            indicator.addEventListener('click', () => {
                if (index === currentSlide) return;
                
                // Determine direction based on index
                const direction = index > currentSlide ? 'next' : 'prev';
                showSlide(index, direction);
                stopAutoPlay();
                startAutoPlay(); // Restart auto-play after manual navigation
            });
        });

        // Pause auto-play on hover
        const slideshowContainer = document.querySelector('.slideshow-container');
        if (slideshowContainer) {
            slideshowContainer.addEventListener('mouseenter', stopAutoPlay);
            slideshowContainer.addEventListener('mouseleave', startAutoPlay);
        }

        // Initialize - show first slide and start auto-play
        // Set initial state without animation
        slides.forEach((slide, index) => {
            // Remove all classes and inline styles
            slide.classList.remove('active', 'prev', 'next');
            slide.style.transform = '';
            slide.style.opacity = '';
            slide.style.transition = '';
            
            if (index === 0) {
                // First slide is active
                slide.classList.add('active');
                slide.style.opacity = '1';
                slide.style.transform = 'translateX(0) scale(1)';
            } else if (index === slides.length - 1) {
                // Last slide is prev
                slide.classList.add('prev');
                slide.style.opacity = '0';
                slide.style.transform = 'translateX(-100%) scale(0.95)';
            } else if (index === 1) {
                // Second slide is next
                slide.classList.add('next');
                slide.style.opacity = '0';
                slide.style.transform = 'translateX(100%) scale(0.95)';
            } else {
                // Other slides hidden
                slide.style.opacity = '0';
                slide.style.transform = 'translateX(100%) scale(0.95)';
            }
        });
        
        // Set first indicator as active
        indicators.forEach((indicator, index) => {
            indicator.classList.remove('active');
            if (index === 0) {
                indicator.classList.add('active');
            }
        });
        
        // Update prev/next classes
        updatePrevNextClasses();
        
        // Reset animation flag
        isAnimating = false;
        
        // Start auto-play after a short delay to ensure DOM is ready
        setTimeout(() => {
            if (slideshowInterval) {
                clearInterval(slideshowInterval);
            }
            startAutoPlay();
            console.log('Slideshow auto-play started');
        }, 2000);
    }

    // Initialize slideshow
    try {
        initSlideshow();
    } catch (error) {
        console.error('Error initializing slideshow:', error);
    }
    }
});