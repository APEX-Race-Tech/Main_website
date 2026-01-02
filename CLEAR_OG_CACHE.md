# How to Clear Open Graph Image Cache

## Problem
Even though you've updated the `og:image` meta tag in your HTML, social media platforms (Facebook, Twitter, LinkedIn) cache the old image. You need to clear their cache to see the new image.

## Solution: Clear Social Media Caches

### 1. Facebook / LinkedIn Cache

**Facebook Sharing Debugger:**
1. Go to: https://developers.facebook.com/tools/debug/
2. Enter your URL: `https://apexracetech.in/race-insight.html`
3. Click **"Debug"**
4. After it loads, click **"Scrape Again"** button
5. This forces Facebook to fetch fresh data from your site
6. Wait a few seconds and refresh - you should see the new image

**Important:** You may need to click "Scrape Again" multiple times if the cache is stubborn.

### 2. Twitter Cache

**Twitter Card Validator:**
1. Go to: https://cards-dev.twitter.com/validator
2. Enter your URL: `https://apexracetech.in/race-insight.html`
3. Click **"Preview card"**
4. Twitter will fetch fresh data
5. The new image should appear

**Note:** Twitter cache clears automatically after a few hours, but the validator forces an immediate refresh.

### 3. LinkedIn Cache

**LinkedIn Post Inspector:**
1. Go to: https://www.linkedin.com/post-inspector/
2. Enter your URL: `https://apexracetech.in/race-insight.html`
3. Click **"Inspect"**
4. LinkedIn will fetch fresh data
5. The new image should appear

### 4. WhatsApp / Other Platforms

**WhatsApp:**
- WhatsApp uses Facebook's cache
- Clear Facebook cache (step 1) and WhatsApp should update within 24 hours
- Or share the link with `?v=2` or `?t=timestamp` to force refresh

**Slack / Discord:**
- These platforms also cache
- Try adding a query parameter: `?v=2` to the URL when sharing
- Example: `https://apexracetech.in/race-insight.html?v=2`

## Verify Your Changes Are Live

Before clearing cache, verify your HTML is correct:

1. **View Page Source:**
   - Visit: `https://apexracetech.in/race-insight.html`
   - Right-click → "View Page Source"
   - Search for `og:image`
   - Should show: `<meta property="og:image" content="https://apexracetech.in/assets/app_icon.png">`

2. **Check Image is Accessible:**
   - Visit: `https://apexracetech.in/assets/app_icon.png`
   - Image should load (not 404 error)
   - Image should be at least 200x200px (recommended: 1200x630px for best results)

## Quick Checklist

- [ ] Verified `og:image` tag in HTML source code
- [ ] Verified image URL is accessible (no 404)
- [ ] Cleared Facebook cache using Debugger
- [ ] Cleared Twitter cache using Card Validator
- [ ] Cleared LinkedIn cache using Post Inspector
- [ ] Tested sharing on each platform

## Troubleshooting

### Image Still Not Updating?

1. **Check Image Dimensions:**
   - Facebook recommends: 1200x630px minimum
   - Your image should meet these requirements

2. **Check Image Format:**
   - Supported: JPG, PNG, GIF, WebP
   - Make sure your image is in a supported format

3. **Check Image Size:**
   - Maximum: 8MB
   - If too large, compress the image

4. **Check Image URL:**
   - Must be absolute URL (starting with `https://`)
   - Must be publicly accessible (no authentication required)
   - Must use HTTPS (not HTTP)

5. **Wait Time:**
   - Sometimes cache takes 24-48 hours to clear naturally
   - Use the debugger tools to force immediate refresh

### Still Seeing Old Image?

1. **Add Version Parameter:**
   - Try: `https://apexracetech.in/race-insight.html?v=2`
   - This tricks the cache into thinking it's a new URL

2. **Check for Multiple og:image Tags:**
   - Make sure there's only ONE `og:image` tag
   - Multiple tags can cause confusion

3. **Check CDN Cache:**
   - If using Cloudflare or similar, clear CDN cache
   - This might be serving old HTML

## Expected Result

After clearing cache, when you share your link:
- ✅ Facebook: Shows `app_icon.png` (not `arrow.png`)
- ✅ Twitter: Shows `app_icon.png` (not `arrow.png`)
- ✅ LinkedIn: Shows `app_icon.png` (not `arrow.png`)

---

**Current Status:** Your HTML is correctly set to `assets/app_icon.png`. You just need to clear the social media caches to see the change.
