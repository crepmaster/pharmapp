@echo off
REM ============================================
REM Quick Clean - PharmApp Unified
REM ============================================
REM Use this before every build to prevent cache issues

cd /d "%~dp0"

echo.
echo ============================================
echo   Quick Clean - PharmApp Unified
echo ============================================
echo.

echo [1/2] Flutter Clean...
flutter clean

echo.
echo [2/2] Getting Dependencies...
flutter pub get

echo.
echo ============================================
echo   Clean Complete! Ready to build.
echo ============================================
echo.
echo You can now run:
echo   - flutter run (auto-detects device)
echo   - flutter run -d emulator-5554 (Android)
echo   - flutter run -d chrome (Web)
echo.
pause
