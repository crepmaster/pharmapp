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
  }) async {
    final user = _auth.currentUser;
    if (user == null) {
      throw Exception('User not authenticated');
    }

    print('📦 InventoryService: Adding medicine ${medicine.name} to inventory');
    
    final inventoryItem = PharmacyInventoryItem.create(
      pharmacyId: user.uid,
      medicine: medicine,
      totalQuantity: quantity,
      expirationDate: expirationDate,
      batchNumber: batchNumber,
      notes: notes,
    );

    try {
      final docRef = await _firestore
          .collection('pharmacy_inventory')
          .add(inventoryItem.toFirestore());
      
      print('✅ InventoryService: Medicine added with ID: ${docRef.id}');
      return docRef.id;
    } catch (e) {
      print('❌ InventoryService: Error adding medicine - $e');
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
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snapshot) {
      return snapshot.docs
          .map((doc) => PharmacyInventoryItem.fromFirestore(doc))
          .toList();
    });
  }

  /// Get all available medicines from other pharmacies
  static Stream<List<PharmacyInventoryItem>> getAvailableMedicines({
    String? categoryFilter,
    String? searchQuery,
  }) {
    final user = _auth.currentUser;
    if (user == null) {
      return Stream.value([]);
    }

    // Simplified query - only use one inequality filter to avoid index requirements
    Query query = _firestore
        .collection('pharmacy_inventory')
        .where('availabilitySettings.availableForExchange', isEqualTo: true)
        .orderBy('createdAt', descending: true);

    return query
        .snapshots()
        .map((snapshot) {
      var items = snapshot.docs
          .map((doc) => PharmacyInventoryItem.fromFirestore(doc))
          .where((item) {
            // Filter out own inventory
            if (item.pharmacyId == user.uid) return false;
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

      return items;
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
      
      print('✅ InventoryService: Updated quantity for $inventoryId to $newQuantity');
    } catch (e) {
      print('❌ InventoryService: Error updating quantity - $e');
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
      
      print('✅ InventoryService: Removed medicine $inventoryId from inventory');
    } catch (e) {
      print('❌ InventoryService: Error removing medicine - $e');
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
      
      print('✅ InventoryService: Updated availability for $inventoryId to $available');
    } catch (e) {
      print('❌ InventoryService: Error updating availability - $e');
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
      print('❌ InventoryService: Error getting inventory item - $e');
      return null;
    }
  }
}