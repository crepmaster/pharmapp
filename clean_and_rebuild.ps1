# PharmApp - Clean and Rebuild Script
# Fixes persistent Flutter build cache issues

Write-Host "CLEANING ALL FLUTTER BUILD CACHES..." -ForegroundColor Cyan

# Kill all Dart/Flutter processes
Write-Host "`nStep 1: Killing all Dart/Flutter processes..." -ForegroundColor Yellow
Get-Process dart,flutter,gradle -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "Processes killed" -ForegroundColor Green

# Clean pharmacy_app
Write-Host "`nStep 2: Cleaning pharmacy_app..." -ForegroundColor Yellow
Set-Location "pharmacy_app"
Remove-Item -Recurse -Force ".dart_tool","build" -ErrorAction SilentlyContinue
flutter clean
Write-Host "pharmacy_app cleaned" -ForegroundColor Green

# Clean pharmapp_unified
Write-Host "`nStep 3: Cleaning pharmapp_unified..." -ForegroundColor Yellow
Set-Location "..\pharmapp_unified"
Remove-Item -Recurse -Force ".dart_tool","build" -ErrorAction SilentlyContinue
flutter clean
Write-Host "pharmapp_unified cleaned" -ForegroundColor Green

# Clean shared
Write-Host "`nStep 4: Cleaning shared..." -ForegroundColor Yellow
Set-Location "..\shared"
Remove-Item -Recurse -Force ".dart_tool","build" -ErrorAction SilentlyContinue
flutter clean
Write-Host "shared cleaned" -ForegroundColor Green

# Rebuild pharmacy_app
Write-Host "`nStep 5: Rebuilding pharmacy_app..." -ForegroundColor Yellow
Set-Location "..\pharmacy_app"
flutter pub get
Write-Host "Dependencies restored" -ForegroundColor Green

Write-Host "`nReady to run! Execute:" -ForegroundColor Cyan
Write-Host "   flutter run -d emulator-5554" -ForegroundColor White
Write-Host "`nLook for DROPDOWN FIX v3 in logs to confirm fix is applied" -ForegroundColor Magenta
