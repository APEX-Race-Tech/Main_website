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

// --- Sign-in: AWS Cognito (js/cognito-auth.js exposes window.RaAuth) ---

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
    // Unregister any service workers that might be blocking requests
    if ('serviceWorker' in navigator) {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.unregister();
                console.log('Service worker unregistered to prevent blocking external requests');
            }
        } catch (error) {
            console.warn('Could not unregister service workers:', error);
        }
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

    // --- Auth modal modes: signin, signup, confirm (email code), forgot, reset ---
    let authMode = 'signin';
    let pendingCredentials = null; // email + password kept between sign-up and email confirmation

    const AUTH_MODES = {
        signin:  { title: 'Sign In to Download', subtitle: 'Sign in to access downloads and save your preferences.', submit: 'Sign In' },
        signup:  { title: 'Create Account', subtitle: 'Join Race Insight to start downloading.', submit: 'Create Account' },
        confirm: { title: 'Confirm Your Email', subtitle: 'Enter the verification code we emailed you.', submit: 'Confirm' },
        forgot:  { title: 'Reset Password', subtitle: 'Enter your email and we will send a verification code.', submit: 'Send Code' },
        reset:   { title: 'Set New Password', subtitle: 'Enter the code from your email and a new password.', submit: 'Set Password' }
    };

    function show(id, visible) {
        const el = document.getElementById(id);
        if (el) el.style.display = visible ? 'block' : 'none';
    }

    function setAuthMode(mode) {
        authMode = mode;
        isSignUp = mode === 'signup';
        const copy = AUTH_MODES[mode];
        const titleEl = document.getElementById('auth-title');
        const subtitleEl = document.getElementById('auth-subtitle');
        const submitBtnEl = document.getElementById('auth-submit-btn');
        const passwordEl = document.getElementById('auth-password');
        const codeEl = document.getElementById('auth-code');
        const confirmPwdInputEl = document.getElementById('auth-confirm-password');
        const switchTextEl = document.getElementById('auth-switch-text');

        if (titleEl) titleEl.textContent = copy.title;
        if (subtitleEl) subtitleEl.textContent = copy.subtitle;
        if (submitBtnEl) { submitBtnEl.textContent = copy.submit; submitBtnEl.disabled = false; }

        show('auth-password-group', mode === 'signin' || mode === 'signup' || mode === 'reset');
        show('auth-code-group', mode === 'confirm' || mode === 'reset');
        show('confirm-password-group', mode === 'signup');
        show('forgot-password-link', mode === 'signin');
        show('auth-resend-link', mode === 'confirm');

        if (passwordEl) {
            passwordEl.placeholder = mode === 'reset' ? 'New password' : 'Password';
            passwordEl.autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
            passwordEl.required = mode === 'signin' || mode === 'signup' || mode === 'reset';
        }
        if (codeEl) { codeEl.required = mode === 'confirm' || mode === 'reset'; if (mode !== 'confirm' && mode !== 'reset') codeEl.value = ''; }
        if (confirmPwdInputEl) {
            confirmPwdInputEl.required = mode === 'signup';
            if (mode !== 'signup') confirmPwdInputEl.value = '';
        }
        if (switchTextEl) {
            switchTextEl.innerHTML = mode === 'signin'
                ? "Don't have an account? <a href=\"#\" id=\"toggle-auth-mode\">Sign Up</a>"
                : 'Back to <a href="#" id="toggle-auth-mode">Sign In</a>';
        }
        show('auth-switch-row', true);
    }

    // Helper function to reset modal to sign-in state
    function resetAuthModalToSignIn() {
        pendingCredentials = null;
        const passwordEl = document.getElementById('auth-password');
        if (passwordEl) passwordEl.value = '';
        const codeEl = document.getElementById('auth-code');
        if (codeEl) codeEl.value = '';
        setAuthMode('signin');
        hideAuthMessages();
    }

    // Log new waitlist signup to Google Sheets (non-blocking, silent on failure)
    async function logToGoogleSheets(data) {
        const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbyF5hQmZqPspXxigQHb7S7HQFjFUuYefoijlEuUzSzVXnllfWMDomM5Y_bfHtdx5w2Z/exec';
        try {
            const formData = new FormData();
            formData.append('fullname', data.fullname || '');
            formData.append('email', data.email || '');
            formData.append('simulator', data.simulator || '');
            formData.append('experience', data.experience || '');
            formData.append('location', data.location || '');
            formData.append('referral', data.referral || '');
            formData.append('date', data.date || new Date().toLocaleString());
            formData.append('source', 'Race Insight Sign-Up');
            await fetch(SHEETS_URL, { method: 'POST', body: formData, mode: 'no-cors' });
            console.log('Waitlist entry logged to Google Sheets');
        } catch (err) {
            // Non-critical — do not interrupt user flow
            console.warn('Could not log to Google Sheets:', err.message);
        }
    }

    // Onboarding Logic
    const onboardingModal = document.getElementById('onboarding-modal');
    const onboardingForm = document.getElementById('onboarding-form');
    
    // Prevent closing onboarding modal by clicking outside
    if (onboardingModal) {
        onboardingModal.addEventListener('click', (e) => {
            // Only prevent if clicking the backdrop, not the content
            if (e.target === onboardingModal) {
                e.preventDefault();
                e.stopPropagation();
                // Show a message that profile completion is required
                alert('Please complete your profile to continue.');
            }
        });
    }
    
    // Handle "Other" option text areas
    const simulatorSelect = document.getElementById('onboarding-simulator');
    const simulatorOtherText = document.getElementById('onboarding-simulator-other');
    const referralSelect = document.getElementById('onboarding-referral');
    const referralOtherText = document.getElementById('onboarding-referral-other');
    
    // Show/hide simulator "Other" text area
    if (simulatorSelect && simulatorOtherText) {
        simulatorSelect.addEventListener('change', () => {
            if (simulatorSelect.value === 'Other') {
                simulatorOtherText.style.display = 'block';
                simulatorOtherText.setAttribute('required', 'required');
            } else {
                simulatorOtherText.style.display = 'none';
                simulatorOtherText.removeAttribute('required');
                simulatorOtherText.value = '';
            }
        });
    }
    
    // Show/hide referral "Other" text area
    if (referralSelect && referralOtherText) {
        referralSelect.addEventListener('change', () => {
            if (referralSelect.value === 'Other') {
                referralOtherText.style.display = 'block';
                referralOtherText.setAttribute('required', 'required');
            } else {
                referralOtherText.style.display = 'none';
                referralOtherText.removeAttribute('required');
                referralOtherText.value = '';
            }
        });
    }

    // Check if user has completed onboarding (all required fields filled)
    async function hasCompletedOnboarding(user) {
        const profile = (user && user.profile) || {};
        if (profile.simulator && profile.experience && profile.location && profile.referral) return true;
        // Fallback when the save failed earlier in this browser.
        return !!user && localStorage.getItem('onboardingCompleted_' + user.uid) === 'true';
    }

    async function checkOnboarding(user, profileResult) {
        if (!onboardingModal) {
            console.warn("Onboarding modal not found");
            return;
        }
        
        // Check if user needs onboarding
        const hasCompleted = await hasCompletedOnboarding(user);
        
        if (!hasCompleted) {
            console.log("Showing onboarding modal - hasCompleted:", hasCompleted);
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
            const user = RaAuth.currentUser;
            if (!user) return;

            const simulatorEl = document.getElementById('onboarding-simulator');
            const experienceEl = document.getElementById('onboarding-experience');
            const locationEl = document.getElementById('onboarding-location');
            const referralEl = document.getElementById('onboarding-referral');
            const simulatorOtherEl = document.getElementById('onboarding-simulator-other');
            const referralOtherEl = document.getElementById('onboarding-referral-other');
            
            if (!simulatorEl || !experienceEl || !locationEl || !referralEl) {
                console.error('Onboarding form elements not found');
                return;
            }

            let simulator = simulatorEl.value.trim();
            const experience = experienceEl.value.trim();
            const location = locationEl.value.trim();
            let referral = referralEl.value.trim();

            // If "Other" is selected, use the text area value
            if (simulator === 'Other') {
                if (simulatorOtherEl) {
                    const otherValue = simulatorOtherEl.value.trim();
                    if (!otherValue) {
                        alert('Please specify your simulator.');
                        return;
                    }
                    simulator = otherValue;
                } else {
                    alert('Please specify your simulator.');
                    return;
                }
            }
            
            if (referral === 'Other') {
                if (referralOtherEl) {
                    const otherValue = referralOtherEl.value.trim();
                    if (!otherValue) {
                        alert('Please specify how you heard about us.');
                        return;
                    }
                    referral = otherValue;
                } else {
                    alert('Please specify how you heard about us.');
                    return;
                }
            }

            // Validate all fields are filled
            if (!simulator || !experience || !location || !referral) {
                alert('Please fill in all fields to complete your profile.');
                return;
            }

            try {
                await RaAuth.updateProfile({
                    simulator: simulator,
                    experience: experience,
                    location: location,
                    referral: referral
                });

                console.log('Onboarding data saved successfully');

                // Log signup with date to Google Sheets (best-effort, non-blocking)
                logToGoogleSheets({
                    fullname: user.displayName || user.email,
                    email: user.email,
                    simulator: simulator,
                    experience: experience,
                    location: location,
                    referral: referral,
                    date: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                });
                
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
                
                // Fallback: remember completion locally if the save failed
                localStorage.setItem('onboardingCompleted_' + user.uid, 'true');
                
                // Provide more helpful error message - only show if save actually failed
                const errorMessage = 'Failed to save information. You can update it later in your profile.';
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


    // Load user profile data (stored as Cognito attributes, loaded at sign-in)
    async function loadUserProfile(user) {
        return (user && user.profile) || null;
    }

    // Load and display profile data (defined before use)
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
    RaAuth.onAuthStateChanged(async (user) => {
        if (user) {
            console.log("=== User is signed in:", user.email, "===");
            
            // Store login state in cookies (30 days expiration)
            // These cookies help maintain session state and provide quick UI updates on page load
            setCookie('userLoggedIn', 'true', 30);
            setCookie('userEmail', user.email || '', 30);
            setCookie('userId', user.uid || '', 30);
            
            console.log("User session saved to cookies - will persist for 30 days");
            
            const profileResult = { isNewUser: isNewUserSignup };

            // Onboarding is only required at download time, not on page load/browse
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
                
                setTimeout(async () => {
                    // Remove active class to trigger fade out
                    authModal.classList.remove('active');
                    // Hide modal after animation
                    setTimeout(async () => {
                        authModal.style.setProperty('display', 'none', 'important');
                        console.log("✓ Modal display set to none");
                        
                        // Reset modal to sign-in state
                        resetAuthModalToSignIn();
                        
                        // Execute pending download action after auth (onboarding gate handled inside download handlers)
                        if (pendingDownloadAction) {
                            // Check onboarding first if needed
                            const hasCompleted = await hasCompletedOnboarding(user);
                            if (!hasCompleted) {
                                console.log("Download requested but onboarding not complete — showing onboarding modal");
                                setTimeout(() => {
                                    checkOnboarding(user, profileResult);
                                }, 100);
                            } else {
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
            resetAuthModalToSignIn();
            
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

    // Switch between Sign In and Sign Up (and back from confirm / forgot / reset)
    const confirmPasswordInput = document.getElementById('auth-confirm-password');
    const authSwitchText = document.getElementById('auth-switch-text');
    if (authSwitchText) {
        authSwitchText.addEventListener('click', (e) => {
            const link = e.target.closest('#toggle-auth-mode');
            if (!link) return;
            e.preventDefault();
            hideAuthMessages();
            setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
        });
    }

    if (forgotPasswordBtn) {
        forgotPasswordBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hideAuthMessages();
            setAuthMode('forgot');
        });
    }

    const resendCodeBtn = document.getElementById('auth-resend-btn');
    if (resendCodeBtn) {
        resendCodeBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = (pendingCredentials && pendingCredentials.email) || (emailInput ? emailInput.value.trim() : '');
            if (!validateEmail(email)) { showAuthError('Please enter a valid email address.'); return; }
            try {
                await RaAuth.resendConfirmationCode(email);
                showAuthSuccess('A new code is on its way.');
            } catch (error) {
                console.error('Resend code error:', error);
                showAuthError(getErrorMessage(error));
            }
        });
    }

    function setSubmitBusy(busy, label) {
        if (!authSubmitBtn) return;
        authSubmitBtn.disabled = busy;
        authSubmitBtn.textContent = busy ? label : AUTH_MODES[authMode].submit;
    }

    // Email + password form: one handler for every mode
    if (emailForm) {
        emailForm.style.display = 'block';
        emailForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAuthMessages();
            const codeInput = document.getElementById('auth-code');
            const email = emailInput ? emailInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value : '';
            const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';
            const code = codeInput ? codeInput.value.trim() : '';

            if (!RaAuth.configured) {
                showAuthError(RaAuth.friendlyError({ code: 'NotConfigured' }));
                return;
            }
            if (!validateEmail(email)) {
                showAuthError(email ? 'Please enter a valid email address.' : 'Please enter your email address.');
                return;
            }

            try {
                if (authMode === 'signin') {
                    if (!password) { showAuthError('Please enter your password.'); return; }
                    setSubmitBusy(true, 'Signing In...');
                    try {
                        await RaAuth.signIn(email, password);
                        showAuthSuccess('Signing in...');
                        if (passwordInput) passwordInput.value = '';
                        // onAuthStateChanged closes the modal.
                    } catch (error) {
                        if (error && error.code === 'UserNotConfirmedException') {
                            pendingCredentials = { email: email, password: password };
                            await RaAuth.resendConfirmationCode(email).catch(() => {});
                            setAuthMode('confirm');
                            showAuthSuccess('This account is not confirmed yet. We emailed you a new code.');
                            return;
                        }
                        throw error;
                    }
                } else if (authMode === 'signup') {
                    const passwordValidation = validatePassword(password);
                    if (!passwordValidation.valid) { showAuthError(passwordValidation.message); return; }
                    if (!confirmPassword) { showAuthError('Please confirm your password.'); return; }
                    if (password !== confirmPassword) { showAuthError('Passwords do not match.'); return; }
                    setSubmitBusy(true, 'Creating Account...');
                    const result = await RaAuth.signUp(email, password);
                    isNewUserSignup = true;
                    pendingCredentials = { email: email, password: password };
                    if (result.needsConfirmation) {
                        if (passwordInput) passwordInput.value = '';
                        if (confirmPasswordInput) confirmPasswordInput.value = '';
                        setAuthMode('confirm');
                        showAuthSuccess('We emailed a verification code to ' + email + '.');
                    } else {
                        await RaAuth.signIn(email, password);
                        showAuthSuccess('Account created successfully! Logging you in...');
                    }
                } else if (authMode === 'confirm') {
                    if (!code) { showAuthError('Please enter the verification code.'); return; }
                    const credentials = pendingCredentials || { email: email, password: '' };
                    setSubmitBusy(true, 'Confirming...');
                    await RaAuth.confirmSignUp(credentials.email, code);
                    if (credentials.password) {
                        await RaAuth.signIn(credentials.email, credentials.password);
                        showAuthSuccess('Email confirmed. Signing you in...');
                        pendingCredentials = null;
                    } else {
                        setAuthMode('signin');
                        showAuthSuccess('Email confirmed. Sign in to continue.');
                    }
                } else if (authMode === 'forgot') {
                    setSubmitBusy(true, 'Sending...');
                    await RaAuth.requestPasswordReset(email);
                    setAuthMode('reset');
                    showAuthSuccess('We emailed a verification code to ' + email + '.');
                } else if (authMode === 'reset') {
                    if (!code) { showAuthError('Please enter the verification code.'); return; }
                    const passwordValidation = validatePassword(password);
                    if (!passwordValidation.valid) { showAuthError(passwordValidation.message); return; }
                    setSubmitBusy(true, 'Saving...');
                    await RaAuth.confirmPasswordReset(email, code, password);
                    if (passwordInput) passwordInput.value = '';
                    setAuthMode('signin');
                    showAuthSuccess('Password updated. Sign in with your new password.');
                }
            } catch (error) {
                console.error('Auth error (' + authMode + '):', error);
                showAuthError(getErrorMessage(error));
                isNewUserSignup = false;
            } finally {
                if (authSubmitBtn) {
                    authSubmitBtn.disabled = false;
                    authSubmitBtn.textContent = AUTH_MODES[authMode].submit;
                }
            }
        });
    }

    // Helper function to get user-friendly error messages
    function getErrorMessage(error) {
        return RaAuth.friendlyError(error);
    }

    // Logout functionality (only in profile modal)
    const logoutBtns = [
        document.getElementById('modal-logout-btn')
    ];
    logoutBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                RaAuth.signOut().then(() => {
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
    
    // Total downloads = GitHub's own download count for the installer files across
    // all public releases, so the site needs no database or write access.
    const totalDownloadContainer = document.getElementById('total-download-container');
    const DOWNLOAD_THRESHOLD = 50; // Big number threshold
    const COUNT_CACHE_KEY = 'ri_total_downloads';
    const COUNT_CACHE_MS = 10 * 60 * 1000;
    const INSTALLER_FILE = /\.(exe|AppImage|dmg)$/i;

    function showDownloadCount(count) {
        if (!downloadCountElement || !totalDownloadContainer) return;
        if (count < DOWNLOAD_THRESHOLD) {
            totalDownloadContainer.style.display = 'none';
            return;
        }
        totalDownloadContainer.style.display = 'block';
        const currentText = downloadCountElement.textContent.trim();
        const currentCount = parseInt(currentText.replace(/,/g, '')) || 0;
        if (currentText === 'Loading...' || currentText === '') {
            downloadCountElement.textContent = formatNumber(count);
        } else if (count !== currentCount) {
            animateCount(downloadCountElement, count);
        }
    }

    function countInstallerDownloads(releases) {
        let total = 0;
        (releases || []).forEach(release => {
            (release.assets || []).forEach(asset => {
                if (INSTALLER_FILE.test(asset.name)) total += asset.download_count || 0;
            });
        });
        return total;
    }

    async function loadTotalDownloads() {
        try {
            const cached = JSON.parse(sessionStorage.getItem(COUNT_CACHE_KEY) || 'null');
            if (cached && Date.now() - cached.at < COUNT_CACHE_MS) {
                showDownloadCount(cached.count);
                return;
            }
        } catch (e) { /* storage unavailable or corrupt: fetch fresh */ }
        try {
            const response = await fetch('https://api.github.com/repos/APEX-Race-Tech/RACE-Insight-Public/releases?per_page=100');
            if (!response.ok) throw new Error('GitHub API error: ' + response.status);
            const count = countInstallerDownloads(await response.json());
            try { sessionStorage.setItem(COUNT_CACHE_KEY, JSON.stringify({ at: Date.now(), count: count })); } catch (e) { /* ignore */ }
            showDownloadCount(count);
        } catch (error) {
            console.warn('Could not load download count:', error.message);
            if (totalDownloadContainer) totalDownloadContainer.style.display = 'none';
        }
    }
    loadTotalDownloads();

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
    async function handleDownloadClick(e) {
        if (e) e.preventDefault();
        const user = RaAuth.currentUser;
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
        // Logged in — check onboarding before scrolling to download
        const hasCompleted = await hasCompletedOnboarding(user);
        if (!hasCompleted) {
            pendingDownloadAction = () => {
                const downloadSection = document.getElementById('download');
                if (downloadSection) downloadSection.scrollIntoView({ behavior: 'smooth' });
            };
            checkOnboarding(user, null);
            return;
        }
        // Fully cleared — scroll to download section
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
        downloadBtn.addEventListener('click', async () => {
            if (!selectedPlatform) {
                alert('Please select your platform first. Windows is available now; Linux and Mac are coming soon.');
                return;
            }
            const user = RaAuth.currentUser;
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
            // Logged in — gate on onboarding completion before download
            const hasCompletedProfile = await hasCompletedOnboarding(user);
            if (!hasCompletedProfile) {
                pendingDownloadAction = () => triggerDownload();
                checkOnboarding(user, null);
                return;
            }
            triggerDownload();
        });
    }

    // ===== GitHub release lookup (shared by the version label and downloads) =====
    // Repository is public: https://github.com/APEX-Race-Tech/RACE-Insight-Public
    // The latest release is fetched automatically; publishing a new GitHub
    // release updates the download and version label with no site change.
    const GITHUB_OWNER = 'APEX-Race-Tech';
    const GITHUB_REPO = 'RACE-Insight-Public';

    const RELEASE_FILE_PATTERNS = {
        'windows': /RACE-Insight.*Setup.*\.exe$/i,
        'linux': /RACE-?Insight.*\.AppImage$/i,
        'apple': /RACE-?Insight.*\.dmg$/i
    };

    const FALLBACK_VERSION = 'v0.1.37';
    const FALLBACK_DOWNLOAD_URLS = {
        'windows': `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v0.1.37/RACE-Insight-Setup-0.1.37.exe`
    };

    let latestReleasePromise = null;

    // Fetch the latest public release once per page load and reuse the result.
    function fetchLatestRelease() {
        if (!latestReleasePromise) {
            latestReleasePromise = fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`GitHub API error: ${response.status}`);
                    }
                    return response.json();
                })
                .catch(error => {
                    // Allow a later click to retry after a transient failure.
                    latestReleasePromise = null;
                    throw error;
                });
        }
        return latestReleasePromise;
    }

    function findReleaseAsset(release, platform) {
        const pattern = RELEASE_FILE_PATTERNS[platform];
        if (!pattern || !release || !Array.isArray(release.assets)) return null;
        return release.assets.find(asset => pattern.test(asset.name)) || null;
    }

    // Show the current release version under the platform buttons.
    const downloadVersionEl = document.getElementById('download-version');
    if (downloadVersionEl) {
        fetchLatestRelease()
            .then(release => {
                const published = release.published_at
                    ? new Date(release.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                    : '';
                downloadVersionEl.textContent = published
                    ? `Latest version: ${release.tag_name} (${published})`
                    : `Latest version: ${release.tag_name}`;
            })
            .catch(() => {
                downloadVersionEl.textContent = `Latest version: ${FALLBACK_VERSION}`;
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
        
        // ===== GitHub Releases API (primary; see fetchLatestRelease above) =====
        let downloadUrl = null;

        try {
            const release = await fetchLatestRelease();
            const asset = findReleaseAsset(release, selectedPlatform);

            if (!asset) {
                // Fallback to hardcoded URLs if API doesn't find the asset
                throw new Error(`No release file found for ${selectedPlatform}`);
            }
            
            downloadUrl = asset.browser_download_url;
            console.log(`Downloading ${asset.name} (${release.tag_name}) from GitHub Releases`);
            
        } catch (error) {
            console.error('GitHub API download error:', error);
            
            // ===== Fallback: Direct Download URLs =====
            // Used only when the GitHub API is unreachable or the release has no
            // file for this platform. Keep it in step with the latest public
            // release. Only Windows installers are published today.
            downloadUrl = FALLBACK_DOWNLOAD_URLS[selectedPlatform];
            if (!downloadUrl) {
                alert('Race Insight is not available for this platform yet. Windows is available now; Linux and Mac are coming soon.');
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
            const user = RaAuth.currentUser;
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
            const user = RaAuth.currentUser;
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
            const user = RaAuth.currentUser;
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
            const user = RaAuth.currentUser;
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
                await RaAuth.updateProfile({
                    displayName: displayName,
                    bio: bio,
                    location: location,
                    simulator: simulator,
                    experience: experience
                });

                if (profileEditForm) profileEditForm.style.display = 'none';
                await loadProfileData(RaAuth.currentUser || user);
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
            const user = RaAuth.currentUser;
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
                await RaAuth.changePassword(currentPassword, newPassword);
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
            const user = RaAuth.currentUser;
            if (!user) return;

            const confirmed = confirm("WARNING: This will permanently delete your account and all associated data. This action cannot be undone. Are you sure?");
            
            if (confirmed) {
                try {
                    await RaAuth.deleteAccount();
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
                    alert("Failed to delete account: " + RaAuth.friendlyError(error));
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
});