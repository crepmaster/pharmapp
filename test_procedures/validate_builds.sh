#!/bin/bash
# PharmApp Build Validation Suite
# Validates all 3 applications for compilation errors and critical issues

set -e
echo "🚀 PHARMAPP BUILD VALIDATION SUITE"
echo "==================================="

# Change to project root
cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)

# Define applications and their build targets
declare -A APPS
APPS[pharmacy_app]="apk"
APPS[courier_app]="apk" 
APPS[admin_panel]="web"

# Results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
CRITICAL_ISSUES=()

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log_result() {
    local test_name="$1"
    local status="$2"
    local message="$3"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if [ "$status" = "PASS" ]; then
        echo -e "✅ ${GREEN}PASS${NC}: $test_name"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    elif [ "$status" = "FAIL" ]; then
        echo -e "❌ ${RED}FAIL${NC}: $test_name - $message"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        CRITICAL_ISSUES+=("$test_name: $message")
    elif [ "$status" = "WARN" ]; then
        echo -e "⚠️  ${YELLOW}WARN${NC}: $test_name - $message"
    else
        echo -e "ℹ️  ${BLUE}INFO${NC}: $test_name - $message"
    fi
}

# Test 1: Check Flutter installation
echo -e "\n${BLUE}Phase 1: Environment Validation${NC}"
echo "--------------------------------"

if flutter --version > /dev/null 2>&1; then
    FLUTTER_VERSION=$(flutter --version | head -n 1)
    log_result "Flutter Installation" "PASS" "$FLUTTER_VERSION"
else
    log_result "Flutter Installation" "FAIL" "Flutter not found in PATH"
    exit 1
fi

# Test 2: Validate each application
echo -e "\n${BLUE}Phase 2: Application Validation${NC}"
echo "-------------------------------"

for app in "${!APPS[@]}"; do
    echo -e "\n📱 Testing $app..."
    
    if [ ! -d "$app" ]; then
        log_result "$app Directory" "FAIL" "Directory not found"
        continue
    fi
    
    cd "$PROJECT_ROOT/$app"
    
    # Test 2A: pubspec.yaml validation
    if [ -f "pubspec.yaml" ]; then
        log_result "$app pubspec.yaml" "PASS" "Found"
    else
        log_result "$app pubspec.yaml" "FAIL" "Missing pubspec.yaml"
        cd "$PROJECT_ROOT"
        continue
    fi
    
    # Test 2B: Dependency resolution
    if flutter pub get > /dev/null 2>&1; then
        log_result "$app Dependencies" "PASS" "All dependencies resolved"
    else
        log_result "$app Dependencies" "FAIL" "pub get failed"
        cd "$PROJECT_ROOT"
        continue
    fi
    
    # Test 2C: Static analysis
    ANALYSIS_ISSUES=$(flutter analyze 2>&1 | grep -c "issues found" || echo "0")
    if [ "$ANALYSIS_ISSUES" = "0" ]; then
        log_result "$app Static Analysis" "PASS" "No issues found"
    else
        ISSUE_COUNT=$(flutter analyze 2>&1 | grep "issues found" | awk '{print $1}')
        if [ "$ISSUE_COUNT" -gt 0 ]; then
            log_result "$app Static Analysis" "WARN" "$ISSUE_COUNT issues found"
        fi
    fi
    
    # Test 2D: Compilation test
    BUILD_TARGET=${APPS[$app]}
    if [ "$BUILD_TARGET" = "web" ]; then
        BUILD_COMMAND="flutter build web --release"
    else
        BUILD_COMMAND="flutter build apk --debug"
    fi
    
    echo "   Running: $BUILD_COMMAND"
    if eval "$BUILD_COMMAND" > /dev/null 2>&1; then
        log_result "$app Compilation ($BUILD_TARGET)" "PASS" "Build successful"
    else
        log_result "$app Compilation ($BUILD_TARGET)" "FAIL" "Build failed"
    fi
    
    cd "$PROJECT_ROOT"
done

# Test 3: Security validation
echo -e "\n${BLUE}Phase 3: Security Validation${NC}"
echo "----------------------------"

# Test 3A: Debug statement detection
DEBUG_COUNT=$(find . -name "*.dart" -not -path "./test_procedures/*" -exec grep -l "print(" {} \; 2>/dev/null | wc -l)
if [ "$DEBUG_COUNT" -eq 0 ]; then
    log_result "Debug Statements" "PASS" "No debug print statements found"
else
    log_result "Debug Statements" "FAIL" "$DEBUG_COUNT files contain print() statements"
fi

# Test 3B: Sensitive data exposure
SENSITIVE_COUNT=$(grep -r -i "password\|token\|secret\|api.*key" */lib/ 2>/dev/null | grep "print" | wc -l)
if [ "$SENSITIVE_COUNT" -eq 0 ]; then
    log_result "Sensitive Data Exposure" "PASS" "No sensitive data in debug statements"
else
    log_result "Sensitive Data Exposure" "FAIL" "$SENSITIVE_COUNT instances of sensitive data in debug statements"
fi

# Test 3C: BuildContext safety
BUILDCONTEXT_COUNT=$(flutter analyze pharmacy_app courier_app admin_panel 2>&1 | grep -c "use_build_context_synchronously" || echo "0")
if [ "$BUILDCONTEXT_COUNT" -eq 0 ]; then
    log_result "BuildContext Safety" "PASS" "No unsafe BuildContext usage"
else
    log_result "BuildContext Safety" "WARN" "$BUILDCONTEXT_COUNT unsafe BuildContext usages found"
fi

# Test 4: Firebase configuration validation
echo -e "\n${BLUE}Phase 4: Firebase Configuration${NC}"
echo "------------------------------"

for app in "${!APPS[@]}"; do
    if [ -f "$app/lib/firebase_options.dart" ]; then
        log_result "$app Firebase Config" "PASS" "Firebase configuration found"
    else
        log_result "$app Firebase Config" "WARN" "Firebase configuration missing"
    fi
done

# Test 5: Asset validation
echo -e "\n${BLUE}Phase 5: Asset Validation${NC}"
echo "------------------------"

for app in "${!APPS[@]}"; do
    if [ -d "$app/assets" ]; then
        ASSET_COUNT=$(find "$app/assets" -type f | wc -l)
        log_result "$app Assets" "PASS" "$ASSET_COUNT assets found"
    else
        log_result "$app Assets" "WARN" "No assets directory"
    fi
done

# Final Results
echo -e "\n${BLUE}📊 VALIDATION SUMMARY${NC}"
echo "===================="
echo -e "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"

if [ ${#CRITICAL_ISSUES[@]} -gt 0 ]; then
    echo -e "\n${RED}🚨 CRITICAL ISSUES FOUND:${NC}"
    for issue in "${CRITICAL_ISSUES[@]}"; do
        echo -e "   • $issue"
    done
    echo -e "\n❌ ${RED}VALIDATION FAILED - Production deployment blocked${NC}"
    exit 1
else
    echo -e "\n✅ ${GREEN}ALL VALIDATIONS PASSED - Ready for production deployment${NC}"
    exit 0
fi