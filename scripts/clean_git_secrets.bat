@echo off
REM Script to clean Firebase secrets from Git history
REM WARNING: This rewrites Git history - use with caution!

echo ========================================
echo Git History Cleanup - Firebase Secrets
echo ========================================

echo WARNING: This will rewrite Git history to remove sensitive Firebase data
echo This is IRREVERSIBLE and will require force push to remote repository
echo.
set /p confirm="Are you sure you want to continue? (y/N): "

if /i not "%confirm%"=="y" (
    echo Operation cancelled.
    pause
    exit /b 0
)

echo.
echo Creating backup branch...
git branch backup-before-cleanup

echo.
echo Removing firebase_options.dart from history...
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch */lib/firebase_options.dart || true" --prune-empty --tag-name-filter cat -- --all

echo.
echo Removing google-services.json from history...
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch */android/app/google-services.json || true" --prune-empty --tag-name-filter cat -- --all

echo.
echo Removing GoogleService-Info.plist from history...
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch */ios/Runner/GoogleService-Info.plist || true" --prune-empty --tag-name-filter cat -- --all

echo.
echo Cleaning up filter-branch refs...
git for-each-ref --format="delete %%(refname)" refs/original | git update-ref --stdin
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo.
echo ========================================
echo Git history cleanup completed!
echo.
echo Next steps:
echo 1. Review changes: git log --oneline
echo 2. If satisfied: git push --force-with-lease origin main
echo 3. If issues: git checkout backup-before-cleanup
echo ========================================

pause