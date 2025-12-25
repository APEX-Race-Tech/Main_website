# Product Card Snippet - Complete Guide

This package includes all the code needed to implement the product cards shown in the design.

## Files Included

1. **`product-card-complete-snippet.html`** - Standalone HTML file with embedded CSS and JavaScript (ready to use)
2. **`product-card-snippet.html`** - HTML structure only
3. **`product-card-styles.css`** - Complete CSS stylesheet
4. **`product-card-animations.js`** - JavaScript for scroll animations

## Quick Start

### Option 1: Use the Complete Standalone File

Simply open `product-card-complete-snippet.html` in a browser. Everything is included!

### Option 2: Integrate into Your Project

1. **Copy the HTML structure** from `product-card-snippet.html` into your HTML file
2. **Link the CSS** in your `<head>`:
   ```html
   <link rel="stylesheet" href="product-card-styles.css">
   ```
3. **Link the JavaScript** before closing `</body>`:
   ```html
   <script src="product-card-animations.js"></script>
   ```

## Dependencies

Make sure you have these in your project:

### Font Awesome (for icons)
```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
```

### Google Fonts - Inter (optional, but recommended)
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

## HTML Structure

```html
<div class="product-showcase">
    <div class="product-card">
        <div class="product-content">
            <div class="product-card__heading">
                <span class="product-card__badge">
                    <i class="fa-solid fa-location-crosshairs"></i>
                </span>
                <div>
                    <p class="product-card__eyebrow">Category Label</p>
                    <h2>Product Title</h2>
                </div>
            </div>
            <p>Product description text...</p>
            <div class="product-features">
                <div class="feature-item">
                    <i class="fa-solid fa-icon"></i>
                    <span><strong>Feature Title:</strong> Feature description.</span>
                </div>
                <!-- More features... -->
            </div>
            <div class="button1">
                <span><b>Button Text</b></span>
            </div>
        </div>
    </div>
</div>
```

## Customization

### Change Icons

Replace Font Awesome icon classes:
- `fa-location-crosshairs` - Target/compass icon
- `fa-microchip` - Circuit board icon
- `fa-chart-simple` - Bar chart icon
- `fa-stopwatch`, `fa-wifi`, `fa-hard-drive`, etc.

Browse all icons at: https://fontawesome.com/icons

### Modify Colors

Edit CSS variables in `product-card-styles.css`:

```css
:root {
    --primary-color: #f53518;        /* Main orange color */
    --primary-gradient: linear-gradient(360deg, #ff7b00, #f83416);
    --text-color: #FFFFFF;            /* White text */
    --text-color-secondary: rgba(255, 255, 255, 0.7);  /* Muted text */
    --border-color: #2c2c2c;          /* Card border */
}
```

### Adjust Card Layout

**2-column layout (default):**
```css
.product-showcase {
    grid-template-columns: repeat(2, 1fr);
}
```

**3-column layout (for larger screens):**
```css
.product-showcase {
    grid-template-columns: repeat(3, 1fr);
}
```

**Single column (mobile):**
```css
.product-showcase {
    grid-template-columns: 1fr;
}
```

### Button Options

**Status button with GIF:**
```html
<div class="button1">
    <img src="./assets/images/F1white2.gif" alt="Status">
    <span><b>Pilot Testing</b></span>
</div>
```

**Standard action button:**
```html
<a href="link.html" class="btn btn-primary">Download Now</a>
```

## Animation Classes

Add these classes to elements for scroll animations:

- `animate-on-scroll` - Base animation class
- `delay-100` - 100ms delay
- `delay-200` - 200ms delay
- `delay-300` - 300ms delay

Example:
```html
<div class="product-card__heading animate-on-scroll delay-100">
    <!-- Content -->
</div>
```

## Responsive Breakpoints

- **Desktop (1921px+)**: 3-column grid
- **Tablet (993px - 1920px)**: 2-column grid
- **Mobile (≤992px)**: Single column
- **Small Mobile (≤768px)**: Single column, adjusted sizing

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires IntersectionObserver API support (all modern browsers)
- Fallback: Elements show immediately if IntersectionObserver not supported

## Troubleshooting

### Animations not working?
- Ensure `product-card-animations.js` is loaded
- Check browser console for errors
- Verify elements have `animate-on-scroll` class

### Icons not showing?
- Verify Font Awesome is loaded
- Check icon class names are correct
- Ensure internet connection (if using CDN)

### Cards not aligned properly?
- Check `.product-showcase` container exists
- Verify CSS is loaded
- Check for conflicting styles in your project

## Example: Creating a New Card

```html
<div class="product-card">
    <div class="product-content">
        <div class="product-card__heading animate-on-scroll delay-100">
            <span class="product-card__badge">
                <i class="fa-solid fa-rocket"></i>
            </span>
            <div>
                <p class="product-card__eyebrow">New Category</p>
                <h2>New Product</h2>
            </div>
        </div>
        <p class="animate-on-scroll delay-200">Your product description here.</p>
        <div class="product-features">
            <div class="feature-item">
                <i class="fa-solid fa-star"></i>
                <span class="animate-on-scroll delay-300">
                    <strong>Feature 1:</strong> Description of feature 1.
                </span>
            </div>
            <div class="feature-item">
                <i class="fa-solid fa-bolt"></i>
                <span class="animate-on-scroll delay-300">
                    <strong>Feature 2:</strong> Description of feature 2.
                </span>
            </div>
            <div class="feature-item">
                <i class="fa-solid fa-shield"></i>
                <span class="animate-on-scroll delay-300">
                    <strong>Feature 3:</strong> Description of feature 3.
                </span>
            </div>
        </div>
        <div class="button1">
            <span><b>Learn More</b></span>
        </div>
    </div>
</div>
```

## License

Use freely in your projects!


