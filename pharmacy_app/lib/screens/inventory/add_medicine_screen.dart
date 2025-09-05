import 'package:flutter/material.dart';
import '../../models/medicine.dart';
import '../../models/barcode_medicine_data.dart';
import '../../data/essential_medicines.dart';
import '../../services/inventory_service.dart';
import '../../services/medicine_lookup_service.dart';
import '../../services/subscription_guard_service.dart';
import 'create_custom_medicine_screen.dart';
import 'barcode_scanner_screen.dart';

class AddMedicineScreen extends StatefulWidget {
  const AddMedicineScreen({super.key});

  @override
  State<AddMedicineScreen> createState() => _AddMedicineScreenState();
}

class _AddMedicineScreenState extends State<AddMedicineScreen> {
  final _formKey = GlobalKey<FormState>();
  
  Medicine? selectedMedicine;
  final quantityController = TextEditingController();
  final batchController = TextEditingController();
  final notesController = TextEditingController();
  
  DateTime? expirationDate;
  bool isLoading = false;
  String searchQuery = '';
  
  // Barcode-related fields
  BarcodeMedicineData? scannedMedicineData;
  bool isLookingUpBarcode = false;
  final MedicineLookupService _lookupService = MedicineLookupService();
  
  List<Medicine> get filteredMedicines {
    if (searchQuery.isEmpty) return EssentialMedicines.allMedicines;
    
    return EssentialMedicines.allMedicines.where((medicine) {
      return medicine.name.toLowerCase().contains(searchQuery.toLowerCase()) ||
             medicine.genericName.toLowerCase().contains(searchQuery.toLowerCase()) ||
             medicine.category.toLowerCase().contains(searchQuery.toLowerCase());
    }).toList();
  }

  @override
  void dispose() {
    quantityController.dispose();
    batchController.dispose();
    notesController.dispose();
    super.dispose();
  }

  /// Show subscription upgrade dialog
  void _showSubscriptionDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('🔒 Subscription Required'),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('You need an active subscription to add medicines to your inventory.'),
            SizedBox(height: 16),
            Text('Available Plans:', style: TextStyle(fontWeight: FontWeight.bold)),
            Text('• Basic ($10/month) - Up to 100 medicines'),
            Text('• Professional ($25/month) - Unlimited'),
            Text('• Enterprise ($50/month) - Multi-location'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).pop();
              // TODO: Navigate to subscription payment screen
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Subscription payment coming soon!'),
                  backgroundColor: Colors.blue,
                ),
              );
            },
            child: const Text('Upgrade Now'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Add Medicine'),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
      ),
      body: Form(
        key: _formKey,
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Medicine Selection
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Select Medicine',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 12),
                            
                            // Search medicines
                            TextField(
                              onChanged: (value) {
                                setState(() {
                                  searchQuery = value;
                                });
                              },
                              decoration: InputDecoration(
                                hintText: 'Search medicines...',
                                prefixIcon: const Icon(Icons.search),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 16, 
                                  vertical: 12,
                                ),
                              ),
                            ),
                            
                            const SizedBox(height: 16),
                            
                            // Barcode Scanner Button
                            Container(
                              width: double.infinity,
                              margin: const EdgeInsets.only(bottom: 16),
                              child: ElevatedButton.icon(
                                onPressed: isLookingUpBarcode ? null : _scanBarcode,
                                icon: isLookingUpBarcode 
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(strokeWidth: 2),
                                    )
                                  : const Icon(Icons.qr_code_scanner),
                                label: Text(isLookingUpBarcode 
                                  ? 'Looking up medicine...'
                                  : 'Scan Medicine Barcode'),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF1976D2),
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(vertical: 12),
                                ),
                              ),
                            ),
                            
                            // Show scanned medicine info if available
                            if (scannedMedicineData != null) ...[
                              Card(
                                color: scannedMedicineData!.isVerified 
                                  ? Colors.green.shade50 
                                  : Colors.orange.shade50,
                                child: Padding(
                                  padding: const EdgeInsets.all(12),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Icon(
                                            scannedMedicineData!.isVerified 
                                              ? Icons.verified_user 
                                              : Icons.warning,
                                            color: scannedMedicineData!.isVerified 
                                              ? Colors.green 
                                              : Colors.orange,
                                            size: 20,
                                          ),
                                          const SizedBox(width: 8),
                                          Text(
                                            scannedMedicineData!.isVerified 
                                              ? 'Medicine Verified'
                                              : 'Barcode Scanned - Please verify details',
                                            style: TextStyle(
                                              fontWeight: FontWeight.w600,
                                              color: scannedMedicineData!.isVerified 
                                                ? Colors.green.shade700
                                                : Colors.orange.shade700,
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 8),
                                      if (scannedMedicineData!.brandName != null)
                                        Text('Brand: ${scannedMedicineData!.brandName}'),
                                      if (scannedMedicineData!.genericName != null)
                                        Text('Generic: ${scannedMedicineData!.genericName}'),
                                      if (scannedMedicineData!.manufacturer != null)
                                        Text('Manufacturer: ${scannedMedicineData!.manufacturer}'),
                                      if (scannedMedicineData!.strength != null)
                                        Text('Strength: ${scannedMedicineData!.strength}'),
                                      if (scannedMedicineData!.gtin != null)
                                        Text('GTIN: ${scannedMedicineData!.gtin}'),
                                      const SizedBox(height: 8),
                                      Row(
                                        children: [
                                          TextButton(
                                            onPressed: _useScannedMedicine,
                                            child: const Text('Use This Medicine'),
                                          ),
                                          TextButton(
                                            onPressed: _clearScannedMedicine,
                                            child: const Text('Clear'),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              const SizedBox(height: 16),
                            ],
                            
                            // Medicine selection
                            if (selectedMedicine == null && scannedMedicineData == null) ...[
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  const Text(
                                    'Choose from essential medicines:',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      color: Colors.grey,
                                    ),
                                  ),
                                  TextButton.icon(
                                    onPressed: _createCustomMedicine,
                                    icon: const Icon(Icons.add_circle_outline),
                                    label: const Text('Create New'),
                                    style: TextButton.styleFrom(
                                      foregroundColor: const Color(0xFF1976D2),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              SizedBox(
                                height: 200,
                                child: ListView.builder(
                                  itemCount: filteredMedicines.length,
                                  itemBuilder: (context, index) {
                                    final medicine = filteredMedicines[index];
                                    return ListTile(
                                      title: Text(medicine.name),
                                      subtitle: Text(
                                        '${medicine.genericName} • ${medicine.strength} • ${medicine.category}',
                                      ),
                                      onTap: () {
                                        setState(() {
                                          selectedMedicine = medicine;
                                        });
                                      },
                                      leading: Container(
                                        width: 12,
                                        height: 12,
                                        decoration: BoxDecoration(
                                          color: _getCategoryColor(medicine.category),
                                          shape: BoxShape.circle,
                                        ),
                                      ),
                                    );
                                  },
                                ),
                              ),
                            ] else ...[
                              // Selected medicine display
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF1976D2).withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: const Color(0xFF1976D2)),
                                ),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            selectedMedicine!.name,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.bold,
                                              fontSize: 16,
                                            ),
                                          ),
                                          Text(
                                            selectedMedicine!.genericName,
                                            style: TextStyle(color: Colors.grey[600]),
                                          ),
                                          Text(
                                            '${selectedMedicine!.strength} • ${selectedMedicine!.form}',
                                            style: TextStyle(
                                              color: Colors.grey[500], 
                                              fontSize: 12,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    TextButton(
                                      onPressed: () {
                                        setState(() {
                                          selectedMedicine = null;
                                          searchQuery = '';
                                        });
                                      },
                                      child: const Text('Change'),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                    
                    if (selectedMedicine != null) ...[
                      const SizedBox(height: 16),
                      
                      // Inventory Details
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Inventory Details',
                                style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 16),
                              
                              // Quantity
                              TextFormField(
                                controller: quantityController,
                                decoration: const InputDecoration(
                                  labelText: 'Quantity Available *',
                                  hintText: 'e.g., 50 boxes, 100 tablets',
                                  border: OutlineInputBorder(),
                                ),
                                keyboardType: TextInputType.number,
                                validator: (value) {
                                  if (value == null || value.isEmpty) {
                                    return 'Quantity is required';
                                  }
                                  if (int.tryParse(value) == null || int.parse(value) <= 0) {
                                    return 'Enter a valid quantity';
                                  }
                                  return null;
                                },
                              ),
                              
                              const SizedBox(height: 16),
                              
                              // Expiration Date
                              InkWell(
                                onTap: _selectExpirationDate,
                                child: Container(
                                  padding: const EdgeInsets.all(16),
                                  decoration: BoxDecoration(
                                    border: Border.all(color: Colors.grey),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Row(
                                    children: [
                                      const Icon(Icons.calendar_today, color: Colors.grey),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Text(
                                          expirationDate == null
                                              ? 'Select Expiration Date *'
                                              : 'Expires: ${expirationDate!.day}/${expirationDate!.month}/${expirationDate!.year}',
                                          style: TextStyle(
                                            color: expirationDate == null 
                                                ? Colors.grey[600] 
                                                : Colors.black,
                                          ),
                                        ),
                                      ),
                                      if (expirationDate != null)
                                        IconButton(
                                          icon: const Icon(Icons.clear, size: 20),
                                          onPressed: () {
                                            setState(() {
                                              expirationDate = null;
                                            });
                                          },
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                              
                              const SizedBox(height: 16),
                              
                              // Batch Number (Optional)
                              TextFormField(
                                controller: batchController,
                                decoration: const InputDecoration(
                                  labelText: 'Batch Number (Optional)',
                                  hintText: 'e.g., BT2024001',
                                  border: OutlineInputBorder(),
                                ),
                              ),
                              
                              const SizedBox(height: 16),
                              
                              // Notes (Optional)
                              TextFormField(
                                controller: notesController,
                                decoration: const InputDecoration(
                                  labelText: 'Notes (Optional)',
                                  hintText: 'Special storage conditions, quality notes, etc.',
                                  border: OutlineInputBorder(),
                                ),
                                maxLines: 3,
                              ),
                            ],
                          ),
                        ),
                      ),
                      
                      const SizedBox(height: 16),
                      
                      // Important Note
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.amber.shade50,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.amber.shade200),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.info_outline, color: Colors.amber.shade700),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'No upfront pricing required! Other pharmacies will make proposals, and you can choose the best offers.',
                                style: TextStyle(
                                  color: Colors.amber.shade800,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            
            // Add Medicine Button
            if (selectedMedicine != null)
              Container(
                padding: const EdgeInsets.all(16.0),
                decoration: BoxDecoration(
                  color: Colors.white,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.grey.withValues(alpha: 0.3),
                      spreadRadius: 1,
                      blurRadius: 5,
                      offset: const Offset(0, -3),
                    ),
                  ],
                ),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: isLoading ? null : _addMedicine,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF1976D2),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    child: isLoading
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : const Text(
                            'Add to Inventory',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _selectExpirationDate() async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now().add(const Duration(days: 365)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 3650)), // 10 years
      helpText: 'Select Expiration Date',
    );
    
    if (picked != null) {
      setState(() {
        expirationDate = picked;
      });
    }
  }

  Future<void> _addMedicine() async {
    if (!_formKey.currentState!.validate()) return;
    if (selectedMedicine == null) return;
    if (expirationDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select an expiration date'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    // 🔒 CRITICAL SUBSCRIPTION CHECK
    final canCreate = await SubscriptionGuardService.canCreateInventoryItem();
    if (!canCreate) {
      final status = await SubscriptionGuardService.getSubscriptionStatus();
      final message = SubscriptionGuardService.getSubscriptionStatusMessage(status);
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('❌ Access Denied: $message'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 5),
            action: SnackBarAction(
              label: 'Upgrade',
              textColor: Colors.white,
              onPressed: () => _showSubscriptionDialog(),
            ),
          ),
        );
      }
      return;
    }

    setState(() {
      isLoading = true;
    });

    try {
      await InventoryService.addMedicineToInventory(
        medicine: selectedMedicine!,
        quantity: int.parse(quantityController.text),
        expirationDate: expirationDate!,
        batchNumber: batchController.text.trim(),
        notes: notesController.text.trim(),
      );

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${selectedMedicine!.name} added to inventory!'),
          backgroundColor: Colors.green,
        ),
      );

      Navigator.pop(context);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to add medicine: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      setState(() {
        isLoading = false;
      });
    }
  }

  Future<void> _createCustomMedicine() async {
    final result = await Navigator.push<Medicine>(
      context,
      MaterialPageRoute(
        builder: (context) => const CreateCustomMedicineScreen(),
      ),
    );
    
    if (result != null) {
      setState(() {
        selectedMedicine = result;
      });
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${result.name} created and selected!'),
          backgroundColor: Colors.green,
        ),
      );
    }
  }

  // Barcode scanning methods
  Future<void> _scanBarcode() async {
    try {
      final result = await Navigator.push<BarcodeMedicineData>(
        context,
        MaterialPageRoute(
          builder: (context) => const BarcodeScannerScreen(),
        ),
      );

      if (result != null) {
        setState(() {
          isLookingUpBarcode = true;
        });

        // Look up medicine information from APIs
        final medicineData = await _lookupService.lookupMedicine(result);

        setState(() {
          scannedMedicineData = medicineData;
          isLookingUpBarcode = false;
        });

        // Auto-fill expiry date if available from GS1 DataMatrix
        if (medicineData.hasExpiryInfo && medicineData.expiryDate != null) {
          setState(() {
            expirationDate = medicineData.expiryDate;
          });
        }

        // Auto-fill batch/lot number if available
        if (medicineData.hasLotInfo && medicineData.lotNumber != null) {
          batchController.text = medicineData.lotNumber!;
        }
      }
    } catch (e) {
      setState(() {
        isLookingUpBarcode = false;
      });
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error scanning barcode: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _useScannedMedicine() {
    if (scannedMedicineData == null) return;

    // Create a Medicine object from scanned data
    final scannedMedicine = Medicine(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      name: scannedMedicineData!.brandName ?? 
             scannedMedicineData!.genericName ?? 
             'Unknown Medicine',
      genericName: scannedMedicineData!.genericName ?? 
                   scannedMedicineData!.brandName ?? 
                   'Unknown',
      category: 'Scanned Medicines',
      strength: scannedMedicineData!.strength ?? 'Unknown',
      dosageForm: scannedMedicineData!.dosageForm ?? 'Unknown',
      manufacturer: scannedMedicineData!.manufacturer ?? 'Unknown',
      description: 'Medicine scanned from barcode (GTIN: ${scannedMedicineData!.gtin})',
      therapeuticClass: 'Unknown',
      indications: ['Scanned from barcode'],
      contraindications: [],
      sideEffects: [],
      africanClassification: 'Unknown',
      createdAt: DateTime.now(),
      formulations: [],
      marketInfo: {},
      names: {
        'en': scannedMedicineData!.brandName ?? scannedMedicineData!.genericName ?? 'Unknown Medicine',
      },
      searchTerms: [
        (scannedMedicineData!.brandName ?? '').toLowerCase(),
        (scannedMedicineData!.genericName ?? '').toLowerCase(),
        'scanned', 'barcode',
      ].where((term) => term.isNotEmpty).toList(),
      storage: 'Store as per manufacturer instructions',
      updatedAt: DateTime.now(),
    );

    setState(() {
      selectedMedicine = scannedMedicine;
      // Keep scanned data for reference
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Using scanned medicine: ${scannedMedicine.name}'),
        backgroundColor: Colors.green,
      ),
    );
  }

  void _clearScannedMedicine() {
    setState(() {
      scannedMedicineData = null;
    });
  }

  Color _getCategoryColor(String category) {
    switch (category.toLowerCase()) {
      case 'antimalarials':
        return Colors.green;
      case 'antibiotics':
        return Colors.blue;
      case 'antiretrovirals':
        return Colors.purple;
      case 'maternal health':
        return Colors.pink;
      case 'pediatric care':
        return Colors.orange;
      case 'pain management':
        return Colors.red;
      case 'cardiovascular':
        return Colors.indigo;
      case 'respiratory':
        return Colors.teal;
      case 'scanned medicines':
        return Colors.deepPurple;
      default:
        return Colors.grey;
    }
  }
}