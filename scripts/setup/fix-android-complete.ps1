# Complete Android SDK Fix
# Run as Administrator

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Android SDK Complete Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$androidSdkPath = "$env:LOCALAPPDATA\Android\sdk"
$cmdlineToolsUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
$tempZipPath = "$env:TEMP\cmdline-tools.zip"
$cmdlineToolsPath = "$androidSdkPath\cmdline-tools"

Write-Host "[Step 1/7] Verifying Android SDK..." -ForegroundColor Yellow
if (-not (Test-Path $androidSdkPath)) {
    Write-Host "Creating Android SDK directory..." -ForegroundColor Gray
    New-Item -Path $androidSdkPath -ItemType Directory -Force | Out-Null
}
Write-Host "[OK] Android SDK path: $androidSdkPath" -ForegroundColor Green

Write-Host "`n[Step 2/7] Downloading command-line tools..." -ForegroundColor Yellow
Write-Host "URL: $cmdlineToolsUrl" -ForegroundColor Gray

try {
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $cmdlineToolsUrl -OutFile $tempZipPath
    Write-Host "[OK] Download completed!" -ForegroundColor Green
}
catch {
    Write-Host "[ERROR] Download failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n[Step 3/7] Extracting command-line tools..." -ForegroundColor Yellow

try {
    # Remove old installation
    if (Test-Path "$cmdlineToolsPath\latest") {
        Remove-Item -Path "$cmdlineToolsPath\latest" -Recurse -Force
    }

    # Extract to temp
    $tempExtractPath = "$env:TEMP\cmdline-tools-extract"
    if (Test-Path $tempExtractPath) {
        Remove-Item -Path $tempExtractPath -Recurse -Force
    }

    Expand-Archive -Path $tempZipPath -DestinationPath $tempExtractPath -Force

    # Move to correct location
    if (-not (Test-Path $cmdlineToolsPath)) {
        New-Item -Path $cmdlineToolsPath -ItemType Directory -Force | Out-Null
    }

    Move-Item -Path "$tempExtractPath\cmdline-tools" -Destination "$cmdlineToolsPath\latest" -Force
    Write-Host "[OK] Extraction completed!" -ForegroundColor Green
}
catch {
    Write-Host "[ERROR] Extraction failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n[Step 4/7] Setting ANDROID_HOME environment variable..." -ForegroundColor Yellow

$currentAndroidHome = [Environment]::GetEnvironmentVariable("ANDROID_HOME", "User")
if (-not $currentAndroidHome -or $currentAndroidHome -ne $androidSdkPath) {
    [Environment]::SetEnvironmentVariable("ANDROID_HOME", $androidSdkPath, "User")
    $env:ANDROID_HOME = $androidSdkPath
    Write-Host "[OK] ANDROID_HOME set to: $androidSdkPath" -ForegroundColor Green
} else {
    Write-Host "[OK] ANDROID_HOME already correct: $currentAndroidHome" -ForegroundColor Green
}

Write-Host "`n[Step 5/7] Adding to PATH..." -ForegroundColor Yellow

$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathsToAdd = @(
    "$androidSdkPath\cmdline-tools\latest\bin",
    "$androidSdkPath\platform-tools",
    "$androidSdkPath\emulator"
)

$pathChanged = $false
foreach ($pathToAdd in $pathsToAdd) {
    if ($currentPath -notlike "*$pathToAdd*") {
        $currentPath += ";$pathToAdd"
        $pathChanged = $true
        Write-Host "[OK] Added: $pathToAdd" -ForegroundColor Green
    } else {
        Write-Host "  Already in PATH: $pathToAdd" -ForegroundColor Gray
    }
}

if ($pathChanged) {
    [Environment]::SetEnvironmentVariable("Path", $currentPath, "User")
    # Update current session
    $env:Path += ";$($pathsToAdd -join ';')"
    Write-Host "[OK] PATH updated!" -ForegroundColor Green
}

Write-Host "`n[Step 6/7] Verifying installation..." -ForegroundColor Yellow

$sdkmanagerPath = "$cmdlineToolsPath\latest\bin\sdkmanager.bat"
if (Test-Path $sdkmanagerPath) {
    Write-Host "[OK] sdkmanager found at: $sdkmanagerPath" -ForegroundColor Green
} else {
    Write-Host "[ERROR] sdkmanager not found!" -ForegroundColor Red
}

Write-Host "`n[Step 7/7] Cleaning up..." -ForegroundColor Yellow
Remove-Item -Path $tempZipPath -Force -ErrorAction SilentlyContinue
Remove-Item -Path $tempExtractPath -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "[OK] Cleanup completed!" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "IMPORTANT: Close and reopen PowerShell/Terminal" -ForegroundColor Yellow
Write-Host ""
Write-Host "Then run these commands:" -ForegroundColor Yellow
Write-Host "  1. flutter doctor --android-licenses" -ForegroundColor White
Write-Host "     (Type 'y' for all prompts)" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. flutter doctor -v" -ForegroundColor White
Write-Host "     (Verify everything is working)" -ForegroundColor Gray
Write-Host ""
