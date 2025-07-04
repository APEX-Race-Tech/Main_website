// Main JavaScript Entry Point

const initHeaderScroll = () => {
    const header = document.querySelector('.header');
    const scrollContainer = document.querySelector('.scroll-container');

    if (!header || !scrollContainer) return;

    scrollContainer.addEventListener('scroll', () => {
        if (scrollContainer.scrollTop > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
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
    const sections = document.querySelectorAll('.full-page-section');
    if (!sections.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                document.body.setAttribute('data-section', entry.target.id);
            }
        });
    }, { threshold: 0.1 }); // Trigger when 10% of the section is visible

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

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');
    initHeaderScroll();
    initSectionObserver();
    initFollowPrompt();
    initMobileNav();
    initSocialMediaVisibility();
});
