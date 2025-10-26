import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:equatable/equatable.dart';
import 'medicine.dart';
import '../data/essential_medicines.dart';

// Pharmacy Inventory Item Model
// Represents medicines a pharmacy has AVAILABLE FOR EXCHANGE/SALE
// NO FIXED PRICE - Other pharmacies make proposals, seller chooses best offer
//
// Simple Flow:
// 1. List medicine: "Amoxicillin, 50 boxes, expires Dec 31" (no price!)
// 2. Receive proposals: "$20/box for 10", "$18/box for 20", "$25/box for 5"
// 3. Accept best proposal(s)
//
// Quick Usage Example:
// final item = PharmacyInventoryItem.list(
//   medicineId: 'med_456', 
//   pharmacyId: 'pharm_789',
//   availableQuantity: 50,
//   expirationDate: DateTime(2024, 12, 31),
//   lotNumber: 'LOT123',
// );
class PharmacyInventoryItem extends Equatable {
  final String id;
  final String medicineId;
  final String pharmacyId;
  final int availableQuantity; // How many available for sale/exchange
  final String packaging; // NEW: Packaging unit (tablets, ml, boxes, etc.)
  final StockInfo? stock; // Optional - for detailed inventory management
  final PricingInfo? pricing; // Optional - no fixed price, wait for proposals
  final BatchInfo batch; // Required - expiration date is critical
  final LocationInfo? location; // Optional - internal pharmacy location
  final TrackingInfo? tracking; // Optional - detailed tracking
  final AvailabilitySettings availabilitySettings; // For exchange/sale
  final DateTime createdAt;
  final DateTime updatedAt;

  const PharmacyInventoryItem({
    required this.id,
    required this.medicineId,
    required this.pharmacyId,
    required this.availableQuantity,
    this.packaging = 'units', // Default packaging
    this.stock, // Optional
    this.pricing, // Optional - no fixed price
    required this.batch,
    this.location, // Optional
    this.tracking, // Optional
    required this.availabilitySettings,
    required this.createdAt,
    required this.updatedAt,
  });

  @override
  List<Object?> get props => [
        id,
        medicineId,
        pharmacyId,
        availableQuantity,
        packaging,
        stock,
        pricing,
        batch,
        location,
        tracking,
        availabilitySettings,
        createdAt,
        updatedAt,
      ];

  factory PharmacyInventoryItem.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return PharmacyInventoryItem(
      id: doc.id,
      medicineId: data['medicineId'] ?? '',
      pharmacyId: data['pharmacyId'] ?? '',
      availableQuantity: data['availableQuantity']?.toInt() ?? 0,
      packaging: data['packaging'] as String? ?? 'units', // Default for backward compatibility
      stock: data['stock'] != null ? StockInfo.fromMap(data['stock']) : null,
      pricing: data['pricing'] != null ? PricingInfo.fromMap(data['pricing']) : null,
      batch: BatchInfo.fromMap(data['batch'] ?? {}),
      location: data['location'] != null ? LocationInfo.fromMap(data['location']) : null,
      tracking: data['tracking'] != null ? TrackingInfo.fromMap(data['tracking']) : null,
      availabilitySettings: AvailabilitySettings.fromMap(data['availabilitySettings'] ?? {}),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  // Simple listing constructor - no price needed, wait for proposals
  factory PharmacyInventoryItem.list({
    required String id,
    required String medicineId,
    required String pharmacyId,
    required int availableQuantity,
    required DateTime expirationDate,
    required String lotNumber,
    bool availableForExchange = true,
  }) {
    final now = DateTime.now();
    
    return PharmacyInventoryItem(
      id: id,
      medicineId: medicineId,
      pharmacyId: pharmacyId,
      availableQuantity: availableQuantity,
      batch: BatchInfo(
        lotNumber: lotNumber,
        expirationDate: expirationDate,
      ),
      availabilitySettings: AvailabilitySettings(
        availableForExchange: availableForExchange,
        minExchangeQuantity: 1,
        maxExchangeQuantity: availableQuantity,
      ),
      createdAt: now,
      updatedAt: now,
    );
  }

  // Create factory for adding new medicine to inventory
  factory PharmacyInventoryItem.create({
    required String pharmacyId,
    required Medicine medicine,
    required int totalQuantity,
    required DateTime expirationDate,
    String packaging = 'units', // NEW: Packaging parameter
    String batchNumber = '',
    String notes = '',
  }) {
    final now = DateTime.now();

    return PharmacyInventoryItem(
      id: '', // Will be set by Firestore
      medicineId: medicine.id,
      pharmacyId: pharmacyId,
      availableQuantity: totalQuantity,
      packaging: packaging, // NEW: Store packaging separately
      batch: BatchInfo(
        lotNumber: batchNumber,
        expirationDate: expirationDate,
      ),
      availabilitySettings: AvailabilitySettings(
        availableForExchange: true,
        minExchangeQuantity: 1,
        maxExchangeQuantity: totalQuantity,
      ),
      tracking: notes.isNotEmpty ? TrackingInfo(
        lastInventoryCount: now,
        notes: notes, // Notes stay clean, no packaging here
      ) : null,
      createdAt: now,
      updatedAt: now,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'medicineId': medicineId,
      'pharmacyId': pharmacyId,
      'availableQuantity': availableQuantity,
      'packaging': packaging, // NEW: Store packaging separately
      if (stock != null) 'stock': stock!.toMap(),
      if (pricing != null) 'pricing': pricing!.toMap(),
      'batch': batch.toMap(),
      if (location != null) 'location': location!.toMap(),
      if (tracking != null) 'tracking': tracking!.toMap(),
      'availabilitySettings': availabilitySettings.toMap(),
      'createdAt': Timestamp.fromDate(createdAt),
      'updatedAt': Timestamp.fromDate(updatedAt),
    };
  }

  PharmacyInventoryItem copyWith({
    String? id,
    String? medicineId,
    String? pharmacyId,
    int? availableQuantity,
    String? packaging,
    StockInfo? stock,
    PricingInfo? pricing,
    BatchInfo? batch,
    LocationInfo? location,
    TrackingInfo? tracking,
    AvailabilitySettings? availabilitySettings,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return PharmacyInventoryItem(
      id: id ?? this.id,
      medicineId: medicineId ?? this.medicineId,
      pharmacyId: pharmacyId ?? this.pharmacyId,
      availableQuantity: availableQuantity ?? this.availableQuantity,
      packaging: packaging ?? this.packaging,
      stock: stock ?? this.stock,
      pricing: pricing ?? this.pricing,
      batch: batch ?? this.batch,
      location: location ?? this.location,
      tracking: tracking ?? this.tracking,
      availabilitySettings: availabilitySettings ?? this.availabilitySettings,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  // Helper getters
  bool get isLowStock => stock?.currentQuantity != null && stock!.currentQuantity <= stock!.minThreshold;
  bool get isOutOfStock => availableQuantity <= 0;
  bool get isNearExpiry => batch.isNearExpiry;
  bool get isExpired => batch.isExpired;
  int get daysToExpiry => batch.daysToExpiry;
  String get expiryStatus => batch.expiryStatus;
  
  // Available for proposals - no price needed, just quantity and not expired
  bool get canExchange => 
      availabilitySettings.availableForExchange && 
      !isExpired && 
      availableQuantity > 0;

  // UI Compatibility Getters - Static medicine lookup from essential medicines
  Medicine? get medicine {
    try {
      final medicines = EssentialMedicines.allMedicines;
      for (final med in medicines) {
        if (med.id == medicineId) return med;
      }
      return null;
    } catch (e) {
      return null;
    }
  }
  
  DateTime? get expirationDate => batch.expirationDate;
  String get batchNumber => batch.lotNumber;
  String get notes => tracking?.notes ?? '';
}

// Stock information
class StockInfo extends Equatable {
  final int currentQuantity;
  final int minThreshold;
  final int maxCapacity;
  final int reservedQuantity; // For pending exchanges
  final int availableForExchange;

  const StockInfo({
    required this.currentQuantity,
    required this.minThreshold,
    required this.maxCapacity,
    this.reservedQuantity = 0,
    required this.availableForExchange,
  });

  @override
  List<Object?> get props => [
        currentQuantity,
        minThreshold,
        maxCapacity,
        reservedQuantity,
        availableForExchange,
      ];

  factory StockInfo.fromMap(Map<String, dynamic> map) {
    return StockInfo(
      currentQuantity: map['currentQuantity']?.toInt() ?? 0,
      minThreshold: map['minThreshold']?.toInt() ?? 0,
      maxCapacity: map['maxCapacity']?.toInt() ?? 0,
      reservedQuantity: map['reservedQuantity']?.toInt() ?? 0,
      availableForExchange: map['availableForExchange']?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'currentQuantity': currentQuantity,
      'minThreshold': minThreshold,
      'maxCapacity': maxCapacity,
      'reservedQuantity': reservedQuantity,
      'availableForExchange': availableForExchange,
    };
  }

  StockInfo copyWith({
    int? currentQuantity,
    int? minThreshold,
    int? maxCapacity,
    int? reservedQuantity,
    int? availableForExchange,
  }) {
    return StockInfo(
      currentQuantity: currentQuantity ?? this.currentQuantity,
      minThreshold: minThreshold ?? this.minThreshold,
      maxCapacity: maxCapacity ?? this.maxCapacity,
      reservedQuantity: reservedQuantity ?? this.reservedQuantity,
      availableForExchange: availableForExchange ?? this.availableForExchange,
    );
  }
}

// Pricing information
class PricingInfo extends Equatable {
  final double acquisitionCost;
  final double retailPrice;
  final double exchangePrice;
  final double? insurancePrice;
  final String currency;

  const PricingInfo({
    required this.acquisitionCost,
    required this.retailPrice,
    required this.exchangePrice,
    this.insurancePrice,
    this.currency = 'USD',
  });

  @override
  List<Object?> get props => [
        acquisitionCost,
        retailPrice,
        exchangePrice,
        insurancePrice,
        currency,
      ];

  factory PricingInfo.fromMap(Map<String, dynamic> map) {
    return PricingInfo(
      acquisitionCost: (map['acquisitionCost'] ?? 0).toDouble(),
      retailPrice: (map['retailPrice'] ?? 0).toDouble(),
      exchangePrice: (map['exchangePrice'] ?? 0).toDouble(),
      insurancePrice: map['insurancePrice']?.toDouble(),
      currency: map['currency'] ?? 'USD',
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'acquisitionCost': acquisitionCost,
      'retailPrice': retailPrice,
      'exchangePrice': exchangePrice,
      if (insurancePrice != null) 'insurancePrice': insurancePrice,
      'currency': currency,
    };
  }

  PricingInfo copyWith({
    double? acquisitionCost,
    double? retailPrice,
    double? exchangePrice,
    double? insurancePrice,
    String? currency,
  }) {
    return PricingInfo(
      acquisitionCost: acquisitionCost ?? this.acquisitionCost,
      retailPrice: retailPrice ?? this.retailPrice,
      exchangePrice: exchangePrice ?? this.exchangePrice,
      insurancePrice: insurancePrice ?? this.insurancePrice,
      currency: currency ?? this.currency,
    );
  }
}

// Batch information (important for expiry tracking)
class BatchInfo extends Equatable {
  final String lotNumber;
  final DateTime expirationDate;
  final DateTime? manufacturingDate;
  final String? supplierBatch;

  const BatchInfo({
    required this.lotNumber,
    required this.expirationDate,
    this.manufacturingDate,
    this.supplierBatch,
  });

  @override
  List<Object?> get props => [
        lotNumber,
        expirationDate,
        manufacturingDate,
        supplierBatch,
      ];

  factory BatchInfo.fromMap(Map<String, dynamic> map) {
    return BatchInfo(
      lotNumber: map['lotNumber'] ?? '',
      expirationDate: (map['expirationDate'] as Timestamp?)?.toDate() ?? DateTime.now(),
      manufacturingDate: (map['manufacturingDate'] as Timestamp?)?.toDate(),
      supplierBatch: map['supplierBatch'],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'lotNumber': lotNumber,
      'expirationDate': Timestamp.fromDate(expirationDate),
      if (manufacturingDate != null) 'manufacturingDate': Timestamp.fromDate(manufacturingDate!),
      if (supplierBatch != null) 'supplierBatch': supplierBatch,
    };
  }

  BatchInfo copyWith({
    String? lotNumber,
    DateTime? expirationDate,
    DateTime? manufacturingDate,
    String? supplierBatch,
  }) {
    return BatchInfo(
      lotNumber: lotNumber ?? this.lotNumber,
      expirationDate: expirationDate ?? this.expirationDate,
      manufacturingDate: manufacturingDate ?? this.manufacturingDate,
      supplierBatch: supplierBatch ?? this.supplierBatch,
    );
  }

  // Expiration validation helpers
  bool get isExpired => expirationDate.isBefore(DateTime.now());
  bool get isNearExpiry {
    final daysToExpiry = expirationDate.difference(DateTime.now()).inDays;
    return daysToExpiry <= 30; // 30 days warning
  }
  
  int get daysToExpiry => expirationDate.difference(DateTime.now()).inDays;
  
  String get expiryStatus {
    if (isExpired) return 'Expired';
    if (isNearExpiry) return 'Expires Soon';
    return 'Valid';
  }
}

// Location within pharmacy
class LocationInfo extends Equatable {
  final String? zone;     // "A", "B", "Refrigerated"
  final String? shelf;    // "A-1", "B-3"
  final String? bin;      // "A-1-5"

  const LocationInfo({
    this.zone,
    this.shelf,
    this.bin,
  });

  @override
  List<Object?> get props => [zone, shelf, bin];

  factory LocationInfo.fromMap(Map<String, dynamic> map) {
    return LocationInfo(
      zone: map['zone'],
      shelf: map['shelf'],
      bin: map['bin'],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      if (zone != null) 'zone': zone,
      if (shelf != null) 'shelf': shelf,
      if (bin != null) 'bin': bin,
    };
  }

  LocationInfo copyWith({
    String? zone,
    String? shelf,
    String? bin,
  }) {
    return LocationInfo(
      zone: zone ?? this.zone,
      shelf: shelf ?? this.shelf,
      bin: bin ?? this.bin,
    );
  }

  String get fullLocation {
    final parts = [zone, shelf, bin].where((p) => p != null && p.isNotEmpty);
    return parts.join(' - ');
  }
}

// Tracking information
class TrackingInfo extends Equatable {
  final DateTime lastInventoryCount;
  final List<MovementRecord> movements;
  final List<InventoryAlert> alerts;
  final String notes;

  const TrackingInfo({
    required this.lastInventoryCount,
    this.movements = const [],
    this.alerts = const [],
    this.notes = '',
  });

  @override
  List<Object?> get props => [lastInventoryCount, movements, alerts, notes];

  factory TrackingInfo.fromMap(Map<String, dynamic> map) {
    return TrackingInfo(
      lastInventoryCount: (map['lastInventoryCount'] as Timestamp?)?.toDate() ?? DateTime.now(),
      movements: (map['movements'] as List?)
          ?.map((m) => MovementRecord.fromMap(m))
          .toList() ?? [],
      alerts: (map['alerts'] as List?)
          ?.map((a) => InventoryAlert.fromMap(a))
          .toList() ?? [],
      notes: map['notes'] ?? '',
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'lastInventoryCount': Timestamp.fromDate(lastInventoryCount),
      'movements': movements.map((m) => m.toMap()).toList(),
      'alerts': alerts.map((a) => a.toMap()).toList(),
      'notes': notes,
    };
  }

  TrackingInfo copyWith({
    DateTime? lastInventoryCount,
    List<MovementRecord>? movements,
    List<InventoryAlert>? alerts,
    String? notes,
  }) {
    return TrackingInfo(
      lastInventoryCount: lastInventoryCount ?? this.lastInventoryCount,
      movements: movements ?? this.movements,
      alerts: alerts ?? this.alerts,
      notes: notes ?? this.notes,
    );
  }
}

// Stock movement record
class MovementRecord extends Equatable {
  final DateTime timestamp;
  final String type; // 'in', 'out', 'adjustment', 'expired'
  final int quantity;
  final String reason;
  final String? reference; // Order ID, Exchange ID, etc.

  const MovementRecord({
    required this.timestamp,
    required this.type,
    required this.quantity,
    required this.reason,
    this.reference,
  });

  @override
  List<Object?> get props => [timestamp, type, quantity, reason, reference];

  factory MovementRecord.fromMap(Map<String, dynamic> map) {
    return MovementRecord(
      timestamp: (map['timestamp'] as Timestamp?)?.toDate() ?? DateTime.now(),
      type: map['type'] ?? '',
      quantity: map['quantity']?.toInt() ?? 0,
      reason: map['reason'] ?? '',
      reference: map['reference'],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'timestamp': Timestamp.fromDate(timestamp),
      'type': type,
      'quantity': quantity,
      'reason': reason,
      if (reference != null) 'reference': reference,
    };
  }
}

// Inventory alerts
class InventoryAlert extends Equatable {
  final String type; // 'low_stock', 'expiry_warning', 'expired'
  final String message;
  final DateTime createdAt;
  final bool isActive;
  final String severity; // 'info', 'warning', 'critical'

  const InventoryAlert({
    required this.type,
    required this.message,
    required this.createdAt,
    this.isActive = true,
    required this.severity,
  });

  @override
  List<Object?> get props => [type, message, createdAt, isActive, severity];

  factory InventoryAlert.fromMap(Map<String, dynamic> map) {
    return InventoryAlert(
      type: map['type'] ?? '',
      message: map['message'] ?? '',
      createdAt: (map['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      isActive: map['isActive'] ?? true,
      severity: map['severity'] ?? 'info',
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'type': type,
      'message': message,
      'createdAt': Timestamp.fromDate(createdAt),
      'isActive': isActive,
      'severity': severity,
    };
  }
}

// Availability settings for exchange/sale
class AvailabilitySettings extends Equatable {
  final bool availableForExchange;
  final int minExchangeQuantity;
  final int maxExchangeQuantity;
  final List<String> preferredPartners;

  const AvailabilitySettings({
    this.availableForExchange = false,
    this.minExchangeQuantity = 1,
    this.maxExchangeQuantity = 100,
    this.preferredPartners = const [],
  });

  @override
  List<Object?> get props => [
        availableForExchange,
        minExchangeQuantity,
        maxExchangeQuantity,
        preferredPartners,
      ];

  factory AvailabilitySettings.fromMap(Map<String, dynamic> map) {
    return AvailabilitySettings(
      availableForExchange: map['availableForExchange'] ?? false,
      minExchangeQuantity: map['minExchangeQuantity']?.toInt() ?? 1,
      maxExchangeQuantity: map['maxExchangeQuantity']?.toInt() ?? 100,
      preferredPartners: List<String>.from(map['preferredPartners'] ?? []),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'availableForExchange': availableForExchange,
      'minExchangeQuantity': minExchangeQuantity,
      'maxExchangeQuantity': maxExchangeQuantity,
      'preferredPartners': preferredPartners,
    };
  }

  AvailabilitySettings copyWith({
    bool? availableForExchange,
    int? minExchangeQuantity,
    int? maxExchangeQuantity,
    List<String>? preferredPartners,
  }) {
    return AvailabilitySettings(
      availableForExchange: availableForExchange ?? this.availableForExchange,
      minExchangeQuantity: minExchangeQuantity ?? this.minExchangeQuantity,
      maxExchangeQuantity: maxExchangeQuantity ?? this.maxExchangeQuantity,
      preferredPartners: preferredPartners ?? this.preferredPartners,
    );
  }
}