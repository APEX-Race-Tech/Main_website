// Main JavaScript Entry Point

const initHeaderScroll = () => {
    const header = document.querySelector('.header');
    const scrollContainer = document.querySelector('.scroll-container');

    if (!header) return;

    // If a custom scroll container exists and is used for scrolling, listen to it; otherwise fall back to window scrolling
    const useWindowScroll = !scrollContainer || getComputedStyle(document.body).overflowY !== 'hidden';
    const onScroll = () => {
        const scrollY = useWindowScroll ? window.scrollY : (scrollContainer?.scrollTop || 0);
        if (scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    };

    if (useWindowScroll) {
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll(); // set initial state
    } else if (scrollContainer) {
        scrollContainer.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }
};

const initFollowPrompt = () => {
    const followPrompt = document.querySelector('.follow-prompt');
    if (!followPrompt) return;

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-section') {
                const currentSection = document.body.getAttribute('data-section');
                if (currentSection === 'contact') {
                    followPrompt.classList.add('visible');
                } else {
                    followPrompt.classList.remove('visible');
                }
            }
        });
    });

    // Initial check in case we're already on the home section
    const currentSection = document.body.getAttribute('data-section');
    if (currentSection === 'contact') {
        followPrompt.classList.add('visible');
    } else {
        followPrompt.classList.remove('visible');
    }

    observer.observe(document.body, {
        attributes: true //configure it to listen to attribute changes
    });
};

const initSectionObserver = () => {
    document.body.setAttribute('data-section', 'home'); // Set initial state
    const sections = document.querySelectorAll('.full-page-section');
    if (!sections.length) return;

    // Use a single IntersectionObserver for both section detection and animations
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            // Set current section for styling
            if (entry.isIntersecting) {
                document.body.setAttribute('data-section', entry.target.id);
                
                // Handle CSS animations when section comes into view
                const animatedElements = entry.target.querySelectorAll('.animate-on-scroll');
                if (animatedElements.length > 0) {
                    animatedElements.forEach(el => {
                        el.classList.add('animate-fade-in-up');
                    });
                }
            }
        });
    }, { 
        threshold: 0.1, // Trigger when 10% of the section is visible
        rootMargin: '0px 0px -10% 0px' // Slightly before elements enter viewport
    }); 

    sections.forEach(section => observer.observe(section));
};

const initSocialMediaVisibility = () => {
    const homeSection = document.querySelector('#home');
    if (homeSection) {
        // Set initial state on page load
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    document.body.setAttribute('data-section', 'home');
                }
            });
        }, { threshold: 0.7 });
        observer.observe(homeSection);
    }
};

const initMobileNav = () => {
    const hamburgerBtn = document.querySelector('.hamburger-btn');
    const mobileNav = document.querySelector('.mobile-nav');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav .nav-links a');

    if (hamburgerBtn && mobileNav) {
        hamburgerBtn.addEventListener('click', () => {
            hamburgerBtn.classList.toggle('open');
            mobileNav.classList.toggle('open');
        });

        mobileNavLinks.forEach(link => {
            link.addEventListener('click', () => {
                hamburgerBtn.classList.remove('open');
                mobileNav.classList.remove('open');
            });
        });
    }
};

// Hide sticky CTA when footer is visible to prevent overlap
const initFooterObserver = () => {
    const footer = document.querySelector('.site-footer');
    const stickyCta = document.querySelector('.sticky-cta');
    if (!footer || !stickyCta) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                stickyCta.classList.add('is-hidden');
            } else {
                stickyCta.classList.remove('is-hidden');
            }
        });
    }, {
        threshold: 0,
        // Start hiding CTA a bit before the footer fully enters the viewport
        rootMargin: '0px 0px -10% 0px'
    });

    observer.observe(footer);
};

document.addEventListener('DOMContentLoaded', () => {
    // --- Loading Screen Logic ---
    const loadingScreen = document.getElementById('loading-screen');

    // Ensure the loading screen is visible initially
    if (loadingScreen) {
        // Set a timeout to hide the loading screen after 3 seconds (reduced from 5 for better UX)
        setTimeout(() => {
            loadingScreen.classList.add('hidden');
        }, 3000); // 3000 milliseconds = 3 seconds
    }
    
    // Initialize smooth-scroll library without auto-init
    const scroll = new SmoothScroll(null, {
        speed: 800,
        speedAsDuration: true,
        easing: 'easeInOutCubic',
        header: '.header' // Specify the fixed header for offset calculation
    });

    // Manually handle clicks for smooth scrolling (works with custom container or window)
    document.addEventListener('click', function (event) {
        // Find link
        const anchor = event.target.closest('a[href*="#"]');
        if (!anchor) return;

        // Prevent default behavior and stop propagation to avoid conflicts
        event.preventDefault();
        event.stopPropagation();

        // Get target element
        const target = document.querySelector(anchor.hash);
        if (!target) return;

        // Animate scroll to target within the custom scroll container if present, otherwise use window
        const scrollContainer = document.querySelector('.scroll-container');
        if (scrollContainer) {
            scroll.animateScroll(target, anchor, { container: scrollContainer });
        } else {
            scroll.animateScroll(target, anchor);
        }
    }, false);

    console.log('DOM fully loaded and parsed');
    initHeaderScroll();
    initSectionObserver();
    initFollowPrompt();
    initMobileNav();
    initSocialMediaVisibility();
    initFooterObserver();
});
