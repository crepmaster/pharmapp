@echo off
echo ============================================
echo   PharmApp Unified - Development Starter
echo ============================================
echo.

echo [1/3] Starting Android Emulator (Pixel 9a)...
start /B emulator -avd Pixel_9a -no-snapshot-load

echo [2/3] Waiting for emulator to boot...
:wait_loop
timeout /t 2 /nobreak >nul
adb devices | findstr "device" >nul
if errorlevel 1 (
    echo Still waiting...
    goto wait_loop
)

echo.
echo [3/3] Emulator is ready!
echo.
echo ============================================
echo   Now you can run: flutter run
echo ============================================
echo.
echo Press any key to run the app automatically...
pause >nul

cd %~dp0
flutter run

pause
