import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
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
        print('⚠️ Pharmacy document not found for user ${user.uid}');
        yield <PharmacyInventoryItem>[];
        return;
      }

      // Extract current pharmacy's city
      final String? currentCity = pharmacyDoc.data()?['city'] as String?;

      // ✅ FIX 2: Enhanced null safety - check for null AND empty string
      if (currentCity == null || currentCity.isEmpty) {
        print('⚠️ Pharmacy ${user.uid} has no city configured');
        yield <PharmacyInventoryItem>[];
        return;
      }

      print('🏙️ Pharmacy city: $currentCity');

      // Get all pharmacies in the same city
      final pharmaciesSnapshot = await _firestore
          .collection('pharmacies')
          .where('city', isEqualTo: currentCity)
          .get();

      print('📍 Found ${pharmaciesSnapshot.docs.length} total pharmacies in $currentCity');

      // ✅ FIX 3: Exclude own pharmacy ID from the list (not just client-side filtering)
      final pharmacyIdsInCity = pharmaciesSnapshot.docs
          .map((doc) => doc.id)
          .where((id) => id != user.uid) // Exclude self at query level
          .toList();

      // ✅ FIX 4: Check if there are any other pharmacies in the same city
      if (pharmacyIdsInCity.isEmpty) {
        print('ℹ️ User is the only pharmacy in $currentCity');
        yield <PharmacyInventoryItem>[];
        return;
      }

      print('👥 Found ${pharmacyIdsInCity.length} other pharmacies in $currentCity');

      // ✅ FIX 5: Handle Firebase whereIn limit of 30 items - split into chunks
      final chunkSize = 30;
      final chunks = <List<String>>[];

      for (var i = 0; i < pharmacyIdsInCity.length; i += chunkSize) {
        final end = (i + chunkSize < pharmacyIdsInCity.length)
            ? i + chunkSize
            : pharmacyIdsInCity.length;
        chunks.add(pharmacyIdsInCity.sublist(i, end));
      }

      print('📦 Querying ${chunks.length} chunk(s) of pharmacy inventories');

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

      print('💊 Retrieved ${allDocs.length} total inventory items');

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

      print('✅ Returning ${items.length} filtered medicines from $currentCity');

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

  /// Toggle availability for exchange
  static Future<void> toggleAvailability({
    required String inventoryId,
    required bool available,
  }) async {
    try {
      await _firestore
          .collection('pharmacy_inventory')
          .doc(inventoryId)
          .update({
        'availabilitySettings.availableForExchange': available,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      
      // Debug statement removed for production security
    } catch (e) {
      // Debug statement removed for production security
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
