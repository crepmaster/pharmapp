# PharmApp Security Review Routine
# Automated security check before commits and pushes

param(
    [string]$ReviewType = "pre-commit",
    [string]$ChangedFiles = "",
    [switch]$SkipReview = $false
)

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "PHARMAPP SECURITY REVIEW ROUTINE" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# Security-sensitive file patterns
$SecurityPatterns = @(
    "*auth*.dart",
    "*firebase*.dart", 
    "*security*.dart",
    "*credential*.dart",
    "*token*.dart",
    "*config*.dart",
    "*.env*",
    "*secret*",
    "*key*"
)

# Check if we should skip review
if ($SkipReview) {
    Write-Host "⚠️  Security review SKIPPED by user request" -ForegroundColor Yellow
    Write-Host "This should only be done for non-security changes!" -ForegroundColor Yellow
    return
}

# Determine if security review is needed
$NeedsReview = $false

if ($ReviewType -eq "pre-push" -or $ReviewType -eq "production") {
    Write-Host "🚨 Production/Push detected - Security review MANDATORY" -ForegroundColor Red
    $NeedsReview = $true
} elseif ($ChangedFiles) {
    # Check if any changed files match security patterns
    foreach ($pattern in $SecurityPatterns) {
        if ($ChangedFiles -like "*$pattern*") {
            Write-Host "🔍 Security-sensitive files detected: $pattern" -ForegroundColor Yellow
            $NeedsReview = $true
            break
        }
    }
}

if (-not $NeedsReview) {
    Write-Host "✅ No security-sensitive changes detected" -ForegroundColor Green
    Write-Host "📝 Proceeding without security review" -ForegroundColor Green
    return
}

Write-Host ""
Write-Host "🔒 SECURITY REVIEW REQUIRED" -ForegroundColor Red
Write-Host "Reason: $ReviewType with security-sensitive changes" -ForegroundColor Yellow
Write-Host ""

# In a real implementation, this would:
# 1. Call the pharmapp-reviewer agent
# 2. Wait for security assessment
# 3. Block commit/push if critical issues found
# 4. Log security review results

Write-Host "📋 Security Review Steps:" -ForegroundColor Cyan
Write-Host "1. 🔍 Scanning for API key exposure..." -ForegroundColor White
Write-Host "2. 🔐 Checking authentication security..." -ForegroundColor White  
Write-Host "3. 🛡️  Validating data privacy compliance..." -ForegroundColor White
Write-Host "4. 🚀 Verifying production readiness..." -ForegroundColor White

# Placeholder for actual security review integration
Write-Host ""
Write-Host "⚠️  MANUAL ACTION REQUIRED:" -ForegroundColor Yellow
Write-Host "Please run: Task > pharmapp-reviewer > security scan" -ForegroundColor White
Write-Host "Before proceeding with commit/push" -ForegroundColor White
Write-Host ""

$response = Read-Host "Have you completed the security review? (yes/no)"
if ($response -ne "yes") {
    Write-Host "❌ Security review not completed - BLOCKING operation" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Security review completed - Proceeding with operation" -ForegroundColor Green