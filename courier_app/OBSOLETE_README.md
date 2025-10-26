# ⚠️ OBSOLETE APPLICATION - DO NOT USE

## This app has been replaced by `pharmapp_unified`

**Status**: OBSOLETE (as of 2025-10-24)
**Reason**: All courier features migrated to `pharmapp_unified` (MASTER app)
**Action**: Use `pharmapp_unified/` instead

### Why This App Is Obsolete:

This standalone courier app has been **completely replaced** by the unified application (`pharmapp_unified/`) which contains:
- ✅ All courier features (delivery management, GPS tracking, QR scanning, wallet)
- ✅ All pharmacy features
- ✅ Unified authentication system
- ✅ Better architecture and code organization
- ✅ Active development and maintenance

### What Happened:

1. **2025-10-24**: Decision made to consolidate all features into `pharmapp_unified`
2. **2025-10-25**: Complete courier module migrated (4,913+ lines)
3. **Testing**: User confirmed "the courier app seems ok"

### For Developers:

**DO NOT**:
- ❌ Run this app
- ❌ Make changes to this app
- ❌ Build APKs from this app
- ❌ Copy code FROM this app

**DO**:
- ✅ Use `pharmapp_unified/` for all courier development
- ✅ Refer to this code only for historical reference
- ✅ Delete this directory if you want to clean up your workspace

### Migration Status:

All courier features have been successfully migrated to `pharmapp_unified`:
- ✅ Courier Dashboard (courier_main_screen.dart)
- ✅ DeliveryBloc (7 events, 9 states)
- ✅ GPS Location Tracking (real-time updates every 30s)
- ✅ Smart Order Sorting (proximity-based algorithm)
- ✅ QR Code Scanning (pickup/delivery verification)
- ✅ Photo Proof (camera integration)
- ✅ Wallet Withdrawals (mobile money integration)
- ✅ Issue Reporting (7 types)
- ✅ Google Maps Navigation
- ✅ Complete delivery lifecycle

**This directory can be safely deleted.**

---

**Master Application**: [`pharmapp_unified/`](../pharmapp_unified/)
**Documentation**: [`CLAUDE.md`](../CLAUDE.md)
**File Structure Guide**: [`docs/FILE_STRUCTURE_ACTIVE_VS_OBSOLETE.md`](../docs/FILE_STRUCTURE_ACTIVE_VS_OBSOLETE.md)
