#!/bin/bash
# BuildContext Safety Testing Script
# Identifies and validates unsafe BuildContext usage patterns in Flutter apps

set -e
echo "🔍 BUILDCONTEXT SAFETY AUDIT"
echo "============================"

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
TOTAL_FILES_SCANNED=0
UNSAFE_PATTERNS_FOUND=0
CRITICAL_ISSUES=0
WARNINGS=0

# Logging function
log_context_issue() {
    local severity="$1"
    local file="$2"
    local line="$3"
    local pattern="$4"
    local context="$5"
    
    case "$severity" in
        "CRITICAL")
            echo -e "🔴 ${RED}CRITICAL${NC}: $file:$line"
            echo -e "   Pattern: $pattern"
            echo -e "   Context: $context"
            CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
            ;;
        "WARNING")
            echo -e "🟡 ${YELLOW}WARNING${NC}: $file:$line"
            echo -e "   Pattern: $pattern"
            echo -e "   Context: $context"
            WARNINGS=$((WARNINGS + 1))
            ;;
        "INFO")
            echo -e "ℹ️  ${BLUE}INFO${NC}: $file:$line - $pattern"
            ;;
    esac
    UNSAFE_PATTERNS_FOUND=$((UNSAFE_PATTERNS_FOUND + 1))
}

# Function to analyze a single Dart file
analyze_dart_file() {
    local file="$1"
    local line_number=0
    local in_async_function=false
    local function_name=""
    
    TOTAL_FILES_SCANNED=$((TOTAL_FILES_SCANNED + 1))
    
    while IFS= read -r line; do
        line_number=$((line_number + 1))
        
        # Check if we're entering an async function
        if echo "$line" | grep -q "async\s*{"; then
            in_async_function=true
            function_name=$(echo "$line" | grep -o "[a-zA-Z_][a-zA-Z0-9_]*\s*(" | head -1 | sed 's/($//')
        fi
        
        # Check if we're leaving the function
        if [ "$in_async_function" = true ] && echo "$line" | grep -q "^\s*}"; then
            in_async_function=false
            function_name=""
        fi
        
        # Pattern 1: Direct BuildContext usage after await
        if echo "$line" | grep -q "await.*" && echo "$line" | grep -q "context\."; then
            log_context_issue "CRITICAL" "$file" "$line_number" "BuildContext used directly after await" "$line"
        fi
        
        # Pattern 2: Navigator usage after async gaps
        if echo "$line" | grep -q "await" && [ "$in_async_function" = true ]; then
            # Look ahead for Navigator calls in next few lines
            next_lines=""
            for i in {1..3}; do
                next_line=""
                read -r next_line || break
                next_lines="$next_lines$next_line\n"
                if echo "$next_line" | grep -q "Navigator\.\|context\."; then
                    log_context_issue "CRITICAL" "$file" "$((line_number + i))" "Navigator/context used after async gap" "$next_line"
                fi
            done
        fi
        
        # Pattern 3: ScaffoldMessenger usage after async
        if echo "$line" | grep -q "ScaffoldMessenger.*context" && [ "$in_async_function" = true ]; then
            log_context_issue "WARNING" "$file" "$line_number" "ScaffoldMessenger context usage in async function" "$line"
        fi
        
        # Pattern 4: Theme/MediaQuery usage after async
        if echo "$line" | grep -E -q "Theme\.of\(context\)|MediaQuery\.of\(context\)" && [ "$in_async_function" = true ]; then
            log_context_issue "WARNING" "$file" "$line_number" "Theme/MediaQuery context usage in async function" "$line"
        fi
        
        # Pattern 5: showDialog/showBottomSheet after async
        if echo "$line" | grep -E -q "showDialog|showBottomSheet|showModalBottomSheet" && echo "$line" | grep -q "context:" && [ "$in_async_function" = true ]; then
            log_context_issue "CRITICAL" "$file" "$line_number" "Dialog/BottomSheet shown with context after async" "$line"
        fi
        
    done < "$file"
}

# Function to check for mounted guard patterns
check_mounted_guards() {
    local file="$1"
    local mounted_usage=$(grep -n "mounted" "$file" 2>/dev/null || echo "")
    local context_usage=$(grep -n "context\." "$file" 2>/dev/null | wc -l)
    
    if [ -n "$mounted_usage" ]; then
        echo -e "✅ ${GREEN}GOOD PRACTICE${NC}: $file uses 'mounted' guards"
        while IFS= read -r line; do
            if [ -n "$line" ]; then
                echo "   Line $(echo "$line" | cut -d: -f1): $(echo "$line" | cut -d: -f2- | xargs)"
            fi
        done <<< "$mounted_usage"
    elif [ "$context_usage" -gt 0 ]; then
        log_context_issue "WARNING" "$file" "N/A" "No mounted guards found" "$context_usage context usages without protection"
    fi
}

# Function to suggest fixes
suggest_fixes() {
    cat << 'EOF'

🔧 BUILDCONTEXT SAFETY FIXES
===========================

1. CRITICAL: Use 'mounted' guards before context usage after async gaps:

   ❌ BAD:
   ```dart
   void submitData() async {
     await apiCall();
     Navigator.of(context).pop();  // UNSAFE!
   }
   ```
   
   ✅ GOOD:
   ```dart
   void submitData() async {
     await apiCall();
     if (!mounted) return;  // Safety check
     Navigator.of(context).pop();  // SAFE
   }
   ```

2. CRITICAL: Store context reference before async operations:

   ❌ BAD:
   ```dart
   void showMessage() async {
     await apiCall();
     ScaffoldMessenger.of(context).showSnackBar(...);  // UNSAFE!
   }
   ```
   
   ✅ GOOD:
   ```dart
   void showMessage() async {
     final messenger = ScaffoldMessenger.of(context);
     await apiCall();
     if (!mounted) return;
     messenger.showSnackBar(...);  // SAFE
   }
   ```

3. WARNING: Use BuildContext carefully in StatefulWidget lifecycle:

   ✅ BEST PRACTICE:
   ```dart
   void performAsyncOperation() async {
     // Store references before async operations
     final navigator = Navigator.of(context);
     final theme = Theme.of(context);
     
     await someAsyncOperation();
     
     // Always check mounted before using context
     if (!mounted) return;
     
     navigator.pop();
   }
   ```

4. PATTERN: Safe async function template:

   ```dart
   Future<void> safeAsyncFunction() async {
     // 1. Store context-dependent objects first
     final navigator = Navigator.of(context);
     final messenger = ScaffoldMessenger.of(context);
     
     try {
       // 2. Perform async operations
       final result = await apiService.getData();
       
       // 3. Check mounted before UI operations
       if (!mounted) return;
       
       // 4. Use stored references or check context again
       if (result.success) {
         navigator.pop();
       } else {
         messenger.showSnackBar(SnackBar(content: Text('Error')));
       }
     } catch (e) {
       if (!mounted) return;
       messenger.showSnackBar(SnackBar(content: Text('Error: $e')));
     }
   }
   ```

AUTOMATED FIX SCRIPT:
You can create a script to automatically add mounted guards:

```bash
# Find all files with unsafe context usage
find . -name "*.dart" -exec grep -l "await.*" {} \; | \
xargs grep -l "context\." | \
while read file; do
  echo "Review file: $file"
done
```

EOF
}

echo -e "\n${PURPLE}1. Scanning Dart Files for BuildContext Issues${NC}"
echo "---------------------------------------------"

# Scan all Dart files in the project
DART_FILES=$(find . -name "*.dart" -not -path "./test_procedures/*" -not -path "./test/*" -not -path "./.dart_tool/*")

if [ -z "$DART_FILES" ]; then
    echo "No Dart files found to analyze"
    exit 1
fi

echo "Found $(echo "$DART_FILES" | wc -l) Dart files to analyze..."

# Analyze each file
for file in $DART_FILES; do
    if [ -f "$file" ]; then
        analyze_dart_file "$file"
    fi
done

echo -e "\n${PURPLE}2. Checking for Mounted Guard Patterns${NC}"
echo "-------------------------------------"

# Check for existing mounted guards
for file in $DART_FILES; do
    if [ -f "$file" ]; then
        check_mounted_guards "$file"
    fi
done

echo -e "\n${PURPLE}3. Flutter Analyzer BuildContext Report${NC}"
echo "--------------------------------------"

# Use Flutter analyzer to find BuildContext issues
APPS=("pharmacy_app" "courier_app" "admin_panel")

for app in "${APPS[@]}"; do
    if [ -d "$app" ]; then
        echo -e "\nAnalyzing $app with Flutter analyzer..."
        cd "$app"
        
        ANALYZER_OUTPUT=$(flutter analyze 2>&1 | grep "use_build_context_synchronously" || echo "")
        if [ -n "$ANALYZER_OUTPUT" ]; then
            echo -e "${RED}BuildContext issues found in $app:${NC}"
            echo "$ANALYZER_OUTPUT" | while read -r line; do
                if [ -n "$line" ]; then
                    echo "   $line"
                fi
            done
        else
            echo -e "${GREEN}No BuildContext issues found in $app${NC}"
        fi
        
        cd "$PROJECT_ROOT"
    fi
done

# Create summary report
echo -e "\n${BLUE}📊 BUILDCONTEXT SAFETY SUMMARY${NC}"
echo "==============================="
echo -e "Files Scanned: $TOTAL_FILES_SCANNED"
echo -e "${RED}Critical Issues: $CRITICAL_ISSUES${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo -e "Total Unsafe Patterns: $UNSAFE_PATTERNS_FOUND"

# Generate detailed report
REPORT_FILE="buildcontext_safety_report_$(date +%Y%m%d_%H%M%S).txt"
{
    echo "BuildContext Safety Audit Report"
    echo "Generated: $(date)"
    echo "==============================="
    echo ""
    echo "Summary:"
    echo "- Files Scanned: $TOTAL_FILES_SCANNED"
    echo "- Critical Issues: $CRITICAL_ISSUES"
    echo "- Warnings: $WARNINGS"
    echo "- Total Unsafe Patterns: $UNSAFE_PATTERNS_FOUND"
    echo ""
    
    if [ "$CRITICAL_ISSUES" -gt 0 ]; then
        echo "CRITICAL ISSUES FOUND:"
        echo "These issues can cause runtime crashes when widgets are disposed"
        echo "before async operations complete. Immediate fix required."
        echo ""
    fi
    
    if [ "$WARNINGS" -gt 0 ]; then
        echo "WARNINGS FOUND:"
        echo "These issues may cause problems in certain edge cases."
        echo "Recommended to fix for production robustness."
        echo ""
    fi
    
} > "$REPORT_FILE"

echo -e "\n📄 Detailed report saved to: $REPORT_FILE"

# Show suggested fixes
suggest_fixes

# Exit with appropriate code
if [ "$CRITICAL_ISSUES" -gt 0 ]; then
    echo -e "\n❌ ${RED}BUILDCONTEXT SAFETY AUDIT FAILED${NC}"
    echo -e "   $CRITICAL_ISSUES critical issues found that can cause runtime crashes"
    exit 1
elif [ "$WARNINGS" -gt 5 ]; then
    echo -e "\n⚠️  ${YELLOW}BUILDCONTEXT SAFETY AUDIT PASSED WITH WARNINGS${NC}"
    echo -e "   $WARNINGS warnings found - consider fixing for production robustness"
    exit 2
else
    echo -e "\n✅ ${GREEN}BUILDCONTEXT SAFETY AUDIT PASSED${NC}"
    exit 0
fi