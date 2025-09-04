#!/bin/bash
# PharmApp Secret Detection System - PRIORITY 1 SECURITY CHECK
# This script MUST be run first in any security audit

echo "========================================"
echo "🔍 PHARMAPP SECRET DETECTION - CRITICAL"
echo "========================================"

SECRETS_FOUND=0

echo
echo "[1/5] Searching for Firebase API Keys..."
if find . -name "*.dart" -type f | xargs grep -n -E "AIza[0-9A-Za-z_-]{35}" 2>/dev/null; then
    echo "❌ CRITICAL: Firebase API Key detected!"
    SECRETS_FOUND=1
else
    echo "✅ OK - No Firebase API keys found"
fi

echo
echo "[2/5] Searching for OAuth Client IDs..."
if find . -name "*.dart" -type f | xargs grep -n -E "[0-9]+-[0-9A-Za-z_]{32}\.apps\.googleusercontent\.com" 2>/dev/null; then
    echo "❌ CRITICAL: OAuth Client ID exposed!"
    SECRETS_FOUND=1
else
    echo "✅ OK - No OAuth IDs found"
fi

echo
echo "[3/5] Searching for hardcoded secrets/tokens..."
if find . -name "*.dart" -type f | xargs grep -n -i -E "(secret|token).*[:=]\s*['\"][^'\"]{8,}['\"]" 2>/dev/null; then
    echo "⚠️  WARNING: Potential secret detected!"
    SECRETS_FOUND=1
else
    echo "✅ OK - No secrets found"
fi

echo
echo "[4/5] Searching for hardcoded passwords..."
if find . -name "*.dart" -type f | xargs grep -n -i -E "password.*[:=]\s*['\"][^'\"]{6,}['\"]" 2>/dev/null; then
    echo "❌ CRITICAL: Hardcoded password found!"
    SECRETS_FOUND=1
else
    echo "✅ OK - No hardcoded passwords"
fi

echo
echo "[5/5] Searching for URLs with credentials..."
if find . -name "*.dart" -type f | xargs grep -n -E "https?://\w+:\w+@" 2>/dev/null; then
    echo "❌ CRITICAL: URL with credentials found!"
    SECRETS_FOUND=1
else
    echo "✅ OK - No credential URLs found"
fi

echo
echo "========================================"
if [ $SECRETS_FOUND -eq 1 ]; then
    echo "❌ SECURITY AUDIT FAILED"
    echo "SECRETS DETECTED - PRODUCTION DEPLOYMENT BLOCKED"
    echo "Fix all issues before proceeding!"
    echo "========================================"
    exit 1
else
    echo "✅ SECURITY AUDIT PASSED"
    echo "No hardcoded secrets detected"
    echo "Safe for production deployment"
    echo "========================================"
    exit 0
fi