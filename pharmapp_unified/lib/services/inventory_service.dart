import 'dart:async' show unawaited;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:pharmapp_shared/pharmapp_shared.dart';
import '../models/pharmacy_inventory.dart';
import '../models/medicine.dart';

class InventoryService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  static final FirebaseAuth _auth = FirebaseAuth.instance;

  /// Add medicine to pharmacy inventory
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

    // Debug statement removed for production security

    final inventoryItem = PharmacyInventoryItem.create(
      pharmacyId: user.uid,
      medicine: medicine,
      totalQuantity: quantity,
      expirationDate: expirationDate,
      packaging: packaging, // Store packaging in dedicated field
      batchNumber: batchNumber,
      notes: notes, // Keep notes clean
    );

    try {
      final docRef = await _firestore
          .collection('pharmacy_inventory')
          .add(inventoryItem.toFirestore());
      
      // Debug statement removed for production security
      return docRef.id;
    } catch (e) {
      // Debug statement removed for production security
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

      // Dual-mode query: cityCode (Sprint 2A+ docs) + legacy city (pre-migration docs).
      // Merging both result sets ensures no pharmacy is missed during the transition.
      final cityQueries = <Future<QuerySnapshot<Map<String, dynamic>>>>[
        _firestore
            .collection('pharmacies')
            .where('cityCode', isEqualTo: resolvedCityCode)
            .get(),
        if (legacyCityName != null && legacyCityName.isNotEmpty)
          _firestore
              .collection('pharmacies')
              .where('city', isEqualTo: legacyCityName)
              .get(),
      ];
      final citySnapshots = await Future.wait(cityQueries);

      debugPrint('📍 City query returned ${citySnapshots.map((s) => s.docs.length).reduce((a, b) => a + b)} docs (pre-dedup)');

      // ✅ FIX 3: Deduplicate across both result sets, exclude self.
      final pharmacyIdsInCity = citySnapshots
          .expand((s) => s.docs.map((d) => d.id))
          .toSet()
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
