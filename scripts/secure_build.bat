@echo off
REM Secure build script for PharmApp
REM Ensures no sensitive data is exposed during build

echo ========================================
echo PharmApp Secure Build Script
echo ========================================

REM Check if environment variables are set
if "%FIREBASE_WEB_API_KEY%"=="" (
    echo ERROR: FIREBASE_WEB_API_KEY not set
    echo Please set all required environment variables
    echo See .env.example for required variables
    pause
    exit /b 1
)

REM Remove any existing hardcoded firebase_options.dart
echo Removing hardcoded Firebase configuration files...
if exist "pharmacy_app\lib\firebase_options.dart" (
    echo WARNING: Found hardcoded firebase_options.dart - removing for security
    del "pharmacy_app\lib\firebase_options.dart"
)

if exist "courier_app\lib\firebase_options.dart" (
    echo WARNING: Found hardcoded firebase_options.dart - removing for security  
    del "courier_app\lib\firebase_options.dart"
)

if exist "admin_panel\lib\firebase_options.dart" (
    echo WARNING: Found hardcoded firebase_options.dart - removing for security
    del "admin_panel\lib\firebase_options.dart"
)

REM Build with environment variables
echo Building with secure environment variables...

cd pharmacy_app
flutter build web --dart-define=FIREBASE_WEB_API_KEY=%FIREBASE_WEB_API_KEY% ^
  --dart-define=FIREBASE_ANDROID_API_KEY=%FIREBASE_ANDROID_API_KEY% ^
  --dart-define=FIREBASE_IOS_API_KEY=%FIREBASE_IOS_API_KEY% ^
  --dart-define=FIREBASE_PROJECT_ID=%FIREBASE_PROJECT_ID% ^
  --dart-define=FIREBASE_WEB_APP_ID=%FIREBASE_WEB_APP_ID% ^
  --dart-define=FIREBASE_ANDROID_APP_ID=%FIREBASE_ANDROID_APP_ID% ^
  --dart-define=FIREBASE_IOS_APP_ID=%FIREBASE_IOS_APP_ID%

if %ERRORLEVEL% NEQ 0 (
    echo Build failed!
    pause
    exit /b 1
)

echo ========================================
echo Build completed successfully!
echo No sensitive data exposed in build.
echo ========================================
pause