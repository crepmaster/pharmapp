@echo off
REM Test Firebase configuration with environment variables

echo ========================================
echo Testing Firebase Configuration
echo ========================================

REM Load environment variables from .env file
if exist ".env" (
    echo Loading .env file...
    for /f "tokens=1,2 delims==" %%a in (.env) do (
        if not "%%b"=="" (
            set "%%a=%%b"
        )
    )
) else (
    echo ERROR: .env file not found
    echo Please create .env from .env.example
    pause
    exit /b 1
)

echo.
echo Checking required environment variables:

if "%FIREBASE_WEB_API_KEY%"=="" (
    echo ❌ FIREBASE_WEB_API_KEY not set
    set HAS_ERROR=1
) else (
    echo ✅ FIREBASE_WEB_API_KEY configured
)

if "%FIREBASE_WEB_APP_ID%"=="" (
    echo ❌ FIREBASE_WEB_APP_ID not set
    set HAS_ERROR=1
) else (
    echo ✅ FIREBASE_WEB_APP_ID configured
)

if "%FIREBASE_PROJECT_ID%"=="" (
    echo ❌ FIREBASE_PROJECT_ID not set
    set HAS_ERROR=1
) else (
    echo ✅ FIREBASE_PROJECT_ID configured: %FIREBASE_PROJECT_ID%
)

echo.
if "%HAS_ERROR%"=="1" (
    echo ❌ Configuration incomplete
    echo Please check your .env file
    pause
    exit /b 1
) else (
    echo ✅ Configuration looks good!
    echo.
    echo Testing pharmacy app with new configuration...
    
    cd pharmacy_app
    flutter run -d chrome --web-port=8080 ^
      --dart-define=FIREBASE_WEB_API_KEY=%FIREBASE_WEB_API_KEY% ^
      --dart-define=FIREBASE_WEB_APP_ID=%FIREBASE_WEB_APP_ID% ^
      --dart-define=FIREBASE_PROJECT_ID=%FIREBASE_PROJECT_ID% ^
      --dart-define=FIREBASE_MESSAGING_SENDER_ID=%FIREBASE_MESSAGING_SENDER_ID%
)

echo ========================================