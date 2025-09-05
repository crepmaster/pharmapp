# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the PharmApp codebase.

## 🚀 **PROJECT STATUS - 2025-09-05**

**PRODUCTION READY** - Comprehensive African pharmaceutical exchange platform
- **Security Score**: 9/10 (Enterprise-grade hardening complete)
- **Applications**: 3 fully functional (Pharmacy, Courier, Admin)
- **Business Model**: Complete SaaS with multi-currency support
- **Deployment**: ✅ Ready for African market launch

## 📚 **Documentation**

### **⚠️ For Claude Code Agents: READ THIS FIRST**
- **[docs/AGENT_BRIEFING.md](./docs/AGENT_BRIEFING.md)** - **MANDATORY**: How to read and update this documentation system

### **Project Documentation**
- **[docs/CURRENT_STATUS.md](./docs/CURRENT_STATUS.md)** - Latest features and implementation status
- **[docs/DEVELOPMENT_COMMANDS.md](./docs/DEVELOPMENT_COMMANDS.md)** - Build, run, test commands
- **[docs/CLAUDE_MAIN.md](./docs/CLAUDE_MAIN.md)** - Complete documentation hub

## ⚡ **Quick Start**

### Run All Applications
```bash
# Terminal 1 - Pharmacy App
cd pharmacy_app && flutter run -d chrome --web-port=8080

# Terminal 2 - Courier App  
cd courier_app && flutter run -d chrome --web-port=8082

# Terminal 3 - Admin Panel
cd admin_panel && flutter run -d chrome --web-port=8084
```

### Firebase Backend (if needed)
```bash
cd ../pharmapp/functions && npm run serve
```

## 🏗️ **Project Overview**

### Applications
- **pharmacy_app/**: Medicine inventory and exchange marketplace
- **courier_app/**: GPS delivery tracking and order management  
- **admin_panel/**: Business management and subscription system

### Technology Stack
- **Framework**: Flutter 3.13+ with Material Design 3
- **Backend**: Firebase (Auth, Firestore, Functions)
- **State Management**: BLoC pattern with real-time sync
- **Special Features**: GPS tracking, QR scanning, mobile money integration

### Business Model
- **Target**: Licensed pharmacies across Africa (Kenya, Nigeria, Cameroon, Ghana)
- **Revenue**: SaaS subscriptions ($10-50/month) with mobile money payments
- **Value**: Professional medicine exchange with GPS-tracked delivery

## 🎯 **Development Priorities**

### ✅ **Production Ready**
- Authentication system with Firebase integration
- African medicine database and exchange marketplace
- GPS courier tracking with QR verification
- Admin business management with multi-currency support
- Enterprise security hardening and audit completion

### 📈 **Post-Launch Enhancements**
- Expanded WHO Essential Medicines database
- Multi-language support (Swahili, French)
- Advanced analytics and reporting
- Push notifications and real-time alerts

## 🔧 **Common Commands**

```bash
# Quick analysis
flutter analyze

# Build for production
flutter build web --release    # Admin panel
flutter build apk --release    # Mobile apps

# Firebase functions
cd ../pharmapp/functions && npm run deploy
```

---

*For detailed technical documentation, implementation history, and comprehensive guides, see the [docs/](./docs/) directory.*