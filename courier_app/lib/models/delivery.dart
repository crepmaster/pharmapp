import 'package:equatable/equatable.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Delivery status enum
enum DeliveryStatus {
  pending,      // Waiting for courier acceptance
  accepted,     // Courier accepted, preparing pickup
  enRoute,      // Courier on the way to pickup/delivery
  pickedUp,     // Medicine picked up, heading to delivery
  delivered,    // Successfully delivered
  failed,       // Delivery failed
  cancelled,    // Delivery cancelled
}

/// Location point for pickup or delivery
class DeliveryLocation extends Equatable {
  final String pharmacyId;
  final String pharmacyName;
  final String address;
  final double? latitude;
  final double? longitude;
  final String? phoneNumber;
  final String? contactPerson;

  const DeliveryLocation({
    required this.pharmacyId,
    required this.pharmacyName,
    required this.address,
    this.latitude,
    this.longitude,
    this.phoneNumber,
    this.contactPerson,
  });

  bool get hasGPSLocation => latitude != null && longitude != null;

  @override
  List<Object?> get props => [
    pharmacyId, pharmacyName, address, latitude, longitude, phoneNumber, contactPerson
  ];

  Map<String, dynamic> toMap() {
    return {
      'pharmacyId': pharmacyId,
      'pharmacyName': pharmacyName,
      'address': address,
      'latitude': latitude,
      'longitude': longitude,
      'phoneNumber': phoneNumber,
      'contactPerson': contactPerson,
    };
  }

  factory DeliveryLocation.fromMap(Map<String, dynamic> map) {
    return DeliveryLocation(
      pharmacyId: map['pharmacyId'] ?? '',
      pharmacyName: map['pharmacyName'] ?? '',
      address: map['address'] ?? '',
      latitude: map['latitude']?.toDouble(),
      longitude: map['longitude']?.toDouble(),
      phoneNumber: map['phoneNumber'],
      contactPerson: map['contactPerson'],
    );
  }
}

/// Medicine item in delivery
class DeliveryItem extends Equatable {
  final String medicineId;
  final String medicineName;
  final int quantity;
  final String unit;
  final double? pricePerUnit;
  final DateTime? expirationDate;

  const DeliveryItem({
    required this.medicineId,
    required this.medicineName,
    required this.quantity,
    required this.unit,
    this.pricePerUnit,
    this.expirationDate,
  });

  double get totalPrice => (pricePerUnit ?? 0.0) * quantity;

  @override
  List<Object?> get props => [
    medicineId, medicineName, quantity, unit, pricePerUnit, expirationDate
  ];

  Map<String, dynamic> toMap() {
    return {
      'medicineId': medicineId,
      'medicineName': medicineName,
      'quantity': quantity,
      'unit': unit,
      'pricePerUnit': pricePerUnit,
      'expirationDate': expirationDate?.toIso8601String(),
    };
  }

  factory DeliveryItem.fromMap(Map<String, dynamic> map) {
    return DeliveryItem(
      medicineId: map['medicineId'] ?? '',
      medicineName: map['medicineName'] ?? '',
      quantity: map['quantity'] ?? 0,
      unit: map['unit'] ?? '',
      pricePerUnit: map['pricePerUnit']?.toDouble(),
      expirationDate: map['expirationDate'] != null 
        ? DateTime.parse(map['expirationDate'])
        : null,
    );
  }
}

/// Complete delivery object
class Delivery extends Equatable {
  final String id;
  final String exchangeId;
  final String courierId;
  final DeliveryLocation pickup;
  final DeliveryLocation delivery;
  final List<DeliveryItem> items;
  final DeliveryStatus status;
  final double deliveryFee;
  final double totalValue;
  final DateTime createdAt;
  final DateTime? acceptedAt;
  final DateTime? pickedUpAt;
  final DateTime? deliveredAt;
  final String? notes;
  final String? failureReason;
  final List<String> proofImages;

  const Delivery({
    required this.id,
    required this.exchangeId,
    required this.courierId,
    required this.pickup,
    required this.delivery,
    required this.items,
    required this.status,
    required this.deliveryFee,
    required this.totalValue,
    required this.createdAt,
    this.acceptedAt,
    this.pickedUpAt,
    this.deliveredAt,
    this.notes,
    this.failureReason,
    this.proofImages = const [],
  });

  // Helper getters
  bool get isPending => status == DeliveryStatus.pending;
  bool get isAccepted => status == DeliveryStatus.accepted;
  bool get isEnRoute => status == DeliveryStatus.enRoute;
  bool get isPickedUp => status == DeliveryStatus.pickedUp;
  bool get isDelivered => status == DeliveryStatus.delivered;
  bool get isFailed => status == DeliveryStatus.failed;
  bool get isCancelled => status == DeliveryStatus.cancelled;
  bool get isActive => [DeliveryStatus.accepted, DeliveryStatus.enRoute, DeliveryStatus.pickedUp].contains(status);
  bool get isCompleted => [DeliveryStatus.delivered, DeliveryStatus.failed, DeliveryStatus.cancelled].contains(status);

  String get statusDisplayText {
    switch (status) {
      case DeliveryStatus.pending:
        return 'Waiting for acceptance';
      case DeliveryStatus.accepted:
        return 'Accepted - Preparing pickup';
      case DeliveryStatus.enRoute:
        return 'En route to pickup';
      case DeliveryStatus.pickedUp:
        return 'Picked up - Delivering';
      case DeliveryStatus.delivered:
        return 'Successfully delivered';
      case DeliveryStatus.failed:
        return 'Delivery failed';
      case DeliveryStatus.cancelled:
        return 'Cancelled';
    }
  }

  Duration? get deliveryDuration {
    if (acceptedAt != null && deliveredAt != null) {
      return deliveredAt!.difference(acceptedAt!);
    }
    return null;
  }

  Delivery copyWith({
    String? id,
    String? exchangeId,
    String? courierId,
    DeliveryLocation? pickup,
    DeliveryLocation? delivery,
    List<DeliveryItem>? items,
    DeliveryStatus? status,
    double? deliveryFee,
    double? totalValue,
    DateTime? createdAt,
    DateTime? acceptedAt,
    DateTime? pickedUpAt,
    DateTime? deliveredAt,
    String? notes,
    String? failureReason,
    List<String>? proofImages,
  }) {
    return Delivery(
      id: id ?? this.id,
      exchangeId: exchangeId ?? this.exchangeId,
      courierId: courierId ?? this.courierId,
      pickup: pickup ?? this.pickup,
      delivery: delivery ?? this.delivery,
      items: items ?? this.items,
      status: status ?? this.status,
      deliveryFee: deliveryFee ?? this.deliveryFee,
      totalValue: totalValue ?? this.totalValue,
      createdAt: createdAt ?? this.createdAt,
      acceptedAt: acceptedAt ?? this.acceptedAt,
      pickedUpAt: pickedUpAt ?? this.pickedUpAt,
      deliveredAt: deliveredAt ?? this.deliveredAt,
      notes: notes ?? this.notes,
      failureReason: failureReason ?? this.failureReason,
      proofImages: proofImages ?? this.proofImages,
    );
  }

  @override
  List<Object?> get props => [
    id, exchangeId, courierId, pickup, delivery, items, status, deliveryFee,
    totalValue, createdAt, acceptedAt, pickedUpAt, deliveredAt, notes,
    failureReason, proofImages
  ];

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'exchangeId': exchangeId,
      'courierId': courierId,
      'pickup': pickup.toMap(),
      'delivery': delivery.toMap(),
      'items': items.map((item) => item.toMap()).toList(),
      'status': status.toString().split('.').last,
      'deliveryFee': deliveryFee,
      'totalValue': totalValue,
      'createdAt': createdAt.toIso8601String(),
      'acceptedAt': acceptedAt?.toIso8601String(),
      'pickedUpAt': pickedUpAt?.toIso8601String(),
      'deliveredAt': deliveredAt?.toIso8601String(),
      'notes': notes,
      'failureReason': failureReason,
      'proofImages': proofImages,
    };
  }

  factory Delivery.fromMap(Map<String, dynamic> map, String id) {
    return Delivery(
      id: id,
      exchangeId: map['exchangeId'] ?? '',
      courierId: map['courierId'] ?? '',
      pickup: DeliveryLocation.fromMap(map['pickup'] ?? {}),
      delivery: DeliveryLocation.fromMap(map['delivery'] ?? {}),
      items: (map['items'] as List<dynamic>?)
          ?.map((item) => DeliveryItem.fromMap(item))
          .toList() ?? [],
      status: DeliveryStatus.values.firstWhere(
        (s) => s.toString().split('.').last == map['status'],
        orElse: () => DeliveryStatus.pending,
      ),
      deliveryFee: map['deliveryFee']?.toDouble() ?? 0.0,
      totalValue: map['totalValue']?.toDouble() ?? 0.0,
      createdAt: DateTime.parse(map['createdAt']),
      acceptedAt: map['acceptedAt'] != null ? DateTime.parse(map['acceptedAt']) : null,
      pickedUpAt: map['pickedUpAt'] != null ? DateTime.parse(map['pickedUpAt']) : null,
      deliveredAt: map['deliveredAt'] != null ? DateTime.parse(map['deliveredAt']) : null,
      notes: map['notes'],
      failureReason: map['failureReason'],
      proofImages: List<String>.from(map['proofImages'] ?? []),
    );
  }

  factory Delivery.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return Delivery.fromMap(data, doc.id);
  }
}