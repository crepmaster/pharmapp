import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:equatable/equatable.dart';

// African Medicine Categories
enum MedicineCategory {
  antimalarials,
  antibiotics,
  antiretrovirals,
  maternalHealth,
  pediatric,
  cardiovascular,
  diabetes,
  painManagement,
  respiratory,
  gastrointestinal,
}

enum MedicinePriority {
  critical,
  high,
  medium,
  low,
}

enum StockoutRisk {
  low,
  medium,
  high,
}

// Medicine Model (African-focused)
class Medicine extends Equatable {
  final String id;
  final MedicineNames names;
  final AfricanClassification africanClassification;
  final MedicineFormulations formulations;
  final MarketInfo marketInfo;
  final StorageRequirements storage;
  final SearchTerms searchTerms;
  final DateTime createdAt;
  final DateTime updatedAt;
  final bool isActive;

  const Medicine({
    required this.id,
    required this.names,
    required this.africanClassification,
    required this.formulations,
    required this.marketInfo,
    required this.storage,
    required this.searchTerms,
    required this.createdAt,
    required this.updatedAt,
    this.isActive = true,
  });

  @override
  List<Object?> get props => [
        id,
        names,
        africanClassification,
        formulations,
        marketInfo,
        storage,
        searchTerms,
        createdAt,
        updatedAt,
        isActive,
      ];

  // Factory constructor from Firestore
  factory Medicine.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    
    return Medicine(
      id: doc.id,
      names: MedicineNames.fromMap(data['names'] ?? {}),
      africanClassification: AfricanClassification.fromMap(data['africanClassification'] ?? {}),
      formulations: MedicineFormulations.fromMap(data['formulations'] ?? {}),
      marketInfo: MarketInfo.fromMap(data['marketInfo'] ?? {}),
      storage: StorageRequirements.fromMap(data['storage'] ?? {}),
      searchTerms: SearchTerms.fromMap(data['searchTerms'] ?? {}),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      isActive: data['isActive'] ?? true,
    );
  }

  // Convert to Firestore map
  Map<String, dynamic> toFirestore() {
    return {
      'names': names.toMap(),
      'africanClassification': africanClassification.toMap(),
      'formulations': formulations.toMap(),
      'marketInfo': marketInfo.toMap(),
      'storage': storage.toMap(),
      'searchTerms': searchTerms.toMap(),
      'createdAt': Timestamp.fromDate(createdAt),
      'updatedAt': Timestamp.fromDate(updatedAt),
      'isActive': isActive,
    };
  }

  Medicine copyWith({
    String? id,
    MedicineNames? names,
    AfricanClassification? africanClassification,
    MedicineFormulations? formulations,
    MarketInfo? marketInfo,
    StorageRequirements? storage,
    SearchTerms? searchTerms,
    DateTime? createdAt,
    DateTime? updatedAt,
    bool? isActive,
  }) {
    return Medicine(
      id: id ?? this.id,
      names: names ?? this.names,
      africanClassification: africanClassification ?? this.africanClassification,
      formulations: formulations ?? this.formulations,
      marketInfo: marketInfo ?? this.marketInfo,
      storage: storage ?? this.storage,
      searchTerms: searchTerms ?? this.searchTerms,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      isActive: isActive ?? this.isActive,
    );
  }
}

// Medicine Names (including local languages)
class MedicineNames extends Equatable {
  final String genericName;
  final List<String> brandNames;
  final List<String> localNames;
  final String commonName;

  const MedicineNames({
    required this.genericName,
    this.brandNames = const [],
    this.localNames = const [],
    required this.commonName,
  });

  @override
  List<Object?> get props => [genericName, brandNames, localNames, commonName];

  factory MedicineNames.fromMap(Map<String, dynamic> map) {
    return MedicineNames(
      genericName: map['genericName'] ?? '',
      brandNames: List<String>.from(map['brandNames'] ?? []),
      localNames: List<String>.from(map['localNames'] ?? []),
      commonName: map['commonName'] ?? '',
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'genericName': genericName,
      'brandNames': brandNames,
      'localNames': localNames,
      'commonName': commonName,
    };
  }
}

// African-specific classification
class AfricanClassification extends Equatable {
  final MedicineCategory category;
  final String subcategory;
  final bool whoEssentialList;
  final MedicinePriority priority;
  final List<String> targetConditions;
  final List<String> ageGroups;

  const AfricanClassification({
    required this.category,
    required this.subcategory,
    this.whoEssentialList = false,
    required this.priority,
    this.targetConditions = const [],
    this.ageGroups = const [],
  });

  @override
  List<Object?> get props => [
        category,
        subcategory,
        whoEssentialList,
        priority,
        targetConditions,
        ageGroups,
      ];

  factory AfricanClassification.fromMap(Map<String, dynamic> map) {
    return AfricanClassification(
      category: MedicineCategory.values.firstWhere(
        (e) => e.toString().split('.').last == map['category'],
        orElse: () => MedicineCategory.antibiotics,
      ),
      subcategory: map['subcategory'] ?? '',
      whoEssentialList: map['whoEssentialList'] ?? false,
      priority: MedicinePriority.values.firstWhere(
        (e) => e.toString().split('.').last == map['priority'],
        orElse: () => MedicinePriority.medium,
      ),
      targetConditions: List<String>.from(map['targetConditions'] ?? []),
      ageGroups: List<String>.from(map['ageGroups'] ?? []),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'category': category.toString().split('.').last,
      'subcategory': subcategory,
      'whoEssentialList': whoEssentialList,
      'priority': priority.toString().split('.').last,
      'targetConditions': targetConditions,
      'ageGroups': ageGroups,
    };
  }
}

// Medicine formulations and specifications
class MedicineFormulations extends Equatable {
  final String strength;
  final String dosageForm;
  final String routeOfAdmin;
  final PackagingInfo packaging;

  const MedicineFormulations({
    required this.strength,
    required this.dosageForm,
    required this.routeOfAdmin,
    required this.packaging,
  });

  @override
  List<Object?> get props => [strength, dosageForm, routeOfAdmin, packaging];

  factory MedicineFormulations.fromMap(Map<String, dynamic> map) {
    return MedicineFormulations(
      strength: map['strength'] ?? '',
      dosageForm: map['dosageForm'] ?? '',
      routeOfAdmin: map['routeOfAdmin'] ?? '',
      packaging: PackagingInfo.fromMap(map['packaging'] ?? {}),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'strength': strength,
      'dosageForm': dosageForm,
      'routeOfAdmin': routeOfAdmin,
      'packaging': packaging.toMap(),
    };
  }
}

class PackagingInfo extends Equatable {
  final int size;
  final String unit;
  final String packType;
  final String? ndc;

  const PackagingInfo({
    required this.size,
    required this.unit,
    required this.packType,
    this.ndc,
  });

  @override
  List<Object?> get props => [size, unit, packType, ndc];

  factory PackagingInfo.fromMap(Map<String, dynamic> map) {
    return PackagingInfo(
      size: map['size']?.toInt() ?? 0,
      unit: map['unit'] ?? '',
      packType: map['packType'] ?? '',
      ndc: map['ndc'],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'size': size,
      'unit': unit,
      'packType': packType,
      if (ndc != null) 'ndc': ndc,
    };
  }
}

// Market information for African context
class MarketInfo extends Equatable {
  final List<String> registeredCountries;
  final List<ManufacturerInfo> manufacturers;
  final PricingInfo pricing;
  final AvailabilityInfo availability;

  const MarketInfo({
    this.registeredCountries = const [],
    this.manufacturers = const [],
    required this.pricing,
    required this.availability,
  });

  @override
  List<Object?> get props => [
        registeredCountries,
        manufacturers,
        pricing,
        availability,
      ];

  factory MarketInfo.fromMap(Map<String, dynamic> map) {
    return MarketInfo(
      registeredCountries: List<String>.from(map['registeredCountries'] ?? []),
      manufacturers: (map['manufacturers'] as List?)
          ?.map((m) => ManufacturerInfo.fromMap(m))
          .toList() ?? [],
      pricing: PricingInfo.fromMap(map['pricing'] ?? {}),
      availability: AvailabilityInfo.fromMap(map['availability'] ?? {}),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'registeredCountries': registeredCountries,
      'manufacturers': manufacturers.map((m) => m.toMap()).toList(),
      'pricing': pricing.toMap(),
      'availability': availability.toMap(),
    };
  }
}

class ManufacturerInfo extends Equatable {
  final String name;
  final String country;
  final String type; // 'local', 'international', 'generic'

  const ManufacturerInfo({
    required this.name,
    required this.country,
    required this.type,
  });

  @override
  List<Object?> get props => [name, country, type];

  factory ManufacturerInfo.fromMap(Map<String, dynamic> map) {
    return ManufacturerInfo(
      name: map['name'] ?? '',
      country: map['country'] ?? '',
      type: map['type'] ?? '',
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'name': name,
      'country': country,
      'type': type,
    };
  }
}

class PricingInfo extends Equatable {
  final double averagePrice;
  final String currency;
  final double minPrice;
  final double maxPrice;

  const PricingInfo({
    required this.averagePrice,
    required this.currency,
    required this.minPrice,
    required this.maxPrice,
  });

  @override
  List<Object?> get props => [averagePrice, currency, minPrice, maxPrice];

  factory PricingInfo.fromMap(Map<String, dynamic> map) {
    return PricingInfo(
      averagePrice: (map['averagePrice'] ?? 0).toDouble(),
      currency: map['currency'] ?? 'USD',
      minPrice: (map['minPrice'] ?? 0).toDouble(),
      maxPrice: (map['maxPrice'] ?? 0).toDouble(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'averagePrice': averagePrice,
      'currency': currency,
      'minPrice': minPrice,
      'maxPrice': maxPrice,
    };
  }
}

class AvailabilityInfo extends Equatable {
  final bool commonlyAvailable;
  final String? seasonalAvailability;
  final StockoutRisk stockoutRisk;

  const AvailabilityInfo({
    required this.commonlyAvailable,
    this.seasonalAvailability,
    required this.stockoutRisk,
  });

  @override
  List<Object?> get props => [commonlyAvailable, seasonalAvailability, stockoutRisk];

  factory AvailabilityInfo.fromMap(Map<String, dynamic> map) {
    return AvailabilityInfo(
      commonlyAvailable: map['commonlyAvailable'] ?? false,
      seasonalAvailability: map['seasonalAvailability'],
      stockoutRisk: StockoutRisk.values.firstWhere(
        (e) => e.toString().split('.').last == map['stockoutRisk'],
        orElse: () => StockoutRisk.medium,
      ),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'commonlyAvailable': commonlyAvailable,
      if (seasonalAvailability != null) 'seasonalAvailability': seasonalAvailability,
      'stockoutRisk': stockoutRisk.toString().split('.').last,
    };
  }
}

// Storage requirements (important for African climate)
class StorageRequirements extends Equatable {
  final String temperatureRange;
  final String? humidityRequirements;
  final bool coldChainRequired;
  final int shelfLifeMonths;
  final bool tropicalStability;

  const StorageRequirements({
    required this.temperatureRange,
    this.humidityRequirements,
    this.coldChainRequired = false,
    required this.shelfLifeMonths,
    this.tropicalStability = true,
  });

  @override
  List<Object?> get props => [
        temperatureRange,
        humidityRequirements,
        coldChainRequired,
        shelfLifeMonths,
        tropicalStability,
      ];

  factory StorageRequirements.fromMap(Map<String, dynamic> map) {
    return StorageRequirements(
      temperatureRange: map['temperatureRange'] ?? '15-30°C',
      humidityRequirements: map['humidityRequirements'],
      coldChainRequired: map['coldChainRequired'] ?? false,
      shelfLifeMonths: map['shelfLifeMonths']?.toInt() ?? 24,
      tropicalStability: map['tropicalStability'] ?? true,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'temperatureRange': temperatureRange,
      if (humidityRequirements != null) 'humidityRequirements': humidityRequirements,
      'coldChainRequired': coldChainRequired,
      'shelfLifeMonths': shelfLifeMonths,
      'tropicalStability': tropicalStability,
    };
  }
}

// Search terms for efficient medicine discovery
class SearchTerms extends Equatable {
  final List<String> generic;
  final List<String> brands;
  final List<String> conditions;
  final List<String> local;

  const SearchTerms({
    this.generic = const [],
    this.brands = const [],
    this.conditions = const [],
    this.local = const [],
  });

  @override
  List<Object?> get props => [generic, brands, conditions, local];

  factory SearchTerms.fromMap(Map<String, dynamic> map) {
    return SearchTerms(
      generic: List<String>.from(map['generic'] ?? []),
      brands: List<String>.from(map['brands'] ?? []),
      conditions: List<String>.from(map['conditions'] ?? []),
      local: List<String>.from(map['local'] ?? []),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'generic': generic,
      'brands': brands,
      'conditions': conditions,
      'local': local,
    };
  }

  // Get all search terms as a flat list
  List<String> getAllTerms() {
    return [...generic, ...brands, ...conditions, ...local];
  }
}

// Helper extension for medicine categories
extension MedicineCategoryExtension on MedicineCategory {
  String get displayName {
    switch (this) {
      case MedicineCategory.antimalarials:
        return 'Anti-malarials';
      case MedicineCategory.antibiotics:
        return 'Antibiotics';
      case MedicineCategory.antiretrovirals:
        return 'Antiretrovirals';
      case MedicineCategory.maternalHealth:
        return 'Maternal Health';
      case MedicineCategory.pediatric:
        return 'Pediatric';
      case MedicineCategory.cardiovascular:
        return 'Cardiovascular';
      case MedicineCategory.diabetes:
        return 'Diabetes';
      case MedicineCategory.painManagement:
        return 'Pain Management';
      case MedicineCategory.respiratory:
        return 'Respiratory';
      case MedicineCategory.gastrointestinal:
        return 'Gastrointestinal';
    }
  }

  String get icon {
    switch (this) {
      case MedicineCategory.antimalarials:
        return '🦟';
      case MedicineCategory.antibiotics:
        return '💊';
      case MedicineCategory.antiretrovirals:
        return '🔬';
      case MedicineCategory.maternalHealth:
        return '🤱';
      case MedicineCategory.pediatric:
        return '👶';
      case MedicineCategory.cardiovascular:
        return '❤️';
      case MedicineCategory.diabetes:
        return '🩺';
      case MedicineCategory.painManagement:
        return '💊';
      case MedicineCategory.respiratory:
        return '🫁';
      case MedicineCategory.gastrointestinal:
        return '🔄';
    }
  }
}