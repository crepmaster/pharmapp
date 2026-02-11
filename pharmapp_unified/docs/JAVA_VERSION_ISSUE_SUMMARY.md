# Java Version Issue - Complete Summary & Solutions

## The Problem

**Error**: `Unsupported class file major version 69`

**Root Cause**: Your system uses Java 25, but Gradle 8.12 only supports up to Java 23.

```
Current State:
├─ System Java (PATH): Java 25 ❌ (Too new!)
├─ Android Studio JBR: Java 21 ✅ (Perfect!)
└─ Gradle 8.12: Supports up to Java 23
```

## Why This Happens

1. **Java Version in PATH**: Your Windows PATH uses Java 25 first
2. **Gradle Launcher**: Uses whatever Java is in PATH (Java 25)
3. **Gradle Daemon**: Tries to use Java 21 from `gradle.properties`
4. **Conflict**: Launcher (25) can't load Daemon (21) bytecode

## Quick Solutions (Choose One)

### ✅ **Solution 1: Use Helper Scripts (QUICKEST - No system changes)**

Run Flutter with these scripts that temporarily set JAVA_HOME:

**Windows PowerShell:**
```powershell
.\run-with-java21.ps1
```

**Git Bash / Linux:**
```bash
./run-with-java21.sh
```

**What the scripts do:**
- Set `JAVA_HOME` to Android Studio's Java 21
- Stop Gradle daemons
- Run `flutter run` with correct Java

**Manual equivalent:**
```bash
# PowerShell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
flutter run

# Bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export PATH="$JAVA_HOME/bin:$PATH"
flutter run
```

### ✅ **Solution 2: Fix System PATH (PERMANENT)**

**Steps:**
1. Press `Win + R`, type `sysdm.cpl`, press Enter
2. Click "Advanced" tab → "Environment Variables"
3. Under "System variables", find `Path` → Click "Edit"
4. Move this entry to the **TOP**:
   ```
   C:\Program Files\Android\Android Studio\jbr\bin
   ```
5. Move this entry **DOWN** (or delete it):
   ```
   C:\Program Files\Eclipse Adoptium\jdk-25.0.0.36-hotspot\bin
   ```
6. Click "OK" on all dialogs
7. **Restart VS Code completely** (not just reload)
8. Open new terminal and verify:
   ```bash
   java -version
   # Should show: openjdk version "21.0.8"
   ```

### ✅ **Solution 3: Set JAVA_HOME Environment Variable (PERMANENT)**

**Steps:**
1. Press `Win + R`, type `sysdm.cpl`, press Enter
2. Click "Advanced" tab → "Environment Variables"
3. Under "System variables", click "New"
4. Variable name: `JAVA_HOME`
5. Variable value: `C:\Program Files\Android\Android Studio\jbr`
6. Click "OK" on all dialogs
7. **Restart VS Code completely**
8. Verify:
   ```bash
   echo $JAVA_HOME
   # Should show: C:\Program Files\Android\Android Studio\jbr
   ```

## Files Already Fixed

✅ **android/gradle.properties** - Already points to Java 21:
```properties
org.gradle.java.home=C:\\Program Files\\Android\\Android Studio\\jbr
```

✅ **android/local.properties** - Now includes Java home:
```properties
java.home=C:\\Program Files\\Android\\Android Studio\\jbr
```

✅ **android/app/build.gradle.kts** - Compiles to Java 11 bytecode:
```kotlin
compileOptions {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
}
```

## Why Java 21 is Perfect (No Dependency Issues!)

| Aspect | Java 17 | Java 21 | Java 25 |
|--------|---------|---------|---------|
| Flutter Support | ✅ Full | ✅ Full | ❌ Not tested |
| Android Gradle 8.x | ✅ Full | ✅ Full | ❌ Not supported |
| All Dependencies | ✅ 100% | ✅ 100% | ⚠️ Unknown |
| Gradle 8.12 | ✅ Yes | ✅ Yes | ❌ No |
| LTS Support | Until 2029 | Until 2031 | Not LTS |
| **Recommendation** | **Perfect** | **Perfect** | **Too New** |

**Key Point**: Your code compiles to Java 11 bytecode, so both Java 17 and 21 work perfectly with all dependencies!

## Verification Steps

After applying any solution:

```bash
# 1. Verify Java version
java -version
# Expected: openjdk version "21.0.8" (not 25!)

# 2. Stop all Gradle daemons
cd android
./gradlew --stop

# 3. Check Gradle is using correct Java
./gradlew --version
# Expected: Launcher JVM: 21 (not 25!)

# 4. Clean everything
cd ..
flutter clean
cd android
./gradlew clean

# 5. Get dependencies
cd ..
flutter pub get

# 6. Try running
flutter run
```

## Troubleshooting

### "Still getting the error after trying solutions"

1. **Kill ALL Java processes:**
   ```powershell
   # PowerShell (as Admin)
   Get-Process java* | Stop-Process -Force
   Get-Process *gradle* | Stop-Process -Force
   ```

2. **Clear Gradle cache:**
   ```bash
   rm -rf ~/.gradle/caches
   rm -rf ~/.gradle/daemon
   ```

3. **Restart computer** to reload environment variables

### "java -version still shows 25"

Check which Java is being used:
```bash
where java
```

Expected (correct order):
```
C:\Program Files\Android\Android Studio\jbr\bin\java.exe
C:\Program Files\Eclipse Adoptium\jdk-25.0.0.36-hotspot\bin\java.exe
```

If wrong order, fix PATH (Solution 2 above).

## How to Prevent This in Future

### ✅ **Best Practice 1: Always use LTS Java versions**

- ✅ Java 17 (LTS until 2029)
- ✅ Java 21 (LTS until 2031)
- ❌ Java 25 (Not LTS, too new for tools)

### ✅ **Best Practice 2: Check Gradle compatibility before upgrading Java**

Visit: https://docs.gradle.org/current/userguide/compatibility.html

**Gradle 8.12 Compatibility:**
- Minimum: Java 8
- Maximum: Java 23
- Recommended: Java 17 or 21

### ✅ **Best Practice 3: Pin Java version in gradle.properties**

Always have this in `android/gradle.properties`:
```properties
org.gradle.java.home=C:\\Program Files\\Android\\Android Studio\\jbr
```

### ✅ **Best Practice 4: Use Android Studio's bundled JDK**

Android Studio ships with the correct Java version for your AGP version:
- Android Studio 2023.x → Java 17
- Android Studio 2024.x → Java 21

Both are perfect for Flutter development!

## Quick Reference

**Java Version → Class File Major Version Mapping:**

| Java | Major Version | Gradle 8.12 |
|------|---------------|-------------|
| 8    | 52            | ✅ Yes      |
| 11   | 55            | ✅ Yes      |
| 17   | 61            | ✅ Yes ⭐   |
| 21   | 65            | ✅ Yes ⭐   |
| 23   | 67            | ✅ Yes      |
| 25   | 69            | ❌ No ⚠️    |

⭐ = Recommended for Flutter/Android development

## Files Created to Help

1. **run-with-java21.ps1** - PowerShell script to run Flutter with Java 21
2. **run-with-java21.sh** - Bash script to run Flutter with Java 21
3. **docs/JAVA_VERSION_FIX.md** - Detailed fix guide
4. **docs/FIX_JAVA_PATH.md** - PATH configuration guide
5. **docs/JAVA_VERSION_ISSUE_SUMMARY.md** - This file

## Summary

**Your Android Studio has Java 21 - Perfect!**

**Problem**: System PATH uses Java 25 first.

**Quickest Fix**: Use `run-with-java21.ps1` or `run-with-java21.sh` scripts.

**Permanent Fix**: Change Windows PATH to use Android Studio's Java 21 first.

**No dependency issues**: Java 21 is fully compatible with all Flutter/Android dependencies!
