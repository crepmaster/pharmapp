@echo off
REM PharmApp Unified - Quick Deployment Script for Testing
REM This script automates the deployment process

echo ================================================
echo   PharmApp Unified - Testing Deployment
echo ================================================
echo.

REM Step 1: Check Flutter installation
echo [1/6] Checking Flutter installation...
flutter --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Flutter not found! Please install Flutter first.
    pause
    exit /b 1
)
echo ✓ Flutter detected
echo.

REM Step 2: Check Firebase CLI
echo [2/6] Checking Firebase CLI...
firebase --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Firebase CLI not found or corrupted!
    echo.
    echo Please run these commands to fix:
    echo   npm uninstall -g firebase-tools
    echo   npm install -g firebase-tools
    echo   firebase login
    echo.
    pause
    exit /b 1
)
echo ✓ Firebase CLI detected
echo.

REM Step 3: Clean and get dependencies
echo [3/6] Installing Flutter dependencies...
call flutter pub get
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to get dependencies!
    pause
    exit /b 1
)
echo ✓ Dependencies installed
echo.

REM Step 4: Analyze code
echo [4/6] Running Flutter analyze...
call flutter analyze
echo.

REM Step 5: Ask user for deployment type
echo [5/6] Select deployment type:
echo   1. Local testing (Chrome - fastest)
echo   2. Build web for Firebase Hosting
echo   3. Build Android APK
echo   4. Full deployment (build + deploy to Firebase)
echo.
set /p DEPLOY_TYPE="Enter choice (1-4): "
echo.

if "%DEPLOY_TYPE%"=="1" (
    echo Starting local web testing...
    echo.
    echo ⚠️  REMINDER: Update firebase_options.dart with real keys first!
    echo    Run: firebase apps:sdkconfig web --project=mediexchange
    echo.
    timeout /t 3 >nul
    flutter run -d chrome --web-port=8084
    goto :end
)

if "%DEPLOY_TYPE%"=="2" (
    echo Building web application...
    call flutter build web --release
    if %ERRORLEVEL% EQU 0 (
        echo.
        echo ✓ Web build complete!
        echo   Output: build\web\
        echo.
        echo To deploy to Firebase Hosting:
        echo   firebase deploy --only hosting --project=mediexchange
    ) else (
        echo ERROR: Web build failed!
    )
    goto :end
)

if "%DEPLOY_TYPE%"=="3" (
    echo Building Android APK...
    call flutter build apk --debug
    if %ERRORLEVEL% EQU 0 (
        echo.
        echo ✓ APK build complete!
        echo   Output: build\app\outputs\flutter-apk\app-debug.apk
        echo.
        echo To install on device:
        echo   adb install build\app\outputs\flutter-apk\app-debug.apk
    ) else (
        echo ERROR: APK build failed!
    )
    goto :end
)

if "%DEPLOY_TYPE%"=="4" (
    echo [6/6] Full deployment process...
    echo.

    REM Deploy Firestore rules
    echo Deploying Firestore rules...
    firebase deploy --only firestore:rules --project=mediexchange
    if %ERRORLEVEL% NEQ 0 (
        echo WARNING: Firestore rules deployment failed!
        echo Continuing with web build...
    ) else (
        echo ✓ Firestore rules deployed
    )
    echo.

    REM Build web
    echo Building web application...
    call flutter build web --release
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Web build failed!
        pause
        exit /b 1
    )
    echo ✓ Web build complete
    echo.

    REM Deploy to Firebase Hosting
    echo Deploying to Firebase Hosting...
    firebase deploy --only hosting --project=mediexchange
    if %ERRORLEVEL% EQU 0 (
        echo.
        echo ================================================
        echo   ✓ DEPLOYMENT COMPLETE!
        echo ================================================
        echo.
        echo Your app is now live at:
        echo   https://mediexchange.web.app
        echo.
        echo Firebase Console:
        echo   https://console.firebase.google.com/project/mediexchange
        echo.
    ) else (
        echo ERROR: Firebase Hosting deployment failed!
    )
    goto :end
)

echo Invalid choice! Please run the script again.

:end
echo.
echo ================================================
pause
