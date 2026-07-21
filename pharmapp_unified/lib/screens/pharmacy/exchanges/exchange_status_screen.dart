import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:pharmapp_shared/config/build_flags.dart';
import 'package:pharmapp_shared/pharmapp_shared.dart';
import '../../../models/exchange_proposal.dart';

class ExchangeStatusScreen extends StatelessWidget {
  final String proposalId;
  final String? deliveryId;

  const ExchangeStatusScreen({
    super.key,
    required this.proposalId,
    this.deliveryId,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Exchange Status'),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
      ),
      body: StreamBuilder<DocumentSnapshot>(
        stream: FirebaseFirestore.instance
            .collection('exchange_proposals')
            .doc(proposalId)
            .snapshots(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Text('Error: ${snapshot.error}'),
            );
          }

          if (!snapshot.hasData || !snapshot.data!.exists) {
            return const Center(
              child: Text('Exchange proposal not found'),
            );
          }

          final proposal = ExchangeProposal.fromFirestore(snapshot.data!);
          final linkedDeliveryId = proposal.deliveryId ?? deliveryId;
          // Only the RECEIVING pharmacy (item owner) may accept or reject
          // a pending proposal. The requester (fromPharmacyId) sees the
          // same status card but no action buttons — matches the backend
          // authorization on acceptExchangeProposal / rejectExchangeProposal
          // (both throw permission-denied for a non-receiver caller).
          final currentUid = FirebaseAuth.instance.currentUser?.uid;
          final isReceiver =
              currentUid != null && currentUid == proposal.toPharmacyId;
          final isExchange =
              proposal.details.proposalType == ProposalType.exchange;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Status Header
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 60,
                              height: 60,
                              decoration: BoxDecoration(
                                color: _getStatusColor(proposal.status),
                                shape: BoxShape.circle,
                              ),
                              child: Center(
                                child: Text(
                                  proposal.status.icon,
                                  style: const TextStyle(fontSize: 24),
                                ),
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Exchange ${proposal.status.displayName}',
                                    style: const TextStyle(
                                      fontSize: 20,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  Text(
                                    'Proposal ID: ${proposal.id}',
                                    style: TextStyle(
                                      color: Colors.grey[600],
                                      fontSize: 14,
                                    ),
                                  ),
                                  if (linkedDeliveryId != null)
                                    Text(
                                      'Delivery ID: $linkedDeliveryId',
                                      style: TextStyle(
                                        color: Colors.grey[600],
                                        fontSize: 14,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        if (proposal.status == ProposalStatus.pending &&
                            isReceiver)
                          Padding(
                            padding: const EdgeInsets.only(top: 16.0),
                            child: Row(
                              children: [
                                Expanded(
                                  child: ElevatedButton(
                                    onPressed: () =>
                                        _acceptProposal(context, proposal),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.green,
                                      foregroundColor: Colors.white,
                                    ),
                                    child: const Text('Accept'),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: ElevatedButton(
                                    onPressed: () =>
                                        _rejectProposal(context, proposal),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.red,
                                      foregroundColor: Colors.white,
                                    ),
                                    child: const Text('Reject'),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        // Info line for the requester so they understand
                        // the wait — the receiver is the one who needs to
                        // act, not them.
                        if (proposal.status == ProposalStatus.pending &&
                            !isReceiver)
                          Padding(
                            padding: const EdgeInsets.only(top: 12.0),
                            child: Row(
                              children: [
                                Icon(Icons.info_outline,
                                    size: 16, color: Colors.grey[600]),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    'Waiting for the receiving pharmacy to accept or reject.',
                                    style: TextStyle(
                                      color: Colors.grey[700],
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 16),

                // Exchange Details
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Exchange Details',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 12),
                        _buildPharmacyNameRow('From', proposal.fromPharmacyId),
                        _buildPharmacyNameRow('To', proposal.toPharmacyId),
                        _buildDetailRow(
                            'Type',
                            proposal.details.proposalType
                                .toString()
                                .split('.')
                                .last),
                        _buildDetailRow('Requested quantity',
                            '${proposal.details.requestedQuantity}'),
                        // Purchase-only rows — hidden for exchange, where
                        // offeredPrice is always 0 and the currency default
                        // "USD" is misleading (no money changes hands).
                        if (!isExchange) ...[
                          _buildDetailRow(
                            'Offered price',
                            '${MoneyFormatter.formatMajor(proposal.details.offeredPrice, currencyCode: proposal.details.currency)}/unit',
                          ),
                          _buildDetailRow(
                            'Total value',
                            MoneyFormatter.formatMajor(
                              proposal.details.totalOfferAmount,
                              currencyCode: proposal.details.currency,
                            ),
                          ),
                        ],
                        // Exchange-only rows — surface what the requester
                        // is offering in barter, so the receiver can decide.
                        // The exchangeInventorySnapshot is populated by the
                        // backend at proposal-create time (Sprint 4).
                        if (isExchange) ...[
                          const SizedBox(height: 8),
                          const Divider(),
                          const SizedBox(height: 4),
                          Text(
                            'In exchange, they offer',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: Colors.grey[700],
                            ),
                          ),
                          const SizedBox(height: 6),
                          if (proposal.details.exchangeInventorySnapshot !=
                              null) ...[
                            _buildDetailRow(
                              'Medicine',
                              '${proposal.details.exchangeInventorySnapshot!.medicineName}'
                                  '${proposal.details.exchangeInventorySnapshot!.dosage.isNotEmpty ? " ${proposal.details.exchangeInventorySnapshot!.dosage}" : ""}'
                                  '${proposal.details.exchangeInventorySnapshot!.form.isNotEmpty ? " • ${proposal.details.exchangeInventorySnapshot!.form}" : ""}',
                            ),
                            _buildDetailRow(
                              'Barter quantity',
                              '${proposal.details.exchangeQuantity ?? 0}'
                                  '${(proposal.details.exchangeInventorySnapshot!.packaging ?? "").isNotEmpty ? " ${proposal.details.exchangeInventorySnapshot!.packaging}" : ""}',
                            ),
                            if ((proposal.details.exchangeInventorySnapshot!
                                        .lotNumber ??
                                    '')
                                .isNotEmpty)
                              _buildDetailRow(
                                'Lot number',
                                proposal.details.exchangeInventorySnapshot!
                                    .lotNumber!,
                              ),
                          ] else ...[
                            // Older proposals created before the snapshot
                            // was persisted — fall back to bare IDs so the
                            // screen still shows something actionable.
                            _buildDetailRow(
                              'Medicine ID',
                              proposal.details.exchangeMedicineId ?? '—',
                            ),
                            _buildDetailRow(
                              'Barter quantity',
                              '${proposal.details.exchangeQuantity ?? 0}',
                            ),
                          ],
                        ],
                      ],
                    ),
                  ),
                ),

                if (proposal.deliveryInfo != null) ...[
                  const SizedBox(height: 16),

                  // Delivery Information
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Delivery Information',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 12),
                          if (proposal.deliveryInfo!.courierId != null)
                            _buildDetailRow(
                                'Courier', proposal.deliveryInfo!.courierId!),
                          _buildDetailRow(
                              'Delivery Type',
                              proposal.deliveryInfo!.deliveryType
                                  .toString()
                                  .split('.')
                                  .last),
                          _buildDetailRow(
                              'Status',
                              proposal.deliveryInfo!.deliveryStatus
                                  .toString()
                                  .split('.')
                                  .last),
                          if (proposal.deliveryInfo!.deliveryFee != null)
                            _buildDetailRow('Delivery Fee',
                                '${proposal.deliveryInfo!.deliveryFee} XAF'),
                          if (proposal.deliveryInfo!.estimatedDelivery != null)
                            _buildDetailRow(
                                'Estimated Delivery',
                                proposal.deliveryInfo!.estimatedDelivery!
                                    .toString()),
                        ],
                      ),
                    ),
                  ),
                ],

                // Delivery status from backend (if linked)
                if (linkedDeliveryId != null) ...[
                  const SizedBox(height: 16),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Delivery Status',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 12),
                          // StreamBuilder (was FutureBuilder) so the status
                          // updates in real time as `sandboxDeliveryAdvance`
                          // or `completeExchangeDelivery` writes to the
                          // delivery doc — no manual refresh needed during
                          // the demo.
                          StreamBuilder<DocumentSnapshot>(
                            stream: FirebaseFirestore.instance
                                .collection('deliveries')
                                .doc(linkedDeliveryId)
                                .snapshots(),
                            builder: (context, snapshot) {
                              if (snapshot.connectionState ==
                                  ConnectionState.waiting) {
                                return const CircularProgressIndicator();
                              }

                              if (snapshot.hasError || !snapshot.hasData) {
                                return Text(
                                    'Error loading delivery status: ${snapshot.error}');
                              }

                              if (!snapshot.data!.exists) {
                                return Text(
                                    'Delivery $linkedDeliveryId not found yet.');
                              }

                              final deliveryData =
                                  snapshot.data!.data() as Map<String, dynamic>;
                              final status =
                                  (deliveryData['status'] ?? 'pending')
                                      .toString();
                              final courierId =
                                  deliveryData['courierId']?.toString();
                              final paymentStatus =
                                  deliveryData['paymentStatus']?.toString();

                              return Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  _buildDetailRow('Status', status),
                                  if (courierId != null && courierId.isNotEmpty)
                                    _buildDetailRow('Courier', courierId),
                                  if (paymentStatus != null &&
                                      paymentStatus.isNotEmpty)
                                    _buildDetailRow('Payment', paymentStatus),
                                  if (kUseStaging) ...[
                                    const SizedBox(height: 12),
                                    const Divider(),
                                    DemoDeliveryActions(
                                      deliveryId: linkedDeliveryId,
                                      currentStatus: status,
                                      journey: deliveryData['sandboxJourney']
                                          as Map<String, dynamic>?,
                                    ),
                                  ],
                                ],
                              );
                            },
                          ),
                        ],
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 24),

                if (proposal.status == ProposalStatus.accepted &&
                    linkedDeliveryId != null)
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.blue.shade50,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.info_outline, color: Colors.blue.shade700),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            kUseStaging
                                ? 'Demo mode — use the delivery controls above to walk the delivery through its steps. The status refreshes in real time.'
                                : 'Delivery is in progress. Assigned courier updates completion from the courier app.',
                            style: TextStyle(color: Colors.blue.shade700),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildPharmacyNameRow(String label, String pharmacyId) {
    return FutureBuilder<DocumentSnapshot>(
      future: FirebaseFirestore.instance
          .collection('pharmacies')
          .doc(pharmacyId)
          .get(),
      builder: (context, snapshot) {
        String name = pharmacyId;
        if (snapshot.hasData && snapshot.data!.exists) {
          final data = snapshot.data!.data() as Map<String, dynamic>?;
          if (data != null) {
            name = data['pharmacyName'] as String? ??
                data['name'] as String? ??
                data['displayName'] as String? ??
                pharmacyId;
            if (name.isEmpty) name = pharmacyId;
          }
        }
        return _buildDetailRow(label, name);
      },
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              '$label:',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(
            child: Text(value),
          ),
        ],
      ),
    );
  }

  Color _getStatusColor(ProposalStatus status) {
    switch (status) {
      case ProposalStatus.pending:
        return Colors.orange.shade100;
      case ProposalStatus.accepted:
        return Colors.green.shade100;
      case ProposalStatus.rejected:
        return Colors.red.shade100;
      case ProposalStatus.expired:
        return Colors.grey.shade100;
      case ProposalStatus.completed:
        return Colors.blue.shade100;
      case ProposalStatus.cancelled:
        return Colors.purple.shade100;
    }
  }

  Future<void> _acceptProposal(
      BuildContext context, ExchangeProposal proposal) async {
    try {
      final deliveryId = await proposal.acceptProposal();

      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Proposal accepted. Delivery created: $deliveryId'),
          backgroundColor: Colors.green,
        ),
      );
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to accept proposal: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _rejectProposal(
      BuildContext context, ExchangeProposal proposal) async {
    final reasonController = TextEditingController();

    final reason = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reject Proposal'),
        content: TextField(
          controller: reasonController,
          decoration: const InputDecoration(
            labelText: 'Reason for rejection',
            hintText: 'Optional reason...',
          ),
          maxLines: 3,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, reasonController.text),
            child: const Text('Reject'),
          ),
        ],
      ),
    );

    if (reason != null) {
      try {
        await proposal
            .rejectProposal(reason.isEmpty ? 'No reason provided' : reason);

        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Proposal rejected'),
            backgroundColor: Colors.orange,
          ),
        );
      } catch (e) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to reject proposal: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}

/// Human labels for a journey action (also drives the button text).
const Map<String, String> _kJourneyActionLabels = {
  'start_pickup': 'Start pickup',
  'confirm_pickup': 'Confirm pickup',
  'start_delivery': 'Start delivery',
  'confirm_delivered': 'Confirm delivered',
  'start_return_pickup': 'Start return pickup',
  'confirm_return_pickup': 'Confirm return pickup',
  'start_return_delivery': 'Start return delivery',
  'confirm_return_delivered': 'Confirm return delivered',
};

/// Human labels for the current journey phase (display only).
const Map<String, String> _kPhaseLabels = {
  'assigned': 'Assigned',
  'en_route_to_pickup': 'On the way to pickup',
  'picked_up': 'Picked up',
  'en_route_to_dropoff': 'On the way to drop-off',
  'delivered': 'Delivered',
  'not_required': 'No return',
  'awaiting_return': 'Awaiting return',
  'en_route_to_return_pickup': 'On the way to return pickup',
  'return_picked_up': 'Return picked up',
  'en_route_to_return_dropoff': 'On the way to return drop-off',
  'return_delivered': 'Return delivered',
};

/// Pure derivation of the SINGLE next allowed journey action from the
/// current phases. Returns null when nothing remains (delivered with no
/// return, or return_delivered). Return actions are only offered when
/// [returnRequired] is true. Exported (library-private) + pure so it is
/// unit-testable without a widget.
String? nextJourneyAction({
  required String outboundPhase,
  required bool returnRequired,
  required String returnPhase,
}) {
  switch (outboundPhase) {
    case 'assigned':
      return 'start_pickup';
    case 'en_route_to_pickup':
      return 'confirm_pickup';
    case 'picked_up':
      return 'start_delivery';
    case 'en_route_to_dropoff':
      return 'confirm_delivered';
    case 'delivered':
      if (!returnRequired) return null;
      switch (returnPhase) {
        case 'not_required':
        case 'awaiting_return':
          return 'start_return_pickup';
        case 'en_route_to_return_pickup':
          return 'confirm_return_pickup';
        case 'return_picked_up':
          return 'start_return_delivery';
        case 'en_route_to_return_dropoff':
          return 'confirm_return_delivered';
        default:
          return null; // return_delivered
      }
    default:
      return null;
  }
}

/// Derive the outbound phase from the journey (preferred) or synthesize it
/// from the canonical delivery status when no journey exists yet.
String outboundPhaseFor(Map<String, dynamic>? journey, String status) {
  final p = journey?['outboundPhase'];
  if (p is String && p.isNotEmpty) return p;
  if (status == 'picked_up' || status == 'in_transit') return 'picked_up';
  if (status == 'delivered' || status == 'completed') return 'delivered';
  return 'assigned';
}

/// "Demo delivery controls" — staging-only manual progression embedded in the
/// Delivery Status card. Rendered only under `if (kUseStaging)` (the subtree
/// tree-shakes out of prod builds). GPS-free: every step is a button that
/// calls `sandboxDeliveryAdvance` with the next journey action; the backend
/// is authoritative (`confirm_delivered` runs the canonical settlement).
///
/// Shows the current phase and ONLY the next allowed action. Return controls
/// appear only when the journey's `returnRequired` is true. The parent
/// StreamBuilder refreshes the phase in real time after each write.
class DemoDeliveryActions extends StatefulWidget {
  final String deliveryId;
  final String currentStatus;
  final Map<String, dynamic>? journey;

  /// Test seam: when provided, actions call this instead of the real
  /// `sandboxDeliveryAdvance` callable. Lets widget tests exercise the
  /// spinner / disabled / error paths without Firebase. Never set in prod.
  final Future<void> Function(String action)? actionRunner;

  const DemoDeliveryActions({
    super.key,
    required this.deliveryId,
    required this.currentStatus,
    this.journey,
    this.actionRunner,
  });

  @override
  State<DemoDeliveryActions> createState() => DemoDeliveryActionsState();
}

class DemoDeliveryActionsState extends State<DemoDeliveryActions> {
  bool _busy = false;

  bool get _returnRequired => widget.journey?['returnRequired'] == true;
  String get _returnPhase =>
      (widget.journey?['returnPhase'] as String?) ?? 'not_required';
  String get _outboundPhase =>
      outboundPhaseFor(widget.journey, widget.currentStatus);

  Future<void> _defaultRun(String action) => FirebaseFunctions.instanceFor(
        region: 'europe-west1',
      ).httpsCallable('sandboxDeliveryAdvance').call<Map<String, dynamic>>(
        {'deliveryId': widget.deliveryId, 'action': action},
      ).then((_) {});

  Future<void> _runAction(String action, {required String successMessage}) =>
      _run(
        () => (widget.actionRunner ?? _defaultRun)(action),
        successMessage: successMessage,
      );

  Future<void> _run(
    Future<void> Function() op, {
    required String successMessage,
  }) async {
    if (_busy) return;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await op();
      messenger.showSnackBar(
        SnackBar(
          content: Text(successMessage),
          backgroundColor: Colors.green,
          duration: const Duration(seconds: 2),
        ),
      );
    } on FirebaseFunctionsException catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text('Demo action failed: ${e.message ?? e.code}'),
          backgroundColor: Colors.red,
        ),
      );
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text('Demo action failed: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Standard button: swaps the icon for an inline spinner while `_busy` so
  /// the loading feedback stays inside the tap target, and disables while busy.
  Widget _actionButton({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback? onPressed,
    Key? key,
  }) {
    return ElevatedButton.icon(
      key: key,
      icon: _busy
          ? const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
              ),
            )
          : Icon(icon, size: 18),
      label: Text(label),
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
      ),
      onPressed: _busy ? null : onPressed,
    );
  }

  @override
  Widget build(BuildContext context) {
    final status = widget.currentStatus;

    // Failed / cancelled → offer reset (legacy contract), regardless of journey.
    final bool resettable = status == 'failed' || status == 'cancelled';

    final String? next = resettable
        ? null
        : nextJourneyAction(
            outboundPhase: _outboundPhase,
            returnRequired: _returnRequired,
            returnPhase: _returnPhase,
          );

    final String phaseLabel = _outboundPhase == 'delivered' && _returnRequired
        ? (_kPhaseLabels[_returnPhase] ?? _returnPhase)
        : (_kPhaseLabels[_outboundPhase] ?? _outboundPhase);

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.deepPurple.shade50,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: Colors.deepPurple.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.movie_creation_outlined,
                  size: 16, color: Colors.deepPurple.shade700),
              const SizedBox(width: 6),
              Text(
                'Demo delivery controls',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Colors.deepPurple.shade700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          if (!resettable)
            Text(
              'Step: $phaseLabel',
              key: const Key('demo-phase-label'),
              style: TextStyle(fontSize: 12, color: Colors.deepPurple.shade500),
            ),
          const SizedBox(height: 8),
          if (resettable)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Delivery is "$status" — reset to replay the demo.',
                  style: TextStyle(color: Colors.orange.shade800, fontSize: 12),
                ),
                const SizedBox(height: 6),
                _actionButton(
                  icon: Icons.replay,
                  label: 'Reset delivery',
                  color: Colors.orange.shade700,
                  onPressed: () => _runAction(
                    'reset',
                    successMessage: 'Delivery reset — you can walk it again.',
                  ),
                ),
              ],
            )
          else if (next != null)
            _actionButton(
              key: const Key('demo-next-action'),
              icon: next.startsWith('confirm')
                  ? Icons.check_circle_outline
                  : Icons.local_shipping_outlined,
              label: _kJourneyActionLabels[next] ?? next,
              color: next.startsWith('confirm')
                  ? Colors.green.shade700
                  : Colors.deepPurple.shade600,
              onPressed: () => _runAction(
                next,
                successMessage: '${_kJourneyActionLabels[next]} done.',
              ),
            )
          else
            Row(
              children: [
                Icon(Icons.done_all, size: 18, color: Colors.green.shade700),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'All steps done — nothing left for the demo.',
                    style: TextStyle(color: Colors.green.shade700),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
