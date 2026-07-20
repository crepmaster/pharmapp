import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:pharmapp_shared/pharmapp_shared.dart';

import '../../../data/essential_medicines.dart';
import '../../../models/medicine.dart';
import '../../../models/medicine_request.dart';
import '../../../models/medicine_request_offer.dart';
import '../../../models/pharmacy_inventory.dart';
import '../../../services/medicine_request_service.dart';
import '../exchanges/exchange_status_screen.dart';

/// Medicine Requests screen.
/// Sprint 2B introduced the 3-tab layout. Sprint 4 (F-BLOC2-P2) adds the
/// `Purchase | Exchange` toggles at create + offer + accept time.
class MedicineRequestsScreen extends StatefulWidget {
  const MedicineRequestsScreen({super.key});

  @override
  State<MedicineRequestsScreen> createState() => _MedicineRequestsScreenState();
}

class _MedicineRequestsScreenState extends State<MedicineRequestsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  String? _pharmacyId;
  String? _countryCode;
  String? _cityCode;
  String? _currencyCode;
  bool _profileLoaded = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;
    final doc = await FirebaseFirestore.instance
        .collection('pharmacies')
        .doc(uid)
        .get();
    if (!mounted || !doc.exists) return;
    final data = doc.data()!;
    final cc = data['countryCode'] as String? ?? '';

    String currency = 'XAF';
    if (cc.isNotEmpty) {
      try {
        final configDoc = await FirebaseFirestore.instance
            .collection('system_config')
            .doc('main')
            .get();
        if (configDoc.exists) {
          final countries =
              configDoc.data()?['countries'] as Map<String, dynamic>? ?? {};
          final country = countries[cc] as Map<String, dynamic>?;
          if (country != null && country['defaultCurrencyCode'] != null) {
            currency = country['defaultCurrencyCode'] as String;
          }
        }
      } catch (_) {}
    }

    if (!mounted) return;
    setState(() {
      _pharmacyId = uid;
      _countryCode = cc;
      _cityCode = data['cityCode'] as String? ?? '';
      _currencyCode = currency;
      _profileLoaded = true;
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Medicine Requests'),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          tabs: const [
            Tab(text: 'Open Requests'),
            Tab(text: 'My Requests'),
            Tab(text: 'My Offers'),
          ],
        ),
      ),
      body: !_profileLoaded
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                _OpenRequestsTab(
                  countryCode: _countryCode!,
                  cityCode: _cityCode!,
                  pharmacyId: _pharmacyId!,
                ),
                _MyRequestsTab(
                  pharmacyId: _pharmacyId!,
                  currencyCode: _currencyCode!,
                ),
                _MyOffersTab(pharmacyId: _pharmacyId!),
              ],
            ),
    );
  }
}

// =============================================================================
// Open Requests Tab
// =============================================================================

class _OpenRequestsTab extends StatelessWidget {
  final String countryCode;
  final String cityCode;
  final String pharmacyId;

  const _OpenRequestsTab({
    required this.countryCode,
    required this.cityCode,
    required this.pharmacyId,
  });

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<MedicineRequest>>(
      stream: MedicineRequestService.getOpenRequestsInCity(
        countryCode: countryCode,
        cityCode: cityCode,
      ),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Center(child: Text('Error: ${snapshot.error}'));
        }
        final requests = (snapshot.data ?? [])
            .where((r) => r.requesterPharmacyId != pharmacyId)
            .toList();

        if (requests.isEmpty) {
          return const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.search_off, size: 64, color: Colors.grey),
                SizedBox(height: 16),
                Text('No open requests in your city',
                    style: TextStyle(fontSize: 18, color: Colors.grey)),
                SizedBox(height: 8),
                Text('Requests from other pharmacies will appear here',
                    style: TextStyle(color: Colors.grey)),
              ],
            ),
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: requests.length,
          itemBuilder: (_, i) => _RequestCard(
            request: requests[i],
            showMakeOffer: true,
            pharmacyId: pharmacyId,
          ),
        );
      },
    );
  }
}

// =============================================================================
// My Requests Tab
// =============================================================================

class _MyRequestsTab extends StatelessWidget {
  final String pharmacyId;
  final String currencyCode;

  const _MyRequestsTab({
    required this.pharmacyId,
    required this.currencyCode,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        StreamBuilder<List<MedicineRequest>>(
          stream: MedicineRequestService.getMyRequests(pharmacyId),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return Center(child: Text('Error: ${snapshot.error}'));
            }
            final requests = snapshot.data ?? [];

            if (requests.isEmpty) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.inbox, size: 64, color: Colors.grey),
                    const SizedBox(height: 16),
                    const Text('No requests yet',
                        style: TextStyle(fontSize: 18, color: Colors.grey)),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: () => _showCreateRequestDialog(context),
                      icon: const Icon(Icons.add),
                      label: const Text('Create Request'),
                    ),
                  ],
                ),
              );
            }

            return ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: requests.length,
              itemBuilder: (_, i) => _RequestCard(
                request: requests[i],
                showMakeOffer: false,
                pharmacyId: pharmacyId,
                onViewOffers: () =>
                    _showOffersDialog(context, requests[i], pharmacyId),
                onCancel: requests[i].isOpen
                    ? () => _cancelRequest(context, requests[i].id)
                    : null,
              ),
            );
          },
        ),
        Positioned(
          bottom: 16,
          right: 16,
          child: FloatingActionButton(
            onPressed: () => _showCreateRequestDialog(context),
            child: const Icon(Icons.add),
          ),
        ),
      ],
    );
  }

  Future<void> _showCreateRequestDialog(BuildContext context) async {
    final medicines = EssentialMedicines.allMedicines;
    Medicine? selected;
    final qtyCtl = TextEditingController(text: '1');
    final notesCtl = TextEditingController();
    var isSaving = false;
    RequestMode mode = RequestMode.purchase;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Request Medicine'),
          content: SizedBox(
            width: 400,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Sprint 4: request mode toggle (Purchase | Exchange).
                  const Text('Mode',
                      style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  SegmentedButton<RequestMode>(
                    segments: const [
                      ButtonSegment(
                        value: RequestMode.purchase,
                        icon: Icon(Icons.shopping_cart, size: 16),
                        label: Text('Purchase'),
                      ),
                      ButtonSegment(
                        value: RequestMode.exchange,
                        icon: Icon(Icons.swap_horiz, size: 16),
                        label: Text('Exchange'),
                      ),
                    ],
                    selected: {mode},
                    onSelectionChanged: (set) =>
                        setDialogState(() => mode = set.first),
                  ),
                  const SizedBox(height: 16),
                  Autocomplete<Medicine>(
                    optionsBuilder: (textEditingValue) {
                      if (textEditingValue.text.isEmpty) return const [];
                      final q = textEditingValue.text.toLowerCase();
                      return medicines
                          .where((m) =>
                              m.name.toLowerCase().contains(q) ||
                              m.genericName.toLowerCase().contains(q))
                          .take(10);
                    },
                    displayStringForOption: (m) => m.name,
                    fieldViewBuilder: (_, ctrl, focus, onSubmit) =>
                        TextField(
                      controller: ctrl,
                      focusNode: focus,
                      decoration: const InputDecoration(
                        labelText: 'Medicine *',
                        border: OutlineInputBorder(),
                        hintText: 'Search by name...',
                      ),
                    ),
                    onSelected: (m) =>
                        setDialogState(() => selected = m),
                  ),
                  if (selected != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      '${selected!.genericName} · ${selected!.strength} · ${selected!.form}',
                      style: TextStyle(
                          fontSize: 12, color: Colors.grey.shade600),
                    ),
                  ],
                  const SizedBox(height: 12),
                  TextField(
                    controller: qtyCtl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Quantity *',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: notesCtl,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      labelText: 'Notes (optional)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: isSaving ? null : () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: isSaving || selected == null
                  ? null
                  : () async {
                      setDialogState(() => isSaving = true);
                      try {
                        await MedicineRequestService.createRequest(
                          medicineId: selected!.id,
                          medicineSnapshot: {
                            'name': selected!.name,
                            'genericName': selected!.genericName,
                            'strength': selected!.strength,
                            'form': selected!.form,
                            'category': selected!.category,
                          },
                          requestedQuantity:
                              int.tryParse(qtyCtl.text) ?? 1,
                          requestMode: mode,
                          currencyCode: currencyCode,
                          notes: notesCtl.text,
                        );
                        if (ctx.mounted) Navigator.pop(ctx);
                      } on FirebaseFunctionsException catch (e) {
                        setDialogState(() => isSaving = false);
                        if (ctx.mounted) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            SnackBar(
                              content: Text(e.message ?? 'Error'),
                              backgroundColor: Colors.red,
                            ),
                          );
                        }
                      } catch (e) {
                        setDialogState(() => isSaving = false);
                        if (ctx.mounted) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            SnackBar(
                              content: Text('Error: $e'),
                              backgroundColor: Colors.red,
                            ),
                          );
                        }
                      }
                    },
              child: isSaving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Submit Request'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _cancelRequest(BuildContext context, String requestId) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel Request?'),
        content:
            const Text('This will cancel the request and expire all pending offers.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('No')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Yes, Cancel')),
        ],
      ),
    );
    if (confirm != true || !context.mounted) return;

    try {
      await MedicineRequestService.cancelRequest(requestId);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Request cancelled')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  void _showOffersDialog(
      BuildContext context, MedicineRequest request, String pharmacyId) {
    showDialog(
      context: context,
      builder: (_) =>
          _OffersDialog(request: request, requesterPharmacyId: pharmacyId),
    );
  }
}

// =============================================================================
// My Offers Tab
// =============================================================================

class _MyOffersTab extends StatelessWidget {
  final String pharmacyId;

  const _MyOffersTab({required this.pharmacyId});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<MedicineRequestOffer>>(
      stream: MedicineRequestService.getMyOffers(pharmacyId),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Center(child: Text('Error: ${snapshot.error}'));
        }
        final offers = snapshot.data ?? [];

        if (offers.isEmpty) {
          return const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.local_offer_outlined, size: 64, color: Colors.grey),
                SizedBox(height: 16),
                Text('No offers submitted yet',
                    style: TextStyle(fontSize: 18, color: Colors.grey)),
                SizedBox(height: 8),
                Text('Browse Open Requests to make offers',
                    style: TextStyle(color: Colors.grey)),
              ],
            ),
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: offers.length,
          itemBuilder: (_, i) => _OfferCard(offer: offers[i]),
        );
      },
    );
  }
}

// =============================================================================
// Shared Widgets
// =============================================================================

class _RequestCard extends StatelessWidget {
  final MedicineRequest request;
  final bool showMakeOffer;
  final String pharmacyId;
  final VoidCallback? onViewOffers;
  final VoidCallback? onCancel;

  const _RequestCard({
    required this.request,
    required this.showMakeOffer,
    required this.pharmacyId,
    this.onViewOffers,
    this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    final isExpired = request.isExpired;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    request.medicineName,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
                _ModeChip(isExchange: request.isExchange),
                const SizedBox(width: 6),
                _StatusChip(
                  label: isExpired ? 'Expired' : request.status.name,
                  color: isExpired
                      ? Colors.grey
                      : _statusColor(request.status),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Qty: ${request.requestedQuantity}'
              '${request.isExchange ? "" : " · ${request.currencyCode}"}',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
            ),
            if (request.notes.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(request.notes,
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            ],
            const SizedBox(height: 4),
            Text(
              'By ${request.requesterName} · ${_timeAgo(request.createdAt)}',
              style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
            ),
            if (request.isOpen && !isExpired) ...[
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (onCancel != null)
                    TextButton(
                      onPressed: onCancel,
                      child: const Text('Cancel',
                          style: TextStyle(color: Colors.red)),
                    ),
                  if (onViewOffers != null)
                    TextButton(
                      onPressed: onViewOffers,
                      child: const Text('View Offers'),
                    ),
                  if (showMakeOffer)
                    ElevatedButton.icon(
                      onPressed: () =>
                          _showMakeOfferDialog(context, request),
                      icon: Icon(
                          request.isExchange
                              ? Icons.swap_horiz
                              : Icons.local_offer,
                          size: 16),
                      label: Text(
                          request.isExchange ? 'Propose Exchange' : 'Make Offer'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                      ),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Color _statusColor(RequestStatus s) {
    switch (s) {
      case RequestStatus.open:
        return Colors.blue;
      case RequestStatus.matched:
        return Colors.green;
      case RequestStatus.fulfilled:
        return Colors.green.shade800;
      case RequestStatus.cancelled:
        return Colors.red;
      case RequestStatus.expired:
        return Colors.grey;
    }
  }

  void _showMakeOfferDialog(BuildContext context, MedicineRequest request) {
    showDialog(
      context: context,
      builder: (_) => _MakeOfferDialog(
        request: request,
        pharmacyId: pharmacyId,
      ),
    );
  }
}

class _OfferCard extends StatelessWidget {
  final MedicineRequestOffer offer;

  const _OfferCard({required this.offer});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    offer.medicineName,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
                _ModeChip(isExchange: offer.isExchange),
                const SizedBox(width: 6),
                _StatusChip(
                  label: offer.status.name,
                  color: _offerStatusColor(offer.status),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (offer.isExchange)
              Text(
                'Offering qty ${offer.offeredQuantity} · '
                'In return: ${offer.exchangeItem?.medicineName ?? "?"} '
                '${offer.exchangeItem?.dosage ?? ""} '
                '(${offer.exchangeItem?.quantity ?? 0})',
                style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
              )
            else
              Text(
                'Qty: ${offer.offeredQuantity} · '
                '${MoneyFormatter.formatMajor(offer.unitPrice, currencyCode: offer.currencyCode)}/unit · '
                'Total: ${MoneyFormatter.formatMajor(offer.totalPrice, currencyCode: offer.currencyCode)}',
                style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
              ),
            const SizedBox(height: 4),
            Text(
              _timeAgo(offer.createdAt),
              style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (offer.status == OfferStatus.pending)
                  TextButton(
                    onPressed: () => _withdraw(context),
                    child: const Text('Withdraw',
                        style: TextStyle(color: Colors.red)),
                  ),
                if (offer.linkedProposalId != null &&
                    offer.linkedProposalId!.isNotEmpty)
                  ElevatedButton(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => ExchangeStatusScreen(
                          proposalId: offer.linkedProposalId!,
                        ),
                      ),
                    ),
                    child: const Text('View Exchange'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Color _offerStatusColor(OfferStatus s) {
    switch (s) {
      case OfferStatus.pending:
        return Colors.orange;
      case OfferStatus.accepted:
      case OfferStatus.converted:
        return Colors.green;
      case OfferStatus.declined:
      case OfferStatus.withdrawn:
        return Colors.red;
      case OfferStatus.expired:
        return Colors.grey;
    }
  }

  Future<void> _withdraw(BuildContext context) async {
    try {
      await MedicineRequestService.withdrawOffer(offer.id);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Offer withdrawn')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }
}

class _ModeChip extends StatelessWidget {
  final bool isExchange;
  const _ModeChip({required this.isExchange});

  @override
  Widget build(BuildContext context) {
    final color = isExchange ? Colors.deepPurple : Colors.indigo;
    final label = isExchange ? 'EXCHANGE' : 'PURCHASE';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Text(
        label,
        style: TextStyle(
            color: color, fontSize: 10, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final Color color;

  const _StatusChip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withOpacity(0.5)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

// =============================================================================
// Make-Offer Dialog (Sprint 4: branches on request.requestMode)
// =============================================================================

class _MakeOfferDialog extends StatefulWidget {
  final MedicineRequest request;
  final String pharmacyId;

  const _MakeOfferDialog({
    required this.request,
    required this.pharmacyId,
  });

  @override
  State<_MakeOfferDialog> createState() => _MakeOfferDialogState();
}

class _MakeOfferDialogState extends State<_MakeOfferDialog> {
  List<PharmacyInventoryItem> _myItems = [];
  PharmacyInventoryItem? _selectedItem;
  final _qtyCtl = TextEditingController(text: '1');
  final _priceCtl = TextEditingController();
  final _notesCtl = TextEditingController();

  // Exchange-only: describe the medicine the seller wants in return.
  final _exMedicineIdCtl = TextEditingController();
  final _exMedicineNameCtl = TextEditingController();
  final _exDosageCtl = TextEditingController();
  final _exFormCtl = TextEditingController();
  final _exQtyCtl = TextEditingController(text: '1');

  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _loadInventory();
  }

  Future<void> _loadInventory() async {
    try {
      final snap = await FirebaseFirestore.instance
          .collection('pharmacy_inventory')
          .where('pharmacyId', isEqualTo: widget.pharmacyId)
          .where('medicineId', isEqualTo: widget.request.medicineId)
          .get();
      final items = snap.docs
          .map((d) => PharmacyInventoryItem.fromFirestore(d))
          .where((item) => item.availableQuantity > 0 && !item.isExpired)
          .toList();
      if (mounted) setState(() { _myItems = items; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _qtyCtl.dispose();
    _priceCtl.dispose();
    _notesCtl.dispose();
    _exMedicineIdCtl.dispose();
    _exMedicineNameCtl.dispose();
    _exDosageCtl.dispose();
    _exFormCtl.dispose();
    _exQtyCtl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isExchange = widget.request.isExchange;
    return AlertDialog(
      title: Row(
        children: [
          Expanded(
            child: Text(
              isExchange
                  ? 'Exchange offer for ${widget.request.medicineName}'
                  : 'Offer for ${widget.request.medicineName}',
            ),
          ),
          _ModeChip(isExchange: isExchange),
        ],
      ),
      content: SizedBox(
        width: 420,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _myItems.isEmpty
                ? const Text(
                    'You have no matching inventory for this medicine.')
                : SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        DropdownButtonFormField<PharmacyInventoryItem>(
                          decoration: const InputDecoration(
                            labelText: 'Select Inventory Item *',
                            border: OutlineInputBorder(),
                          ),
                          items: _myItems
                              .map((item) => DropdownMenuItem(
                                    value: item,
                                    child: Text(
                                      'Qty: ${item.availableQuantity} · '
                                      'Batch: ${item.batchNumber.isNotEmpty ? item.batchNumber : "N/A"} · '
                                      'Exp: ${item.expirationDate != null ? "${item.expirationDate!.day}/${item.expirationDate!.month}/${item.expirationDate!.year}" : "N/A"}',
                                    ),
                                  ))
                              .toList(),
                          onChanged: (v) =>
                              setState(() => _selectedItem = v),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _qtyCtl,
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(
                            labelText:
                                'Quantity * (requested: ${widget.request.requestedQuantity})',
                            border: const OutlineInputBorder(),
                          ),
                        ),
                        if (!isExchange) ...[
                          const SizedBox(height: 12),
                          TextField(
                            controller: _priceCtl,
                            keyboardType: TextInputType.number,
                            decoration: InputDecoration(
                              labelText:
                                  'Unit Price (${widget.request.currencyCode}) *',
                              border: const OutlineInputBorder(),
                            ),
                          ),
                        ] else ...[
                          const SizedBox(height: 20),
                          const Divider(),
                          const SizedBox(height: 8),
                          const Text(
                            'In return, you want…',
                            style: TextStyle(fontWeight: FontWeight.w600),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _exMedicineIdCtl,
                            decoration: const InputDecoration(
                              labelText: 'Medicine ID *',
                              hintText: 'e.g. paracetamol-500',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _exMedicineNameCtl,
                            decoration: const InputDecoration(
                              labelText: 'Medicine name *',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _exDosageCtl,
                                  decoration: const InputDecoration(
                                    labelText: 'Dosage *',
                                    hintText: '500mg',
                                    border: OutlineInputBorder(),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: TextField(
                                  controller: _exFormCtl,
                                  decoration: const InputDecoration(
                                    labelText: 'Form *',
                                    hintText: 'tablet',
                                    border: OutlineInputBorder(),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _exQtyCtl,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'Quantity wanted *',
                              border: OutlineInputBorder(),
                            ),
                          ),
                        ],
                        const SizedBox(height: 12),
                        TextField(
                          controller: _notesCtl,
                          maxLines: 2,
                          decoration: const InputDecoration(
                            labelText: 'Notes (optional)',
                            border: OutlineInputBorder(),
                          ),
                        ),
                      ],
                    ),
                  ),
      ),
      actions: [
        TextButton(
          onPressed: _saving ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        if (_myItems.isNotEmpty)
          ElevatedButton(
            onPressed: _saving || _selectedItem == null
                ? null
                : _submit,
            child: _saving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(isExchange ? 'Submit Exchange' : 'Submit Offer'),
          ),
      ],
    );
  }

  Future<void> _submit() async {
    final qty = int.tryParse(_qtyCtl.text) ?? 0;
    if (qty <= 0 || _selectedItem == null) return;

    final isExchange = widget.request.isExchange;
    if (!isExchange) {
      final price = double.tryParse(_priceCtl.text) ?? 0;
      if (price <= 0) return;
      setState(() => _saving = true);
      try {
        await MedicineRequestService.submitPurchaseOffer(
          requestId: widget.request.id,
          inventoryItemId: _selectedItem!.id,
          offeredQuantity: qty,
          unitPrice: price,
          notes: _notesCtl.text,
        );
        if (mounted) {
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Offer submitted!')),
          );
        }
      } on FirebaseFunctionsException catch (e) {
        setState(() => _saving = false);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(e.message ?? 'Error'),
              backgroundColor: Colors.red,
            ),
          );
        }
      } catch (e) {
        setState(() => _saving = false);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
          );
        }
      }
      return;
    }

    // Exchange path
    final exMid = _exMedicineIdCtl.text.trim();
    final exName = _exMedicineNameCtl.text.trim();
    final exDosage = _exDosageCtl.text.trim();
    final exForm = _exFormCtl.text.trim();
    final exQty = int.tryParse(_exQtyCtl.text) ?? 0;
    if (exMid.isEmpty ||
        exName.isEmpty ||
        exDosage.isEmpty ||
        exForm.isEmpty ||
        exQty <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Fill all "in return" fields with valid values.'),
            backgroundColor: Colors.red),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      await MedicineRequestService.submitExchangeOffer(
        requestId: widget.request.id,
        inventoryItemId: _selectedItem!.id,
        offeredQuantity: qty,
        exchangeItem: ExchangeItem(
          medicineId: exMid,
          medicineName: exName,
          dosage: exDosage,
          form: exForm,
          quantity: exQty,
        ),
        notes: _notesCtl.text,
      );
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Exchange offer submitted!')),
        );
      }
    } on FirebaseFunctionsException catch (e) {
      setState(() => _saving = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.message ?? 'Error'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      setState(() => _saving = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }
}

// =============================================================================
// Offers Dialog (Sprint 4: exchange accept opens an inventory picker)
// =============================================================================

class _OffersDialog extends StatelessWidget {
  final MedicineRequest request;
  final String requesterPharmacyId;

  const _OffersDialog(
      {required this.request, required this.requesterPharmacyId});

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: Container(
        width: 500,
        constraints: const BoxConstraints(maxHeight: 500),
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Offers for ${request.medicineName}',
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Flexible(
              child: StreamBuilder<List<MedicineRequestOffer>>(
                stream: MedicineRequestService.getOffersForRequest(request.id),
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  final offers = snapshot.data ?? [];
                  if (offers.isEmpty) {
                    return const Center(
                      child: Text('No offers yet',
                          style: TextStyle(color: Colors.grey)),
                    );
                  }

                  return ListView.builder(
                    shrinkWrap: true,
                    itemCount: offers.length,
                    itemBuilder: (_, i) => _OfferListTile(
                      offer: offers[i],
                      request: request,
                      requesterPharmacyId: requesterPharmacyId,
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OfferListTile extends StatefulWidget {
  final MedicineRequestOffer offer;
  final MedicineRequest request;
  final String requesterPharmacyId;

  const _OfferListTile(
      {required this.offer,
      required this.request,
      required this.requesterPharmacyId});

  @override
  State<_OfferListTile> createState() => _OfferListTileState();
}

class _OfferListTileState extends State<_OfferListTile> {
  bool _accepting = false;

  @override
  Widget build(BuildContext context) {
    final offer = widget.offer;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Row(
          children: [
            Expanded(child: Text(offer.sellerName)),
            _ModeChip(isExchange: offer.isExchange),
          ],
        ),
        subtitle: offer.isExchange
            ? Text(
                'Qty: ${offer.offeredQuantity} · '
                'wants: ${offer.exchangeItem?.medicineName ?? "?"} '
                '${offer.exchangeItem?.dosage ?? ""} '
                '(${offer.exchangeItem?.quantity ?? 0})',
              )
            : Text(
                'Qty: ${offer.offeredQuantity} · '
                '${MoneyFormatter.formatMajor(offer.unitPrice, currencyCode: offer.currencyCode)}/unit · '
                'Total: ${MoneyFormatter.formatMajor(offer.totalPrice, currencyCode: offer.currencyCode)}',
              ),
        trailing: offer.status == OfferStatus.pending && widget.request.isOpen
            ? _accepting
                ? const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : ElevatedButton(
                    onPressed: _accept,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      foregroundColor: Colors.white,
                    ),
                    child: const Text('Accept'),
                  )
            : _StatusChip(
                label: offer.status.name,
                color: offer.status == OfferStatus.converted
                    ? Colors.green
                    : Colors.grey,
              ),
      ),
    );
  }

  Future<void> _accept() async {
    final isExchange = widget.offer.isExchange;
    if (isExchange) {
      // Sprint 4: requester must pick one of their own inventory items
      // matching offer.exchangeItem (medicine + dosage + form + quantity).
      final picked = await _showInventoryPicker(context);
      if (picked == null) return;
      await _runAccept(exchangeInventoryItemId: picked);
      return;
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Accept this offer?'),
        content: Text(
          'This will purchase ${widget.offer.offeredQuantity} units at '
          '${MoneyFormatter.formatMajor(widget.offer.totalPrice, currencyCode: widget.offer.currencyCode)} '
          'from ${widget.offer.sellerName}. '
          'All other offers will be declined.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Accept'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    await _runAccept();
  }

  Future<String?> _showInventoryPicker(BuildContext context) async {
    final ex = widget.offer.exchangeItem;
    if (ex == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Offer is missing exchange details.'),
            backgroundColor: Colors.red),
      );
      return null;
    }
    return showDialog<String>(
      context: context,
      builder: (ctx) => _InventoryPickerDialog(
        requesterPharmacyId: widget.requesterPharmacyId,
        targetMedicineId: ex.medicineId,
        targetDosage: ex.dosage,
        targetForm: ex.form,
        requiredQuantity: ex.quantity,
      ),
    );
  }

  Future<void> _runAccept({String? exchangeInventoryItemId}) async {
    if (!mounted) return;
    setState(() => _accepting = true);
    try {
      final result = await MedicineRequestService.acceptOffer(
        requestId: widget.request.id,
        offerId: widget.offer.id,
        exchangeInventoryItemId: exchangeInventoryItemId,
      );
      if (!mounted) return;
      Navigator.pop(context); // Close offers dialog
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Offer accepted! Delivery created.')),
      );
      final proposalId = result['proposalId'] as String?;
      final deliveryId = result['deliveryId'] as String?;
      if (proposalId != null) {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ExchangeStatusScreen(
              proposalId: proposalId,
              deliveryId: deliveryId,
            ),
          ),
        );
      }
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        setState(() => _accepting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.message ?? 'Error'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _accepting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }
}

// =============================================================================
// Inventory Picker — Sprint 4 (exchange accept)
// =============================================================================

class _InventoryPickerDialog extends StatefulWidget {
  final String requesterPharmacyId;
  final String targetMedicineId;
  final String targetDosage;
  final String targetForm;
  final int requiredQuantity;

  const _InventoryPickerDialog({
    required this.requesterPharmacyId,
    required this.targetMedicineId,
    required this.targetDosage,
    required this.targetForm,
    required this.requiredQuantity,
  });

  @override
  State<_InventoryPickerDialog> createState() => _InventoryPickerDialogState();
}

class _InventoryPickerDialogState extends State<_InventoryPickerDialog> {
  List<PharmacyInventoryItem> _matches = [];
  PharmacyInventoryItem? _picked;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final snap = await FirebaseFirestore.instance
          .collection('pharmacy_inventory')
          .where('pharmacyId', isEqualTo: widget.requesterPharmacyId)
          .where('medicineId', isEqualTo: widget.targetMedicineId)
          .get();
      // Client-side filter is best-effort. When the inventory item maps
      // to an essential medicine, we filter on dosage (`strength`) and
      // form too. For custom medicines (no master-data match), we fall
      // through and let the backend enforce the contract — the writer
      // path will reject any mismatched item at accept time anyway.
      bool clientMatches(PharmacyInventoryItem item) {
        if (item.availableQuantity < widget.requiredQuantity) return false;
        if (item.isExpired) return false;
        final med = item.medicine;
        if (med == null) return true;
        if (!_normMatch(med.strength, widget.targetDosage)) return false;
        if (!_normMatch(med.form, widget.targetForm)) return false;
        return true;
      }

      final matches = snap.docs
          .map((d) => PharmacyInventoryItem.fromFirestore(d))
          .where(clientMatches)
          .toList();
      if (mounted) {
        setState(() {
          _matches = matches;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool _normMatch(String a, String b) =>
      a.trim().toLowerCase() == b.trim().toLowerCase();

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Pick your inventory item'),
      content: SizedBox(
        width: 420,
        child: _loading
            ? const SizedBox(
                height: 80, child: Center(child: CircularProgressIndicator()))
            : _matches.isEmpty
                ? Text(
                    'You have no inventory matching the seller\'s request '
                    '(${widget.targetMedicineId}, ${widget.targetDosage}, ${widget.targetForm}, '
                    '≥ ${widget.requiredQuantity} units).',
                    style: const TextStyle(color: Colors.red),
                  )
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: _matches
                        .map((item) => RadioListTile<PharmacyInventoryItem>(
                              value: item,
                              groupValue: _picked,
                              onChanged: (v) => setState(() => _picked = v),
                              title: Text(
                                'Qty: ${item.availableQuantity} · '
                                'Batch: ${item.batchNumber.isNotEmpty ? item.batchNumber : "N/A"}',
                              ),
                              subtitle: Text(
                                'Exp: ${item.expirationDate != null ? "${item.expirationDate!.day}/${item.expirationDate!.month}/${item.expirationDate!.year}" : "N/A"}',
                              ),
                            ))
                        .toList(),
                  ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, null),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: _picked == null ? null : () => Navigator.pop(context, _picked!.id),
          child: const Text('Use this item'),
        ),
      ],
    );
  }
}

// =============================================================================
// Utilities
// =============================================================================

String _timeAgo(DateTime date) {
  final diff = DateTime.now().difference(date);
  if (diff.inDays > 0) return '${diff.inDays}d ago';
  if (diff.inHours > 0) return '${diff.inHours}h ago';
  if (diff.inMinutes > 0) return '${diff.inMinutes}m ago';
  return 'Just now';
}
