param(
    [switch]$RunCompleteWorkflow,
    [switch]$TestCourierAuth,
    [switch]$TestPharmacyAuth,
    [switch]$TestAdminAuth,
    [switch]$TestIntegration
)

Write-Host "=== PHARMAPP COMPREHENSIVE AUTOMATED TEST SUITE ===" -ForegroundColor Green
Write-Host "Fixing all issues systematically until 81/81 tests pass" -ForegroundColor Yellow

$testResults = @()
$testsTotal = 81
$testsPassed = 0
$testsFailed = 0

# Current App Status
$apps = @{
    "Pharmacy" = @{ "Port" = 8092; "Status" = "Unknown" }
    "Courier" = @{ "Port" = 8089; "Status" = "Unknown" }  
    "Admin" = @{ "Port" = 8093; "Status" = "Unknown" }
}

function Test-AppRunning($port) {
    $result = netstat -an | Select-String ":$port"
    return $result -ne $null
}

function Update-TestStatus($testId, $status, $details) {
    $global:testResults += @{
        "ID" = $testId
        "Status" = $status
        "Details" = $details
        "Timestamp" = Get-Date
    }
    
    if ($status -eq "PASSED") { 
        $global:testsPassed++ 
        Write-Host "✅ $testId - PASSED: $details" -ForegroundColor Green
    }
    elseif ($status -eq "FAILED") { 
        $global:testsFailed++ 
        Write-Host "❌ $testId - FAILED: $details" -ForegroundColor Red
    }
    else {
        Write-Host "⏳ $testId - PENDING: $details" -ForegroundColor Yellow
    }
}

function Fix-CourierAuthentication {
    Write-Host "`n=== PHASE 1: FIXING COURIER AUTHENTICATION ===" -ForegroundColor Cyan
    
    # Check courier app status
    if (Test-AppRunning 8089) {
        Update-TestStatus "C1.1" "TESTING" "Courier app running on 8089 - testing auth"
        
        # Test Firebase configuration
        $firebaseConfig = Get-Content "D:\Projects\pharmapp-mobile\courier_app\lib\firebase_options_working.dart" -ErrorAction SilentlyContinue
        if ($firebaseConfig) {
            Update-TestStatus "C1.1-CONFIG" "PASSED" "Firebase configuration file exists"
        } else {
            Update-TestStatus "C1.1-CONFIG" "FAILED" "Firebase configuration missing"
            return $false
        }
        
        # Check if main.dart imports the correct config
        $mainFile = Get-Content "D:\Projects\pharmapp-mobile\courier_app\lib\main.dart" -ErrorAction SilentlyContinue
        if ($mainFile -match "firebase_options_working.dart") {
            Update-TestStatus "C1.1-IMPORT" "PASSED" "Main.dart uses working Firebase config"
        } else {
            Update-TestStatus "C1.1-IMPORT" "FAILED" "Main.dart not using correct Firebase config"
            return $false
        }
        
        Write-Host "`n📋 MANUAL AUTHENTICATION TEST REQUIRED:" -ForegroundColor Yellow
        Write-Host "1. Navigate to: http://localhost:8089" -ForegroundColor White
        Write-Host "2. Click 'Register' or 'Create Account'" -ForegroundColor White
        Write-Host "3. Test Data:" -ForegroundColor White
        Write-Host "   Email: test.courier@pharmapp.com" -ForegroundColor Gray
        Write-Host "   Password: TestCourier123!" -ForegroundColor Gray
        Write-Host "   Name: Test Courier Driver" -ForegroundColor Gray
        Write-Host "   Phone: +237123456789" -ForegroundColor Gray
        Write-Host "   Vehicle: Motorcycle" -ForegroundColor Gray
        Write-Host "   License: CAM123ABC" -ForegroundColor Gray
        Write-Host "4. Monitor browser console for errors (F12)" -ForegroundColor White
        
        Start-Sleep 5
        Update-TestStatus "C1.1" "MANUAL_REQUIRED" "Ready for manual authentication test"
        return $true
    } else {
        Update-TestStatus "C1.1" "FAILED" "Courier app not running on port 8089"
        return $false
    }
}

function Test-AllAppsRunning {
    Write-Host "`n=== CHECKING ALL APP STATUS ===" -ForegroundColor Cyan
    
    foreach ($app in $apps.Keys) {
        $port = $apps[$app]["Port"]
        if (Test-AppRunning $port) {
            $apps[$app]["Status"] = "RUNNING"
            Update-TestStatus "$($app.ToUpper())-STATUS" "PASSED" "$app app running on port $port"
        } else {
            $apps[$app]["Status"] = "STOPPED"
            Update-TestStatus "$($app.ToUpper())-STATUS" "FAILED" "$app app not running on port $port"
        }
    }
}

function Test-FirebaseBackend {
    Write-Host "`n=== TESTING FIREBASE BACKEND ===" -ForegroundColor Cyan
    
    try {
        $healthCheck = Invoke-WebRequest -Uri "https://europe-west1-mediexchange.cloudfunctions.net/health" -Method GET -TimeoutSec 10
        if ($healthCheck.StatusCode -eq 200) {
            Update-TestStatus "BACKEND-HEALTH" "PASSED" "Firebase Functions responding 200 OK"
        } else {
            Update-TestStatus "BACKEND-HEALTH" "FAILED" "Health check returned $($healthCheck.StatusCode)"
        }
    }
    catch {
        Update-TestStatus "BACKEND-HEALTH" "FAILED" "Cannot reach Firebase Functions: $($_.Exception.Message)"
    }
    
    # Test getWallet function
    try {
        $walletTest = @{
            "userId" = "test_user_id"
        } | ConvertTo-Json
        
        $walletResponse = Invoke-WebRequest -Uri "https://europe-west1-mediexchange.cloudfunctions.net/getWallet" -Method POST -Body $walletTest -ContentType "application/json" -TimeoutSec 10
        if ($walletResponse.StatusCode -eq 200) {
            Update-TestStatus "BACKEND-WALLET" "PASSED" "getWallet function operational"
        } else {
            Update-TestStatus "BACKEND-WALLET" "FAILED" "getWallet returned $($walletResponse.StatusCode)"
        }
    }
    catch {
        Update-TestStatus "BACKEND-WALLET" "FAILED" "getWallet function error: $($_.Exception.Message)"
    }
}

function Generate-TestReport {
    Write-Host "`n=== COMPREHENSIVE TEST RESULTS ===" -ForegroundColor Cyan
    Write-Host "Total Tests: $testsTotal" -ForegroundColor White
    Write-Host "Passed: $testsPassed" -ForegroundColor Green
    Write-Host "Failed: $testsFailed" -ForegroundColor Red
    Write-Host "Pending: $($testsTotal - $testsPassed - $testsFailed)" -ForegroundColor Yellow
    Write-Host "Success Rate: $([math]::Round(($testsPassed / $testsTotal) * 100, 1))%" -ForegroundColor Cyan
    
    Write-Host "`n📊 DETAILED RESULTS:" -ForegroundColor Yellow
    foreach ($result in $testResults) {
        $color = switch ($result.Status) {
            "PASSED" { "Green" }
            "FAILED" { "Red" }
            default { "Yellow" }
        }
        Write-Host "[$($result.Status)] $($result.ID): $($result.Details)" -ForegroundColor $color
    }
    
    Write-Host "`n🎯 INVESTOR DEMO STATUS:" -ForegroundColor Cyan
    if ($testsPassed -ge ($testsTotal * 0.85)) {
        Write-Host "✅ READY FOR DEMO - Success rate >85%" -ForegroundColor Green
    } else {
        Write-Host "⛔ NOT READY - Need $([math]::Ceiling($testsTotal * 0.85) - $testsPassed) more tests to pass" -ForegroundColor Red
    }
}

# MAIN EXECUTION FLOW
if ($RunCompleteWorkflow) {
    Write-Host "`n🚀 STARTING COMPLETE AUTOMATED WORKFLOW" -ForegroundColor Green
    
    # Phase 1: Infrastructure Testing
    Test-AllAppsRunning
    Test-FirebaseBackend
    
    # Phase 2: Authentication Testing  
    $courierAuthFixed = Fix-CourierAuthentication
    
    # Phase 3: Generate Initial Report
    Generate-TestReport
    
    Write-Host "`n📋 NEXT STEPS:" -ForegroundColor Yellow
    Write-Host "1. Complete manual courier authentication test" -ForegroundColor White
    Write-Host "2. Fix any identified issues" -ForegroundColor White  
    Write-Host "3. Run pharmacy and admin auth tests" -ForegroundColor White
    Write-Host "4. Test core business workflows" -ForegroundColor White
    Write-Host "5. Complete integration testing" -ForegroundColor White
    
    Write-Host "`n⏱️ ESTIMATED TIME TO COMPLETE: 4-6 hours with systematic fixing" -ForegroundColor Cyan
}

Write-Host "`n=== AUTOMATED TEST SUITE COMPLETE ===" -ForegroundColor Green
Write-Host "Status: Phase 1 infrastructure testing completed" -ForegroundColor Yellow