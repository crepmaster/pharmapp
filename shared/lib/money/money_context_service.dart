import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

import '../services/master_data_service.dart';
import 'money_context.dart';

/// MoneyContextService — resolves and caches a [MoneyContext] for the
/// current authenticated pharmacy user.
///
/// Purpose : screens should not each redo the "fetch pharmacy → load
/// MasterData → resolve currency → handle loading → pick fallback" chain.
/// They call [MoneyContextService.current()] (fast, cached) and get a
/// consistent [MoneyContext] for the caller's country. The service
/// invalidates on Firebase Auth sign-out / user change.
///
/// The service is intentionally kept as a static singleton with a
/// per-uid in-memory cache — no additional state library, no widget
/// subtree provider. This mirrors the pattern of
/// [FirebaseAuth.instance] and [MasterDataService.load] already used
/// across the app.
///
/// Fail-loud policy : returns `null` when the caller pharmacy cannot be
/// resolved (unauthenticated, missing pharmacy doc, missing countryCode,
/// unknown country in master data, unknown currency). Consumers decide
/// the UI fallback locally (loading placeholder vs error state) rather
/// than absorbing a silent "XAF" default.
class MoneyContextService {
  MoneyContextService._();

  static final Map<String, MoneyContext> _cache = <String, MoneyContext>{};
  static StreamSubscription<User?>? _authSubscription;

  /// Returns the [MoneyContext] for the currently authenticated pharmacy,
  /// or null when it cannot be resolved. Cheap on cache hit ; on cache
  /// miss it awaits a pharmacy Firestore read + MasterData load.
  ///
  /// The optional [overrideUid] is for tests + admin flows that need a
  /// context for a specific pharmacy (never for the current user in the
  /// normal flow).
  static Future<MoneyContext?> current({String? overrideUid}) async {
    _ensureAuthListener();
    final uid = overrideUid ?? FirebaseAuth.instance.currentUser?.uid;
    if (uid == null || uid.isEmpty) return null;

    final cached = _cache[uid];
    if (cached != null) return cached;

    try {
      final pharmacyDoc = await FirebaseFirestore.instance
          .collection('pharmacies')
          .doc(uid)
          .get();
      if (!pharmacyDoc.exists) return null;
      final countryCode = pharmacyDoc.data()?['countryCode'] as String?;
      if (countryCode == null || countryCode.isEmpty) return null;

      final master = await MasterDataService.load();
      final currencyCode = master.getDefaultCurrencyForCountry(countryCode);
      if (currencyCode == null) return null;

      final currency = master.getCurrency(currencyCode);
      final symbol = (currency?.symbol.isNotEmpty ?? false)
          ? currency!.symbol
          : currencyCode;
      final decimals = currency?.decimals;
      final locale = _localeForCountry(countryCode);

      final ctx = MoneyContext(
        countryCode: countryCode,
        currencyCode: currencyCode,
        symbol: symbol,
        decimals: decimals,
        locale: locale,
      );
      _cache[uid] = ctx;
      return ctx;
    } catch (e) {
      debugPrint('MoneyContextService.current: failed for uid=$uid: $e');
      return null;
    }
  }

  /// Manually invalidate the cache for a specific uid (or all). Call from
  /// registration + profile-country-edit flows that mutate the pharmacy
  /// countryCode after cache population. The auth-change listener already
  /// covers sign-out / user swap.
  static void invalidate({String? uid}) {
    if (uid == null) {
      _cache.clear();
    } else {
      _cache.remove(uid);
    }
  }

  static void _ensureAuthListener() {
    if (_authSubscription != null) return;
    _authSubscription = FirebaseAuth.instance.authStateChanges().listen((user) {
      // Auth transition — drop the whole cache. A new user or a sign-out
      // must never reuse the previous user's MoneyContext.
      _cache.clear();
    });
  }

  /// Simple `en_{cc}` locale mapping. Enough for African currencies which
  /// are mostly `en_XX` or `fr_XX`. Extend the switch when a country
  /// needs a different locale for intl formatting.
  static String _localeForCountry(String countryCode) {
    switch (countryCode.toUpperCase()) {
      case 'CM':
      case 'CI':
      case 'SN':
      case 'BJ':
      case 'TG':
      case 'BF':
      case 'ML':
      case 'NE':
      case 'GA':
      case 'CG':
      case 'CD':
      case 'GN':
      case 'MG':
        return 'fr_$countryCode';
      default:
        return 'en_$countryCode';
    }
  }
}

