# 🚀 Android Emulator Startup Guide

**Problem**: `flutter run -d emulator-5554` says "No supported devices found"

**Cause**: Android emulator is not running

---

## ✅ **Solution - Start the Emulator**

### Method 1: Using Command Line (Recommended)

```bash
# Start Pixel 9a emulator
emulator -avd Pixel_9a
```

**Wait 1-2 minutes** for emulator to fully boot, then verify:

```bash
# Check if emulator is running
adb devices
```

**Expected output**:
```
List of devices attached
emulator-5554   device
```

Now you can run:
```bash
flutter run -d emulator-5554
```

---

### Method 2: Using Android Studio (Alternative)

1. Open **Android Studio**
2. Click **Device Manager** icon (phone icon in toolbar)
3. Find **Pixel 9a** in the list
4. Click **▶️ (Play button)** to start it
5. Wait for emulator window to open and boot
6. Then run: `flutter run -d emulator-5554`

---

## 📋 **Available Emulators on Your System**

You have 4 emulators configured:
- ✅ **Pixel_9a** (recommended for testing)
- Medium_Phone_API_36.1
- Medium_Tablet
- Small_Phone

---

## ⏱️ **Emulator Startup Time**

**First boot**: 1-2 minutes
- Emulator window appears
- Android boots up
- Shows lock screen or home screen

**When ready**:
```bash
adb devices
# Should show: emulator-5554   device
```

---

## 🔧 **Troubleshooting**

### Issue: "emulator: command not found"

**Fix - Add Android SDK to PATH**:

Windows:
```bash
# Find your Android SDK location (usually):
# C:\Users\[YourName]\AppData\Local\Android\Sdk

# Add to PATH:
# C:\Users\[YourName]\AppData\Local\Android\Sdk\emulator
# C:\Users\[YourName]\AppData\Local\Android\Sdk\platform-tools
```

### Issue: Emulator starts but shows "offline"

```bash
# Restart ADB
adb kill-server
adb start-server
adb devices
```

### Issue: Emulator won't start (Hyper-V conflict)

Check if Hyper-V is enabled:
```bash
systeminfo | findstr /C:"Hyper-V"
```

If enabled, Android Emulator might conflict. Options:
- Disable Hyper-V (requires restart)
- Use a physical Android device instead

### Issue: Very slow emulator

**Fix**: Enable hardware acceleration (HAXM/WHPX)
- Check Android Studio → Tools → AVD Manager → Pixel 9a → Edit → Show Advanced → Graphics: Hardware

---

## 🎯 **Complete Workflow**

### Step 1: Start Emulator
```bash
emulator -avd Pixel_9a
```
**Wait 1-2 minutes**

### Step 2: Verify Emulator is Running
```bash
adb devices
```
**Expected**: `emulator-5554   device`

### Step 3: Run Pharmacy App
```bash
cd C:\Users\aebon\projects\pharmapp-mobile\pharmacy_app
flutter run -d emulator-5554
```

### Step 4: Perform Tests
- Follow `MANUAL_TEST_CHECKLIST.md`
- Register test pharmacy
- Verify in Firebase Console

---

## 📌 **Quick Commands**

**Start emulator**:
```bash
emulator -avd Pixel_9a
```

**Check if running**:
```bash
adb devices
```

**List all emulators**:
```bash
emulator -list-avds
```

**Kill emulator** (if stuck):
```bash
adb -s emulator-5554 emu kill
```

---

## ⚡ **Pro Tips**

1. **Keep emulator running** between test scenarios (don't close it)
2. **Use snapshots** for faster startup (set in AVD Manager)
3. **Run emulator first**, then run Flutter apps
4. **One emulator at a time** (unless testing multi-device)

---

**Current Status**: I've started Pixel_9a emulator for you in the background.

**Next Step**: Wait 1-2 minutes, then run:
```bash
adb devices
```

If you see `emulator-5554   device`, you're ready to test! 🎉
