# Firebase Configuration Setup Guide

## 🚨 SECURITY NOTICE
Firebase configuration files containing Google API keys have been removed from the repository for security reasons. You must configure them locally before running the apps.

## Quick Setup Instructions

### 1. Copy Configuration Templates
```bash
# Pharmacy App
cp pharmacy_app/lib/firebase_options.dart.template pharmacy_app/lib/firebase_options.dart

# Courier App  
cp courier_app/lib/firebase_options.dart.template courier_app/lib/firebase_options.dart

# Admin Panel
cp admin_panel/lib/firebase_options.dart.template admin_panel/lib/firebase_options.dart
```

### 2. Get Your API Keys from Firebase Console
1. Visit [Firebase Console](https://console.firebase.google.com)
2. Select the `mediexchange` project
3. Go to Project Settings → General
4. Scroll down to "Your apps" section
5. For each app (Web, Android, iOS), click the config icon to get the keys

### 3. Replace Placeholder Values
Open each `firebase_options.dart` file and replace:
- `YOUR_WEB_API_KEY_HERE` with your actual Web API key
- `YOUR_ANDROID_API_KEY_HERE` with your Android API key  
- `YOUR_IOS_API_KEY_HERE` with your iOS API key
- `YOUR_WEB_APP_ID_HERE` with your Web App ID
- `YOUR_ANDROID_APP_ID_HERE` with your Android App ID
- `YOUR_IOS_APP_ID_HERE` with your iOS App ID
- `YOUR_SENDER_ID_HERE` with your Messaging Sender ID
- `YOUR_MEASUREMENT_ID_HERE` with your Measurement ID (optional)

### 4. Verify Configuration
```bash
# Test pharmacy app
cd pharmacy_app && flutter run -d chrome

# Test courier app
cd courier_app && flutter run -d chrome  

# Test admin panel
cd admin_panel && flutter run -d chrome --web-port=8084
```

## 🔒 Security Best Practices

### DO:
✅ Keep `firebase_options.dart` files LOCAL ONLY  
✅ Use the template files for sharing configuration structure  
✅ Store real API keys in secure password managers  
✅ Use different Firebase projects for dev/staging/production  

### DON'T:
❌ NEVER commit `firebase_options.dart` files to git  
❌ NEVER share API keys in chat/email  
❌ NEVER use production keys in development  
❌ NEVER ignore the .gitignore warnings  

## File Structure
```
pharmacy_app/lib/
├── firebase_options.dart          # ← YOUR CONFIG (local only)
└── firebase_options.dart.template # ← TEMPLATE (committed)

courier_app/lib/
├── firebase_options.dart          # ← YOUR CONFIG (local only)  
└── firebase_options.dart.template # ← TEMPLATE (committed)

admin_panel/lib/
├── firebase_options.dart          # ← YOUR CONFIG (local only)
└── firebase_options.dart.template # ← TEMPLATE (committed)
```

## Troubleshooting

### "Firebase not initialized" Error
- Verify you copied the template files
- Check that API keys are properly formatted (no extra quotes/spaces)
- Ensure project ID is exactly "mediexchange"

### Apps not connecting to Firebase
- Double-check the API keys from Firebase Console
- Verify internet connection
- Try restarting the Flutter apps

### Need Help?
Contact the development team or check the main project documentation in `CLAUDE.md`.