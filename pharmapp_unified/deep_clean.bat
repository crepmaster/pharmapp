@echo off
REM ============================================
REM Deep Clean - PharmApp Unified
REM ============================================
REM Use this when quick_clean doesn't fix build errors

cd /d "%~dp0"

echo.
echo ============================================
echo   Deep Clean - PharmApp Unified
echo ============================================
echo.
echo This will clean:
echo   - Flutter build cache
echo   - Android Gradle cache
echo   - All dependencies
echo.
echo Estimated time: 30-60 seconds
echo.
pause

echo.
echo [1/4] Flutter Clean...
flutter clean

echo.
echo [2/4] Gradle Clean...
cd android
call gradlew clean --no-daemon
cd ..

echo.
echo [3/4] Getting Fresh Dependencies...
flutter pub get

echo.
echo [4/4] Verifying Setup...
flutter doctor

echo.
echo ============================================
echo   Deep Clean Complete!
echo ============================================
echo.
echo All caches cleared. Build errors should be resolved.
echo.
echo You can now run:
echo   - flutter run -d emulator-5554 (Android)
echo   - flutter run -d chrome (Web)
echo.
pause
