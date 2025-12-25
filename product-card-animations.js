/* ============================================
   PRODUCT CARD SCROLL ANIMATIONS
   ============================================
   JavaScript for scroll-triggered animations
   Copy this into your JavaScript file or link it separately
*/

/**
 * Initialize scroll animations for product cards
 * Uses IntersectionObserver to trigger animations when elements enter viewport
 */
const initProductCardAnimations = () => {
    const animatedElements = document.querySelectorAll('.animate-on-scroll');
    
    // Check if IntersectionObserver is supported
    if (!animatedElements.length || !('IntersectionObserver' in window)) {
        // Fallback: show elements immediately if IntersectionObserver not supported
        animatedElements.forEach(el => {
            el.style.opacity = '1';
        });
        return;
    }
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-fade-in-up');
                observer.unobserve(entry.target); // Only animate once
            }
        });
    }, { 
        threshold: 0.1, // Trigger when 10% of element is visible
        rootMargin: '0px 0px -10% 0px' // Trigger slightly before element enters viewport
    });
    
    // Observe all animated elements
    animatedElements.forEach(el => observer.observe(el));
};

/**
 * Initialize animations when DOM is ready
 */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProductCardAnimations);
} else {
    // DOM is already loaded
    initProductCardAnimations();
}

// Export for use in modules (if using ES6 modules)
// export { initProductCardAnimations };

