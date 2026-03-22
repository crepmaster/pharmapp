import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/courier_user.dart';
import '../services/courier_management_service.dart';

class CourierManagementScreen extends StatefulWidget {
  final List<String> countryScopes;
  final bool isSuperAdmin;

  const CourierManagementScreen({
    super.key,
    this.countryScopes = const [],
    this.isSuperAdmin = false,
  });

  @override
  State<CourierManagementScreen> createState() =>
      _CourierManagementScreenState();
}

class _CourierManagementScreenState extends State<CourierManagementScreen> {
  final TextEditingController _searchController = TextEditingController();
  final CourierManagementService _courierService = CourierManagementService();

  String _searchQuery = '';
  String _statusFilter = 'all';

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
          Text(
            'Courier Management',
            style: GoogleFonts.inter(
              fontSize: 24,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 24),

          // Search and filters
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: [
                  Expanded(
                    flex: 2,
                    child: TextField(
                      controller: _searchController,
                      decoration: const InputDecoration(
                        labelText: 'Search couriers...',
                        prefixIcon: Icon(Icons.search),
                        border: OutlineInputBorder(),
                      ),
                      onChanged: (value) {
                        setState(() => _searchQuery = value.toLowerCase());
                      },
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _statusFilter,
                      decoration: const InputDecoration(
                        labelText: 'Status',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(
                            value: 'all', child: Text('All Status')),
                        DropdownMenuItem(
                            value: 'active', child: Text('Active')),
                        DropdownMenuItem(
                            value: 'inactive', child: Text('Inactive')),
                      ],
                      onChanged: (value) {
                        setState(() => _statusFilter = value!);
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Courier list
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: _courierService.getScopedCouriersStream(
                  widget.countryScopes,
                  isSuperAdmin: widget.isSuperAdmin),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.error,
                            size: 64, color: Colors.red.shade300),
                        const SizedBox(height: 16),
                        Text('Error loading couriers',
                            style: GoogleFonts.inter(
                                fontSize: 18, color: Colors.red.shade700)),
                        Text(snapshot.error.toString(),
                            style: GoogleFonts.inter(
                                fontSize: 14, color: Colors.grey.shade600),
                            textAlign: TextAlign.center),
                      ],
                    ),
                  );
                }

                if (!snapshot.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }

                final couriers = snapshot.data!.docs
                    .map((doc) {
                      final data = doc.data() as Map<String, dynamic>;
                      return CourierUser.fromMap(data, doc.id);
                    })
                    .where((c) {
                      final matchesSearch = _searchQuery.isEmpty ||
                          c.fullName.toLowerCase().contains(_searchQuery) ||
                          c.email.toLowerCase().contains(_searchQuery) ||
                          c.phone.toLowerCase().contains(_searchQuery);
                      final matchesStatus = _statusFilter == 'all' ||
                          (_statusFilter == 'active' && c.isActive) ||
                          (_statusFilter == 'inactive' && !c.isActive);
                      return matchesSearch && matchesStatus;
                    })
                    .toList();

                if (couriers.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.delivery_dining,
                            size: 64, color: Colors.grey.shade300),
                        const SizedBox(height: 16),
                        Text('No couriers found',
                            style: GoogleFonts.inter(
                                fontSize: 18, color: Colors.grey.shade600)),
                        if (_searchQuery.isNotEmpty ||
                            _statusFilter != 'all')
                          Text('Try adjusting your filters',
                              style: GoogleFonts.inter(
                                  fontSize: 14,
                                  color: Colors.grey.shade500)),
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
                            _headerCell('Courier', flex: 2),
                            _headerCell('Contact', flex: 2),
                            _headerCell('Vehicle'),
                            _headerCell('Location'),
                            _headerCell('Status'),
                            _headerCell('Actions'),
                          ],
                        ),
                      ),
                      // Table body
                      Expanded(
                        child: ListView.builder(
                          itemCount: couriers.length,
                          itemBuilder: (context, index) {
                            final courier = couriers[index];
                            return _CourierListItem(
                              courier: courier,
                              onToggleStatus: () =>
                                  _toggleCourierStatus(courier),
                              onViewDetails: () =>
                                  _viewCourierDetails(courier),
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

  Widget _headerCell(String label, {int flex = 1}) {
    return Expanded(
      flex: flex,
      child: Text(label,
          style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
    );
  }

  void _toggleCourierStatus(CourierUser courier) async {
    try {
      await _courierService.updateCourierStatus(
          courier.uid, !courier.isActive);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(courier.isActive
              ? '${courier.fullName} deactivated'
              : '${courier.fullName} activated'),
        ),
      );
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text('Failed: ${e.message}'),
            backgroundColor: Colors.red),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text('Failed to update status: $e'),
            backgroundColor: Colors.red),
      );
    }
  }

  void _viewCourierDetails(CourierUser courier) {
    showDialog(
      context: context,
      builder: (context) => _CourierDetailsDialog(courier: courier),
    );
  }
}

class _CourierListItem extends StatelessWidget {
  final CourierUser courier;
  final VoidCallback onToggleStatus;
  final VoidCallback onViewDetails;

  const _CourierListItem({
    required this.courier,
    required this.onToggleStatus,
    required this.onViewDetails,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Colors.grey.shade200, width: 1),
        ),
      ),
      child: Row(
        children: [
          // Name
          Expanded(
            flex: 2,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(courier.fullName,
                    style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
                Text(
                  'Joined ${DateFormat('MMM dd, yyyy').format(courier.createdAt)}',
                  style: GoogleFonts.inter(
                      fontSize: 11, color: Colors.grey.shade500),
                ),
              ],
            ),
          ),
          // Contact
          Expanded(
            flex: 2,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(courier.email,
                    style: GoogleFonts.inter(fontSize: 12)),
                if (courier.phone.isNotEmpty)
                  Text(courier.phone,
                      style: GoogleFonts.inter(
                          fontSize: 12, color: Colors.grey.shade600)),
              ],
            ),
          ),
          // Vehicle
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(courier.vehicleType,
                    style: GoogleFonts.inter(fontSize: 12)),
                if (courier.licensePlate.isNotEmpty)
                  Text(courier.licensePlate,
                      style: GoogleFonts.inter(
                          fontSize: 11, color: Colors.grey.shade600)),
              ],
            ),
          ),
          // Location
          Expanded(
            child: Text(
              courier.operatingCity.isNotEmpty
                  ? '${courier.operatingCity} (${courier.countryCode})'
                  : courier.countryCode,
              style: GoogleFonts.inter(fontSize: 12),
            ),
          ),
          // Status
          Expanded(
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: courier.isActive
                    ? Colors.green.shade50
                    : Colors.red.shade50,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                courier.isActive ? 'Active' : 'Inactive',
                style: GoogleFonts.inter(
                  fontSize: 12,
                  color: courier.isActive
                      ? Colors.green.shade700
                      : Colors.red.shade700,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
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
                  onPressed: onToggleStatus,
                  icon: Icon(
                    courier.isActive ? Icons.block : Icons.check_circle,
                  ),
                  iconSize: 18,
                  tooltip: courier.isActive ? 'Deactivate' : 'Activate',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CourierDetailsDialog extends StatelessWidget {
  final CourierUser courier;

  const _CourierDetailsDialog({required this.courier});

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
                Icon(Icons.delivery_dining, color: Colors.green.shade600),
                const SizedBox(width: 12),
                Text('Courier Details',
                    style: GoogleFonts.inter(
                        fontSize: 20, fontWeight: FontWeight.bold)),
                const Spacer(),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 24),
            _row('Name', courier.fullName),
            _row('Email', courier.email),
            _row('Phone', courier.phone.isNotEmpty ? courier.phone : 'N/A'),
            _row('Vehicle', courier.vehicleType),
            _row('License Plate',
                courier.licensePlate.isNotEmpty ? courier.licensePlate : 'N/A'),
            _row('City', courier.operatingCity.isNotEmpty
                ? courier.operatingCity
                : 'N/A'),
            _row('Country', courier.countryCode.isNotEmpty
                ? courier.countryCode
                : 'N/A'),
            _row('Status', courier.isActive ? 'Active' : 'Inactive'),
            _row('Joined',
                DateFormat('MMMM dd, yyyy').format(courier.createdAt)),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Close'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text('$label:',
                style: GoogleFonts.inter(
                    fontWeight: FontWeight.w600,
                    color: Colors.grey.shade700)),
          ),
          Expanded(child: Text(value, style: GoogleFonts.inter())),
        ],
      ),
    );
  }
}
