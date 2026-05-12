# CLAUDE.md - PharmApp Documentation Hub

This file provides guidance to Claude Code (claude.ai/code) when working with the PharmApp codebase.

## 🚀 **QUICK STATUS - 2025-09-05**

### ✅ **PRODUCTION READY - COMPREHENSIVE PLATFORM**
- **Security Score**: 9/10 (Enterprise-grade hardening complete)
- **Applications**: 3 apps fully functional (Pharmacy, Courier, Admin)
- **Backend**: 9+ Firebase Functions deployed and operational
- **Business Model**: Complete SaaS system with multi-currency support
- **Deployment Status**: ✅ Ready for African market launch

## 📚 **Documentation Structure**

### **Core Documentation**
- **[PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)** - Architecture, tech stack, and app structure
- **[DEVELOPMENT_COMMANDS.md](./DEVELOPMENT_COMMANDS.md)** - Build, run, test, and deployment commands
- **[CURRENT_STATUS.md](./CURRENT_STATUS.md)** - Latest implementation status and features

### **Feature Documentation**
- **[AUTHENTICATION_SYSTEM.md](./AUTHENTICATION_SYSTEM.md)** - Complete auth flow implementation
- **[MEDICINE_EXCHANGE.md](./MEDICINE_EXCHANGE.md)** - African medicine database and marketplace
- **[COURIER_DELIVERY.md](./COURIER_DELIVERY.md)** - GPS tracking and delivery management
- **[ADMIN_BUSINESS.md](./ADMIN_BUSINESS.md)** - Business management and subscription system

### **Technical Documentation**
- **[SECURITY_AUDIT.md](./SECURITY_AUDIT.md)** - Security reviews, fixes, and hardening
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Production deployment and configuration
- **[PROJECT_HISTORY.md](./PROJECT_HISTORY.md)** - Complete development timeline

## 🎯 **Quick Start Commands**

```bash
# Run all 3 applications (parallel terminals)
cd pharmacy_app && flutter run -d chrome --web-port=8080
cd courier_app && flutter run -d chrome --web-port=8082  
cd admin_panel && flutter run -d chrome --web-port=8084

# Firebase backend (if needed)
cd ../pharmapp/functions && npm run serve
```

## 🔗 **Navigation Guide**

| Need | Documentation |
|------|---------------|
| **Setup new development environment** | → [DEVELOPMENT_COMMANDS.md](./DEVELOPMENT_COMMANDS.md) |
| **Understand app architecture** | → [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) |
| **Check current implementation status** | → [CURRENT_STATUS.md](./CURRENT_STATUS.md) |
| **Review security measures** | → [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) |
| **Deploy to production** | → [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) |
| **Historical development context** | → [PROJECT_HISTORY.md](./PROJECT_HISTORY.md) |

## 💼 **Business Context**
- **Platform**: African pharmaceutical exchange marketplace
- **Model**: SaaS subscription ($10-50/month) with mobile money integration
- **Target**: Licensed pharmacies across Kenya, Nigeria, Cameroon, Ghana
- **Technology**: Flutter 3.13+ with Firebase backend and GPS delivery tracking

---
*For detailed information, see the linked documentation files above.*