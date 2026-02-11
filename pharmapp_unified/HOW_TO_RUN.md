# 🚀 How to Run PharmApp Unified

## ✅ **VS Code Configuration Complete!**

I've set up VS Code to make running the app easier. Here's how to use it:

---

## 🎯 **Method 1: Using VS Code (RECOMMENDED)**

### **Step 1: Start the Emulator**

1. Open VS Code
2. Press **`Ctrl + Shift + P`** (Command Palette)
3. Type: **"Tasks: Run Task"**
4. Select: **"Start Android Emulator (Pixel 9a)"**
5. Wait 30-60 seconds for emulator to boot

### **Step 2: Run the App**

1. Press **`F5`** OR click the **"Run and Debug"** icon (▶️) in the left sidebar
2. Select: **"PharmApp Unified (Emulator)"**
3. The app will build and install automatically

---

## 🔧 **Method 2: Using Terminal (Manual)**

### **Start Emulator:**
```bash
# Option 1: PowerShell
powershell -Command "Start-Process emulator -ArgumentList '-avd','Pixel_9a','-no-snapshot-load' -WindowStyle Normal"

# Option 2: Direct command
emulator -avd Pixel_9a -no-snapshot-load
```

### **Wait for Emulator to Boot:**
```bash
# Check if emulator is ready
adb devices

# You should see something like:
# emulator-5554   device
```

### **Run the App:**
```bash
cd pharmapp_unified
flutter run -d emulator-5554
```

---

## ⚠️ **Troubleshooting: "No supported devices found"**

This error happens when:
1. **Emulator hasn't started yet** → Wait 30-60 seconds and try again
2. **Emulator is booting** → Run `adb devices` to check status
3. **Wrong device ID** → Use `flutter devices` to see available devices

### **Solution:**
```bash
# 1. Check what devices are available
flutter devices

# 2. If emulator shows as "emulator-5554", use:
flutter run -d emulator-5554

# 3. If emulator shows as "Pixel_9a", use:
flutter run -d Pixel_9a

# 4. Let Flutter choose automatically:
flutter run
```

---

## 🌐 **Network Issues ("Check your connection" error)**

If you see a login error about network/connection:

### **Cause:**
- Android emulator lost internet connectivity
- Can't reach Firebase servers

### **Fix:**
```bash
# 1. Kill the emulator
adb emu kill

# 2. Restart it
powershell -Command "Start-Process emulator -ArgumentList '-avd','Pixel_9a','-no-snapshot-load'"

# 3. Wait for boot, then run app
flutter run
```

---

## 📱 **Quick Commands**

### **Kill Emulator:**
```bash
adb emu kill
```

### **Check Emulator Status:**
```bash
adb devices
```

### **List Available Emulators:**
```bash
emulator -list-avds
```

### **Flutter Hot Reload (while app is running):**
Press **`r`** in terminal OR **`Ctrl + F5`** in VS Code

---

## 🧪 **Testing the Sandbox Screen**

Once the app is running:

1. **Login** with any test account (e.g., `limbe1@gmail.com`)
2. Look for **"Quick Actions"** on the dashboard
3. Click **"Sandbox Testing"** (orange button with science icon)
4. Test wallet operations:
   - **Add Money**: Enter amount → Click "Add Money to Wallet"
   - **Withdraw Money**: Enter amount → Click "Withdraw Money from Wallet"
   - Use **Quick Amount buttons** for common amounts

---

## 🎯 **VS Code Features You Now Have:**

### **Run Configurations (F5):**
- ✅ PharmApp Unified (Emulator) - Runs on Android emulator
- ✅ PharmApp Unified (Chrome) - Runs in web browser
- ✅ PharmApp Unified (Windows) - Runs as Windows desktop app

### **Tasks (Ctrl+Shift+P → "Tasks: Run Task"):**
- ✅ Start Android Emulator (Pixel 9a)
- ✅ Kill All Emulators
- ✅ Check Emulator Status
- ✅ Flutter Clean & Run

---

## 💡 **Pro Tips:**

1. **Always wait for emulator to fully boot** before running `flutter run`
2. **Use VS Code tasks** to start emulator - it's easier than terminal
3. **Press `r` for hot reload** when making code changes (no need to restart)
4. **Press `R` for hot restart** if you need a full app restart
5. **Check `adb devices`** to confirm emulator is ready

---

## 📝 **Common Workflow:**

```bash
# Morning startup:
1. Open VS Code in pharmapp_unified folder
2. Ctrl+Shift+P → "Tasks: Run Task" → "Start Android Emulator"
3. Wait 60 seconds
4. Press F5 → Select "PharmApp Unified (Emulator)"
5. Done! ☕

# During development:
- Make code changes
- Press 'r' in terminal for hot reload
- Test changes immediately

# End of day:
Ctrl+Shift+P → "Tasks: Run Task" → "Kill All Emulators"
```

---

**Created:** 2025-10-24
**Updated:** Auto-configured by Claude Code
