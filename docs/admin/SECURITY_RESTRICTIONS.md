# 🔒 Configuration des Restrictions API Firebase

## 🚨 ÉTAPE CRITIQUE - À FAIRE IMMÉDIATEMENT

Vos nouvelles clés API doivent être restreintes pour éviter l'abus.

## 📋 Configuration Google Cloud Console

### 1. Accédez à Google Cloud Console
- URL : https://console.cloud.google.com
- Sélectionnez le projet `mediexchange`
- Allez dans **APIs & Services** → **Credentials**

### 2. Restrictions pour la clé Web
Cliquez sur votre clé API Web puis configurez :

**Application restrictions:**
```
HTTP referrers (websites)
```

**Referrers autorisés:**
```
http://localhost:8080/*
http://localhost:8083/*  
http://localhost:8084/*
http://localhost:8085/*
https://votre-domaine-production.com/*
```

**API restrictions:**
```
☑️ Firebase Authentication API
☑️ Cloud Firestore API  
☑️ Firebase Installations API
☑️ Identity Toolkit API
☑️ Token Service API
```

### 3. Restrictions pour la clé Android
**Application restrictions:**
```
Android apps
```

**Package names et SHA-1:**
```
Package name: com.pharmapp.pharmacy
SHA-1: 86:35:EA:11:22:E6:0F:7F:3C:60:03:79:0C:FB:B8:90:07:0A:EA:AC

Package name: com.mediexchange.courier_app  
SHA-1: 86:35:EA:11:22:E6:0F:7F:3C:60:03:79:0C:FB:B8:90:07:0A:EA:AC

Package name: com.mediexchange.admin_panel
SHA-1: 86:35:EA:11:22:E6:0F:7F:3C:60:03:79:0C:FB:B8:90:07:0A:EA:AC
```

**API restrictions:**
```
☑️ Firebase Authentication API
☑️ Cloud Firestore API
☑️ Firebase Installations API  
☑️ Identity Toolkit API
```

### 4. Restrictions pour la clé iOS
**Application restrictions:**
```
iOS apps
```

**Bundle IDs:**
```
com.pharmapp.pharmacy
com.pharmapp.courier
com.pharmapp.admin
```

## ⚠️ IMPORTANT

- Les restrictions prennent **5-10 minutes** à être effectives
- Testez votre application après configuration
- Si erreur 403, vérifiez les restrictions

## ✅ Vérification

Une fois configuré, testez :
```bash
scripts\test_firebase_config.bat
```

L'application doit continuer à fonctionner normalement.