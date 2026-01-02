# Performance Optimization Guide

Based on PageSpeed Insights analysis, here are the key optimizations implemented and recommended.

## ✅ Optimizations Implemented

### 1. Resource Hints
- ✅ Preconnect to external domains (fonts.googleapis.com, gstatic.com, cdnjs.cloudflare.com)
- ✅ Added preconnect for Firebase (gstatic.com)

### 2. Script Loading
- ✅ Google Analytics uses `async` attribute
- ✅ External scripts use `defer` where appropriate

## 🔧 Additional Optimizations Needed

### 1. Defer/Async Firebase Scripts
**Current Issue**: Firebase scripts block rendering
**Solution**: Move Firebase scripts to bottom or use async/defer

### 2. Image Optimization
**Current Issues**:
- Multiple large images without lazy loading
- No width/height attributes (causes layout shift)
- Images not optimized (WebP format)

**Solutions**:
- Add `loading="lazy"` to below-the-fold images
- Add explicit width/height attributes
- Convert images to WebP format
- Use responsive images with `srcset`

### 3. Font Loading
**Current Issue**: Google Fonts can block rendering
**Solution**: Use `font-display: swap` and preload critical fonts

### 4. CSS Optimization
**Current Issue**: Large CSS files may block rendering
**Solution**: 
- Minify CSS files
- Remove unused CSS
- Inline critical CSS

### 5. JavaScript Optimization
**Current Issue**: Large JavaScript file (race-insight.js)
**Solution**:
- Minify JavaScript
- Code splitting
- Remove unused code
- Defer non-critical scripts

## 📊 Core Web Vitals Targets

### Largest Contentful Paint (LCP)
- **Target**: < 2.5 seconds
- **Current**: Check PageSpeed Insights
- **Optimizations**:
  - Optimize hero image
  - Preload critical resources
  - Reduce server response time

### First Input Delay (FID) / Interaction to Next Paint (INP)
- **Target**: < 100ms
- **Optimizations**:
  - Defer non-critical JavaScript
  - Reduce JavaScript execution time
  - Use Web Workers for heavy tasks

### Cumulative Layout Shift (CLS)
- **Target**: < 0.1
- **Optimizations**:
  - Add width/height to images
  - Reserve space for ads/embeds
  - Avoid inserting content above existing content

## 🚀 Quick Wins

1. **Add image dimensions** to prevent layout shift
2. **Lazy load images** below the fold
3. **Minify CSS/JS** files
4. **Enable compression** (gzip/brotli)
5. **Use CDN** for static assets
6. **Optimize images** (compress, WebP format)

## 📝 Implementation Checklist

- [ ] Defer Firebase scripts
- [ ] Add lazy loading to images
- [ ] Add width/height to images
- [ ] Optimize images (compress, WebP)
- [ ] Minify CSS files
- [ ] Minify JavaScript files
- [ ] Add font-display: swap
- [ ] Preload critical resources
- [ ] Enable server compression
- [ ] Set up CDN

## 🔗 Resources

- **PageSpeed Insights**: https://pagespeed.web.dev/
- **Web.dev Performance**: https://web.dev/performance/
- **Core Web Vitals**: https://web.dev/vitals/
- **Image Optimization**: https://web.dev/fast/#optimize-your-images
