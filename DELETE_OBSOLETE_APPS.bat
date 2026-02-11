@echo off
REM ============================================
REM DELETE OBSOLETE PHARMACY AND COURIER APPS
REM ============================================
REM
REM This script deletes the obsolete standalone apps:
REM   - pharmacy_app/ (replaced by pharmapp_unified)
REM   - courier_app/ (replaced by pharmapp_unified)
REM
REM IMPORTANT: Only run this after confirming all features
REM            work correctly in pharmapp_unified!
REM ============================================

echo.
echo ============================================
echo  DELETE OBSOLETE PHARMACY & COURIER APPS
echo ============================================
echo.
echo This will PERMANENTLY DELETE:
echo   - pharmacy_app/
echo   - courier_app/
echo.
echo These apps have been replaced by pharmapp_unified/
echo.
echo ============================================
echo.
set /p CONFIRM="Are you sure you want to delete these folders? (type YES to confirm): "

if /i "%CONFIRM%" NEQ "YES" (
    echo.
    echo Deletion cancelled. No files were deleted.
    echo.
    pause
    exit /b 0
)

echo.
echo Deleting pharmacy_app...
if exist pharmacy_app (
    rmdir /s /q pharmacy_app
    echo ✓ pharmacy_app deleted
) else (
    echo ⚠ pharmacy_app not found
)

echo.
echo Deleting courier_app...
if exist courier_app (
    rmdir /s /q courier_app
    echo ✓ courier_app deleted
) else (
    echo ⚠ courier_app not found
)

echo.
echo ============================================
echo  CLEANUP COMPLETE
echo ============================================
echo.
echo Obsolete apps have been deleted.
echo Master app: pharmapp_unified/
echo.
echo You can now run: flutter clean
echo                  flutter pub get
echo.
pause
