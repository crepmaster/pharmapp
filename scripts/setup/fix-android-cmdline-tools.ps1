# Fix Android Command-Line Tools
# This script downloads and installs the Android cmdline-tools

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Android Command-Line Tools Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$androidSdkPath = "$env:LOCALAPPDATA\Android\sdk"
$cmdlineToolsUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
$tempZipPath = "$env:TEMP\cmdline-tools.zip"
$cmdlineToolsPath = "$androidSdkPath\cmdline-tools"

Write-Host "[1/5] Checking Android SDK location..." -ForegroundColor Yellow
if (-not (Test-Path $androidSdkPath)) {
    Write-Host "Creating Android SDK directory..." -ForegroundColor Gray
    New-Item -Path $androidSdkPath -ItemType Directory -Force | Out-Null
}
Write-Host "Android SDK path: $androidSdkPath" -ForegroundColor Green

Write-Host "[2/5] Downloading Android command-line tools..." -ForegroundColor Yellow
Write-Host "This may take a few minutes..." -ForegroundColor Gray

try {
    $webClient = New-Object System.Net.WebClient
    $webClient.DownloadFile($cmdlineToolsUrl, $tempZipPath)
    Write-Host "Download completed!" -ForegroundColor Green
}
catch {
    Write-Host "Error downloading cmdline-tools: $_" -ForegroundColor Red
    exit 1
}

Write-Host "[3/5] Extracting command-line tools..." -ForegroundColor Yellow

try {
    # Create cmdline-tools directory structure
    if (Test-Path "$cmdlineToolsPath\latest") {
        Write-Host "Removing old cmdline-tools..." -ForegroundColor Gray
        Remove-Item -Path "$cmdlineToolsPath\latest" -Recurse -Force
    }

    # Extract to temporary location
    $tempExtractPath = "$env:TEMP\cmdline-tools-extract"
    if (Test-Path $tempExtractPath) {
        Remove-Item -Path $tempExtractPath -Recurse -Force
    }

    Expand-Archive -Path $tempZipPath -DestinationPath $tempExtractPath -Force

    # Move to correct location (cmdline-tools/latest)
    if (-not (Test-Path $cmdlineToolsPath)) {
        New-Item -Path $cmdlineToolsPath -ItemType Directory -Force | Out-Null
    }

    Move-Item -Path "$tempExtractPath\cmdline-tools" -Destination "$cmdlineToolsPath\latest" -Force

    Write-Host "Extraction completed!" -ForegroundColor Green
}
catch {
    Write-Host "Error extracting cmdline-tools: $_" -ForegroundColor Red
    exit 1
}

Write-Host "[4/5] Setting up environment variables..." -ForegroundColor Yellow

# Set ANDROID_HOME if not already set
$currentAndroidHome = [Environment]::GetEnvironmentVariable("ANDROID_HOME", "User")
if (-not $currentAndroidHome) {
    [Environment]::SetEnvironmentVariable("ANDROID_HOME", $androidSdkPath, "User")
    Write-Host "ANDROID_HOME set to: $androidSdkPath" -ForegroundColor Green
} else {
    Write-Host "ANDROID_HOME already set: $currentAndroidHome" -ForegroundColor Green
}

# Add to PATH if not already there
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathsToAdd = @(
    "$androidSdkPath\cmdline-tools\latest\bin",
    "$androidSdkPath\platform-tools"
)

$pathChanged = $false
foreach ($pathToAdd in $pathsToAdd) {
    if ($currentPath -notlike "*$pathToAdd*") {
        $currentPath += ";$pathToAdd"
        $pathChanged = $true
        Write-Host "Added to PATH: $pathToAdd" -ForegroundColor Green
    }
}

if ($pathChanged) {
    [Environment]::SetEnvironmentVariable("Path", $currentPath, "User")
    Write-Host "PATH updated successfully!" -ForegroundColor Green
} else {
    Write-Host "PATH already contains required directories" -ForegroundColor Green
}

Write-Host "[5/5] Cleaning up..." -ForegroundColor Yellow
Remove-Item -Path $tempZipPath -Force -ErrorAction SilentlyContinue
Remove-Item -Path $tempExtractPath -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Cleanup completed!" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Close and reopen PowerShell/Terminal" -ForegroundColor White
Write-Host "2. Run: flutter doctor --android-licenses" -ForegroundColor White
Write-Host "3. Accept all licenses by typing 'y'" -ForegroundColor White
Write-Host "4. Run: flutter doctor -v (to verify)" -ForegroundColor White
Write-Host ""
Write-Host "Command-line tools installed at:" -ForegroundColor Gray
Write-Host "$cmdlineToolsPath\latest" -ForegroundColor Gray
