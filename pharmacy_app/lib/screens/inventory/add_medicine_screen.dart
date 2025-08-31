import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../models/medicine.dart';
import '../../models/pharmacy_inventory.dart';
import '../../data/essential_medicines.dart';
import '../../services/inventory_service.dart';

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
                            
                            // Medicine selection
                            if (selectedMedicine == null) ...[
                              const Text(
                                'Choose from essential medicines:',
                                style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  color: Colors.grey,
                                ),
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
                                  color: const Color(0xFF1976D2).withOpacity(0.1),
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
                      color: Colors.grey.withOpacity(0.3),
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
      default:
        return Colors.grey;
    }
  }
}