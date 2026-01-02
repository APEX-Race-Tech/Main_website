# Facebook App ID Setup Guide

## Why Add Facebook App ID?

Adding a `fb:app_id` meta tag provides several benefits:
- **Better Analytics**: Track how your content is shared on Facebook
- **Content Moderation**: Moderate how your links appear when shared
- **Insights**: Access detailed sharing analytics in Facebook Insights
- **Debugging**: Better access to Facebook's sharing debugger tools

## How to Get Your Facebook App ID

### Step 1: Create a Facebook App

1. **Go to Facebook Developers**:
   - Visit: https://developers.facebook.com/
   - Log in with your Facebook account

2. **Create New App**:
   - Click "My Apps" → "Create App"
   - Choose "Business" as the app type
   - Fill in:
     - **App Name**: APEX Race Technologies (or Race Insight)
     - **App Contact Email**: Your email address
     - **Business Account**: Select or create one
   - Click "Create App"

### Step 2: Get Your App ID

1. **Find App ID**:
   - After creating the app, you'll see the App Dashboard
   - Your **App ID** is displayed at the top of the dashboard
   - It looks like: `1234567890123456` (a long number)

2. **Copy the App ID**:
   - Copy this number - you'll need it for the meta tag

### Step 3: Configure Your App

1. **Add Platform**:
   - In the App Dashboard, click "Add Product"
   - Select "Website" or "Facebook Login"
   - Add your website URL: `https://apexracetech.in`

2. **Basic Settings**:
   - Go to Settings → Basic
   - Add your website domain: `apexracetech.in`
   - Save changes

### Step 4: Add App ID to Your Website

1. **Update the Meta Tag**:
   - Open `race-insight.html`
   - Find: `<meta property="fb:app_id" content="YOUR_FACEBOOK_APP_ID">`
   - Replace `YOUR_FACEBOOK_APP_ID` with your actual App ID
   - Example: `<meta property="fb:app_id" content="1234567890123456">`

2. **Also Update index.html** (if needed):
   - Add the same meta tag to your homepage for consistency

### Step 5: Verify

1. **Test with Facebook Debugger**:
   - Visit: https://developers.facebook.com/tools/debug/
   - Enter your URL: `https://apexracetech.in/race-insight.html`
   - Click "Debug"
   - The warning about missing `fb:app_id` should disappear

2. **Check Meta Tags**:
   - The debugger should now show your App ID in the Open Graph tags

## Optional: Add Facebook Page ID

You can also add your Facebook Page ID for even better integration:

```html
<meta property="fb:pages" content="YOUR_FACEBOOK_PAGE_ID">
```

To find your Page ID:
1. Go to your Facebook Page
2. Click "About" → "Page Info"
3. Scroll down to find "Facebook Page ID"

## Important Notes

- **App Review**: For basic Open Graph sharing, you don't need App Review
- **Privacy**: The App ID is public and safe to include in your HTML
- **Multiple Sites**: One App ID can be used for multiple websites
- **Not Required**: `fb:app_id` is recommended but not required for basic sharing

## Troubleshooting

### App ID Not Working?
- Make sure you've added your website domain in App Settings
- Verify the App ID is correct (no spaces, correct number)
- Clear Facebook's cache using the debugger tool

### Can't Create App?
- You need a Facebook account
- Some features require a verified business account
- Check Facebook's current requirements

## Quick Reference

**Meta Tag Format:**
```html
<meta property="fb:app_id" content="YOUR_APP_ID_HERE">
```

**Where to Find App ID:**
- Facebook Developers Dashboard: https://developers.facebook.com/apps/

**Test Your Setup:**
- Facebook Sharing Debugger: https://developers.facebook.com/tools/debug/

---

**Note**: The `fb:app_id` is currently set to `YOUR_FACEBOOK_APP_ID` as a placeholder. Replace it with your actual App ID once you create a Facebook App.
