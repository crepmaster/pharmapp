import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../models/exchange_proposal.dart';
import '../../../services/exchange_service.dart';

class ExchangeStatusScreen extends StatelessWidget {
  final String proposalId;
  final String? exchangeId;

  const ExchangeStatusScreen({
    super.key,
    required this.proposalId,
    this.exchangeId,
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
                                  if (exchangeId != null)
                                    Text(
                                      'Exchange ID: $exchangeId',
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
                        if (proposal.status == ProposalStatus.pending)
                          Padding(
                            padding: const EdgeInsets.only(top: 16.0),
                            child: Row(
                              children: [
                                Expanded(
                                  child: ElevatedButton(
                                    onPressed: () => _acceptProposal(context, proposal),
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
                                    onPressed: () => _rejectProposal(context, proposal),
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
                        _buildDetailRow('From', proposal.fromPharmacyId),
                        _buildDetailRow('To', proposal.toPharmacyId),
                        _buildDetailRow('Quantity', '${proposal.details.requestedQuantity}'),
                        _buildDetailRow('Offered Price', 
                            '${proposal.details.offeredPrice} ${proposal.details.currency}/unit'),
                        _buildDetailRow('Total Value', 
                            '${proposal.details.totalOfferAmount} ${proposal.details.currency}'),
                        _buildDetailRow('Type', proposal.details.proposalType.toString().split('.').last),
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
                            _buildDetailRow('Courier', proposal.deliveryInfo!.courierId!),
                          _buildDetailRow('Delivery Type', 
                              proposal.deliveryInfo!.deliveryType.toString().split('.').last),
                          _buildDetailRow('Status', 
                              proposal.deliveryInfo!.deliveryStatus.toString().split('.').last),
                          if (proposal.deliveryInfo!.deliveryFee != null)
                            _buildDetailRow('Delivery Fee', 
                                '${proposal.deliveryInfo!.deliveryFee} XAF'),
                          if (proposal.deliveryInfo!.estimatedDelivery != null)
                            _buildDetailRow('Estimated Delivery', 
                                proposal.deliveryInfo!.estimatedDelivery!.toString()),
                        ],
                      ),
                    ),
                  ),
                ],

                // Backend Exchange Status (if available)
                if (exchangeId != null) ...[
                  const SizedBox(height: 16),
                  
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Payment Status',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 12),
                          FutureBuilder<Map<String, dynamic>>(
                            future: ExchangeService.getExchangeStatus(exchangeId: exchangeId!),
                            builder: (context, snapshot) {
                              if (snapshot.connectionState == ConnectionState.waiting) {
                                return const CircularProgressIndicator();
                              }
                              
                              if (snapshot.hasError) {
                                return Text('Error loading payment status: ${snapshot.error}');
                              }
                              
                              final exchangeData = snapshot.data ?? {};
                              return Column(
                                children: [
                                  _buildDetailRow('Backend Status', exchangeData['status'] ?? 'Unknown'),
                                  if (exchangeData['holdAmount'] != null)
                                    _buildDetailRow('Hold Amount', 
                                        '${(exchangeData['holdAmount'] / 100).toStringAsFixed(0)} XAF'),
                                  if (exchangeData['createdAt'] != null)
                                    _buildDetailRow('Created', exchangeData['createdAt'].toString()),
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

                // Actions
                if (proposal.status == ProposalStatus.accepted && exchangeId != null) ...[
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton(
                          onPressed: () => _completeDelivery(context, proposal, exchangeId!),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.green,
                            foregroundColor: Colors.white,
                          ),
                          child: const Text('Complete Delivery'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: () => _cancelExchange(context, proposal, exchangeId!),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.orange,
                            foregroundColor: Colors.white,
                          ),
                          child: const Text('Cancel Exchange'),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          );
        },
      ),
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

  Future<void> _acceptProposal(BuildContext context, ExchangeProposal proposal) async {
    try {
      final exchangeId = await proposal.acceptProposal();

      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Proposal accepted! Exchange ID: $exchangeId'),
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

  Future<void> _rejectProposal(BuildContext context, ExchangeProposal proposal) async {
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
        await proposal.rejectProposal(reason.isEmpty ? 'No reason provided' : reason);

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

  Future<void> _completeDelivery(BuildContext context, ExchangeProposal proposal, String exchangeId) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Complete Delivery'),
        content: const Text('Are you sure the delivery has been completed? This will process the payment.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Complete'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await proposal.completeDelivery(exchangeId);

        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Delivery completed! Payment processed.'),
            backgroundColor: Colors.green,
          ),
        );
      } catch (e) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to complete delivery: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _cancelExchange(BuildContext context, ExchangeProposal proposal, String exchangeId) async {
    final reasonController = TextEditingController();
    
    final reason = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel Exchange'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('This will cancel the exchange and refund any held amounts.'),
            const SizedBox(height: 16),
            TextField(
              controller: reasonController,
              decoration: const InputDecoration(
                labelText: 'Reason for cancellation',
                hintText: 'Required...',
              ),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Keep Exchange'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, reasonController.text),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Cancel Exchange'),
          ),
        ],
      ),
    );

    if (reason != null && reason.isNotEmpty) {
      try {
        await proposal.cancelExchange(exchangeId, reason);

        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Exchange cancelled and amounts refunded'),
            backgroundColor: Colors.orange,
          ),
        );
      } catch (e) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to cancel exchange: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}