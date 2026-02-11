import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../models/medicine.dart';

class CreateCustomMedicineScreen extends StatefulWidget {
  const CreateCustomMedicineScreen({super.key});

  @override
  State<CreateCustomMedicineScreen> createState() => _CreateCustomMedicineScreenState();
}

class _CreateCustomMedicineScreenState extends State<CreateCustomMedicineScreen> {
  final _formKey = GlobalKey<FormState>();
  
  // Basic Information
  final brandNameController = TextEditingController();
  final genericNameController = TextEditingController();
  final strengthController = TextEditingController();
  final dosageFormController = TextEditingController();
  final manufacturerController = TextEditingController();
  final descriptionController = TextEditingController();
  
  // Selected values
  MedicineCategory selectedCategory = MedicineCategory.antibiotics;
  String selectedDosageForm = 'Tablet';
  String selectedRouteOfAdmin = 'Oral';
  
  bool isLoading = false;
  
  final List<String> dosageForms = [
    'Tablet', 'Capsule', 'Syrup', 'Injection', 'Drops', 'Cream', 'Ointment', 'Suspension'
  ];
  
  final List<String> routesOfAdmin = [
    'Oral', 'Topical', 'Intramuscular', 'Intravenous', 'Subcutaneous', 'Inhalation'
  ];

  @override
  void dispose() {
    brandNameController.dispose();
    genericNameController.dispose();
    strengthController.dispose();
    dosageFormController.dispose();
    manufacturerController.dispose();
    descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Create New Medicine'),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
      ),
      body: Form(
        key: _formKey,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header info
              Card(
                color: Colors.blue.shade50,
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline, color: Colors.blue.shade700),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Create Custom Medicine',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: Colors.blue.shade700,
                              ),
                            ),
                            const Text(
                              'Add a medicine not in our database for your inventory',
                              style: TextStyle(fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              
              const SizedBox(height: 24),
              
              // Basic Medicine Information
              const Text(
                'Basic Information',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              
              // Brand Name (required)
              TextFormField(
                controller: brandNameController,
                decoration: const InputDecoration(
                  labelText: 'Brand Name *',
                  hintText: 'e.g., Augmentin, Panadol, Doliprane',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.medical_services),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Brand name is required';
                  }
                  return null;
                },
              ),
              
              const SizedBox(height: 16),
              
              // Generic Name (required)
              TextFormField(
                controller: genericNameController,
                decoration: const InputDecoration(
                  labelText: 'Generic Name *',
                  hintText: 'e.g., Amoxicillin/Clavulanic acid, Paracetamol',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.science),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Generic name is required';
                  }
                  return null;
                },
              ),
              
              const SizedBox(height: 16),
              
              // Strength (required)
              TextFormField(
                controller: strengthController,
                decoration: const InputDecoration(
                  labelText: 'Strength *',
                  hintText: 'e.g., 500mg, 250mg/5ml, 1g',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.fitness_center),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Strength is required';
                  }
                  return null;
                },
              ),
              
              const SizedBox(height: 16),
              
              // Category Dropdown
              DropdownButtonFormField<MedicineCategory>(
                initialValue: selectedCategory,
                decoration: const InputDecoration(
                  labelText: 'Medicine Category',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.category),
                ),
                items: MedicineCategory.values.map((category) {
                  return DropdownMenuItem(
                    value: category,
                    child: Text(category.displayName),
                  );
                }).toList(),
                onChanged: (value) {
                  setState(() {
                    selectedCategory = value!;
                  });
                },
              ),
              
              const SizedBox(height: 16),
              
              // Dosage Form Dropdown
              DropdownButtonFormField<String>(
                initialValue: selectedDosageForm,
                decoration: const InputDecoration(
                  labelText: 'Dosage Form',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.medication),
                ),
                items: dosageForms.map((form) {
                  return DropdownMenuItem(
                    value: form,
                    child: Text(form),
                  );
                }).toList(),
                onChanged: (value) {
                  setState(() {
                    selectedDosageForm = value!;
                  });
                },
              ),
              
              const SizedBox(height: 16),
              
              // Route of Administration
              DropdownButtonFormField<String>(
                initialValue: selectedRouteOfAdmin,
                decoration: const InputDecoration(
                  labelText: 'Route of Administration',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.route),
                ),
                items: routesOfAdmin.map((route) {
                  return DropdownMenuItem(
                    value: route,
                    child: Text(route),
                  );
                }).toList(),
                onChanged: (value) {
                  setState(() {
                    selectedRouteOfAdmin = value!;
                  });
                },
              ),
              
              const SizedBox(height: 24),
              
              // Optional Information
              const Text(
                'Optional Information',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              
              // Manufacturer
              TextFormField(
                controller: manufacturerController,
                decoration: const InputDecoration(
                  labelText: 'Manufacturer',
                  hintText: 'e.g., GSK, Pfizer, Sanofi',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.business),
                ),
              ),
              
              const SizedBox(height: 16),
              
              // Description/Notes
              TextFormField(
                controller: descriptionController,
                decoration: const InputDecoration(
                  labelText: 'Description/Notes',
                  hintText: 'Additional information about this medicine',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.notes),
                ),
                maxLines: 3,
              ),
              
              const SizedBox(height: 32),
              
              // Create Medicine Button
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: isLoading ? null : _createMedicine,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1976D2),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: isLoading
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.add_circle),
                            SizedBox(width: 8),
                            Text(
                              'Create Medicine',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                ),
              ),
              
              const SizedBox(height: 16),
              
              // Info about what happens next
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.green.shade200),
                ),
                child: Row(
                  children: [
                    Icon(Icons.check_circle, color: Colors.green.shade700),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Text(
                        'After creation, you\'ll be able to add this medicine to your inventory with quantity and expiration details.',
                        style: TextStyle(fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _createMedicine() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      isLoading = true;
    });

    try {
      // Create custom medicine object
      final medicine = Medicine(
        id: '', // Will be generated by Firestore
        names: MedicineNames(
          genericName: genericNameController.text.trim(),
          brandNames: [brandNameController.text.trim()],
          commonName: brandNameController.text.trim(),
        ),
        africanClassification: AfricanClassification(
          category: selectedCategory,
          subcategory: 'Custom Medicine',
          priority: MedicinePriority.medium,
          whoEssentialList: false,
        ),
        formulations: MedicineFormulations(
          strength: strengthController.text.trim(),
          dosageForm: selectedDosageForm,
          routeOfAdmin: selectedRouteOfAdmin,
          packaging: const PackagingInfo(
            size: 1,
            unit: 'unit',
            packType: 'standard',
          ),
        ),
        marketInfo: MarketInfo(
          manufacturers: manufacturerController.text.trim().isNotEmpty
              ? [ManufacturerInfo(
                  name: manufacturerController.text.trim(),
                  country: 'Unknown',
                  type: 'commercial',
                )]
              : [],
          pricing: const PricingInfo(
            averagePrice: 0,
            currency: 'XAF',
            minPrice: 0,
            maxPrice: 0,
          ),
          availability: const AvailabilityInfo(
            commonlyAvailable: true,
            stockoutRisk: StockoutRisk.low,
          ),
        ),
        storage: const StorageRequirements(
          temperatureRange: '15-30°C',
          shelfLifeMonths: 24,
          coldChainRequired: false,
          tropicalStability: true,
        ),
        searchTerms: SearchTerms(
          generic: [genericNameController.text.trim().toLowerCase()],
          brands: [brandNameController.text.trim().toLowerCase()],
          local: const [],
          conditions: const [],
        ),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        isActive: true,
      );

      // Save to Firestore medicines collection
      final docRef = await FirebaseFirestore.instance
          .collection('medicines')
          .add(medicine.toFirestore());

      // Create updated medicine object with the generated ID
      final createdMedicine = medicine.copyWith(id: docRef.id);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${brandNameController.text.trim()} created successfully!'),
          backgroundColor: Colors.green,
        ),
      );

      // Return the created medicine to the previous screen
      if (!mounted) return;
      Navigator.pop(context, createdMedicine);
    } catch (e) {
      // Debug statement removed for production security
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to create medicine: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      setState(() {
        isLoading = false;
      });
    }
  }
}