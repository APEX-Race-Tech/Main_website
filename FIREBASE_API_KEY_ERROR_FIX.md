# Fixing "auth/api-key-not-valid" Error

## Error Message
`Firebase: Error (auth/api-key-not-valid.-please-pass-a-valid-api-key.)`

## Common Causes & Solutions

### 1. .env File Missing or Incorrect

**Problem:** The `.env` file doesn't exist or has incorrect variable names.

**Solution:**
1. Create a `.env` file in the project root (same directory as `package.json`)
2. Add your Firebase configuration:

```env
VITE_FIREBASE_API_KEY=AIzaSyBGrOI8vnV2GKDgk_9aOY6P8_7hGz-SqGg
VITE_FIREBASE_AUTH_DOMAIN=race-insight-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=race-insight-app
VITE_FIREBASE_STORAGE_BUCKET=race-insight-app.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=762507339296
VITE_FIREBASE_APP_ID=1:762507339296:web:6bed7e38a493920871be45
VITE_FIREBASE_MEASUREMENT_ID=G-V9X5P0EFZQ
```

**Important:**
- Variable names MUST start with `VITE_` for Vite to expose them
- No spaces around the `=` sign
- No quotes around values (unless the value itself contains spaces)
- Each variable on its own line

### 2. Not Running Through Vite

**Problem:** Opening the HTML file directly in the browser won't load `.env` variables.

**Solution:**
- **MUST** run `npm run dev` to start the Vite development server
- **DO NOT** open `race-insight.html` directly in the browser
- Access the site at `http://localhost:3000` (or the port shown in terminal)

### 3. .env File in Wrong Location

**Problem:** The `.env` file is not in the project root.

**Solution:**
- The `.env` file must be in the same directory as:
  - `package.json`
  - `vite.config.js`
  - `index.html`
  - `race-insight.html`

### 4. Server Not Restarted After Creating .env

**Problem:** Vite needs to be restarted to load new environment variables.

**Solution:**
1. Stop the dev server (Ctrl+C)
2. Make sure `.env` file exists with correct values
3. Run `npm run dev` again
4. Refresh the browser

### 5. Invalid API Key

**Problem:** The API key in `.env` is incorrect or from a different Firebase project.

**Solution:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `race-insight-app`
3. Go to Project Settings (gear icon)
4. Scroll to "Your apps" section
5. Click on your web app
6. Copy the `apiKey` value
7. Update `.env` file with the correct value
8. Restart the dev server

## Quick Checklist

- [ ] `.env` file exists in project root
- [ ] `.env` file has all 7 required variables (all starting with `VITE_`)
- [ ] No spaces around `=` in `.env` file
- [ ] Running `npm run dev` (not opening HTML directly)
- [ ] Dev server restarted after creating/updating `.env`
- [ ] API key matches the one in Firebase Console
- [ ] Browser console shows "Firebase configuration loaded successfully"

## Debugging Steps

1. **Check browser console** for:
   - `[Firebase Config] Checking VITE_FIREBASE_API_KEY: Found/Not found`
   - `Firebase configuration loaded successfully`
   - Any error messages

2. **Verify .env file:**
   ```bash
   # In project root, check if file exists
   ls -la .env
   # Or on Windows:
   dir .env
   ```

3. **Check if Vite is loading env vars:**
   - Open browser console
   - Type: `console.log(import.meta.env)`
   - Look for `VITE_FIREBASE_*` variables

4. **Verify API key format:**
   - Should start with `AIzaSy`
   - Should be about 39 characters long
   - No spaces or quotes

## Still Not Working?

1. **Clear browser cache** and hard refresh (Ctrl+Shift+R)
2. **Check terminal** for any Vite errors
3. **Verify Firebase project** is active and not deleted
4. **Check Firebase Console** → Authentication → Settings → Authorized domains
   - Make sure `localhost` is added
