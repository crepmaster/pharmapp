import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/pharmacy_user.dart';
import '../models/subscription.dart';
import '../services/pharmacy_management_service.dart';

class PharmacyManagementScreen extends StatefulWidget {
  const PharmacyManagementScreen({super.key});

  @override
  State<PharmacyManagementScreen> createState() => _PharmacyManagementScreenState();
}

class _PharmacyManagementScreenState extends State<PharmacyManagementScreen> {
  final TextEditingController _searchController = TextEditingController();
  final PharmacyManagementService _pharmacyService = PharmacyManagementService();
  
  String _searchQuery = '';
  String _statusFilter = 'all';
  String _subscriptionFilter = 'all';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              Text(
                'Pharmacy Management',
                style: GoogleFonts.inter(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const Spacer(),
              ElevatedButton.icon(
                onPressed: () {
                  _showCreatePharmacyDialog(context);
                },
                icon: const Icon(Icons.add),
                label: const Text('Add Pharmacy'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blue.shade600,
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Search and filters
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: [
                  // Search field
                  Expanded(
                    flex: 2,
                    child: TextField(
                      controller: _searchController,
                      decoration: const InputDecoration(
                        labelText: 'Search pharmacies...',
                        prefixIcon: Icon(Icons.search),
                        border: OutlineInputBorder(),
                      ),
                      onChanged: (value) {
                        setState(() {
                          _searchQuery = value.toLowerCase();
                        });
                      },
                    ),
                  ),
                  const SizedBox(width: 16),

                  // Status filter
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      value: _statusFilter,
                      decoration: const InputDecoration(
                        labelText: 'Status',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(value: 'all', child: Text('All Status')),
                        DropdownMenuItem(value: 'active', child: Text('Active')),
                        DropdownMenuItem(value: 'inactive', child: Text('Inactive')),
                        DropdownMenuItem(value: 'suspended', child: Text('Suspended')),
                      ],
                      onChanged: (value) {
                        setState(() {
                          _statusFilter = value!;
                        });
                      },
                    ),
                  ),
                  const SizedBox(width: 16),

                  // Subscription filter
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      value: _subscriptionFilter,
                      decoration: const InputDecoration(
                        labelText: 'Subscription',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(value: 'all', child: Text('All Plans')),
                        DropdownMenuItem(value: 'active', child: Text('Active')),
                        DropdownMenuItem(value: 'pending', child: Text('Pending')),
                        DropdownMenuItem(value: 'expired', child: Text('Expired')),
                      ],
                      onChanged: (value) {
                        setState(() {
                          _subscriptionFilter = value!;
                        });
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Pharmacy list
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: _pharmacyService.getPharmaciesStream(),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.error,
                          size: 64,
                          color: Colors.red.shade300,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'Error loading pharmacies',
                          style: GoogleFonts.inter(
                            fontSize: 18,
                            color: Colors.red.shade700,
                          ),
                        ),
                        Text(
                          snapshot.error.toString(),
                          style: GoogleFonts.inter(
                            fontSize: 14,
                            color: Colors.grey.shade600,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  );
                }

                if (!snapshot.hasData) {
                  return const Center(
                    child: CircularProgressIndicator(),
                  );
                }

                final pharmacies = snapshot.data!.docs
                    .map((doc) {
                      final data = doc.data() as Map<String, dynamic>;
                      return PharmacyUser.fromMap(data, doc.id);
                    })
                    .where((pharmacy) {
                      // Apply search filter
                      final matchesSearch = _searchQuery.isEmpty ||
                          pharmacy.pharmacyName.toLowerCase().contains(_searchQuery) ||
                          pharmacy.email.toLowerCase().contains(_searchQuery);

                      // Apply status filter
                      final matchesStatus = _statusFilter == 'all' ||
                          (_statusFilter == 'active' && pharmacy.isActive) ||
                          (_statusFilter == 'inactive' && !pharmacy.isActive);

                      return matchesSearch && matchesStatus;
                    })
                    .toList();

                if (pharmacies.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.local_pharmacy_outlined,
                          size: 64,
                          color: Colors.grey.shade300,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'No pharmacies found',
                          style: GoogleFonts.inter(
                            fontSize: 18,
                            color: Colors.grey.shade600,
                          ),
                        ),
                        if (_searchQuery.isNotEmpty || _statusFilter != 'all')
                          Text(
                            'Try adjusting your filters',
                            style: GoogleFonts.inter(
                              fontSize: 14,
                              color: Colors.grey.shade500,
                            ),
                          ),
                      ],
                    ),
                  );
                }

                return Card(
                  child: Column(
                    children: [
                      // Table header
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade50,
                          borderRadius: const BorderRadius.only(
                            topLeft: Radius.circular(12),
                            topRight: Radius.circular(12),
                          ),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              flex: 3,
                              child: Text(
                                'Pharmacy',
                                style: GoogleFonts.inter(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            Expanded(
                              flex: 2,
                              child: Text(
                                'Contact',
                                style: GoogleFonts.inter(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            Expanded(
                              child: Text(
                                'Status',
                                style: GoogleFonts.inter(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            Expanded(
                              child: Text(
                                'Subscription',
                                style: GoogleFonts.inter(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            Expanded(
                              child: Text(
                                'Actions',
                                style: GoogleFonts.inter(
                                  fontWeight: FontWeight.w600,
                                ),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ],
                        ),
                      ),
                      
                      // Table body
                      Expanded(
                        child: ListView.builder(
                          itemCount: pharmacies.length,
                          itemBuilder: (context, index) {
                            final pharmacy = pharmacies[index];
                            return _PharmacyListItem(
                              pharmacy: pharmacy,
                              onEdit: () => _editPharmacy(pharmacy),
                              onToggleStatus: () => _togglePharmacyStatus(pharmacy),
                              onViewDetails: () => _viewPharmacyDetails(pharmacy),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  void _showCreatePharmacyDialog(BuildContext context) {
    // TODO: Implement create pharmacy dialog
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Create pharmacy functionality coming soon'),
      ),
    );
  }

  void _editPharmacy(PharmacyUser pharmacy) {
    // TODO: Implement edit pharmacy dialog
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Edit ${pharmacy.pharmacyName} functionality coming soon'),
      ),
    );
  }

  void _togglePharmacyStatus(PharmacyUser pharmacy) async {
    try {
      await _pharmacyService.updatePharmacyStatus(
        pharmacy.uid,
        !pharmacy.isActive,
      );
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            pharmacy.isActive
                ? '${pharmacy.pharmacyName} deactivated'
                : '${pharmacy.pharmacyName} activated',
          ),
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to update status: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  void _viewPharmacyDetails(PharmacyUser pharmacy) {
    showDialog(
      context: context,
      builder: (context) => _PharmacyDetailsDialog(pharmacy: pharmacy),
    );
  }
}

class _PharmacyListItem extends StatelessWidget {
  final PharmacyUser pharmacy;
  final VoidCallback onEdit;
  final VoidCallback onToggleStatus;
  final VoidCallback onViewDetails;

  const _PharmacyListItem({
    required this.pharmacy,
    required this.onEdit,
    required this.onToggleStatus,
    required this.onViewDetails,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: Colors.grey.shade200,
            width: 1,
          ),
        ),
      ),
      child: Row(
        children: [
          // Pharmacy info
          Expanded(
            flex: 3,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  pharmacy.pharmacyName,
                  style: GoogleFonts.inter(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (pharmacy.address.isNotEmpty)
                  Text(
                    pharmacy.address,
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: Colors.grey.shade600,
                    ),
                  ),
                Text(
                  'Joined ${DateFormat('MMM dd, yyyy').format(pharmacy.createdAt)}',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    color: Colors.grey.shade500,
                  ),
                ),
              ],
            ),
          ),

          // Contact info
          Expanded(
            flex: 2,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  pharmacy.email,
                  style: GoogleFonts.inter(fontSize: 12),
                ),
                if (pharmacy.phoneNumber.isNotEmpty)
                  Text(
                    pharmacy.phoneNumber,
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: Colors.grey.shade600,
                    ),
                  ),
              ],
            ),
          ),

          // Status
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: pharmacy.isActive
                    ? Colors.green.shade50
                    : Colors.red.shade50,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                pharmacy.isActive ? 'Active' : 'Inactive',
                style: GoogleFonts.inter(
                  fontSize: 12,
                  color: pharmacy.isActive
                      ? Colors.green.shade700
                      : Colors.red.shade700,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ),

          // Subscription status
          Expanded(
            child: FutureBuilder<Subscription?>(
              future: _getPharmacySubscription(pharmacy.uid),
              builder: (context, snapshot) {
                if (!snapshot.hasData) {
                  return const SizedBox(
                    width: 12,
                    height: 12,
                    child: CircularProgressIndicator(strokeWidth: 1),
                  );
                }

                final subscription = snapshot.data;
                if (subscription == null) {
                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.orange.shade50,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      'No Plan',
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        color: Colors.orange.shade700,
                        fontWeight: FontWeight.w600,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  );
                }

                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: _getSubscriptionStatusColor(subscription.status)[50],
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    subscription.planDisplayName,
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: _getSubscriptionStatusColor(subscription.status)[700],
                      fontWeight: FontWeight.w600,
                    ),
                    textAlign: TextAlign.center,
                  ),
                );
              },
            ),
          ),

          // Actions
          Expanded(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  onPressed: onViewDetails,
                  icon: const Icon(Icons.visibility),
                  iconSize: 18,
                  tooltip: 'View Details',
                ),
                IconButton(
                  onPressed: onEdit,
                  icon: const Icon(Icons.edit),
                  iconSize: 18,
                  tooltip: 'Edit',
                ),
                IconButton(
                  onPressed: onToggleStatus,
                  icon: Icon(
                    pharmacy.isActive ? Icons.block : Icons.check_circle,
                  ),
                  iconSize: 18,
                  tooltip: pharmacy.isActive ? 'Deactivate' : 'Activate',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<Subscription?> _getPharmacySubscription(String pharmacyId) async {
    // TODO: Implement subscription lookup
    return null;
  }

  MaterialColor _getSubscriptionStatusColor(SubscriptionStatus status) {
    switch (status) {
      case SubscriptionStatus.active:
        return Colors.green;
      case SubscriptionStatus.pendingPayment:
      case SubscriptionStatus.pendingApproval:
        return Colors.orange;
      case SubscriptionStatus.expired:
      case SubscriptionStatus.cancelled:
        return Colors.red;
      case SubscriptionStatus.suspended:
        return Colors.grey;
    }
  }
}

class _PharmacyDetailsDialog extends StatelessWidget {
  final PharmacyUser pharmacy;

  const _PharmacyDetailsDialog({required this.pharmacy});

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: Container(
        width: 500,
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.local_pharmacy,
                  color: Colors.blue.shade600,
                ),
                const SizedBox(width: 12),
                Text(
                  'Pharmacy Details',
                  style: GoogleFonts.inter(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const Spacer(),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 24),

            _buildDetailRow('Pharmacy Name', pharmacy.pharmacyName),
            _buildDetailRow('Email', pharmacy.email),
            _buildDetailRow('Phone', pharmacy.phoneNumber.isNotEmpty ? pharmacy.phoneNumber : 'Not provided'),
            _buildDetailRow('Address', pharmacy.address.isNotEmpty ? pharmacy.address : 'Not provided'),
            _buildDetailRow('Status', pharmacy.isActive ? 'Active' : 'Inactive'),
            _buildDetailRow('Member Since', DateFormat('MMMM dd, yyyy').format(pharmacy.createdAt)),

            const SizedBox(height: 24),
            
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Close'),
                ),
                const SizedBox(width: 12),
                ElevatedButton(
                  onPressed: () {
                    Navigator.of(context).pop();
                    // TODO: Navigate to edit pharmacy screen
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.blue.shade600,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('Edit Pharmacy'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              '$label:',
              style: GoogleFonts.inter(
                fontWeight: FontWeight.w600,
                color: Colors.grey.shade700,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: GoogleFonts.inter(),
            ),
          ),
        ],
      ),
    );
  }
}