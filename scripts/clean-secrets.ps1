# PowerShell script to permanently remove Google API keys from git history
# WARNING: This will rewrite git history - ensure all team members are aware

Write-Host "======================================" -ForegroundColor Yellow
Write-Host "GIT HISTORY CLEANER - REMOVE SECRETS" -ForegroundColor Yellow
Write-Host "======================================" -ForegroundColor Yellow

Write-Host "`nThis script will permanently remove Google API keys from git history." -ForegroundColor Cyan
Write-Host "WARNING: This rewrites history and requires force push!" -ForegroundColor Red

$confirm = Read-Host "`nDo you want to proceed? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "Operation cancelled." -ForegroundColor Yellow
    exit
}

# Step 1: Install git-filter-repo if not present
Write-Host "`n[1/4] Checking for git-filter-repo..." -ForegroundColor Green
try {
    git filter-repo --version | Out-Null
    Write-Host "git-filter-repo is installed." -ForegroundColor Green
} catch {
    Write-Host "Installing git-filter-repo via pip..." -ForegroundColor Yellow
    pip install git-filter-repo
}

# Step 2: Create backup
Write-Host "`n[2/4] Creating backup..." -ForegroundColor Green
$backupDir = "pharmapp-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -Path "." -Destination "../$backupDir" -Recurse -Force
Write-Host "Backup created at ../$backupDir" -ForegroundColor Green

# Step 3: Remove secrets from history
Write-Host "`n[3/4] Removing firebase_options.dart files from entire history..." -ForegroundColor Green

# Create paths file for filter-repo
$pathsToRemove = @"
pharmacy_app/lib/firebase_options.dart
courier_app/lib/firebase_options.dart
admin_panel/lib/firebase_options.dart
"@

$pathsToRemove | Out-File -FilePath "paths-to-remove.txt" -Encoding UTF8

# Run git-filter-repo to remove the files
git filter-repo --invert-paths --paths-from-file paths-to-remove.txt --force

# Clean up temp file
Remove-Item "paths-to-remove.txt"

Write-Host "Files removed from history successfully!" -ForegroundColor Green

# Step 4: Re-add remote
Write-Host "`n[4/4] Re-adding remote repository..." -ForegroundColor Green
git remote add origin https://github.com/crepmaster/pharmapp.git

Write-Host "`n======================================" -ForegroundColor Green
Write-Host "CLEANUP COMPLETE!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green

Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Force push to remote: git push origin master --force" -ForegroundColor Yellow
Write-Host "2. Have all team members re-clone the repository" -ForegroundColor Yellow
Write-Host "3. Copy firebase_options.dart files from templates and add real API keys" -ForegroundColor Yellow
Write-Host "4. Verify .gitignore is properly configured" -ForegroundColor Yellow
Write-Host "`nREMEMBER: Never commit firebase_options.dart files again!" -ForegroundColor Red