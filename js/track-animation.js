/**
 * @file track-animation.js
 * @description Manages a dynamic, non-interactive background animation of motorsport track outlines.
 *
 * @functionality
 * - Renders a grid-based animation of various motorsport track shapes onto an HTML5 canvas.
 * - The animation is only visible on sections of the page other than the "home" section, controlled by a `data-section` attribute on the `<body>` tag.
 * - It asynchronously loads track vector data from multiple CSV files.
 * - To create an organic, 'doodled' appearance, it randomizes the position, scale, and rotation of each track within a grid layout.
 * - It actively prevents the same track shape from appearing in adjacent grid cells to increase visual variety.
 * - The animation has two visual layers:
 *   1. A static, complete outline of all tracks is drawn in a subtle gray color on every frame.
 *   2. A brighter, accent-colored trail animates along the path of each track, creating a dynamic tracing effect.
 * - The animation is responsive and recalculates the grid and track instances on window resize.
 * - It is performance-conscious, using `requestAnimationFrame` for smooth rendering and only running when the animation is intended to be active.
 */
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('track-animation');
    if (!canvas) {
        console.error('Track animation canvas not found!');
        return;
    }
    
    // We'll keep the tracks visible for all display sizes, but disable animation
    const shouldAnimate = true; // Set to false to disable animation but show tracks
    
    const ctx = canvas.getContext('2d');

    // --- Configuration ---
    const GRID_CELL_SIZE = 450; // The size of each cell in the grid
    const TRACK_PADDING = 125;   // Padding within each cell to prevent tracks from touching cell edges

    const trackFiles = [
        'assets/bg animation/Austin.csv', 
        // , 'assets/bg animation/Budapest.csv',
        // 'assets/bg animation/Catalunya.csv', 'assets/bg animation/Hockenheim.csv', 
        //'assets/bg animation/IMS.csv',
        'assets/bg animation/Melbourne.csv', 'assets/bg animation/MexicoCity.csv',
        //  'assets/bg animation/Montreal.csv',
        'assets/bg animation/Monza.csv', 'assets/bg animation/MoscowRaceway.csv', 
        // 'assets/bg animation/Norisring.csv',
        'assets/bg animation/Nuerburgring.csv',
        // 'assets/bg animation/Oschersleben.csv', 'assets/bg animation/Sakhir.csv',
        'assets/bg animation/SaoPaulo.csv', 'assets/bg animation/Sepang.csv', 
        // 'assets/bg animation/Shanghai.csv',
        'assets/bg animation/Silverstone.csv', 
        // 'assets/bg animation/Sochi.csv', 
        'assets/bg animation/Spa.csv',
        // 'assets/bg animation/Spielberg.csv', 
        'assets/bg animation/Suzuka.csv', 'assets/bg animation/YasMarina.csv',
        'assets/bg animation/Zandvoort.csv'
    ];

    // --- State Management ---
    let animationFrameId = null;
    let trackInstances = [];
    let allTracks = [];

    // --- Animation Control ---
    function startAnimation() {
        if (animationFrameId) return; // Animation is already running
        console.log('Rendering static tracks...');
        
        // Just render once without animation
        if (!shouldAnimate) {
            renderStaticTracks();
        } else {
            animationFrameId = requestAnimationFrame(animate);
        }
    }

    function stopAnimation() {
        if (!animationFrameId) return; // Animation is already stopped
        console.log('Stopping animation...');
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        // Clear the canvas to ensure it's blank when stopped
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // --- Main Initialization Logic ---
    async function main() {
        resizeCanvas();
        allTracks = await loadAllTrackData();
        if (allTracks.length > 0) {
            createTrackInstances();
            setupAttributeObserver();
            window.addEventListener('resize', debounce(onResize, 250));
        } else {
            console.warn('No tracks were loaded. Tracks will not be displayed.');
        }
    }

    function onResize() {
        resizeCanvas();
        createTrackInstances();
    }

    function setupAttributeObserver() {
        // Start animation immediately on load
        startAnimation();

        // Optional: Keep observer if other logic depends on sections, but don't stop animation
        /*
        const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-section') {
                    const currentSection = document.body.getAttribute('data-section');
                    // Removed logic that stops animation on home section
                    // Animation now runs continuously
                }
            }
        });
        observer.observe(document.body, { attributes: true });
        */
    }

    // --- Data Loading & Parsing ---
    async function loadAllTrackData() {
        const promises = trackFiles.map(async (file) => {
            try {
                const response = await fetch(file);
                if (!response.ok) throw new Error(`Network response was not ok for ${file}`);
                const text = await response.text();
                const parsed = parseCSV(text);
                return normalizeTrack(parsed);
            } catch (error) {
                console.warn(`Failed to load or parse track: ${file}`, error);
                return null;
            }
        });
        const loadedTracks = (await Promise.all(promises)).filter(t => t && t.points.length > 0);
        console.log(`Successfully loaded ${loadedTracks.length} tracks.`);
        return loadedTracks;
    }

    function parseCSV(data) {
        const rows = data.trim().split('\n').slice(1); // Skip header
        return rows.map(row => {
            const [x, y] = row.split(',').map(Number);
            return { x, y };
        }).filter(p => !isNaN(p.x) && !isNaN(p.y));
    }

    // --- Grid & Track Instance Management ---
    function createTrackInstances() {
        trackInstances = [];
        if (allTracks.length === 0) return;

        const cols = Math.ceil(canvas.width / GRID_CELL_SIZE);
        const rows = Math.ceil(canvas.height / GRID_CELL_SIZE);
        const numCells = cols * rows;

        // Create a pool of track indices, shuffled, and large enough to fill the grid.
        // This ensures maximum variety by using each track once before repeating.
        let availableTracks = Array.from({ length: allTracks.length }, (_, i) => i);
        let trackPool = [];
        while (trackPool.length < numCells) {
            // Fisher-Yates shuffle algorithm for true randomness
            for (let i = availableTracks.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [availableTracks[i], availableTracks[j]] = [availableTracks[j], availableTracks[i]];
            }
            trackPool.push(...availableTracks);
        }

        for (let i = 0; i < numCells; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const trackIndex = trackPool[i];

            const randomXOffset = (Math.random() - 0.5) * (GRID_CELL_SIZE / 4);
            const randomYOffset = (Math.random() - 0.5) * (GRID_CELL_SIZE / 4);

            trackInstances.push({
                track: allTracks[trackIndex],
                x: col * GRID_CELL_SIZE + GRID_CELL_SIZE / 2 + randomXOffset,
                y: row * GRID_CELL_SIZE + GRID_CELL_SIZE / 2 + randomYOffset,
                size: (GRID_CELL_SIZE - TRACK_PADDING) * (0.7 + Math.random() * 0.6), // Randomize size
                rotation: Math.random() * Math.PI * 2, // Add random rotation
                progress: Math.random() * allTracks[trackIndex].points.length, // Start at a random point
                animationSpeed: 3 + Math.random() * 0.8 // Faster speed
            });
        }
    }

    // --- Canvas Drawing & Static Rendering ---
    function renderStaticTracks() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#f53518';

        trackInstances.forEach(instance => {
            drawStaticTrack(instance, primaryColor);
        });
    }

    // --- Canvas Drawing & Animation Loop (only used if shouldAnimate is true) ---
    // Track the last time we rendered a frame to throttle FPS on less powerful devices
    let lastFrameTime = 0;
    const targetFPS = 15; // Lower FPS to save resources
    const frameInterval = 1000 / targetFPS;
    
    function animate(timestamp) {
        // Throttle frame rate
        if (timestamp - lastFrameTime < frameInterval) {
            animationFrameId = requestAnimationFrame(animate);
            return;
        }
        
        lastFrameTime = timestamp;
        
        // Only render if the animation is in the viewport
        if (!isElementInViewport(canvas)) {
            animationFrameId = requestAnimationFrame(animate);
            return;
        }
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#f53518';

        trackInstances.forEach(instance => {
            instance.progress += instance.animationSpeed;
            if (instance.progress >= instance.track.points.length) {
                instance.progress = 0;
            }
            drawAnimatedTrack(instance, primaryColor);
        });

        animationFrameId = requestAnimationFrame(animate);
    }
    
    // Helper function to check if element is in viewport
    function isElementInViewport(el) {
        const rect = el.getBoundingClientRect();
        return (
            rect.top <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.bottom >= 0
        );
    }

    // Function to draw static tracks without animation
    function drawStaticTrack(instance, color) {
        const { track, x, y, size, rotation } = instance;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation); // Apply random rotation
        ctx.scale(size, size);

        // Draw the track outline with a very subtle stroke (more transparent)
        ctx.strokeStyle = 'rgba(182, 181, 181, 0.3)'; // Brighter base track
        ctx.lineWidth = 1.8 / size; // Thinner line
        ctx.beginPath();
        track.points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.stroke();
        
        // Draw the track with a more subtle highlight
        const rgbColor = hexToRgb(color);
        ctx.strokeStyle = `rgba(${rgbColor}, 0.1)`; // Low opacity base track
        ctx.lineWidth = 1.2 / size; // Thinner line
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowBlur = 2; // Reduced blur from 4 to 2
        ctx.shadowColor = `rgba(${rgbColor}, 0.22)`; // More transparent shadow
        ctx.beginPath();
        track.points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.stroke();
        
        ctx.restore();
    }

    // Keep the original drawAnimatedTrack function for when animation is enabled
    function drawAnimatedTrack(instance, color) {
        const { track, x, y, size, progress, rotation } = instance;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation); // Apply random rotation
        ctx.scale(size, size);

        // 1. Draw the faint, static background track outline
        ctx.strokeStyle = 'rgba(182, 181, 181, 0.3)';
        ctx.lineWidth = 2 / size;
        ctx.beginPath();
        track.points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.stroke();

        // 2. Draw the animated, colored trail
        const trailLength = 50; // The number of segments in our trail
        const headIndex = Math.floor(progress);
        const rgbColor = hexToRgb(color);

        for (let i = 0; i < trailLength; i++) {
            const currentIndex = (headIndex - i + track.points.length) % track.points.length;
            const nextIndex = (currentIndex + 1) % track.points.length;

            if (!track.points[currentIndex] || !track.points[nextIndex]) continue;

            const opacity = Math.max(0, 1 - (i / trailLength)); // Fade out
            
            ctx.beginPath();
            ctx.moveTo(track.points[currentIndex].x, track.points[currentIndex].y);
            ctx.lineTo(track.points[nextIndex].x, track.points[nextIndex].y);
            
            ctx.strokeStyle = `rgba(${rgbColor}, ${opacity})`;
            ctx.lineWidth = 3 / size;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.shadowBlur = 10;
            ctx.shadowColor = color;
            ctx.stroke();
        }
        
        ctx.restore();
    }

    // --- Utility Functions ---
    function resizeCanvas() {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    }

    function normalizeTrack(points) {
        if (points.length === 0) return { points: [] };

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        points.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        });

        const width = maxX - minX;
        const height = maxY - minY;
        const scale = Math.max(width, height);

        const normalized = points.map(p => ({
            x: (p.x - (minX + width / 2)) / scale,
            y: (p.y - (minY + height / 2)) / scale,
        }));

        return { points: normalized };
    }

    function hexToRgb(hex) {
        let r = 0, g = 0, b = 0;
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        }
        return `${r},${g},${b}`;
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // --- Start Execution ---
    main();
});
