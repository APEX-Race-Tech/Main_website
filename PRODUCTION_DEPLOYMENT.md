# Production Deployment Guide

## Important: Environment Variables in Production

**The `.env` file is NOT automatically loaded in production!** You must build the site with Vite for environment variables to be injected.

## Steps to Deploy to Production

### 1. Create/Update .env File

Create a `.env` file in the project root with your Firebase configuration:

```env
VITE_FIREBASE_API_KEY=AIzaSyBGrOI8vnV2GKDgk_9aOY6P8_7hGz-SqGg
VITE_FIREBASE_AUTH_DOMAIN=race-insight-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=race-insight-app
VITE_FIREBASE_STORAGE_BUCKET=race-insight-app.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=762507339296
VITE_FIREBASE_APP_ID=1:762507339296:web:6bed7e38a493920871be45
VITE_FIREBASE_MEASUREMENT_ID=G-V9X5P0EFZQ
```

### 2. Build the Site

**CRITICAL:** You MUST build the site for production:

```bash
npm run build
```

This will:
- Read your `.env` file
- Inject the environment variables into the built files
- Create a `dist/` folder with production-ready files

### 3. Deploy the dist/ Folder

Upload the contents of the `dist/` folder to your web server (not the source files).

**DO NOT:**
- ❌ Upload source files directly
- ❌ Upload the `.env` file to production
- ❌ Open HTML files directly in browser

**DO:**
- ✅ Build with `npm run build`
- ✅ Upload only the `dist/` folder contents
- ✅ Keep `.env` file local (it's gitignored)

## Current Issue

Your production site (`apexracetech.in`) is showing errors because:
1. The site wasn't built with Vite
2. Environment variables aren't injected
3. The old Firebase config is still being used

## Quick Fix

1. **Create `.env` file** with your new Firebase values (see above)
2. **Build the site:**
   ```bash
   npm run build
   ```
3. **Upload the `dist/` folder** to your web server
4. **Clear browser cache** and test

## Development vs Production

### Development
- Run: `npm run dev`
- `.env` file is automatically loaded
- Access at: `http://localhost:3000`

### Production
- Build: `npm run build`
- `.env` values are injected into built files
- Deploy: Upload `dist/` folder contents
- Access at: Your production domain

## Verification

After building and deploying, check the browser console:
- Should see: `Firebase configuration loaded successfully`
- Should see: `[Firebase Config] API Key: AIzaSyBGr...` (first 10 chars)
- Should NOT see: `Environment variable VITE_FIREBASE_API_KEY is not set`

## Troubleshooting

If you still see errors after building:

1. **Verify .env file exists** in project root
2. **Check build output** - look for any errors during `npm run build`
3. **Verify dist/ folder** - check that `dist/js/firebase-config.js` contains actual values (not `getEnvVar()` calls)
4. **Clear cache** - hard refresh browser (Ctrl+Shift+R)
5. **Check server** - make sure you uploaded the `dist/` folder, not source files
