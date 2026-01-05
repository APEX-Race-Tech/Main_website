# Deploying Without Vite - Simple Static Site

## Overview

Your site is now configured to work **without Vite**. You can deploy the files directly to your web server.

## Important: Firebase Security

**Firebase API keys are PUBLIC by design** - they're safe to include in client-side code. Security is enforced through:

1. **Domain Restrictions** in Firebase Console
2. **Firestore Security Rules**
3. **Authentication Requirements**

See `FIREBASE_SECURITY_EXPLAINED.md` for complete details.

## Deployment Steps

### 1. Verify Firebase Configuration

The Firebase config is now in `js/firebase-config.js` with your production values. No build step needed!

### 2. Set Up Firebase Security

**CRITICAL:** Before deploying, secure your Firebase project:

#### A. Restrict API Key to Your Domains

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `race-insight-app`
3. Go to **Authentication** → **Settings** → **Authorized domains**
4. Add ONLY your domains:
   - `apexracetech.in`
   - `www.apexracetech.in`
   - `localhost` (for development)
5. Remove any unauthorized domains

#### B. Set Up Firestore Security Rules

1. Go to **Firestore Database** → **Rules**
2. Update with these rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own profile
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Stats - anyone can read, only authenticated users can write
    match /stats/{document} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    
    // Default: deny all other access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

3. Click **"Publish"**

### 3. Deploy Files

Simply upload these files/folders to your web server:

```
✅ index.html
✅ race-insight.html
✅ race-insight/ (folder with all HTML files)
✅ js/ (folder with all JavaScript files)
✅ css/ (folder with all CSS files)
✅ assets/ (folder with all images and assets)
```

**DO NOT upload:**
- ❌ `.env` file
- ❌ `node_modules/` folder
- ❌ `package.json` (unless needed)
- ❌ `vite.config.js`
- ❌ `dist/` folder (if it exists)

### 4. Test

1. Visit your site: `https://apexracetech.in`
2. Open browser console (F12)
3. Check for:
   - ✅ "Firebase configuration loaded successfully"
   - ✅ No API key errors
   - ✅ Sign-in works
   - ✅ Download works

## Security Checklist

Before going live, verify:

- [ ] Firebase API key is restricted to your domains only
- [ ] Firestore security rules are published and correct
- [ ] Only authorized domains can use the API key
- [ ] Users can only access their own data
- [ ] Unauthenticated users cannot write to Firestore

## Why This Is Secure

1. **Domain Restrictions**: Even if someone has your API key, they can't use it from unauthorized domains
2. **Security Rules**: Firestore rules prevent unauthorized data access
3. **Authentication**: Sensitive operations require user sign-in
4. **Rate Limiting**: Firebase automatically prevents abuse

## Troubleshooting

### API Key Errors

- Check Firebase Console → Authentication → Settings → Authorized domains
- Make sure your domain is added
- Clear browser cache

### Permission Denied Errors

- Check Firestore security rules
- Verify rules are published
- Check browser console for specific error codes

### Sign-In Not Working

- Verify domain is in authorized domains list
- Check browser console for errors
- Ensure Firebase Authentication is enabled

## Summary

✅ **No Vite needed** - deploy files directly  
✅ **API keys are safe** - they're public by design  
✅ **Security via Firebase** - domain restrictions + security rules  
✅ **Simple deployment** - just upload files  

Your site is ready to deploy!
