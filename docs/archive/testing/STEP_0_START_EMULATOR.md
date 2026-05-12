# 🎯 STEP 0: START THE EMULATOR (DO THIS FIRST!)

**⚠️ THIS IS THE MOST IMPORTANT STEP - DO NOT SKIP!**

---

## Why You MUST Start Emulator First

**Without the emulator running**:
- ❌ `flutter run -d emulator-5554` will fail
- ❌ You'll see "No supported devices found"
- ❌ Cannot test pharmacy_app or courier_app

**With the emulator running**:
- ✅ Apps launch successfully
- ✅ Can perform registration tests
- ✅ Data saves to Firebase

---

## 🚀 How to Start the Emulator

### Option 1: Command Line (Fast)

**Open PowerShell or Terminal**:

```bash
# Start Pixel 9a emulator
emulator -avd Pixel_9a
```

**Expected output**:
```
INFO    | Android emulator version 36.2.12.0
INFO    | Found systemPath...
INFO    | Starting emulator...
```

**Wait 1-2 minutes** - Emulator window will appear and Android will boot

---

### Option 2: Android Studio (Easier for beginners)

1. **Open Android Studio**
2. **Click Device Manager** icon (📱 in toolbar on right)
3. **Find "Pixel 9a"** in the list
4. **Click ▶️ (Play button)** next to Pixel 9a
5. **Wait for emulator window** to open
6. **Wait for Android to boot** (lock screen or home screen appears)

---

## ✅ How to Verify Emulator is Ready

### Method 1: Check with ADB

```bash
adb devices
```

**✅ READY - Expected output**:
```
List of devices attached
emulator-5554   device
```

**❌ NOT READY - Still booting**:
```
List of devices attached
emulator-5554   offline
```
Wait 30 more seconds and check again.

**❌ NOT RUNNING**:
```
List of devices attached
```
No devices listed → Go back and start emulator!

---

### Method 2: Visual Confirmation

**Look at the emulator window**:
- ✅ **READY**: Shows Android lock screen or home screen
- ❌ **NOT READY**: Shows "Android" logo with animation
- ❌ **NOT RUNNING**: No emulator window visible

---

## ⏱️ Timeline

| Activity | Duration |
|----------|----------|
| Start emulator command | Instant |
| Emulator window appears | 10-20 seconds |
| Android boots | 1-2 minutes |
| **Total to ready** | **1-2 minutes** |

**First boot**: May take 2-3 minutes
**Subsequent boots**: Usually 1-2 minutes

---

## 🔧 Troubleshooting

### Issue: "emulator: command not found"

**Fix**: Add Android SDK to PATH

**Windows**:
```bash
# Typical Android SDK location:
C:\Users\[YourUsername]\AppData\Local\Android\Sdk\emulator

# Add to PATH environment variable
```

**Alternative**: Use full path:
```bash
C:\Users\aebon\AppData\Local\Android\Sdk\emulator\emulator.exe -avd Pixel_9a
```

---

### Issue: Emulator starts but shows "offline"

**Wait**: Give it 30-60 more seconds

**If still offline after 2 minutes**:
```bash
# Restart ADB
adb kill-server
adb start-server
adb devices
```

---

### Issue: Emulator is very slow

**Check Hardware Acceleration**:
- Android Studio → Tools → AVD Manager
- Click ✏️ (Edit) on Pixel 9a
- Show Advanced Settings
- Graphics: Should be "Hardware - GLES 2.0" or "Hardware"
- CPU/RAM: Give it 2GB+ RAM

**Your System**:
- ✅ GPU: NVIDIA GeForce RTX 4060 (Good!)
- ✅ Acceleration: WHPX (Windows Hypervisor Platform) - Working

---

### Issue: Emulator won't start at all

**Check available emulators**:
```bash
emulator -list-avds
```

**Expected**:
```
Pixel_9a
Medium_Phone_API_36.1
Medium_Tablet
Small_Phone
```

**If Pixel_9a is not in the list**:
- Create it in Android Studio → Device Manager
- Or use another emulator: `emulator -avd Medium_Phone_API_36.1`

---

## 📋 Complete Pre-Test Checklist

**Before starting Scenario 1 or 2**:

- [ ] **Emulator Started**: Ran `emulator -avd Pixel_9a`
- [ ] **Emulator Window Open**: Can see Android emulator window
- [ ] **ADB Verified**: `adb devices` shows `emulator-5554 device`
- [ ] **Status is "device"**: NOT "offline" or missing

**Only proceed when ALL 4 checkboxes are checked!**

---

## 🎯 Quick Commands Reference

**Start emulator**:
```bash
emulator -avd Pixel_9a
```

**Check if running**:
```bash
adb devices
```

**List available emulators**:
```bash
emulator -list-avds
```

**Kill stuck emulator**:
```bash
adb -s emulator-5554 emu kill
```

**Restart ADB** (if connection issues):
```bash
adb kill-server
adb start-server
```

---

## 🚦 Status Indicators

### ✅ GREEN - Ready to Test
```bash
$ adb devices
List of devices attached
emulator-5554   device
```
**Action**: Proceed to run `flutter run -d emulator-5554`

---

### ⚠️ YELLOW - Still Booting
```bash
$ adb devices
List of devices attached
emulator-5554   offline
```
**Action**: Wait 30-60 more seconds, check again

---

### 🔴 RED - Not Running
```bash
$ adb devices
List of devices attached
```
**Action**: Start emulator with `emulator -avd Pixel_9a`

---

## 🎬 What Happens After Emulator is Ready

**Once you see "emulator-5554 device"**:

### For Scenario 1 (Pharmacy):
```bash
cd C:\Users\aebon\projects\pharmapp-mobile\pharmacy_app
flutter run -d emulator-5554
```

### For Scenario 2 (Courier):
```bash
cd C:\Users\aebon\projects\pharmapp-mobile\courier_app
flutter run -d emulator-5554
```

---

## 💡 Pro Tips

1. **Start emulator ONCE** - Keep it running for all test scenarios
2. **Don't close emulator** between Scenario 1 and Scenario 2
3. **Use snapshots** - Enable quick boot in AVD Manager for faster startups
4. **Close other apps** - Free up RAM for better emulator performance

---

## ✅ Success Confirmation

**You're ready to proceed when**:
- ✅ Emulator window is visible on your screen
- ✅ Android home screen or lock screen is showing
- ✅ `adb devices` shows `emulator-5554 device`
- ✅ No "offline" status

**Now you can run**: `flutter run -d emulator-5554` ✨

---

**This is STEP 0 - Do this BEFORE following any test checklist!**

**Next Steps**:
- Scenario 1: Read `docs/testing/NEXT_SESSION_TEST_PLAN.md`
- Scenario 2: Read `docs/testing/SCENARIO_2_MANUAL_CHECKLIST.md`
- Quick Start: Read `docs/testing/HOW_TO_RUN_APPS.md`

---

**Document Version**: 1.0
**Last Updated**: 2025-10-21
**Status**: ✅ Emulator currently running (emulator-5554)
