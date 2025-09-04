@echo off
REM PharmApp Secret Detection System - PRIORITY 1 SECURITY CHECK
REM This script MUST be run first in any security audit

echo ========================================
echo 🔍 PHARMAPP SECRET DETECTION - CRITICAL
echo ========================================

set SECRETS_FOUND=0

echo.
echo [1/5] Searching for Firebase API Keys...
findstr /S /N /R "AIza[0-9A-Za-z_-]*" *.dart >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ❌ CRITICAL: Firebase API Key detected!
    findstr /S /N /R "AIza[0-9A-Za-z_-]*" *.dart
    set SECRETS_FOUND=1
) else (
    echo ✅ OK - No Firebase API keys found
)

echo.
echo [2/5] Searching for OAuth Client IDs...
findstr /S /N /R "[0-9]*-[0-9A-Za-z_]*\.apps\.googleusercontent\.com" *.dart >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ❌ CRITICAL: OAuth Client ID exposed!
    findstr /S /N /R "[0-9]*-[0-9A-Za-z_]*\.apps\.googleusercontent\.com" *.dart
    set SECRETS_FOUND=1
) else (
    echo ✅ OK - No OAuth IDs found
)

echo.
echo [3/5] Searching for hardcoded secrets/tokens...
findstr /S /N /R /I "secret.*=.*['\"][^'\"]*['\"]" *.dart >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ⚠️  WARNING: Potential secret detected!
    findstr /S /N /R /I "secret.*=.*['\"][^'\"]*['\"]" *.dart
    set SECRETS_FOUND=1
) else (
    echo ✅ OK - No secrets found
)

echo.
echo [4/5] Searching for hardcoded passwords...
findstr /S /N /R /I "password.*=.*['\"][^'\"]*['\"]" *.dart >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ❌ CRITICAL: Hardcoded password found!
    findstr /S /N /R /I "password.*=.*['\"][^'\"]*['\"]" *.dart
    set SECRETS_FOUND=1
) else (
    echo ✅ OK - No hardcoded passwords
)

echo.
echo [5/5] Searching for URLs with credentials...
findstr /S /N /R "https://.*:.*@" *.dart >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ❌ CRITICAL: URL with credentials found!
    findstr /S /N /R "https://.*:.*@" *.dart
    set SECRETS_FOUND=1
) else (
    echo ✅ OK - No credential URLs found
)

echo.
echo ========================================
if %SECRETS_FOUND% EQU 1 (
    echo ❌ SECURITY AUDIT FAILED
    echo SECRETS DETECTED - PRODUCTION DEPLOYMENT BLOCKED
    echo Fix all issues before proceeding!
    echo ========================================
    exit /b 1
) else (
    echo ✅ SECURITY AUDIT PASSED
    echo No hardcoded secrets detected
    echo Safe for production deployment
    echo ========================================
    exit /b 0
)