import 'package:flutter/material.dart';
import '../../../models/pharmacy_inventory.dart';
import '../../../services/inventory_service.dart';
import 'add_medicine_screen.dart';
import '../exchanges/create_proposal_screen.dart';
import '../requests/medicine_requests_screen.dart';

class InventoryBrowserScreen extends StatefulWidget {
  const InventoryBrowserScreen({super.key});

  @override
  State<InventoryBrowserScreen> createState() => _InventoryBrowserScreenState();
}

class _InventoryBrowserScreenState extends State<InventoryBrowserScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  String selectedCategory = 'All';
  String searchQuery = '';
  final Set<String> _togglingItems = {};

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
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      setState(() {}); // Rebuild to toggle FAB visibility
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  bool get _isMyInventoryTab => _tabController.index == 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Inventory'),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
        actions: [
          if (_isMyInventoryTab)
            IconButton(
              icon: const Icon(Icons.add),
              onPressed: _navigateToAddMedicine,
            ),
          IconButton(
            icon: const Icon(Icons.assignment),
            tooltip: 'Medicine Requests',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => const MedicineRequestsScreen(),
              ),
            ),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          tabs: const [
            Tab(text: 'My Inventory'),
            Tab(text: 'Marketplace'),
          ],
        ),
      ),
      body: Column(
        children: [
          // Search and Filter Bar
          Container(
            padding: const EdgeInsets.all(16.0),
            color: Colors.grey[50],
            child: Column(
              children: [
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
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  ),
                ),
                const SizedBox(height: 12),
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
                          selectedColor:
                              const Color(0xFF1976D2).withOpacity(0.2),
                          checkmarkColor: const Color(0xFF1976D2),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),

          // Tab content
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildMyInventory(),
                _buildMarketplace(),
              ],
            ),
          ),
        ],
      ),
      floatingActionButton: _isMyInventoryTab
          ? FloatingActionButton(
              onPressed: _navigateToAddMedicine,
              backgroundColor: const Color(0xFF1976D2),
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
    );
  }

  void _navigateToAddMedicine() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => const AddMedicineScreen(),
      ),
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
          final medicine = item.medicine;
          if (medicine == null) return false;

          if (searchQuery.isNotEmpty &&
              !medicine.name
                  .toLowerCase()
                  .contains(searchQuery.toLowerCase()) &&
              !medicine.genericName
                  .toLowerCase()
                  .contains(searchQuery.toLowerCase())) {
            return false;
          }

          if (selectedCategory != 'All' &&
              medicine.category != selectedCategory) {
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
                  onPressed: _navigateToAddMedicine,
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

  Widget _buildMarketplace() {
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
                const Icon(Icons.storefront, size: 64, color: Colors.grey),
                const SizedBox(height: 16),
                Text(
                  searchQuery.isNotEmpty || selectedCategory != 'All'
                      ? 'No medicines match your search'
                      : 'No medicines available in your city',
                  style: const TextStyle(fontSize: 18, color: Colors.grey),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Other pharmacies in your city will appear here',
                  style: TextStyle(color: Colors.grey),
                ),
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const MedicineRequestsScreen(),
                    ),
                  ),
                  icon: const Icon(Icons.assignment),
                  label: const Text('Request Medicine'),
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
    final daysUntilExpiry =
        item.expirationDate?.difference(DateTime.now()).inDays;
    final isExpiringSoon = daysUntilExpiry != null && daysUntilExpiry <= 30;
    final isExpired = daysUntilExpiry != null && daysUntilExpiry < 0;
    final isPublished = item.availabilitySettings.availableForExchange;

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
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: _getCategoryColor(
                            item.medicine?.category ?? 'Unknown'),
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
                    const SizedBox(height: 6),
                    _buildVisibilityToggle(item, isPublished),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _buildInfoChip(
                    '${item.availableQuantity} ${item.packaging}', Colors.blue),
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
    final daysUntilExpiry =
        item.expirationDate?.difference(DateTime.now()).inDays;
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
                        builder: (context) =>
                            CreateProposalScreen(inventoryItem: item),
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
                _buildInfoChip(
                    '${item.availableQuantity} ${item.packaging} available',
                    Colors.green),
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color:
                        _getCategoryColor(item.medicine?.category ?? 'Unknown'),
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

  /// Ask the pharmacy how many units to publish on the Marketplace.
  /// Returns null if the user cancels, otherwise an integer in [1, item.availableQuantity].
  Future<int?> _askPublishQuantity(PharmacyInventoryItem item) async {
    final controller = TextEditingController(text: item.availableQuantity.toString());
    final formKey = GlobalKey<FormState>();
    return showDialog<int>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Publish to Marketplace'),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'You have ${item.availableQuantity} units of ${item.medicine?.name ?? "this medicine"} in stock.',
                style: const TextStyle(fontSize: 13),
              ),
              const SizedBox(height: 12),
              Text(
                'How many units do you want to offer on the Marketplace?',
                style: TextStyle(
                    fontSize: 12, color: Colors.grey.shade700),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: controller,
                keyboardType: TextInputType.number,
                autofocus: true,
                decoration: InputDecoration(
                  labelText: 'Quantity to publish',
                  helperText: 'Max: ${item.availableQuantity}',
                  border: const OutlineInputBorder(),
                ),
                validator: (v) {
                  final n = int.tryParse(v?.trim() ?? '');
                  if (n == null || n <= 0) return 'Enter a positive number';
                  if (n > item.availableQuantity) {
                    return 'Cannot exceed available stock (${item.availableQuantity})';
                  }
                  return null;
                },
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, null),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              if (formKey.currentState!.validate()) {
                Navigator.pop(ctx, int.parse(controller.text.trim()));
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.blue.shade600,
              foregroundColor: Colors.white,
            ),
            child: const Text('Publish'),
          ),
        ],
      ),
    );
  }

  Widget _buildVisibilityToggle(
      PharmacyInventoryItem item, bool isPublished) {
    final isToggling = _togglingItems.contains(item.id);
    final label = isPublished ? 'Published — tap to unpublish' : 'Publish to Marketplace';
    return Tooltip(
      message: isPublished
          ? 'This item is visible to other pharmacies. Tap to make it private.'
          : 'This item is private. Tap to publish it on the Marketplace.',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: isToggling
              ? null
              : () async {
                  // If publishing, ask the pharmacy how many units to offer.
                  int? maxQty;
                  if (!isPublished) {
                    maxQty = await _askPublishQuantity(item);
                    if (maxQty == null) return; // User cancelled
                  }
                  setState(() => _togglingItems.add(item.id));
                  try {
                    await InventoryService.toggleAvailability(
                      inventoryId: item.id,
                      available: !isPublished,
                      maxExchangeQuantity: maxQty,
                    );
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(!isPublished
                              ? (maxQty == item.availableQuantity
                                  ? 'Published on Marketplace (full stock)'
                                  : 'Published on Marketplace ($maxQty units)')
                              : 'Removed from Marketplace'),
                          backgroundColor:
                              !isPublished ? Colors.green : Colors.grey.shade700,
                          duration: const Duration(seconds: 2),
                        ),
                      );
                    }
                  } catch (e) {
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('Failed to update: $e'),
                          backgroundColor: Colors.red,
                        ),
                      );
                    }
                  } finally {
                    if (mounted) {
                      setState(() => _togglingItems.remove(item.id));
                    }
                  }
                },
          child: Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: isPublished ? Colors.green.shade600 : Colors.blue.shade600,
              borderRadius: BorderRadius.circular(20),
              boxShadow: [
                BoxShadow(
                  color: (isPublished ? Colors.green : Colors.blue)
                      .withOpacity(0.25),
                  blurRadius: 4,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: isToggling
                ? const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor:
                          AlwaysStoppedAnimation<Color>(Colors.white),
                    ),
                  )
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        isPublished
                            ? Icons.check_circle
                            : Icons.publish,
                        size: 14,
                        color: Colors.white,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        label,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }

  Widget _buildInfoChip(String label, MaterialColor color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
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
