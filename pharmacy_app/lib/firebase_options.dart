// SECURE Firebase configuration using environment variables
// This file replaces the hardcoded firebase_options.dart for production
// ignore_for_file: type=lint
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

/// SECURE Firebase Options using environment variables
/// 
/// Usage with environment variables:
/// ```bash
/// flutter run --dart-define=FIREBASE_WEB_API_KEY=your_web_key_here \
///   --dart-define=FIREBASE_ANDROID_API_KEY=your_android_key_here \
///   --dart-define=FIREBASE_IOS_API_KEY=your_ios_key_here \
///   --dart-define=FIREBASE_PROJECT_ID=your_project_id
/// ```
class DefaultFirebaseOptions {
  // Environment variable constants
  static const String _webApiKey = String.fromEnvironment('FIREBASE_WEB_API_KEY');
  static const String _androidApiKey = String.fromEnvironment('FIREBASE_ANDROID_API_KEY');
  static const String _iosApiKey = String.fromEnvironment('FIREBASE_IOS_API_KEY');
  static const String _projectId = String.fromEnvironment('FIREBASE_PROJECT_ID', defaultValue: 'mediexchange');
  static const String _messagingSenderId = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID', defaultValue: '850077575356');
  static const String _webAppId = String.fromEnvironment('FIREBASE_WEB_APP_ID');
  static const String _androidAppId = String.fromEnvironment('FIREBASE_ANDROID_APP_ID');
  static const String _iosAppId = String.fromEnvironment('FIREBASE_IOS_APP_ID');

  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      case TargetPlatform.macOS:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for macos - '
          'you can reconfigure this by running the FlutterFire CLI again.',
        );
      case TargetPlatform.windows:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for windows - '
          'you can reconfigure this by running the FlutterFire CLI again.',
        );
      case TargetPlatform.linux:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for linux - '
          'you can reconfigure this by running the FlutterFire CLI again.',
        );
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static FirebaseOptions get web {
    if (_webApiKey.isEmpty || _webAppId.isEmpty) {
      throw Exception(
        'SECURITY ERROR: Firebase Web configuration missing. '
        'Set FIREBASE_WEB_API_KEY and FIREBASE_WEB_APP_ID environment variables.'
      );
    }
    
    return FirebaseOptions(
      apiKey: _webApiKey,
      appId: _webAppId,
      messagingSenderId: _messagingSenderId,
      projectId: _projectId,
      authDomain: '$_projectId.firebaseapp.com',
      storageBucket: '$_projectId.firebasestorage.app',
    );
  }

  static FirebaseOptions get android {
    if (_androidApiKey.isEmpty || _androidAppId.isEmpty) {
      throw Exception(
        'SECURITY ERROR: Firebase Android configuration missing. '
        'Set FIREBASE_ANDROID_API_KEY and FIREBASE_ANDROID_APP_ID environment variables.'
      );
    }
    
    return FirebaseOptions(
      apiKey: _androidApiKey,
      appId: _androidAppId,
      messagingSenderId: _messagingSenderId,
      projectId: _projectId,
      storageBucket: '$_projectId.firebasestorage.app',
    );
  }

  static FirebaseOptions get ios {
    if (_iosApiKey.isEmpty || _iosAppId.isEmpty) {
      throw Exception(
        'SECURITY ERROR: Firebase iOS configuration missing. '
        'Set FIREBASE_IOS_API_KEY and FIREBASE_IOS_APP_ID environment variables.'
      );
    }
    
    return FirebaseOptions(
      apiKey: _iosApiKey,
      appId: _iosAppId,
      messagingSenderId: _messagingSenderId,
      projectId: _projectId,
      storageBucket: '$_projectId.firebasestorage.app',
      iosBundleId: 'com.pharmapp.pharmacy',
    );
  }
}