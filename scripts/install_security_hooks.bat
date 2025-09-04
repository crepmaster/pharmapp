@echo off
REM Install PharmApp Security Git Hooks

echo ========================================
echo Installing PharmApp Security Git Hooks
echo ========================================

REM Check if .git directory exists
if not exist ".git" (
    echo ERROR: Not in a Git repository
    echo Please run this script from the project root
    pause
    exit /b 1
)

REM Create hooks directory if it doesn't exist
if not exist ".git\hooks" mkdir ".git\hooks"

REM Copy pre-commit hook
echo Installing pre-commit hook for secret detection...
copy ".githooks\pre-commit" ".git\hooks\pre-commit" >nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install pre-commit hook
    pause
    exit /b 1
)

REM Make hook executable (Git Bash compatibility)
git update-index --chmod=+x .git/hooks/pre-commit

echo.
echo ✅ Security hooks installed successfully!
echo.
echo The following security checks are now automatic:
echo - Pre-commit: Hardcoded secret detection
echo - Blocks commits containing exposed API keys/secrets
echo.
echo To test the hook:
echo   scripts\detect_secrets.bat
echo.
echo To bypass hook in emergency (NOT RECOMMENDED):
echo   git commit --no-verify
echo.
echo ========================================
pause