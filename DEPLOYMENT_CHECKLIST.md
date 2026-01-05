# Deployment Checklist - Fix API Key Error

## Current Issue

Your production site (`apexracetech.in`) is still using the **OLD Firebase configuration** from the deleted project. You need to upload the **NEW files** to your server.

## Files That MUST Be Updated on Server

### Critical Files (Upload These First):

1. **`js/firebase-config.js`** ⚠️ **MOST IMPORTANT**
   - Contains new Firebase config: `race-insight-app`
   - Old file had: `apex-race-insight-auth` (deleted project)
   - **This file MUST be uploaded**

2. **`race-insight.html`**
   - Updated to load firebase-config.js as regular script (not module)
   - **Upload this file**

3. **`js/race-insight.js`**
   - Updated to work with new config
   - **Upload this file**

## Quick Deployment Steps

### Step 1: Verify Local Files Are Correct

Check that `js/firebase-config.js` contains:
- ✅ `apiKey: "AIzaSyBGrOI8vnV2GKDgk_9aOY6P8_7hGz-SqGg"` (NEW)
- ✅ `projectId: "race-insight-app"` (NEW)
- ❌ NOT `apex-race-insight-auth` (OLD - deleted)

### Step 2: Upload Updated Files

Upload these files/folders to your web server:

```
✅ js/firebase-config.js  (CRITICAL - must be updated)
✅ js/race-insight.js
✅ race-insight.html
✅ All other files (css/, assets/, etc.)
```

### Step 3: Clear Server Cache

After uploading:
1. Clear your web server's cache (if it has one)
2. Clear browser cache (Ctrl+Shift+R)
3. Test the site

### Step 4: Verify

After uploading, check browser console:
- ✅ Should see: `Firebase configuration loaded successfully`
- ✅ Should see: `[Firebase Config] Project ID: race-insight-app`
- ❌ Should NOT see: `apex-race-insight-auth` anywhere
- ❌ Should NOT see: `AIzaSyB6pcGMJixpwxz4Zls_ghpCPX8RwKd4F5g` (old key)

## How to Verify Files Are Updated

### Method 1: Check File Directly
Visit: `https://apexracetech.in/js/firebase-config.js`

You should see:
```javascript
apiKey: "AIzaSyBGrOI8vnV2GKDgk_9aOY6P8_7hGz-SqGg"
projectId: "race-insight-app"
```

You should NOT see:
- `apex-race-insight-auth`
- `AIzaSyB6pcGMJixpwxz4Zls_ghpCPX8RwKd4F5g`

### Method 2: Browser Console
Open browser console (F12) and check:
- Look for `Firebase configuration loaded successfully`
- Check the API key shown (should start with `AIzaSyBGr...`)

## Common Issues

### Issue: Still seeing old API key
**Solution:** The file wasn't uploaded or server cache needs clearing

### Issue: import.meta error
**Solution:** Make sure `race-insight.html` loads `firebase-config.js` as regular script (not module)

### Issue: Permission denied on old project
**Solution:** Old files still on server - upload new `js/firebase-config.js`

## After Uploading

1. **Hard refresh browser** (Ctrl+Shift+R or Cmd+Shift+R)
2. **Test sign-in** - should work with new Firebase project
3. **Check console** - should show new project ID
4. **Verify** - no more API key errors

## Summary

**The problem:** Production server has old files  
**The solution:** Upload updated `js/firebase-config.js` and related files  
**The result:** Site will use new Firebase project and work correctly
