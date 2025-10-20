# Flutter SDK Installation Script
# Run this in PowerShell as Administrator

# Configuration
$FlutterInstallPath = "C:\src\flutter"
$FlutterZipUrl = "https://storage.googleapis.com/flutter_infra_release/releases/stable/windows/flutter_windows_3.24.5-stable.zip"
$TempZipPath = "$env:TEMP\flutter_windows.zip"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Flutter SDK Installation for PharmApp" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create installation directory
Write-Host "[1/5] Creating installation directory..." -ForegroundColor Yellow
if (-not (Test-Path "C:\src")) {
    New-Item -Path "C:\src" -ItemType Directory -Force | Out-Null
    Write-Host "Created C:\src directory" -ForegroundColor Green
}

# Step 2: Download Flutter SDK
Write-Host "[2/5] Downloading Flutter SDK (this may take several minutes)..." -ForegroundColor Yellow
Write-Host "URL: $FlutterZipUrl" -ForegroundColor Gray

try {
    # Use .NET WebClient for download with progress
    $webClient = New-Object System.Net.WebClient
    $webClient.DownloadFile($FlutterZipUrl, $TempZipPath)
    Write-Host "Download completed!" -ForegroundColor Green
}
catch {
    Write-Host "Error downloading Flutter SDK: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Extract Flutter SDK
Write-Host "[3/5] Extracting Flutter SDK to $FlutterInstallPath..." -ForegroundColor Yellow

try {
    # Check if flutter directory already exists
    if (Test-Path $FlutterInstallPath) {
        Write-Host "Flutter directory already exists. Removing old installation..." -ForegroundColor Yellow
        Remove-Item -Path $FlutterInstallPath -Recurse -Force
    }

    # Extract using Expand-Archive
    Expand-Archive -Path $TempZipPath -DestinationPath "C:\src" -Force
    Write-Host "Extraction completed!" -ForegroundColor Green
}
catch {
    Write-Host "Error extracting Flutter SDK: $_" -ForegroundColor Red
    exit 1
}

# Step 4: Add Flutter to PATH
Write-Host "[4/5] Adding Flutter to PATH..." -ForegroundColor Yellow

$FlutterBinPath = "$FlutterInstallPath\bin"
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")

if ($currentPath -notlike "*$FlutterBinPath*") {
    [Environment]::SetEnvironmentVariable(
        "Path",
        "$currentPath;$FlutterBinPath",
        "User"
    )
    Write-Host "Flutter added to PATH!" -ForegroundColor Green
    Write-Host "NOTE: You may need to restart PowerShell for PATH changes to take effect." -ForegroundColor Yellow
} else {
    Write-Host "Flutter is already in PATH" -ForegroundColor Green
}

# Step 5: Clean up
Write-Host "[5/5] Cleaning up temporary files..." -ForegroundColor Yellow
Remove-Item -Path $TempZipPath -Force
Write-Host "Cleanup completed!" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Flutter SDK Installation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Close and reopen PowerShell/Terminal" -ForegroundColor White
Write-Host "2. Run: flutter --version" -ForegroundColor White
Write-Host "3. Run: flutter doctor" -ForegroundColor White
Write-Host "4. Run: flutter doctor --android-licenses (accept all)" -ForegroundColor White
Write-Host ""
Write-Host "Flutter installation path: $FlutterInstallPath" -ForegroundColor Gray
