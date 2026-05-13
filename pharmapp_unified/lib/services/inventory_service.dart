import 'dart:async' show unawaited;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:pharmapp_shared/pharmapp_shared.dart';
import '../models/pharmacy_inventory.dart';
import '../models/medicine.dart';

/// Sprint 2B.2b — pluggable marketplace-pharmacies fetcher. Production
/// passes a closure that calls the backend callable
/// `getMarketplacePharmacies` ; tests pass a stub that returns a fixed
/// list. Keeps the service decoupled from Firebase Functions at test
/// time, mirrors the seam patterns used in Sprint 2B.1 and 2B.2a.
typedef MarketplacePharmaciesFetcher = Future<List<String>> Function({
  required String countryCode,
  String? cityCode,
  String? legacyCityName,
});

class InventoryService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  static final FirebaseAuth _auth = FirebaseAuth.instance;

  /// Sprint 2B.2b — overridable for widget tests. Default invokes the
  /// `getMarketplacePharmacies` callable in `europe-west1` and returns
  /// the list of eligible UIDs. Production code path is the default.
  @visibleForTesting
  static MarketplacePharmaciesFetcher fetchMarketplacePharmacyIds =
      _fetchMarketplacePharmacyIdsFromCallable;

  static Future<List<String>> _fetchMarketplacePharmacyIdsFromCallable({
    required String countryCode,
    String? cityCode,
    String? legacyCityName,
  }) async {
    final fn = FirebaseFunctions.instanceFor(region: 'europe-west1')
        .httpsCallable('getMarketplacePharmacies');
    final res = await fn.call<Map<dynamic, dynamic>>({
      'countryCode': countryCode,
      if (cityCode != null) 'cityCode': cityCode,
      if (legacyCityName != null && legacyCityName.isNotEmpty)
        'legacyCityName': legacyCityName,
    });
    final raw = res.data['pharmacies'];
    if (raw is! List) return const <String>[];
    final ids = <String>[];
    for (final p in raw) {
      if (p is Map) {
        final uid = p['uid'];
        if (uid is String && uid.isNotEmpty) ids.add(uid);
      }
    }
    return ids;
  }

  /// Add medicine to pharmacy inventory.
  ///
  /// If an existing inventory line matches on (pharmacyId, medicineId,
  /// batch.lotNumber), the quantity is incremented atomically on that line
  /// instead of creating a new row. This preserves pharmaceutical traceability
  /// — different batch numbers remain separate lines (regulatory requirement)
  /// — while avoiding duplicate rows for the same batch.
  ///
  /// Returns the id of the line (existing or newly created).
  static Future<String> addMedicineToInventory({
    required Medicine medicine,
    required int quantity,
    required DateTime expirationDate,
    String batchNumber = '',
    String notes = '',
    String packaging = 'tablets',
  }) async {
    final user = _auth.currentUser;
    if (user == null) {
      throw Exception('User not authenticated');
    }

    try {
      // Merge rule: same medicine + same batch lot number → increment.
      // Empty batchNumber is still a valid key — two "no-batch" additions of
      // the same medicine merge together. If the pharmacy wants them distinct,
      // they must provide a batch number.
      final existing = await _firestore
          .collection('pharmacy_inventory')
          .where('pharmacyId', isEqualTo: user.uid)
          .where('medicineId', isEqualTo: medicine.id)
          .where('batch.lotNumber', isEqualTo: batchNumber)
          .limit(1)
          .get();

      if (existing.docs.isNotEmpty) {
        final doc = existing.docs.first;
        await doc.reference.update({
          'availableQuantity': FieldValue.increment(quantity),
          if (packaging.isNotEmpty) 'packaging': packaging,
          'updatedAt': FieldValue.serverTimestamp(),
        });
        return doc.id;
      }

      // No matching line → create a new one.
      final inventoryItem = PharmacyInventoryItem.create(
        pharmacyId: user.uid,
        medicine: medicine,
        totalQuantity: quantity,
        expirationDate: expirationDate,
        packaging: packaging,
        batchNumber: batchNumber,
        notes: notes,
      );

      // Enrich the Firestore doc with denormalized display fields so backend
      // flows (delivery creation, notifications) can show the medicine name
      // without client-side catalogue resolution.
      final data = inventoryItem.toFirestore();
      data['medicineName'] = medicine.name;
      data['medicineGenericName'] = medicine.genericName;
      data['medicineDosage'] = medicine.strength;
      data['medicineForm'] = medicine.form;

      final docRef = await _firestore
          .collection('pharmacy_inventory')
          .add(data);
      return docRef.id;
    } catch (e) {
      throw Exception('Failed to add medicine to inventory: $e');
    }
  }

  /// Get pharmacy's own inventory
  static Stream<List<PharmacyInventoryItem>> getMyInventory() {
    final user = _auth.currentUser;
    if (user == null) {
      return Stream.value([]);
    }

    return _firestore
        .collection('pharmacy_inventory')
        .where('pharmacyId', isEqualTo: user.uid)
        .snapshots()
        .map((snapshot) {
      var items = snapshot.docs
          .map((doc) => PharmacyInventoryItem.fromFirestore(doc))
          .toList();
      
      // Sort by creation date (most recent first) in client-side
      items.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      
      return items;
    });
  }

  /// Get all available medicines from other pharmacies in the same city
  static Stream<List<PharmacyInventoryItem>> getAvailableMedicines({
    String? categoryFilter,
    String? searchQuery,
  }) {
    final user = _auth.currentUser;
    if (user == null) {
      return Stream.value([]);
    }

    // First, get the current pharmacy's city to enable city-based filtering
    return _firestore
        .collection('pharmacies')
        .doc(user.uid)
        .snapshots()
        .asyncExpand((pharmacyDoc) async* {
      // ✅ FIX 1: Check if pharmacy document exists
      if (!pharmacyDoc.exists) {
        debugPrint('⚠️ Pharmacy document not found for user ${user.uid}');
        yield <PharmacyInventoryItem>[];
        return;
      }

      final docData = pharmacyDoc.data()!;

      // Prefer canonical cityCode (written by Sprint 2A+ registration).
      // If absent, compute slug from legacy city display name and write it back
      // lazily — this is the Sprint 2D backfill for pre-migration documents.
      String? resolvedCityCode = docData['cityCode'] as String?;
      final String? legacyCityName = docData['city'] as String?;

      if (resolvedCityCode == null &&
          legacyCityName != null &&
          legacyCityName.isNotEmpty) {
        resolvedCityCode = MasterDataService.citySlug(legacyCityName);
        unawaited(_firestore
            .collection('pharmacies')
            .doc(user.uid)
            .update({'cityCode': resolvedCityCode}));
      }

      if (resolvedCityCode == null) {
        debugPrint('⚠️ Pharmacy ${user.uid} has no city configured');
        yield <PharmacyInventoryItem>[];
        return;
      }

      debugPrint('🏙️ Pharmacy cityCode: $resolvedCityCode (legacy: $legacyCityName)');

      // Sprint 2B.2b — backend-owned marketplace listing.
      //
      // Previously this method ran two direct Firestore queries against
      // `collection('pharmacies').where(cityCode | city, isEqualTo: ...)`
      // to discover same-city pharmacies. That listing path is now
      // closed at the rule layer (`allow list: if false` on the
      // pharmacies collection — see firestore.rules and the rules
      // emulator tests REQ-2B2B-001..005). Any client-side listing
      // would now be rejected with `permission-denied`.
      //
      // Migration : we delegate the country/city-scoped lookup to the
      // `getMarketplacePharmacies` callable, which evaluates the
      // license gate server-side and returns ONLY eligible UIDs. The
      // owner's own UID is then filtered out before chunking into the
      // existing `pharmacy_inventory.whereIn(pharmacyId, chunk)` query.
      // No leak of licenseStatus or rejection reason : the callable
      // strips those fields before returning.
      final ownCountryCode = docData['countryCode'] as String?;
      if (ownCountryCode == null || ownCountryCode.isEmpty) {
        debugPrint('⚠️ Pharmacy ${user.uid} has no countryCode — cannot list marketplace');
        yield <PharmacyInventoryItem>[];
        return;
      }
      final List<String> eligibleIds;
      try {
        eligibleIds = await fetchMarketplacePharmacyIds(
          countryCode: ownCountryCode,
          cityCode: resolvedCityCode,
          // Sprint 2B.2b architect follow-up — dual-mode for legacy
          // pharmacies that have only `city` (display name) without
          // `cityCode` slug. The backend callable unions both result
          // sets, deduplicated by document id.
          legacyCityName: legacyCityName,
        );
      } catch (e) {
        debugPrint('⚠️ getMarketplacePharmacies failed: $e');
        yield <PharmacyInventoryItem>[];
        return;
      }
      debugPrint('📍 Backend returned ${eligibleIds.length} eligible pharmacy UIDs');

      // Exclude self.
      final pharmacyIdsInCity = eligibleIds
          .where((id) => id != user.uid)
          .toList();

      // ✅ FIX 4: Check if there are any other pharmacies in the same city
      if (pharmacyIdsInCity.isEmpty) {
        debugPrint('ℹ️ User is the only pharmacy in $resolvedCityCode');
        yield <PharmacyInventoryItem>[];
        return;
      }

      debugPrint('👥 Found ${pharmacyIdsInCity.length} other pharmacies in $resolvedCityCode');

      // ✅ FIX 5: Handle Firebase whereIn limit of 30 items - split into chunks
      const chunkSize = 30;
      final chunks = <List<String>>[];

      for (var i = 0; i < pharmacyIdsInCity.length; i += chunkSize) {
        final end = (i + chunkSize < pharmacyIdsInCity.length)
            ? i + chunkSize
            : pharmacyIdsInCity.length;
        chunks.add(pharmacyIdsInCity.sublist(i, end));
      }

      debugPrint('📦 Querying ${chunks.length} chunk(s) of pharmacy inventories');

      // Query all chunks in parallel and combine results
      final snapshots = await Future.wait(
        chunks.map((chunk) => _firestore
            .collection('pharmacy_inventory')
            .where('availabilitySettings.availableForExchange', isEqualTo: true)
            .where('pharmacyId', whereIn: chunk)
            .get())
      );

      // Combine all results from chunks
      final allDocs = snapshots.expand((snapshot) => snapshot.docs).toList();

      debugPrint('💊 Retrieved ${allDocs.length} total inventory items');

      // Parse and filter items (no need to filter by pharmacyId - already done in query)
      var items = allDocs
          .map((doc) => PharmacyInventoryItem.fromFirestore(doc))
          .where((item) {
            // Filter out expired items
            if (item.isExpired) return false;
            // Filter out items with no available quantity
            if (item.availableQuantity <= 0) return false;
            return true;
          })
          .toList();

      // Apply category filter
      if (categoryFilter != null && categoryFilter != 'All') {
        items = items.where((item) {
          final medicine = item.medicine;
          return medicine?.category == categoryFilter;
        }).toList();
      }

      // Apply search filter
      if (searchQuery != null && searchQuery.isNotEmpty) {
        items = items.where((item) {
          final medicine = item.medicine;
          if (medicine == null) return false;

          final query = searchQuery.toLowerCase();
          return medicine.name.toLowerCase().contains(query) ||
                 medicine.genericName.toLowerCase().contains(query) ||
                 medicine.category.toLowerCase().contains(query);
        }).toList();
      }

      // Sort by creation date (most recent first) in client-side
      items.sort((a, b) => b.createdAt.compareTo(a.createdAt));

      debugPrint('✅ Returning ${items.length} filtered medicines from $resolvedCityCode');

      yield items;
    });
  }

  /// Update inventory item quantity
  static Future<void> updateQuantity({
    required String inventoryId,
    required int newQuantity,
  }) async {
    try {
      await _firestore
          .collection('pharmacy_inventory')
          .doc(inventoryId)
          .update({
        'availableQuantity': newQuantity,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      
      // Debug statement removed for production security
    } catch (e) {
      // Debug statement removed for production security
      throw Exception('Failed to update quantity: $e');
    }
  }

  /// Remove medicine from inventory
  static Future<void> removeMedicine(String inventoryId) async {
    try {
      await _firestore
          .collection('pharmacy_inventory')
          .doc(inventoryId)
          .delete();
      
      // Debug statement removed for production security
    } catch (e) {
      // Debug statement removed for production security
      throw Exception('Failed to remove medicine: $e');
    }
  }

  /// Toggle availability for exchange.
  ///
  /// When publishing ([available] = true), an optional [maxExchangeQuantity]
  /// can be provided to cap how many units are offered to other pharmacies.
  /// If null, the caller signals "no explicit cap" and `maxExchangeQuantity`
  /// is reset so the full inventory quantity is offered.
  static Future<void> toggleAvailability({
    required String inventoryId,
    required bool available,
    int? maxExchangeQuantity,
  }) async {
    try {
      final Map<String, dynamic> updates = {
        'availabilitySettings.availableForExchange': available,
        'updatedAt': FieldValue.serverTimestamp(),
      };
      if (available && maxExchangeQuantity != null) {
        updates['availabilitySettings.maxExchangeQuantity'] =
            maxExchangeQuantity;
      } else if (available && maxExchangeQuantity == null) {
        updates['availabilitySettings.maxExchangeQuantity'] = 0;
      }
      await _firestore
          .collection('pharmacy_inventory')
          .doc(inventoryId)
          .update(updates);
    } catch (e) {
      throw Exception('Failed to update availability: $e');
    }
  }

  /// Get inventory item by ID (for proposals)
  static Future<PharmacyInventoryItem?> getInventoryItem(String inventoryId) async {
    try {
      final doc = await _firestore
          .collection('pharmacy_inventory')
          .doc(inventoryId)
          .get();

      if (doc.exists) {
        return PharmacyInventoryItem.fromFirestore(doc);
      }
      return null;
    } catch (e) {
      // Debug statement removed for production security
      return null;
    }
  }
}
