import 'package:flutter/material.dart';
import '../../../models/pharmacy_inventory.dart';
import '../../../services/inventory_service.dart';
import 'add_medicine_screen.dart';
import '../exchanges/create_proposal_screen.dart';

class InventoryBrowserScreen extends StatefulWidget {
  const InventoryBrowserScreen({super.key});

  @override
  State<InventoryBrowserScreen> createState() => _InventoryBrowserScreenState();
}

class _InventoryBrowserScreenState extends State<InventoryBrowserScreen> {
  String selectedCategory = 'All';
  String searchQuery = '';
  bool showMyInventory = false;

  final List<String> categories = [
    'All',
    'Antimalarials',
    'Antibiotics', 
    'Antiretrovirals',
    'Maternal Health',
    'Pediatric Care',
    'Pain Management',
    'Cardiovascular',
    'Respiratory',
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(showMyInventory ? 'My Inventory' : 'Available Medicines'),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: Icon(showMyInventory ? Icons.public : Icons.inventory),
            onPressed: () {
              setState(() {
                showMyInventory = !showMyInventory;
              });
            },
          ),
          if (showMyInventory)
            IconButton(
              icon: const Icon(Icons.add),
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const AddMedicineScreen(),
                  ),
                );
              },
            ),
        ],
      ),
      body: Column(
        children: [
          // Search and Filter Bar
          Container(
            padding: const EdgeInsets.all(16.0),
            color: Colors.grey[50],
            child: Column(
              children: [
                // Search Bar
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
                      borderSide: BorderSide.none,
                    ),
                    filled: true,
                    fillColor: Colors.white,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  ),
                ),
                
                const SizedBox(height: 12),
                
                // Category Filter
                SizedBox(
                  height: 40,
                  child: ListView.builder(
                    scrollDirection: Axis.horizontal,
                    itemCount: categories.length,
                    itemBuilder: (context, index) {
                      final category = categories[index];
                      final isSelected = selectedCategory == category;
                      
                      return Padding(
                        padding: const EdgeInsets.only(right: 8.0),
                        child: FilterChip(
                          label: Text(category),
                          selected: isSelected,
                          onSelected: (selected) {
                            setState(() {
                              selectedCategory = category;
                            });
                          },
                          backgroundColor: Colors.white,
                          selectedColor: const Color(0xFF1976D2).withValues(alpha: 0.2),
                          checkmarkColor: const Color(0xFF1976D2),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
          
          // Inventory List
          Expanded(
            child: showMyInventory ? _buildMyInventory() : _buildAvailableMedicines(),
          ),
        ],
      ),
      floatingActionButton: showMyInventory 
          ? FloatingActionButton(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const AddMedicineScreen(),
                  ),
                );
              },
              backgroundColor: const Color(0xFF1976D2),
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
    );
  }

  Widget _buildMyInventory() {
    return StreamBuilder<List<PharmacyInventoryItem>>(
      stream: InventoryService.getMyInventory(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        if (snapshot.hasError) {
          return Center(child: Text('Error: ${snapshot.error}'));
        }

        final allItems = snapshot.data ?? [];
        final items = allItems.where((item) {
          // Apply filters
          final medicine = item.medicine;
          if (medicine == null) return false;
          
          if (searchQuery.isNotEmpty &&
              !medicine.name.toLowerCase().contains(searchQuery.toLowerCase()) &&
              !medicine.genericName.toLowerCase().contains(searchQuery.toLowerCase())) {
            return false;
          }
          
          if (selectedCategory != 'All' && medicine.category != selectedCategory) {
            return false;
          }
          
          return true;
        }).toList();

        if (items.isEmpty) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.inventory_2, size: 64, color: Colors.grey),
                const SizedBox(height: 16),
                Text(
                  searchQuery.isNotEmpty || selectedCategory != 'All' 
                      ? 'No medicines match your filters' 
                      : 'Your inventory is empty',
                  style: const TextStyle(fontSize: 18, color: Colors.grey),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Add medicines to start trading',
                  style: TextStyle(color: Colors.grey),
                ),
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => const AddMedicineScreen(),
                      ),
                    );
                  },
                  icon: const Icon(Icons.add),
                  label: const Text('Add Medicine'),
                ),
              ],
            ),
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16.0),
          itemCount: items.length,
          itemBuilder: (context, index) {
            final item = items[index];
            return _buildMyInventoryCard(item);
          },
        );
      },
    );
  }

  Widget _buildAvailableMedicines() {
    return StreamBuilder<List<PharmacyInventoryItem>>(
      stream: InventoryService.getAvailableMedicines(
        categoryFilter: selectedCategory,
        searchQuery: searchQuery.isEmpty ? null : searchQuery,
      ),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        if (snapshot.hasError) {
          return Center(child: Text('Error: ${snapshot.error}'));
        }

        final items = snapshot.data ?? [];

        if (items.isEmpty) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.search_off, size: 64, color: Colors.grey),
                const SizedBox(height: 16),
                Text(
                  searchQuery.isNotEmpty || selectedCategory != 'All'
                      ? 'No medicines match your search'
                      : 'No medicines available',
                  style: const TextStyle(fontSize: 18, color: Colors.grey),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Try adjusting your search or filters',
                  style: TextStyle(color: Colors.grey),
                ),
              ],
            ),
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16.0),
          itemCount: items.length,
          itemBuilder: (context, index) {
            final item = items[index];
            return _buildAvailableMedicineCard(item);
          },
        );
      },
    );
  }

  Widget _buildMyInventoryCard(PharmacyInventoryItem item) {
    final daysUntilExpiry = item.expirationDate?.difference(DateTime.now()).inDays;
    final isExpiringSoon = daysUntilExpiry != null && daysUntilExpiry <= 30;
    final isExpired = daysUntilExpiry != null && daysUntilExpiry < 0;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.medicine?.name ?? 'Unknown Medicine',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        item.medicine?.genericName ?? 'Unknown',
                        style: TextStyle(
                          color: Colors.grey[600],
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${item.medicine?.strength ?? ''} • ${item.medicine?.form ?? ''}',
                        style: TextStyle(
                          color: Colors.grey[500],
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: _getCategoryColor(item.medicine?.category ?? 'Unknown'),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    item.medicine?.category ?? 'Unknown',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 12),
            
            Row(
              children: [
                _buildInfoChip('${item.availableQuantity} ${item.packaging}', Colors.blue),
                const SizedBox(width: 8),
                if (item.batchNumber.isNotEmpty)
                  _buildInfoChip('Batch: ${item.batchNumber}', Colors.grey),
              ],
            ),
            
            if (item.expirationDate != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: isExpired 
                      ? Colors.red.shade50
                      : isExpiringSoon 
                          ? Colors.orange.shade50
                          : Colors.green.shade50,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  children: [
                    Icon(
                      isExpired 
                          ? Icons.error
                          : isExpiringSoon 
                              ? Icons.warning
                              : Icons.check_circle,
                      size: 16,
                      color: isExpired 
                          ? Colors.red
                          : isExpiringSoon 
                              ? Colors.orange
                              : Colors.green,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      isExpired 
                          ? 'Expired ${(-daysUntilExpiry)} days ago'
                          : isExpiringSoon 
                              ? 'Expires in $daysUntilExpiry days'
                              : 'Expires: ${item.expirationDate!.day}/${item.expirationDate!.month}/${item.expirationDate!.year}',
                      style: TextStyle(
                        fontSize: 12,
                        color: isExpired 
                            ? Colors.red.shade700
                            : isExpiringSoon 
                                ? Colors.orange.shade700
                                : Colors.green.shade700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
            
            if (item.notes.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'Notes: ${item.notes}',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey[600],
                  fontStyle: FontStyle.italic,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildAvailableMedicineCard(PharmacyInventoryItem item) {
    final daysUntilExpiry = item.expirationDate?.difference(DateTime.now()).inDays;
    final isExpiringSoon = daysUntilExpiry != null && daysUntilExpiry <= 30;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.medicine?.name ?? 'Unknown Medicine',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        item.medicine?.genericName ?? 'Unknown',
                        style: TextStyle(
                          color: Colors.grey[600],
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${item.medicine?.strength ?? ''} • ${item.medicine?.form ?? ''}',
                        style: TextStyle(
                          color: Colors.grey[500],
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                ElevatedButton(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => CreateProposalScreen(inventoryItem: item),
                      ),
                    );
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1976D2),
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('Make Offer'),
                ),
              ],
            ),
            
            const SizedBox(height: 12),
            
            Row(
              children: [
                _buildInfoChip('${item.availableQuantity} ${item.packaging} available', Colors.green),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: _getCategoryColor(item.medicine?.category ?? 'Unknown'),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    item.medicine?.category ?? 'Unknown',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                if (isExpiringSoon) ...[
                  const SizedBox(width: 8),
                  _buildInfoChip('Expires soon', Colors.orange),
                ],
              ],
            ),
            
            if (item.expirationDate != null) ...[
              const SizedBox(height: 8),
              Text(
                'Expires: ${item.expirationDate!.day}/${item.expirationDate!.month}/${item.expirationDate!.year}',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey[600],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildInfoChip(String label, MaterialColor color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color.shade700,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  MaterialColor _getCategoryColor(String category) {
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