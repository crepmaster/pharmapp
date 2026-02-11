# Fix Java PATH Issue - Quick Guide

## Problem Identified

Your system is using Java 25 from PATH, but Gradle needs Java 17 or 21.

```
Launcher JVM:  25 (Eclipse Adoptium 25+36-LTS)  ← This is the problem!
Daemon JVM:    C:\Program Files\Android\Android Studio\jbr  ← This is correct (Java 21)
```

## Quick Fix (Temporary - for immediate development)

### **Option 1: Use gradlew.bat with JAVA_HOME set (QUICKEST)**

Create a file `android/local.properties`:

```properties
sdk.dir=C:\\Users\\YOUR_USERNAME\\AppData\\Local\\Android\\Sdk
java.home=C:\\Program Files\\Android\\Android Studio\\jbr
```

Then run:
```bash
flutter run
```

### **Option 2: Set JAVA_HOME for current terminal session**

```bash
# In PowerShell (recommended for Windows)
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
flutter run

# In Git Bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export PATH="$JAVA_HOME/bin:$PATH"
flutter run
```

## Permanent Fix (Recommended)

### **Step 1: Edit System Environment Variables**

1. Press `Win + R`, type: `sysdm.cpl`, press Enter
2. Click "Advanced" tab → "Environment Variables"
3. Under "System variables" (or "User variables"), find `Path`
4. Click "Edit"

### **Step 2: Reorder PATH entries**

Move this to the **TOP**:
```
C:\Program Files\Android\Android Studio\jbr\bin
```

Move this **DOWN** (or remove if you don't need Java 25):
```
C:\Program Files\Eclipse Adoptium\jdk-25.0.0.36-hotspot\bin
```

### **Step 3: Set JAVA_HOME**

1. In "Environment Variables" window
2. Click "New" under System variables
3. Variable name: `JAVA_HOME`
4. Variable value: `C:\Program Files\Android\Android Studio\jbr`
5. Click OK

### **Step 4: Verify**

1. **Close ALL terminals and VS Code**
2. Open new terminal
3. Run:
   ```bash
   java -version
   ```
   Should show: `openjdk version "21.0.8"`

4. Run:
   ```bash
   cd android
   ./gradlew --version
   ```
   Should show: `Launcher JVM: 21` (not 25!)

## Why Android Studio Java 21 is Perfect

- ✅ **Officially supported** by Android Gradle Plugin 8.x
- ✅ **Compatible with Flutter** (Flutter supports Java 8-21)
- ✅ **All dependencies will work** - They're tested with Java 21
- ✅ **No incompatibility issues** - Java 21 is backward compatible
- ✅ **LTS version** - Long-term support until 2029

## Will Java 17 cause dependency issues?

**No!** Here's why:

| Java Version | Flutter Support | Android Support | Dependencies | Recommendation |
|--------------|----------------|-----------------|--------------|----------------|
| Java 17 (LTS)| ✅ Full        | ✅ Full         | ✅ 100%      | Perfect        |
| Java 21 (LTS)| ✅ Full        | ✅ Full         | ✅ 100%      | Perfect        |
| Java 25      | ❌ Not tested  | ❌ Not tested   | ⚠️ Unknown   | Too new!       |

**Key Points:**
- Java compiles to **bytecode** with target compatibility
- Your `build.gradle.kts` sets: `JavaVersion.VERSION_11`
- This means all code compiles to Java 11 bytecode
- Java 17 and 21 can compile to Java 11 target without issues
- Java 25 causes Gradle parser errors before compilation even starts

## Your Current Setup Analysis

```kotlin
// From android/app/build.gradle.kts
compileOptions {
    sourceCompatibility = JavaVersion.VERSION_11  ← Target bytecode
    targetCompatibility = JavaVersion.VERSION_11  ← Target bytecode
}
```

This means:
- **Java 17 will work perfectly** - Compiles to Java 11 bytecode
- **Java 21 will work perfectly** - Compiles to Java 11 bytecode
- **Java 25 breaks Gradle** - Gradle can't parse Java 25 classes

## After Applying Fix

Run these commands to verify everything works:

```bash
# 1. Check Java version
java -version
# Should show: openjdk version "21.0.8" (from Android Studio)

# 2. Stop old Gradle daemons
cd android
./gradlew --stop

# 3. Clean everything
flutter clean
./gradlew clean

# 4. Check Gradle is using correct Java
./gradlew --version
# Should show: Launcher JVM: 21 (not 25!)

# 5. Get dependencies
cd ..
flutter pub get

# 6. Try running
flutter run
```

## Troubleshooting

### "Still showing Java 25 after PATH change"

1. **Kill ALL Java/Gradle processes:**
   ```bash
   # Windows PowerShell (as Admin)
   Get-Process java* | Stop-Process -Force
   Get-Process *gradle* | Stop-Process -Force
   ```

2. **Clear Gradle cache:**
   ```bash
   cd android
   rm -rf ~/.gradle/caches
   rm -rf ~/.gradle/daemon
   ```

3. **Restart computer** (this ensures all environment variables reload)

### "java -version still shows 25"

Your PATH wasn't updated correctly. Check:
```bash
where java
```

Should show Android Studio Java first:
```
C:\Program Files\Android\Android Studio\jbr\bin\java.exe
C:\Program Files\Eclipse Adoptium\jdk-25.0.0.36-hotspot\bin\java.exe
```

If not, repeat Step 2 (Reorder PATH).

## Summary

**You DO NOT need Java 17 - Java 21 from Android Studio is perfect!**

The issue is just that your system PATH is using Java 25 instead of Java 21.

**Quick fix:** Set environment variables to use Android Studio's Java 21 first.
