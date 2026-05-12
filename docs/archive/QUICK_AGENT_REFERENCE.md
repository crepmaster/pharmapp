# Quick Agent Reference Card

## 🚀 **5-Second Agent Onboarding**

### **Read These Files in Order:**
1. **`CLAUDE.md`** (87 lines) - Essential context and commands
2. **`docs/AGENT_BRIEFING.md`** - How to work with this documentation system
3. **`docs/CURRENT_STATUS.md`** - What's implemented right now

### **Update Protocol (Quick Version):**
| Change Type | Update Files | Example |
|-------------|-------------|---------|
| **New Feature** | `docs/CURRENT_STATUS.md` | Added barcode scanning |
| **Security Fix** | `docs/CURRENT_STATUS.md` + security score in `CLAUDE.md` | Fixed auth vulnerability |
| **New App** | `CLAUDE.md` + `docs/CURRENT_STATUS.md` + `docs/DEVELOPMENT_COMMANDS.md` | Added patient app |
| **Command Change** | `docs/DEVELOPMENT_COMMANDS.md` | New build process |

### **Golden Rules:**
- ✅ Keep `CLAUDE.md` under 150 lines (currently 87)
- ✅ Always update timestamps: `*Last Updated: 2025-09-05*`
- ✅ Test commands before documenting them
- ✅ Detailed info goes in `docs/`, not main `CLAUDE.md`

### **File Purposes:**
- **`CLAUDE.md`**: Executive summary + quick start
- **`docs/CURRENT_STATUS.md`**: Complete current state
- **`docs/DEVELOPMENT_COMMANDS.md`**: Developer cheat sheet
- **`docs/AGENT_BRIEFING.md`**: How to maintain this system

### **Emergency Commands:**
```bash
# Test all apps work
cd pharmacy_app && flutter run -d chrome --web-port=8080
cd courier_app && flutter run -d chrome --web-port=8082  
cd admin_panel && flutter run -d chrome --web-port=8084

# Quick status check
flutter analyze
git status
```

**Remember**: This is a PRODUCTION-READY African pharmaceutical platform with 9/10 security score. Treat updates accordingly!