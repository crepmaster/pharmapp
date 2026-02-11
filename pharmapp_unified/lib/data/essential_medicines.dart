import '../models/medicine.dart';

// Essential African Medicines Database
// Based on WHO Essential Medicines List and African health priorities

class EssentialAfricanMedicines {
  static final List<Medicine> medicines = [
    // ANTIMALARIALS (Critical Priority)
    Medicine(
      id: 'artemether-lumefantrine-20-120',
      names: const MedicineNames(
        genericName: 'Artemether + Lumefantrine',
        brandNames: ['Coartem', 'Riamet', 'Artefan', 'Falcynate'],
        localNames: ['Dawa ya malaria', 'Médecine paludisme'],
        commonName: 'ACT Malaria Treatment',
      ),
      africanClassification: const AfricanClassification(
        category: MedicineCategory.antimalarials,
        subcategory: 'artemisinin_combinations',
        whoEssentialList: true,
        priority: MedicinePriority.critical,
        targetConditions: ['malaria', 'fever', 'uncomplicated_malaria'],
        ageGroups: ['adult', 'pediatric'],
      ),
      formulations: const MedicineFormulations(
        strength: '20mg/120mg',
        dosageForm: 'Tablet',
        routeOfAdmin: 'Oral',
        packaging: PackagingInfo(
          size: 24,
          unit: 'tablets',
          packType: 'blister',
        ),
      ),
      marketInfo: const MarketInfo(
        registeredCountries: ['Kenya', 'Uganda', 'Tanzania', 'Nigeria', 'Ghana'],
        manufacturers: [
          ManufacturerInfo(name: 'Novartis', country: 'Switzerland', type: 'international'),
          ManufacturerInfo(name: 'Beta Healthcare', country: 'Kenya', type: 'local'),
        ],
        pricing: PricingInfo(
          averagePrice: 8.50,
          currency: 'USD',
          minPrice: 6.00,
          maxPrice: 12.00,
        ),
        availability: AvailabilityInfo(
          commonlyAvailable: true,
          seasonalAvailability: 'rainy_season',
          stockoutRisk: StockoutRisk.medium,
        ),
      ),
      storage: const StorageRequirements(
        temperatureRange: '15-30°C',
        coldChainRequired: false,
        shelfLifeMonths: 36,
        tropicalStability: true,
      ),
      searchTerms: const SearchTerms(
        generic: ['artemether', 'lumefantrine', 'ACT'],
        brands: ['coartem', 'riamet', 'artefan'],
        conditions: ['malaria', 'fever', 'parasites'],
        local: ['dawa ya malaria', 'médecine paludisme'],
      ),
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    ),

    // ANTIBIOTICS
    Medicine(
      id: 'amoxicillin-500mg',
      names: const MedicineNames(
        genericName: 'Amoxicillin',
        brandNames: ['Amoxil', 'Flemoxin', 'Biomox'],
        localNames: ['Dawa ya bacteria', 'Antibiotique'],
        commonName: 'Amoxicillin 500mg',
      ),
      africanClassification: const AfricanClassification(
        category: MedicineCategory.antibiotics,
        subcategory: 'penicillins',
        whoEssentialList: true,
        priority: MedicinePriority.critical,
        targetConditions: ['bacterial_infection', 'respiratory_infection', 'pneumonia'],
        ageGroups: ['adult', 'pediatric'],
      ),
      formulations: const MedicineFormulations(
        strength: '500mg',
        dosageForm: 'Capsule',
        routeOfAdmin: 'Oral',
        packaging: PackagingInfo(
          size: 100,
          unit: 'capsules',
          packType: 'bottle',
        ),
      ),
      marketInfo: const MarketInfo(
        registeredCountries: ['Kenya', 'Uganda', 'Tanzania', 'Nigeria', 'Ghana', 'South Africa'],
        manufacturers: [
          ManufacturerInfo(name: 'GSK', country: 'UK', type: 'international'),
          ManufacturerInfo(name: 'Cosmos Pharmaceuticals', country: 'Kenya', type: 'local'),
          ManufacturerInfo(name: 'Medreich', country: 'India', type: 'generic'),
        ],
        pricing: PricingInfo(
          averagePrice: 3.50,
          currency: 'USD',
          minPrice: 2.00,
          maxPrice: 6.00,
        ),
        availability: AvailabilityInfo(
          commonlyAvailable: true,
          stockoutRisk: StockoutRisk.low,
        ),
      ),
      storage: const StorageRequirements(
        temperatureRange: '15-25°C',
        coldChainRequired: false,
        shelfLifeMonths: 24,
        tropicalStability: true,
      ),
      searchTerms: const SearchTerms(
        generic: ['amoxicillin', 'penicillin'],
        brands: ['amoxil', 'flemoxin'],
        conditions: ['infection', 'bacteria', 'pneumonia'],
        local: ['dawa ya bacteria', 'antibiotique'],
      ),
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    ),

    // ANTIRETROVIRALS
    Medicine(
      id: 'efavirenz-tenofovir-emtricitabine',
      names: const MedicineNames(
        genericName: 'Efavirenz + Tenofovir + Emtricitabine',
        brandNames: ['Atripla', 'Tribuss', 'Viraday'],
        localNames: ['Dawa ya UKIMWI', 'ARV', 'Médicament VIH'],
        commonName: 'HIV Triple Therapy',
      ),
      africanClassification: const AfricanClassification(
        category: MedicineCategory.antiretrovirals,
        subcategory: 'fixed_dose_combinations',
        whoEssentialList: true,
        priority: MedicinePriority.critical,
        targetConditions: ['hiv', 'aids'],
        ageGroups: ['adult'],
      ),
      formulations: const MedicineFormulations(
        strength: '600mg/300mg/200mg',
        dosageForm: 'Tablet',
        routeOfAdmin: 'Oral',
        packaging: PackagingInfo(
          size: 30,
          unit: 'tablets',
          packType: 'bottle',
        ),
      ),
      marketInfo: const MarketInfo(
        registeredCountries: ['Kenya', 'Uganda', 'Tanzania', 'Nigeria', 'South Africa'],
        manufacturers: [
          ManufacturerInfo(name: 'Cipla', country: 'India', type: 'generic'),
          ManufacturerInfo(name: 'Aurobindo', country: 'India', type: 'generic'),
        ],
        pricing: PricingInfo(
          averagePrice: 25.00,
          currency: 'USD',
          minPrice: 18.00,
          maxPrice: 35.00,
        ),
        availability: AvailabilityInfo(
          commonlyAvailable: true,
          stockoutRisk: StockoutRisk.low, // Usually well-supplied due to donor programs
        ),
      ),
      storage: const StorageRequirements(
        temperatureRange: '15-30°C',
        coldChainRequired: false,
        shelfLifeMonths: 24,
        tropicalStability: true,
      ),
      searchTerms: const SearchTerms(
        generic: ['efavirenz', 'tenofovir', 'emtricitabine', 'arv'],
        brands: ['atripla', 'tribuss', 'viraday'],
        conditions: ['hiv', 'aids', 'antiretroviral'],
        local: ['dawa ya ukimwi', 'arv', 'médicament vih'],
      ),
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    ),

    // MATERNAL HEALTH
    Medicine(
      id: 'iron-folic-acid',
      names: const MedicineNames(
        genericName: 'Iron + Folic Acid',
        brandNames: ['Ferrograd Folic', 'Iberet Folic', 'Feroglobin'],
        localNames: ['Dawa ya damu', 'Vitamine grossesse'],
        commonName: 'Iron and Folic Acid',
      ),
      africanClassification: const AfricanClassification(
        category: MedicineCategory.maternalHealth,
        subcategory: 'iron_supplements',
        whoEssentialList: true,
        priority: MedicinePriority.high,
        targetConditions: ['anemia', 'pregnancy', 'iron_deficiency'],
        ageGroups: ['adult', 'pregnant_women'],
      ),
      formulations: const MedicineFormulations(
        strength: '60mg/400mcg',
        dosageForm: 'Tablet',
        routeOfAdmin: 'Oral',
        packaging: PackagingInfo(
          size: 100,
          unit: 'tablets',
          packType: 'bottle',
        ),
      ),
      marketInfo: const MarketInfo(
        registeredCountries: ['Kenya', 'Uganda', 'Tanzania', 'Nigeria', 'Ghana'],
        manufacturers: [
          ManufacturerInfo(name: 'Abbott', country: 'USA', type: 'international'),
          ManufacturerInfo(name: 'Universal Corporation', country: 'Kenya', type: 'local'),
        ],
        pricing: PricingInfo(
          averagePrice: 2.50,
          currency: 'USD',
          minPrice: 1.50,
          maxPrice: 4.00,
        ),
        availability: AvailabilityInfo(
          commonlyAvailable: true,
          stockoutRisk: StockoutRisk.low,
        ),
      ),
      storage: const StorageRequirements(
        temperatureRange: '15-25°C',
        humidityRequirements: '<60%',
        coldChainRequired: false,
        shelfLifeMonths: 24,
        tropicalStability: true,
      ),
      searchTerms: const SearchTerms(
        generic: ['iron', 'folic acid', 'ferrous sulfate'],
        brands: ['ferrograd', 'iberet', 'feroglobin'],
        conditions: ['anemia', 'pregnancy', 'iron deficiency'],
        local: ['dawa ya damu', 'vitamine grossesse'],
      ),
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    ),

    // PEDIATRIC
    Medicine(
      id: 'paracetamol-syrup-120mg-5ml',
      names: const MedicineNames(
        genericName: 'Paracetamol',
        brandNames: ['Calpol', 'Tylenol', 'Panadol'],
        localNames: ['Dawa ya homa watoto', 'Sirop fièvre'],
        commonName: 'Paracetamol Syrup',
      ),
      africanClassification: const AfricanClassification(
        category: MedicineCategory.pediatric,
        subcategory: 'antipyretics',
        whoEssentialList: true,
        priority: MedicinePriority.high,
        targetConditions: ['fever', 'pain', 'malaria_fever'],
        ageGroups: ['pediatric', 'infant'],
      ),
      formulations: const MedicineFormulations(
        strength: '120mg/5ml',
        dosageForm: 'Syrup',
        routeOfAdmin: 'Oral',
        packaging: PackagingInfo(
          size: 100,
          unit: 'ml',
          packType: 'bottle',
        ),
      ),
      marketInfo: const MarketInfo(
        registeredCountries: ['Kenya', 'Uganda', 'Tanzania', 'Nigeria', 'Ghana', 'South Africa'],
        manufacturers: [
          ManufacturerInfo(name: 'GSK', country: 'UK', type: 'international'),
          ManufacturerInfo(name: 'Dawa Pharmaceuticals', country: 'Kenya', type: 'local'),
        ],
        pricing: PricingInfo(
          averagePrice: 3.00,
          currency: 'USD',
          minPrice: 2.00,
          maxPrice: 5.00,
        ),
        availability: AvailabilityInfo(
          commonlyAvailable: true,
          stockoutRisk: StockoutRisk.low,
        ),
      ),
      storage: const StorageRequirements(
        temperatureRange: '15-25°C',
        coldChainRequired: false,
        shelfLifeMonths: 24,
        tropicalStability: true,
      ),
      searchTerms: const SearchTerms(
        generic: ['paracetamol', 'acetaminophen'],
        brands: ['calpol', 'tylenol', 'panadol'],
        conditions: ['fever', 'pain', 'headache', 'malaria'],
        local: ['dawa ya homa', 'sirop fièvre', 'mti wa homa'],
      ),
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    ),

    // PAIN MANAGEMENT
    Medicine(
      id: 'ibuprofen-400mg',
      names: const MedicineNames(
        genericName: 'Ibuprofen',
        brandNames: ['Brufen', 'Advil', 'Nurofen'],
        localNames: ['Dawa ya maumivu', 'Anti-douleur'],
        commonName: 'Ibuprofen 400mg',
      ),
      africanClassification: const AfricanClassification(
        category: MedicineCategory.painManagement,
        subcategory: 'nsaids',
        whoEssentialList: true,
        priority: MedicinePriority.high,
        targetConditions: ['pain', 'inflammation', 'fever', 'headache'],
        ageGroups: ['adult', 'pediatric'],
      ),
      formulations: const MedicineFormulations(
        strength: '400mg',
        dosageForm: 'Tablet',
        routeOfAdmin: 'Oral',
        packaging: PackagingInfo(
          size: 100,
          unit: 'tablets',
          packType: 'blister',
        ),
      ),
      marketInfo: const MarketInfo(
        registeredCountries: ['Kenya', 'Uganda', 'Tanzania', 'Nigeria', 'Ghana'],
        manufacturers: [
          ManufacturerInfo(name: 'Abbott', country: 'USA', type: 'international'),
          ManufacturerInfo(name: 'Reckitt Benckiser', country: 'UK', type: 'international'),
          ManufacturerInfo(name: 'Beta Healthcare', country: 'Kenya', type: 'local'),
        ],
        pricing: PricingInfo(
          averagePrice: 4.00,
          currency: 'USD',
          minPrice: 2.50,
          maxPrice: 6.00,
        ),
        availability: AvailabilityInfo(
          commonlyAvailable: true,
          stockoutRisk: StockoutRisk.low,
        ),
      ),
      storage: const StorageRequirements(
        temperatureRange: '15-25°C',
        coldChainRequired: false,
        shelfLifeMonths: 36,
        tropicalStability: true,
      ),
      searchTerms: const SearchTerms(
        generic: ['ibuprofen', 'nsaid'],
        brands: ['brufen', 'advil', 'nurofen'],
        conditions: ['pain', 'fever', 'headache', 'inflammation'],
        local: ['dawa ya maumivu', 'anti-douleur'],
      ),
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    ),

    // GASTROINTESTINAL
    Medicine(
      id: 'ors-sachet',
      names: const MedicineNames(
        genericName: 'Oral Rehydration Salts',
        brandNames: ['ORS', 'Oralyte', 'Pedialyte'],
        localNames: ['Chumvi ya kuponya kiu', 'Sels de réhydratation'],
        commonName: 'ORS Sachet',
      ),
      africanClassification: const AfricanClassification(
        category: MedicineCategory.gastrointestinal,
        subcategory: 'oral_rehydration',
        whoEssentialList: true,
        priority: MedicinePriority.critical,
        targetConditions: ['diarrhea', 'dehydration', 'cholera', 'gastroenteritis'],
        ageGroups: ['pediatric', 'adult', 'infant'],
      ),
      formulations: const MedicineFormulations(
        strength: '20.5g',
        dosageForm: 'Powder for solution',
        routeOfAdmin: 'Oral',
        packaging: PackagingInfo(
          size: 1,
          unit: 'sachet',
          packType: 'sachet',
        ),
      ),
      marketInfo: const MarketInfo(
        registeredCountries: ['Kenya', 'Uganda', 'Tanzania', 'Nigeria', 'Ghana', 'Chad'],
        manufacturers: [
          ManufacturerInfo(name: 'WHO/UNICEF', country: 'International', type: 'international'),
          ManufacturerInfo(name: 'Shelys Pharmaceuticals', country: 'Kenya', type: 'local'),
        ],
        pricing: PricingInfo(
          averagePrice: 0.15,
          currency: 'USD',
          minPrice: 0.10,
          maxPrice: 0.25,
        ),
        availability: AvailabilityInfo(
          commonlyAvailable: true,
          stockoutRisk: StockoutRisk.low,
        ),
      ),
      storage: const StorageRequirements(
        temperatureRange: '15-30°C',
        humidityRequirements: '<75%',
        coldChainRequired: false,
        shelfLifeMonths: 24,
        tropicalStability: true,
      ),
      searchTerms: const SearchTerms(
        generic: ['ors', 'oral rehydration', 'electrolytes'],
        brands: ['oralyte', 'pedialyte'],
        conditions: ['diarrhea', 'dehydration', 'cholera'],
        local: ['chumvi ya kuponya kiu', 'sels de réhydratation'],
      ),
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    ),

    // RESPIRATORY
    Medicine(
      id: 'salbutamol-inhaler',
      names: const MedicineNames(
        genericName: 'Salbutamol',
        brandNames: ['Ventolin', 'Airomir', 'Salamol'],
        localNames: ['Dawa ya pumu', 'Inhalateur asthme'],
        commonName: 'Salbutamol Inhaler',
      ),
      africanClassification: const AfricanClassification(
        category: MedicineCategory.respiratory,
        subcategory: 'bronchodilators',
        whoEssentialList: true,
        priority: MedicinePriority.high,
        targetConditions: ['asthma', 'bronchospasm', 'copd'],
        ageGroups: ['adult', 'pediatric'],
      ),
      formulations: const MedicineFormulations(
        strength: '100mcg/dose',
        dosageForm: 'Inhaler',
        routeOfAdmin: 'Inhalation',
        packaging: PackagingInfo(
          size: 200,
          unit: 'doses',
          packType: 'inhaler',
        ),
      ),
      marketInfo: const MarketInfo(
        registeredCountries: ['Kenya', 'Uganda', 'Tanzania', 'Nigeria', 'South Africa'],
        manufacturers: [
          ManufacturerInfo(name: 'GSK', country: 'UK', type: 'international'),
          ManufacturerInfo(name: 'Cipla', country: 'India', type: 'generic'),
        ],
        pricing: PricingInfo(
          averagePrice: 8.00,
          currency: 'USD',
          minPrice: 5.00,
          maxPrice: 12.00,
        ),
        availability: AvailabilityInfo(
          commonlyAvailable: true,
          stockoutRisk: StockoutRisk.medium,
        ),
      ),
      storage: const StorageRequirements(
        temperatureRange: '15-25°C',
        coldChainRequired: false,
        shelfLifeMonths: 24,
        tropicalStability: false, // Sensitive to extreme heat
      ),
      searchTerms: const SearchTerms(
        generic: ['salbutamol', 'albuterol', 'bronchodilator'],
        brands: ['ventolin', 'airomir', 'salamol'],
        conditions: ['asthma', 'breathing', 'bronchospasm'],
        local: ['dawa ya pumu', 'inhalateur asthme'],
      ),
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    ),
  ];

  // Helper methods
  static List<Medicine> getMedicinesByCategory(MedicineCategory category) {
    return medicines.where((m) => m.africanClassification.category == category).toList();
  }

  static List<Medicine> getCriticalMedicines() {
    return medicines
        .where((m) => m.africanClassification.priority == MedicinePriority.critical)
        .toList();
  }

  static List<Medicine> getWhoEssentialMedicines() {
    return medicines
        .where((m) => m.africanClassification.whoEssentialList)
        .toList();
  }

  static List<Medicine> searchMedicines(String query) {
    final searchQuery = query.toLowerCase();
    return medicines.where((medicine) {
      return medicine.searchTerms.getAllTerms().any(
        (term) => term.toLowerCase().contains(searchQuery),
      ) ||
      medicine.names.genericName.toLowerCase().contains(searchQuery) ||
      medicine.names.commonName.toLowerCase().contains(searchQuery);
    }).toList();
  }

  // Get medicines for common African conditions
  static List<Medicine> getMedicinesForMalaria() {
    return medicines.where((m) => 
      m.africanClassification.targetConditions.contains('malaria')
    ).toList();
  }

  static List<Medicine> getMedicinesForChildren() {
    return medicines.where((m) => 
      m.africanClassification.ageGroups.contains('pediatric')
    ).toList();
  }

  static List<Medicine> getMedicinesForPregnantWomen() {
    return medicines.where((m) => 
      m.africanClassification.ageGroups.contains('pregnant_women')
    ).toList();
  }

  // Compatibility alias for UI
  static List<Medicine> get allMedicines => medicines;
}

// Compatibility class for UI
class EssentialMedicines {
  static List<Medicine> get allMedicines => EssentialAfricanMedicines.medicines;
}