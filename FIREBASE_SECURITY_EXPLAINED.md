# Firebase Security Explained

## Important: Firebase API Keys Are Public

**Firebase API keys are NOT secrets.** They are meant to be public and are included in client-side code. This is by design.

### Why API Keys Are Safe to Expose

1. **Domain Restrictions**: API keys are restricted by authorized domains in Firebase Console
2. **Security Rules**: Firestore and Storage have security rules that control access
3. **Authentication**: User data access requires proper authentication
4. **Rate Limiting**: Firebase automatically rate-limits API usage

### How Firebase Security Actually Works

Security is enforced through:

1. **Authorized Domains** (Firebase Console → Authentication → Settings)
   - Only domains you specify can use the API key
   - Unauthorized domains are blocked even with the key

2. **Firestore Security Rules** (Firestore Database → Rules)
   - Control who can read/write data
   - Enforce authentication requirements
   - Prevent unauthorized access

3. **Authentication Requirements**
   - Users must sign in to access protected data
   - Each user can only access their own data (enforced by rules)

## Best Practices

✅ **DO:**
- Restrict API key to specific domains in Firebase Console
- Use strict Firestore security rules
- Require authentication for sensitive operations
- Regularly review security rules

❌ **DON'T:**
- Worry about exposing the API key in client code (it's normal)
- Store sensitive server-side data in Firestore without proper rules
- Use the API key for server-side operations (use Admin SDK instead)

## Setting Up Domain Restrictions

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `race-insight-app`
3. Go to **Authentication** → **Settings** → **Authorized domains**
4. Add only your production domains:
   - `apexracetech.in`
   - `www.apexracetech.in`
   - `localhost` (for development)
5. Remove any unauthorized domains

## Firestore Security Rules

Your Firestore rules should look like this:

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

## Summary

- ✅ API keys in client code = Normal and safe
- ✅ Domain restrictions = Primary security layer
- ✅ Security rules = Data access control
- ✅ Authentication = User verification

Your site is secure as long as you:
1. Restrict domains in Firebase Console
2. Use proper Firestore security rules
3. Require authentication for sensitive operations
