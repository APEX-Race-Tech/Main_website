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

    if (!hamburgerBtn || !mobileNav) return;

    const setNavState = (open) => {
        const isOpen = Boolean(open);
        hamburgerBtn.classList.toggle('open', isOpen);
        mobileNav.classList.toggle('open', isOpen);
        hamburgerBtn.setAttribute('aria-expanded', String(isOpen));
        mobileNav.setAttribute('aria-hidden', String(!isOpen));
        mobileNav.style.display = isOpen ? 'flex' : 'none';
        document.body.classList.toggle('nav-open', isOpen);
    };

    // Ensure initial state
    setNavState(false);

    hamburgerBtn.addEventListener('click', () => {
        const willOpen = !hamburgerBtn.classList.contains('open');
        setNavState(willOpen);
    });

    mobileNavLinks.forEach(link => {
        link.addEventListener('click', () => setNavState(false));
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            setNavState(false);
        }
    });
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
    const hasSmoothScroll = typeof SmoothScroll === 'function';
    const scrollInstance = hasSmoothScroll ? new SmoothScroll(null, {
        speed: 800,
        speedAsDuration: true,
        easing: 'easeInOutCubic',
        header: '.header'
    }) : null;

    document.addEventListener('click', (event) => {
        const anchor = event.target.closest('a[href*="#"]');
        if (!anchor) return;

        event.preventDefault();
        event.stopPropagation();

        const target = document.querySelector(anchor.hash);
        if (!target) return;

        const scrollContainer = document.querySelector('.scroll-container');
        if (hasSmoothScroll && scrollInstance) {
            if (scrollContainer) {
                scrollInstance.animateScroll(target, anchor, { container: scrollContainer });
            } else {
                scrollInstance.animateScroll(target, anchor);
            }
        } else if (scrollContainer) {
            scrollContainer.scrollTo({
                top: target.offsetTop,
                behavior: 'smooth'
            });
        } else {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
