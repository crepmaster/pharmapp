import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../models/pharmacy_inventory.dart';
import '../../models/exchange_proposal.dart';
import '../../services/subscription_guard_service.dart';

class CreateProposalScreen extends StatefulWidget {
  final PharmacyInventoryItem inventoryItem;

  const CreateProposalScreen({
    super.key,
    required this.inventoryItem,
  });

  @override
  State<CreateProposalScreen> createState() => _CreateProposalScreenState();
}

class _CreateProposalScreenState extends State<CreateProposalScreen> {
  final _formKey = GlobalKey<FormState>();
  
  final quantityController = TextEditingController();
  final priceController = TextEditingController();
  final notesController = TextEditingController();
  
  bool isLoading = false;
  String selectedCurrency = 'XAF';
  
  final List<String> currencies = ['XAF', 'USD', 'EUR'];

  @override
  void dispose() {
    quantityController.dispose();
    priceController.dispose();
    notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final medicine = widget.inventoryItem.medicine;
    final daysUntilExpiry = widget.inventoryItem.expirationDate?.difference(DateTime.now()).inDays;
    final isExpiringSoon = daysUntilExpiry != null && daysUntilExpiry <= 30;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Make Proposal'),
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
                    // Medicine Information
                    Card(
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
                                        medicine?.name ?? 'Unknown Medicine',
                                        style: const TextStyle(
                                          fontSize: 20,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        medicine?.genericName ?? 'Unknown',
                                        style: TextStyle(
                                          color: Colors.grey[600],
                                          fontSize: 16,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        '${medicine?.strength ?? ''} • ${medicine?.form ?? ''}',
                                        style: TextStyle(
                                          color: Colors.grey[500],
                                          fontSize: 14,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                  decoration: BoxDecoration(
                                    color: _getCategoryColor(medicine?.category ?? 'Unknown'),
                                    borderRadius: BorderRadius.circular(16),
                                  ),
                                  child: Text(
                                    medicine?.category ?? 'Unknown',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            
                            const SizedBox(height: 16),
                            
                            // Availability Info
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.grey.shade50,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: Colors.grey.shade200),
                              ),
                              child: Column(
                                children: [
                                  Row(
                                    children: [
                                      const Icon(Icons.inventory, color: Colors.blue),
                                      const SizedBox(width: 8),
                                      Text(
                                        '${widget.inventoryItem.availableQuantity} units available',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w600,
                                          fontSize: 16,
                                        ),
                                      ),
                                    ],
                                  ),
                                  
                                  if (widget.inventoryItem.expirationDate != null) ...[
                                    const SizedBox(height: 8),
                                    Row(
                                      children: [
                                        Icon(
                                          isExpiringSoon ? Icons.warning : Icons.calendar_today,
                                          color: isExpiringSoon ? Colors.orange : Colors.grey,
                                        ),
                                        const SizedBox(width: 8),
                                        Text(
                                          isExpiringSoon
                                              ? 'Expires in $daysUntilExpiry days'
                                              : 'Expires: ${widget.inventoryItem.expirationDate!.day}/${widget.inventoryItem.expirationDate!.month}/${widget.inventoryItem.expirationDate!.year}',
                                          style: TextStyle(
                                            color: isExpiringSoon ? Colors.orange.shade700 : Colors.grey.shade700,
                                            fontWeight: isExpiringSoon ? FontWeight.w600 : FontWeight.normal,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                  
                                  if (widget.inventoryItem.batchNumber.isNotEmpty) ...[
                                    const SizedBox(height: 8),
                                    Row(
                                      children: [
                                        const Icon(Icons.qr_code, color: Colors.grey),
                                        const SizedBox(width: 8),
                                        Text(
                                          'Batch: ${widget.inventoryItem.batchNumber}',
                                          style: TextStyle(color: Colors.grey.shade700),
                                        ),
                                      ],
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    
                    const SizedBox(height: 16),
                    
                    // Your Proposal
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Your Proposal',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 16),
                            
                            // Quantity Requested
                            TextFormField(
                              controller: quantityController,
                              decoration: InputDecoration(
                                labelText: 'Quantity Requested *',
                                hintText: 'Max: ${widget.inventoryItem.availableQuantity}',
                                border: const OutlineInputBorder(),
                                suffixText: 'units',
                              ),
                              keyboardType: TextInputType.number,
                              validator: (value) {
                                if (value == null || value.isEmpty) {
                                  return 'Quantity is required';
                                }
                                final quantity = int.tryParse(value);
                                if (quantity == null || quantity <= 0) {
                                  return 'Enter a valid quantity';
                                }
                                if (quantity > widget.inventoryItem.availableQuantity) {
                                  return 'Cannot exceed ${widget.inventoryItem.availableQuantity} units';
                                }
                                return null;
                              },
                            ),
                            
                            const SizedBox(height: 16),
                            
                            // Price Offer
                            Row(
                              children: [
                                Expanded(
                                  flex: 3,
                                  child: TextFormField(
                                    controller: priceController,
                                    decoration: const InputDecoration(
                                      labelText: 'Price Per Unit *',
                                      hintText: '0.00',
                                      border: OutlineInputBorder(),
                                    ),
                                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                    validator: (value) {
                                      if (value == null || value.isEmpty) {
                                        return 'Price is required';
                                      }
                                      final price = double.tryParse(value);
                                      if (price == null || price <= 0) {
                                        return 'Enter a valid price';
                                      }
                                      return null;
                                    },
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  flex: 1,
                                  child: DropdownButtonFormField<String>(
                                    initialValue: selectedCurrency,
                                    decoration: const InputDecoration(
                                      labelText: 'Currency',
                                      border: OutlineInputBorder(),
                                    ),
                                    items: currencies.map((currency) {
                                      return DropdownMenuItem(
                                        value: currency,
                                        child: Text(currency),
                                      );
                                    }).toList(),
                                    onChanged: (value) {
                                      setState(() {
                                        selectedCurrency = value!;
                                      });
                                    },
                                  ),
                                ),
                              ],
                            ),
                            
                            const SizedBox(height: 16),
                            
                            // Total Calculation
                            if (quantityController.text.isNotEmpty && priceController.text.isNotEmpty)
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF1976D2).withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: const Color(0xFF1976D2)),
                                ),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    const Text(
                                      'Total Offer:',
                                      style: TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 16,
                                      ),
                                    ),
                                    Text(
                                      '${_calculateTotal()} $selectedCurrency',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 18,
                                        color: Color(0xFF1976D2),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            
                            const SizedBox(height: 16),
                            
                            // Additional Notes
                            TextFormField(
                              controller: notesController,
                              decoration: const InputDecoration(
                                labelText: 'Additional Notes (Optional)',
                                hintText: 'Any special requirements or comments...',
                                border: OutlineInputBorder(),
                              ),
                              maxLines: 3,
                            ),
                          ],
                        ),
                      ),
                    ),
                    
                    const SizedBox(height: 16),
                    
                    // Important Information
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.blue.shade50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.blue.shade200),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(Icons.info_outline, color: Colors.blue.shade700),
                              const SizedBox(width: 8),
                              const Text(
                                'How it works:',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '• Your proposal will be sent to the pharmacy\n• They can accept, reject, or counter-offer\n• Payment is held securely until delivery\n• You\'ll be notified of their decision',
                            style: TextStyle(
                              color: Colors.blue.shade700,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            
            // Submit Proposal Button
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
                  onPressed: isLoading ? null : _submitProposal,
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
                          'Submit Proposal',
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

  String _calculateTotal() {
    final quantity = int.tryParse(quantityController.text) ?? 0;
    final price = double.tryParse(priceController.text) ?? 0.0;
    final total = quantity * price;
    return total.toStringAsFixed(2);
  }

  Future<void> _submitProposal() async {
    if (!_formKey.currentState!.validate()) return;

    // 🔒 CRITICAL SUBSCRIPTION CHECK
    final canCreate = await SubscriptionGuardService.canCreateProposal();
    if (!canCreate) {
      final status = await SubscriptionGuardService.getSubscriptionStatus();
      final message = SubscriptionGuardService.getSubscriptionStatusMessage(status);
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('❌ Proposal Access Denied: $message'),
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
      final currentUser = FirebaseAuth.instance.currentUser;
      if (currentUser == null) {
        throw Exception('User not logged in');
      }

      final quantity = int.parse(quantityController.text);
      final pricePerUnit = double.parse(priceController.text);
      
      // Generate proposal ID
      final proposalId = FirebaseFirestore.instance.collection('exchange_proposals').doc().id;
      
      // Create proposal
      final proposal = ExchangeProposal.makeOffer(
        id: proposalId,
        inventoryItemId: widget.inventoryItem.id,
        buyerPharmacyId: currentUser.uid,
        sellerPharmacyId: widget.inventoryItem.pharmacyId,
        offerPricePerUnit: pricePerUnit,
        quantity: quantity,
        currency: selectedCurrency,
      );

      // Add notes if provided
      final proposalWithNotes = proposal.copyWith(
        details: ProposalDetails(
          offeredPrice: pricePerUnit,
          requestedQuantity: quantity,
          currency: selectedCurrency,
          proposalType: ProposalType.purchase,
        ),
      );

      await FirebaseFirestore.instance
          .collection('exchange_proposals')
          .doc(proposalId)
          .set(proposalWithNotes.toFirestore());

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Proposal submitted successfully!'),
          backgroundColor: Colors.green,
        ),
      );

      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to submit proposal: $e'),
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
            Text('You need an active subscription to create exchange proposals.'),
            SizedBox(height: 16),
            Text('Available Plans:', style: TextStyle(fontWeight: FontWeight.bold)),
            Text('• Basic ($10/month) - Create & receive proposals'),
            Text('• Professional ($25/month) - Unlimited + analytics'),
            Text('• Enterprise ($50/month) - Multi-location + API'),
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
}