# 🧹 Clean Build Guide - Avoiding Cache Issues

**Purpose**: Prevent and fix Flutter/Gradle cache corruption issues
**Last Updated**: 2025-10-26

---

## 🚨 **Common Cache Issues & Prevention**

### **Problem**: Firebase plugins fail to build on Android
**Error**: `Could not find the firebase_core FlutterFire plugin`
**Cause**: Corrupted pub cache or incomplete package downloads

---

## 💡 **Best Practices to Avoid Cache Issues**

### **1. Clean Build Before Switching Branches**

Always clean before switching Git branches:

```bash
cd pharmapp_unified
flutter clean
```

**Why**: Different branches may have different dependencies. Clean prevents conflicts.

---

### **2. Clean After Failed Builds**

If any build fails, **always clean before retrying**:

```bash
cd pharmapp_unified
flutter clean
flutter pub get
```

**Why**: Failed builds leave corrupted artifacts that cause repeated failures.

---

### **3. Don't Interrupt Package Downloads**

**Never** press Ctrl+C during `flutter pub get`!

**If you must interrupt**:
```bash
flutter clean
flutter pub get  # Start fresh
```

**Why**: Interrupted downloads leave incomplete packages in the cache.

---

### **4. Update Flutter Regularly**

Update Flutter SDK monthly:

```bash
flutter upgrade
flutter doctor
```

**Why**: Newer Flutter versions have better cache management and bug fixes.

---

### **5. Clean After Package Updates**

After updating pubspec.yaml:

```bash
flutter pub get
flutter clean  # Clean AFTER getting packages
flutter run
```

**Why**: New dependencies may conflict with cached build artifacts.

---

## 🔧 **Three Levels of Cleaning**

### **Level 1: Quick Clean** (Use 99% of the time)

```bash
cd pharmapp_unified
flutter clean
```

**When to use**: Before every build, after failed builds, when switching branches

**What it does**:
- Deletes `build/` directory
- Deletes `.dart_tool/` directory
- Deletes `.flutter-plugins-dependencies`

**Time**: 1-2 seconds

---

### **Level 2: Deep Clean** (Use when Level 1 doesn't work)

```bash
cd pharmapp_unified
flutter clean
cd android
./gradlew clean
cd ..
flutter pub get
```

**When to use**: When you get Gradle errors, Firebase plugin errors

**What it does**:
- Level 1 clean
- Cleans Android Gradle cache
- Refreshes package dependencies

**Time**: 10-15 seconds

---

### **Level 3: Nuclear Clean** (Use as last resort)

```bash
cd pharmapp_unified

# Clean everything
flutter clean
cd android
./gradlew clean --no-daemon
cd ..

# Delete pub cache for corrupted packages (if specific package is corrupted)
# Example for firebase_core:
# rmdir /s /q "%LOCALAPPDATA%\Pub\Cache\hosted\pub.dev\firebase_core-3.15.2"

# Repair entire pub cache (WARNING: Takes 5-10 minutes)
flutter pub cache repair

# Get fresh packages
flutter pub get
```

**When to use**: Only when Level 1 & 2 fail, or after network interruptions during package downloads

**What it does**:
- Everything from Level 1 & 2
- Repairs entire pub cache (re-downloads all packages globally)

**Time**: 5-10 minutes

---

## 🎯 **Automated Clean Scripts**

### **Create: `quick_clean.bat`**

```batch
@echo off
echo ============================================
echo   Quick Clean - PharmApp Unified
echo ============================================
echo.

cd /d "%~dp0"

echo [1/2] Flutter Clean...
flutter clean

echo.
echo [2/2] Getting Dependencies...
flutter pub get

echo.
echo ============================================
echo   Clean Complete! Ready to build.
echo ============================================
pause
```

**Usage**: Double-click before building

---

### **Create: `deep_clean.bat`**

```batch
@echo off
echo ============================================
echo   Deep Clean - PharmApp Unified
echo ============================================
echo.

cd /d "%~dp0"

echo [1/4] Flutter Clean...
flutter clean

echo.
echo [2/4] Gradle Clean...
cd android
call gradlew clean --no-daemon
cd ..

echo.
echo [3/4] Getting Dependencies...
flutter pub get

echo.
echo [4/4] Verification...
flutter doctor

echo.
echo ============================================
echo   Deep Clean Complete!
echo ============================================
pause
```

**Usage**: Use when build errors persist after quick clean

---

## 🛡️ **Cache Issue Prevention Checklist**

Before every coding session:

- [ ] Pull latest code: `git pull`
- [ ] Quick clean: `flutter clean`
- [ ] Get dependencies: `flutter pub get`
- [ ] Verify setup: `flutter doctor`

After every coding session:

- [ ] Commit changes: `git add . && git commit -m "message"`
- [ ] Clean before pushing: `flutter clean` (optional but recommended)
- [ ] Push: `git push`

When encountering build errors:

- [ ] Stop the build immediately (Ctrl+C)
- [ ] Run Level 1 clean
- [ ] Try building again
- [ ] If still failing, run Level 2 clean
- [ ] If still failing, check error message for specific corrupted package

---

## 📊 **Common Error Patterns & Solutions**

### **Error 1**: "Could not find the firebase_core FlutterFire plugin"

**Solution**: Level 2 Clean (Gradle + Flutter)

```bash
flutter clean
cd android && ./gradlew clean && cd ..
flutter pub get
flutter run
```

---

### **Error 2**: "Gradle task assembleDebug failed with exit code 1"

**Solution**: Check if using correct Java version

```bash
flutter doctor -v  # Check Java version
flutter config --jdk-dir="C:\Program Files\Android\Android Studio\jbr"
flutter clean
flutter run
```

---

### **Error 3**: "RangeError: Invalid value"

**Solution**: Flutter API compatibility issue (not cache related)

Check code for:
- `withValues()` → Use `withOpacity()` instead
- Incompatible Flutter version APIs

---

### **Error 4**: "Package xyz has no pubspec.yaml"

**Solution**: Corrupted pub cache - repair specific package

```bash
# Delete the corrupted package
rmdir /s /q "%LOCALAPPDATA%\Pub\Cache\hosted\pub.dev\<package-name>"

# Or repair entire cache
flutter pub cache repair

flutter pub get
```

---

## 🔍 **How to Identify Cache Corruption**

**Symptoms**:
1. Build worked yesterday, fails today (no code changes)
2. Error mentions missing pubspec.yaml files
3. Firebase plugins fail to load
4. Gradle can't find Flutter plugins
5. `flutter pub get` shows package download errors

**Quick Test**:
```bash
flutter pub cache repair
```

If this fixes it, you had cache corruption.

---

## 🚀 **Recommended Development Workflow**

### **Daily Workflow**:

```bash
# Morning routine
git pull
flutter clean
flutter pub get

# Development
flutter run -d emulator-5554
# Make changes, hot reload with 'r'

# End of day
flutter clean  # Optional but recommended
git add .
git commit -m "Your changes"
git push
```

---

### **After Errors**:

```bash
# Stop build (Ctrl+C)
flutter clean
flutter pub get
flutter run  # Try again

# If still failing
cd android && ./gradlew clean && cd ..
flutter pub get
flutter run

# If still failing
flutter pub cache repair  # Last resort (slow)
flutter pub get
flutter run
```

---

## 📝 **Cache Locations (for manual inspection)**

**Flutter Pub Cache**:
```
C:\Users\aebon\AppData\Local\Pub\Cache\hosted\pub.dev\
```

**Flutter Build Cache**:
```
pharmapp_unified\build\
pharmapp_unified\.dart_tool\
```

**Gradle Cache**:
```
C:\Users\aebon\.gradle\
pharmapp_unified\android\build\
```

**Android Build Cache**:
```
pharmapp_unified\build\app\
```

---

## ⚠️ **What NOT to Do**

❌ **Don't delete entire .gradle folder** - This breaks Gradle wrapper
❌ **Don't delete entire Pub\Cache folder** - Re-downloads EVERYTHING (very slow)
❌ **Don't clean during active build** - Wait for build to finish or fail first
❌ **Don't skip `flutter pub get` after clean** - You'll get missing dependency errors
❌ **Don't run multiple `flutter run` simultaneously** - Causes port conflicts and cache locks

---

## ✅ **What TO Do**

✅ **Always run `flutter clean` before important builds** (demos, releases)
✅ **Clean after pulling code** from Git
✅ **Clean before switching branches**
✅ **Use `flutter doctor` to verify setup** regularly
✅ **Keep Flutter SDK updated** monthly
✅ **Use automated scripts** (quick_clean.bat, deep_clean.bat)
✅ **Commit often** - Small commits reduce conflicts
✅ **Use hot reload (`r`)** instead of full rebuilds during development

---

## 🎓 **Understanding the Build Process**

### **What Happens During `flutter run`**:

1. **Package Resolution** - Checks pubspec.yaml for dependencies
2. **Code Generation** - Generates plugin registrant files
3. **Dart Compilation** - Compiles Dart code to native
4. **Gradle Build** (Android) - Compiles Android native code
5. **APK Assembly** - Packages everything into APK
6. **Installation** - Installs APK on device/emulator
7. **Launch** - Starts the app

**Cache used at each step**:
- Step 1: `Pub\Cache\`
- Step 2: `.dart_tool\`
- Step 3: `build\`
- Step 4: `android\build\`, `.gradle\`
- Step 5-7: `build\app\outputs\`

**Why cleaning helps**: Removes corrupted artifacts from any of these steps.

---

## 🔄 **Quick Reference**

| Situation | Command |
|-----------|---------|
| Before building | `flutter clean && flutter pub get` |
| After Git pull | `flutter clean && flutter pub get` |
| After failed build | `flutter clean && flutter pub get` |
| After package update | `flutter pub get && flutter clean` |
| Firebase errors | `cd android && gradlew clean && cd .. && flutter clean` |
| Corrupted cache | `flutter pub cache repair` |
| Java version issues | `flutter config --jdk-dir="..."` |

---

## 📞 **Still Having Issues?**

If cache cleaning doesn't fix your issue:

1. **Check the actual error message** - It might not be cache-related
2. **Run `flutter doctor -v`** - Check for setup problems
3. **Check Java version** - Should be Java 21 (not 25)
4. **Check Flutter version** - Should be 3.13+
5. **Check disk space** - Need 10GB+ free for builds
6. **Restart computer** - Sometimes Gradle daemon gets stuck

---

**Pro Tip**: Create a keyboard shortcut in your terminal for `flutter clean && flutter pub get`. You'll use it dozens of times per day!
