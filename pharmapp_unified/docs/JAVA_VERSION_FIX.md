# Java Version Compatibility Fix

## Problem
Error: `Unsupported class file major version 69`

This means you're using Java 25, but Gradle 8.12 only supports up to Java 23.

## Solution

### **Option 1: Install Java 17 (LTS) - RECOMMENDED**

1. **Download Java 17:**
   - Visit: https://adoptium.net/temurin/releases/?version=17
   - Download: Windows x64 JDK 17 (.msi installer)
   - Install to default location: `C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot`

2. **Update gradle.properties:**
   ```properties
   # In android/gradle.properties
   org.gradle.java.home=C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.13.11-hotspot
   ```

3. **Restart VS Code or Terminal**

### **Option 2: Use Android Studio's Bundled JDK**

If you have Android Studio installed:

1. **Check if JBR exists:**
   ```bash
   dir "C:\Program Files\Android\Android Studio\jbr"
   ```

2. **If it exists, update gradle.properties:**
   ```properties
   org.gradle.java.home=C:\\Program Files\\Android\\Android Studio\\jbr
   ```

3. **Verify JBR version is Java 17 or 21:**
   ```bash
   "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" -version
   ```

### **Option 3: Set System JAVA_HOME**

1. **Open System Environment Variables:**
   - Press `Win + R`, type `sysdm.cpl`, press Enter
   - Click "Environment Variables"

2. **Set JAVA_HOME:**
   - Add new System variable:
     - Variable name: `JAVA_HOME`
     - Variable value: `C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot`

3. **Update PATH:**
   - Edit System PATH variable
   - Add: `%JAVA_HOME%\bin` at the top

4. **Restart VS Code completely**

## How to Prevent This Error

### **1. Use Java LTS Versions**

Always use Long-Term Support (LTS) versions for Android/Flutter development:
- ✅ **Java 17** (Recommended - best compatibility)
- ✅ **Java 21** (Newer LTS, also good)
- ❌ **Java 25** (Too new, not supported by Gradle 8.12)

### **2. Pin Java Version in gradle.properties**

Always specify the Java home in `android/gradle.properties`:

```properties
# Force specific Java version
org.gradle.java.home=C:\\Program Files\\Eclipse Adoptium\\jdk-17.x.x-hotspot
```

This ensures Gradle uses the correct Java version regardless of system PATH.

### **3. Check Compatibility Before Upgrading**

Before upgrading Java, check the Gradle compatibility matrix:
- https://docs.gradle.org/current/userguide/compatibility.html

**Current PharmApp Unified Setup:**
- Gradle: 8.12
- Supported Java: 8 to 23 (Java 17 or 21 recommended)

### **4. Use Gradle Java Toolchains (Advanced)**

Add to `android/build.gradle.kts`:

```kotlin
java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(17))
    }
}
```

This auto-downloads Java 17 if not available.

## Verification

After applying the fix:

1. **Check Java version:**
   ```bash
   java -version
   ```
   Should show Java 17 or 21, not 25.

2. **Clean and rebuild:**
   ```bash
   cd android
   ./gradlew clean
   flutter clean
   flutter pub get
   flutter run
   ```

3. **Check Gradle is happy:**
   ```bash
   cd android
   ./gradlew --version
   ```

## Quick Reference

| Java Version | Class File Major Version | Gradle 8.12 Support |
|--------------|-------------------------|---------------------|
| Java 8       | 52                      | ✅ Yes              |
| Java 11      | 55                      | ✅ Yes              |
| Java 17      | 61                      | ✅ Yes (Recommended)|
| Java 21      | 65                      | ✅ Yes              |
| Java 23      | 67                      | ✅ Yes              |
| Java 25      | 69                      | ❌ No (Your Error)  |

## Current Error Breakdown

```
Unsupported class file major version 69
```

- **Major Version 69** = Java 25
- **Your Gradle**: 8.12 (max supports Java 23, version 67)
- **Solution**: Downgrade to Java 17 (version 61) or Java 21 (version 65)

## Installation Commands (Quick)

**Install Java 17 with Chocolatey (if you have it):**
```bash
choco install temurin17
```

**Or download manually:**
1. https://adoptium.net/temurin/releases/?version=17
2. Install Windows x64 MSI
3. Update `android/gradle.properties`
4. Restart VS Code

## Troubleshooting

### "Still getting the error after installing Java 17"

1. **Verify gradle.properties:**
   ```bash
   cat android/gradle.properties
   ```
   Should have: `org.gradle.java.home=C:\\Program Files\\Eclipse Adoptium\\jdk-17.x.x-hotspot`

2. **Kill all Gradle daemons:**
   ```bash
   cd android
   ./gradlew --stop
   ```

3. **Restart VS Code completely** (don't just reload window)

4. **Clean everything:**
   ```bash
   flutter clean
   cd android && ./gradlew clean --no-daemon
   flutter pub get
   ```

### "Java 17 installed but still using Java 25"

System PATH might be taking precedence. Check:

```bash
where java
```

Should show Java 17 path first. If not:
1. Edit System PATH
2. Move `C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot\bin` to the TOP
3. Remove or move Java 25 path lower
4. Restart terminal

## Contact

If issues persist, check:
- [CLEAN_BUILD_GUIDE.md](CLEAN_BUILD_GUIDE.md)
- [HOW_TO_RUN.md](HOW_TO_RUN.md)
