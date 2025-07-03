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

const initSectionObserver = () => {
    const sections = document.querySelectorAll('.full-page-section');
    if (!sections.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                document.body.setAttribute('data-section', entry.target.id);
            }
        });
    }, { threshold: 0.7 }); // Trigger when 70% of the section is visible

    sections.forEach(section => observer.observe(section));
};

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');
    initHeaderScroll();
    initSectionObserver();
});

