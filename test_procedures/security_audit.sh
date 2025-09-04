#!/bin/bash
# PharmApp Security Audit Script
# Comprehensive security vulnerability scanner for production deployment

set -e
echo "🔒 PHARMAPP SECURITY AUDIT"
echo "=========================="

# Change to project root
cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Results tracking
TOTAL_CHECKS=0
SECURITY_ISSUES=0
WARNINGS=0
INFO_COUNT=0

# Logging function
log_security() {
    local check_name="$1"
    local severity="$2"
    local count="$3"
    local message="$4"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    case "$severity" in
        "CRITICAL")
            echo -e "🔴 ${RED}CRITICAL${NC}: $check_name - $count instances found"
            [ -n "$message" ] && echo -e "   Details: $message"
            SECURITY_ISSUES=$((SECURITY_ISSUES + count))
            ;;
        "HIGH")
            echo -e "🟠 ${YELLOW}HIGH${NC}: $check_name - $count instances found"
            [ -n "$message" ] && echo -e "   Details: $message"
            SECURITY_ISSUES=$((SECURITY_ISSUES + count))
            ;;
        "MEDIUM")
            echo -e "🟡 ${YELLOW}MEDIUM${NC}: $check_name - $count instances found"
            [ -n "$message" ] && echo -e "   Details: $message"
            WARNINGS=$((WARNINGS + count))
            ;;
        "LOW")
            echo -e "🔵 ${BLUE}LOW${NC}: $check_name - $count instances"
            [ -n "$message" ] && echo -e "   Details: $message"
            INFO_COUNT=$((INFO_COUNT + count))
            ;;
        "PASS")
            echo -e "✅ ${GREEN}SECURE${NC}: $check_name - No issues found"
            ;;
    esac
}

# Check 1: Debug Statement Exposure
echo -e "\n${PURPLE}1. Debug Statement Security Analysis${NC}"
echo "-----------------------------------"

# Find all debug print statements
DEBUG_FILES=$(find . -name "*.dart" -not -path "./test_procedures/*" -not -path "./test/*" -exec grep -l "print(" {} \; 2>/dev/null)
DEBUG_COUNT=$(echo "$DEBUG_FILES" | grep -v "^$" | wc -l)

if [ "$DEBUG_COUNT" -eq 0 ]; then
    log_security "Debug Print Statements" "PASS" 0
else
    log_security "Debug Print Statements" "HIGH" $DEBUG_COUNT "Debug statements expose sensitive data in production logs"
    
    # Show top 5 files with most debug statements
    echo "   Top files with debug statements:"
    for file in $DEBUG_FILES; do
        count=$(grep -c "print(" "$file" 2>/dev/null || echo 0)
        [ "$count" -gt 0 ] && echo "     • $file: $count statements"
    done | sort -k2 -nr | head -5
fi

# Check 2: Sensitive Data Exposure
echo -e "\n${PURPLE}2. Sensitive Data Exposure Analysis${NC}"
echo "----------------------------------"

# Check for sensitive data in debug statements
SENSITIVE_PATTERNS=("password" "token" "secret" "api.*key" "credential" "auth.*key" "firebase.*key" "private.*key")
TOTAL_SENSITIVE=0

for pattern in "${SENSITIVE_PATTERNS[@]}"; do
    COUNT=$(grep -r -i "$pattern" */lib/ 2>/dev/null | grep -i "print\|log\|debug" | wc -l)
    if [ "$COUNT" -gt 0 ]; then
        log_security "Sensitive Pattern: $pattern" "CRITICAL" $COUNT "Found in debug/log statements"
        TOTAL_SENSITIVE=$((TOTAL_SENSITIVE + COUNT))
    fi
done

if [ "$TOTAL_SENSITIVE" -eq 0 ]; then
    log_security "Sensitive Data in Logs" "PASS" 0
fi

# Check 3: Hardcoded Credentials
echo -e "\n${PURPLE}3. Hardcoded Credentials Analysis${NC}"
echo "--------------------------------"

# Check for hardcoded secrets
HARDCODED_COUNT=$(grep -r -E "(password|secret|token|api.*key).*=.*['\"][^'\"]{8,}['\"]" */lib/ 2>/dev/null | wc -l)
if [ "$HARDCODED_COUNT" -eq 0 ]; then
    log_security "Hardcoded Credentials" "PASS" 0
else
    log_security "Hardcoded Credentials" "CRITICAL" $HARDCODED_COUNT "Credentials embedded in source code"
fi

# Check 4: Firebase Configuration Security
echo -e "\n${PURPLE}4. Firebase Configuration Security${NC}"
echo "---------------------------------"

# Check for Firebase config exposure
FIREBASE_EXPOSED=0
for app in "pharmacy_app" "courier_app" "admin_panel"; do
    if [ -f "$app/lib/firebase_options.dart" ]; then
        # Check if sensitive Firebase config is in debug statements
        FIREBASE_DEBUG=$(grep -c "print.*firebase\|print.*project.*id\|print.*api.*key" "$app/lib/firebase_options.dart" 2>/dev/null || echo 0)
        if [ "$FIREBASE_DEBUG" -gt 0 ]; then
            FIREBASE_EXPOSED=$((FIREBASE_EXPOSED + FIREBASE_DEBUG))
        fi
    fi
done

if [ "$FIREBASE_EXPOSED" -eq 0 ]; then
    log_security "Firebase Config Exposure" "PASS" 0
else
    log_security "Firebase Config Exposure" "HIGH" $FIREBASE_EXPOSED "Firebase credentials in debug statements"
fi

# Check 5: Authentication Security
echo -e "\n${PURPLE}5. Authentication Security Analysis${NC}"
echo "----------------------------------"

# Check for weak password patterns
WEAK_PASSWORD_COUNT=$(grep -r -i "password.*=.*['\"][^'\"]*123\|password.*=.*['\"][^'\"]*test\|password.*=.*['\"][^'\"]*admin" */lib/ 2>/dev/null | wc -l)
if [ "$WEAK_PASSWORD_COUNT" -eq 0 ]; then
    log_security "Weak Test Passwords" "PASS" 0
else
    log_security "Weak Test Passwords" "MEDIUM" $WEAK_PASSWORD_COUNT "Test passwords found in code"
fi

# Check for insecure random generation (before fix)
INSECURE_RANDOM=$(grep -r "DateTime\.now().*millisecondsSinceEpoch" */lib/ 2>/dev/null | grep -i "random\|password\|token" | wc -l)
if [ "$INSECURE_RANDOM" -eq 0 ]; then
    log_security "Insecure Random Generation" "PASS" 0
else
    log_security "Insecure Random Generation" "HIGH" $INSECURE_RANDOM "Using predictable random seeds"
fi

# Check 6: Network Security
echo -e "\n${PURPLE}6. Network Security Analysis${NC}"
echo "----------------------------"

# Check for HTTP (non-HTTPS) requests
HTTP_REQUESTS=$(grep -r "http://" */lib/ 2>/dev/null | grep -v "localhost\|127\.0\.0\.1" | wc -l)
if [ "$HTTP_REQUESTS" -eq 0 ]; then
    log_security "Insecure HTTP Requests" "PASS" 0
else
    log_security "Insecure HTTP Requests" "MEDIUM" $HTTP_REQUESTS "Non-HTTPS network requests found"
fi

# Check for SSL certificate validation bypass
SSL_BYPASS=$(grep -r -i "certificate.*ignore\|ssl.*ignore\|trust.*all" */lib/ 2>/dev/null | wc -l)
if [ "$SSL_BYPASS" -eq 0 ]; then
    log_security "SSL Certificate Validation" "PASS" 0
else
    log_security "SSL Certificate Validation" "CRITICAL" $SSL_BYPASS "SSL validation bypass detected"
fi

# Check 7: Data Storage Security
echo -e "\n${PURPLE}7. Data Storage Security Analysis${NC}"
echo "--------------------------------"

# Check for sensitive data in SharedPreferences/local storage
LOCAL_STORAGE_SENSITIVE=$(grep -r -i "sharedpreferences\|localstorage" */lib/ 2>/dev/null | grep -i "password\|token\|secret" | wc -l)
if [ "$LOCAL_STORAGE_SENSITIVE" -eq 0 ]; then
    log_security "Sensitive Data in Local Storage" "PASS" 0
else
    log_security "Sensitive Data in Local Storage" "HIGH" $LOCAL_STORAGE_SENSITIVE "Sensitive data stored insecurely"
fi

# Check 8: Input Validation
echo -e "\n${PURPLE}8. Input Validation Analysis${NC}"
echo "---------------------------"

# Check for potential SQL injection patterns (though using Firestore)
SQL_INJECTION=$(grep -r -E "rawQuery|execSQL" */lib/ 2>/dev/null | wc -l)
if [ "$SQL_INJECTION" -eq 0 ]; then
    log_security "SQL Injection Vectors" "PASS" 0
else
    log_security "SQL Injection Vectors" "HIGH" $SQL_INJECTION "Raw SQL queries detected"
fi

# Check for unvalidated user input
INPUT_VALIDATION=$(grep -r -E "text\.isEmpty|text\.isNotEmpty" */lib/ 2>/dev/null | wc -l)
TOTAL_INPUTS=$(grep -r -E "TextFormField|TextField" */lib/ 2>/dev/null | wc -l)

if [ "$TOTAL_INPUTS" -gt 0 ]; then
    VALIDATION_RATIO=$((INPUT_VALIDATION * 100 / TOTAL_INPUTS))
    if [ "$VALIDATION_RATIO" -gt 80 ]; then
        log_security "Input Validation Coverage" "PASS" 0 "${VALIDATION_RATIO}% of inputs validated"
    elif [ "$VALIDATION_RATIO" -gt 50 ]; then
        log_security "Input Validation Coverage" "MEDIUM" $((TOTAL_INPUTS - INPUT_VALIDATION)) "${VALIDATION_RATIO}% validation coverage"
    else
        log_security "Input Validation Coverage" "HIGH" $((TOTAL_INPUTS - INPUT_VALIDATION)) "Only ${VALIDATION_RATIO}% validation coverage"
    fi
fi

# Check 9: Permission Analysis
echo -e "\n${PURPLE}9. Permission Security Analysis${NC}"
echo "------------------------------"

# Check Android permissions
for app in "pharmacy_app" "courier_app" "admin_panel"; do
    MANIFEST_PATH="$app/android/app/src/main/AndroidManifest.xml"
    if [ -f "$MANIFEST_PATH" ]; then
        DANGEROUS_PERMISSIONS=$(grep -E "CAMERA|LOCATION|STORAGE|CONTACTS|MICROPHONE" "$MANIFEST_PATH" 2>/dev/null | wc -l)
        if [ "$DANGEROUS_PERMISSIONS" -gt 0 ]; then
            log_security "$app Dangerous Permissions" "MEDIUM" $DANGEROUS_PERMISSIONS "Review required permissions"
        fi
    fi
done

# Check 10: Firebase Security Rules
echo -e "\n${PURPLE}10. Firebase Security Rules Analysis${NC}"
echo "------------------------------------"

# This would typically check the actual Firestore rules
# For now, we check if rules are referenced in the code
FIRESTORE_RULES_REF=$(grep -r -i "firestore.*rules\|security.*rules" */lib/ 2>/dev/null | wc -l)
log_security "Firestore Security Rules" "INFO" $FIRESTORE_RULES_REF "References to security rules found"

# Generate Security Report
echo -e "\n${BLUE}🔒 SECURITY AUDIT SUMMARY${NC}"
echo "========================"
echo -e "Total Security Checks: $TOTAL_CHECKS"
echo -e "${RED}Critical/High Issues: $SECURITY_ISSUES${NC}"
echo -e "${YELLOW}Medium Warnings: $WARNINGS${NC}"
echo -e "${BLUE}Information Items: $INFO_COUNT${NC}"

# Create detailed report file
REPORT_FILE="security_audit_report_$(date +%Y%m%d_%H%M%S).txt"
{
    echo "PharmApp Security Audit Report"
    echo "Generated: $(date)"
    echo "=========================="
    echo ""
    echo "Executive Summary:"
    echo "- Total Checks: $TOTAL_CHECKS"
    echo "- Critical/High Issues: $SECURITY_ISSUES"
    echo "- Medium Warnings: $WARNINGS"
    echo "- Information Items: $INFO_COUNT"
    echo ""
    
    if [ "$SECURITY_ISSUES" -gt 0 ]; then
        echo "CRITICAL ACTION REQUIRED:"
        echo "- $SECURITY_ISSUES security issues must be resolved before production deployment"
        echo "- Focus on debug statement removal and sensitive data exposure"
        echo "- Implement secure random generation for password/token creation"
        echo ""
    fi
    
    echo "Recommendations:"
    echo "1. Remove all debug print statements from production code"
    echo "2. Implement proper logging framework with configurable levels"
    echo "3. Use environment variables for sensitive configuration"
    echo "4. Implement proper input validation for all user inputs"
    echo "5. Regular security code reviews and automated scanning"
    echo ""
    
} > "$REPORT_FILE"

echo -e "\n📄 Detailed report saved to: $REPORT_FILE"

# Exit with appropriate code
if [ "$SECURITY_ISSUES" -gt 0 ]; then
    echo -e "\n❌ ${RED}SECURITY AUDIT FAILED${NC} - Critical issues must be resolved"
    echo -e "   🚨 Production deployment BLOCKED until issues are fixed"
    exit 1
elif [ "$WARNINGS" -gt 10 ]; then
    echo -e "\n⚠️  ${YELLOW}SECURITY AUDIT PASSED WITH WARNINGS${NC} - Consider addressing warnings"
    exit 2
else
    echo -e "\n✅ ${GREEN}SECURITY AUDIT PASSED${NC} - Ready for production deployment"
    exit 0
fi