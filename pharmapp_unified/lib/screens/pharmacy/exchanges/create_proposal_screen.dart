import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../../models/pharmacy_inventory.dart';
import '../../../models/exchange_proposal.dart';
import '../../../services/secure_subscription_service.dart';
import '../../../services/inventory_service.dart';
// FIX #1: Add service layer imports
import '../../../services/exchange_proposal_service.dart';
import '../../../services/wallet_service.dart';

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
  final exchangeQuantityController = TextEditingController();

  bool isLoading = false;
  String selectedCurrency = 'XAF';
  ProposalType proposalType = ProposalType.exchange; // Exchange is PRIMARY
  PharmacyInventoryItem? selectedMyInventory;
  List<PharmacyInventoryItem> myInventoryList = [];

  final List<String> currencies = ['XAF', 'USD', 'EUR'];

  @override
  void initState() {
    super.initState();
    _loadMyInventory();
    _checkSubscriptionAccess();
  }

  Future<void> _checkSubscriptionAccess() async {
    final result = await SecureSubscriptionService.validateProposalAccess();
    if (!result.canAccess && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('⚠️ Subscription required to create proposals: ${result.error ?? ""}'),
          backgroundColor: Colors.orange,
          duration: const Duration(seconds: 6),
          action: SnackBarAction(
            label: 'Upgrade',
            onPressed: () {
              // TODO: Navigate to subscription screen
            },
          ),
        ),
      );
    }
  }

  Future<void> _loadMyInventory() async {
    setState(() {
      isLoading = true;
    });

    try {
      debugPrint('🔍 Loading user inventory for exchange proposals...');
      final stream = InventoryService.getMyInventory();
      final items = await stream.first;

      debugPrint('📦 Total inventory items loaded: ${items.length}');

      // Log details of all items before filtering
      for (var i = 0; i < items.length; i++) {
        final item = items[i];
        debugPrint('  Item $i: ${item.medicine?.name ?? 'Unknown'} | Available: ${item.availableQuantity} | Expired: ${item.isExpired}');
      }

      // FIX: Show ALL inventory items for exchange proposals (not filtered by availableForExchange)
      // User can offer ANY medicine they have, even if not publicly listed
      // This enables flexibility in exchange negotiations
      final availableItems = items.where((item) =>
        !item.isExpired &&
        item.availableQuantity > 0
        // NOTE: Removed availableForExchange filter - user can offer any inventory
      ).toList();

      debugPrint('✅ Filtered available items: ${availableItems.length}');

      if (mounted) {
        setState(() {
          myInventoryList = availableItems;
          isLoading = false;
        });

        if (availableItems.isEmpty) {
          debugPrint('⚠️ No available inventory for exchange (all items expired or zero quantity)');
        } else {
          debugPrint('✅ Inventory loaded successfully for dropdown');
        }
      }
    } catch (e) {
      debugPrint('❌ Error loading inventory: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Failed to load inventory. Please check your connection.'),
            backgroundColor: Colors.orange,
            action: SnackBarAction(
              label: 'Retry',
              onPressed: _loadMyInventory,
              textColor: Colors.white,
            ),
          ),
        );
        setState(() {
          isLoading = false;
        });
      }
    }
  }

  @override
  void dispose() {
    quantityController.dispose();
    priceController.dispose();
    notesController.dispose();
    exchangeQuantityController.dispose();
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
                                        '${widget.inventoryItem.availableQuantity} ${widget.inventoryItem.packaging} available',
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

                    // Proposal Type Selector
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Proposal Type',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: _ProposalTypeButton(
                                    icon: Icons.swap_horiz,
                                    label: 'Exchange',
                                    isSelected: proposalType == ProposalType.exchange,
                                    color: const Color(0xFF1976D2),
                                    onTap: () {
                                      setState(() {
                                        proposalType = ProposalType.exchange;
                                      });
                                    },
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: _ProposalTypeButton(
                                    icon: Icons.shopping_cart,
                                    label: 'Buy',
                                    isSelected: proposalType == ProposalType.purchase,
                                    color: Colors.green,
                                    onTap: () {
                                      setState(() {
                                        proposalType = ProposalType.purchase;
                                      });
                                    },
                                  ),
                                ),
                              ],
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
                            Text(
                              proposalType == ProposalType.exchange
                                  ? 'Exchange Details'
                                  : 'Purchase Details',
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 16),

                            // Exchange-Specific Fields
                            if (proposalType == ProposalType.exchange) ...[
                              // Select Medicine to Trade
                              DropdownButtonFormField<PharmacyInventoryItem>(
                                value: selectedMyInventory,
                                decoration: const InputDecoration(
                                  labelText: 'Medicine to Trade *',
                                  hintText: 'Select from your inventory',
                                  border: OutlineInputBorder(),
                                  prefixIcon: Icon(Icons.swap_horiz),
                                ),
                                items: myInventoryList.map((item) {
                                  return DropdownMenuItem(
                                    value: item,
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(
                                          item.medicine?.name ?? 'Unknown',
                                          style: const TextStyle(fontWeight: FontWeight.w600),
                                        ),
                                        Text(
                                          '${item.availableQuantity} ${item.packaging} • ${item.medicine?.strength ?? ''}',
                                          style: TextStyle(
                                            fontSize: 12,
                                            color: Colors.grey[600],
                                          ),
                                        ),
                                      ],
                                    ),
                                  );
                                }).toList(),
                                onChanged: (value) {
                                  setState(() {
                                    selectedMyInventory = value;
                                  });
                                },
                                validator: (value) {
                                  if (proposalType == ProposalType.exchange && value == null) {
                                    return 'Please select a medicine to trade';
                                  }
                                  return null;
                                },
                              ),

                              const SizedBox(height: 16),

                              // Exchange Quantity
                              TextFormField(
                                controller: exchangeQuantityController,
                                decoration: InputDecoration(
                                  labelText: 'Quantity to Trade *',
                                  hintText: selectedMyInventory != null
                                      ? 'Max: ${selectedMyInventory!.availableQuantity}'
                                      : 'Select medicine first',
                                  border: const OutlineInputBorder(),
                                  suffixText: selectedMyInventory?.packaging ?? 'units',
                                  prefixIcon: const Icon(Icons.inventory_2),
                                ),
                                keyboardType: TextInputType.number,
                                enabled: selectedMyInventory != null,
                                validator: (value) {
                                  if (proposalType == ProposalType.exchange) {
                                    if (value == null || value.isEmpty) {
                                      return 'Quantity is required';
                                    }
                                    final quantity = int.tryParse(value);
                                    if (quantity == null || quantity <= 0) {
                                      return 'Enter a valid quantity';
                                    }
                                    if (selectedMyInventory != null &&
                                        quantity > selectedMyInventory!.availableQuantity) {
                                      return 'Cannot exceed ${selectedMyInventory!.availableQuantity} units';
                                    }
                                  }
                                  return null;
                                },
                              ),

                              const SizedBox(height: 16),

                              // Exchange Summary
                              if (selectedMyInventory != null && exchangeQuantityController.text.isNotEmpty)
                                Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF1976D2).withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(color: const Color(0xFF1976D2)),
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Text(
                                        'Exchange Summary:',
                                        style: TextStyle(
                                          fontWeight: FontWeight.bold,
                                          fontSize: 14,
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      Row(
                                        children: [
                                          const Icon(Icons.arrow_forward, size: 16, color: Color(0xFF1976D2)),
                                          const SizedBox(width: 8),
                                          Expanded(
                                            child: Text(
                                              'You give: ${exchangeQuantityController.text} ${selectedMyInventory!.packaging} of ${selectedMyInventory!.medicine?.name ?? 'Unknown'}',
                                              style: const TextStyle(fontSize: 13),
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 4),
                                      Row(
                                        children: [
                                          const Icon(Icons.arrow_back, size: 16, color: Color(0xFF1976D2)),
                                          const SizedBox(width: 8),
                                          Expanded(
                                            child: Text(
                                              'You receive: ${quantityController.text.isEmpty ? "?" : quantityController.text} ${widget.inventoryItem.packaging} of ${widget.inventoryItem.medicine?.name ?? 'Unknown'}',
                                              style: const TextStyle(fontSize: 13),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),

                              const SizedBox(height: 16),
                            ],

                            // Quantity Requested (for both types)
                            TextFormField(
                              controller: quantityController,
                              decoration: InputDecoration(
                                labelText: proposalType == ProposalType.exchange
                                    ? 'Quantity Requested *'
                                    : 'Quantity to Purchase *',
                                hintText: 'Max: ${widget.inventoryItem.availableQuantity}',
                                border: const OutlineInputBorder(),
                                suffixText: widget.inventoryItem.packaging,
                                prefixIcon: Icon(
                                  proposalType == ProposalType.exchange
                                      ? Icons.swap_calls
                                      : Icons.shopping_bag,
                                ),
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

                            // Price Offer (only for purchase)
                            if (proposalType == ProposalType.purchase) ...[
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
                                        prefixIcon: Icon(Icons.attach_money),
                                      ),
                                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                      validator: (value) {
                                        if (proposalType == ProposalType.purchase) {
                                          if (value == null || value.isEmpty) {
                                            return 'Price is required';
                                          }
                                          final price = double.tryParse(value);
                                          if (price == null || price <= 0) {
                                            return 'Enter a valid price';
                                          }
                                        }
                                        return null;
                                      },
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    flex: 1,
                                    child: DropdownButtonFormField<String>(
                                      value: selectedCurrency,
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

                              // Total Calculation (only for purchase)
                              if (quantityController.text.isNotEmpty && priceController.text.isNotEmpty)
                                Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: Colors.green.withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(color: Colors.green),
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
                                          color: Colors.green,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),

                              const SizedBox(height: 16),
                            ],

                            // Additional Notes
                            TextFormField(
                              controller: notesController,
                              decoration: const InputDecoration(
                                labelText: 'Additional Notes (Optional)',
                                hintText: 'Any special requirements or comments...',
                                border: OutlineInputBorder(),
                                prefixIcon: Icon(Icons.note),
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
                            proposalType == ProposalType.exchange
                                ? '• Your exchange proposal will be sent to the pharmacy\n• They can accept, reject, or counter-offer\n• Both medicines are held securely until delivery\n• You\'ll be notified of their decision'
                                : '• Your purchase proposal will be sent to the pharmacy\n• They can accept, reject, or counter-offer\n• Payment is held securely until delivery\n• You\'ll be notified of their decision',
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
                    backgroundColor: proposalType == ProposalType.exchange
                        ? const Color(0xFF1976D2)
                        : Colors.green,
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
                      : Text(
                          proposalType == ProposalType.exchange
                              ? 'Submit Exchange Proposal'
                              : 'Submit Purchase Proposal',
                          style: const TextStyle(
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

    // FIX #2: Prevent self-proposals (cannot propose on own inventory)
    final currentUser = FirebaseAuth.instance.currentUser;
    if (currentUser == null) {
      throw UnauthorizedException('User not logged in');
    }

    if (widget.inventoryItem.pharmacyId == currentUser.uid) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('❌ Cannot create proposal for your own inventory'),
            backgroundColor: Colors.red,
            duration: Duration(seconds: 4),
          ),
        );
      }
      return;
    }

    // 🔒 CRITICAL SERVER-SIDE SUBSCRIPTION CHECK (SECURE)
    final accessResult = await SecureSubscriptionService.validateProposalAccess();

    // TEMPORARY FIX: Check if user has trial subscription
    if (!accessResult.canAccess) {
      // Check if user is in trial period (backend might not recognize trial as valid)
      final statusResult = await SecureSubscriptionService.getSubscriptionStatus();
      final isInTrial = statusResult.isInTrial && (statusResult.daysRemaining ?? 0) > 0;

      if (!isInTrial) {
        // Only block if NOT in trial
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('❌ Proposal Access Denied: ${accessResult.error ?? "Subscription required"}'),
              backgroundColor: Colors.red,
              duration: const Duration(seconds: 5),
              action: SnackBarAction(
                label: 'Upgrade',
                textColor: Colors.white,
                onPressed: () {
                  // TODO: Navigate to subscription upgrade screen
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Subscription upgrade coming soon!'),
                      backgroundColor: Colors.blue,
                    ),
                  );
                },
              ),
            ),
          );
        }
        return;
      } else {
        // User is in trial - allow proposal creation
        debugPrint('✅ Trial user allowed: ${statusResult.daysRemaining} days remaining');
      }
    }

    setState(() {
      isLoading = true;
    });

    try {
      // currentUser already validated in FIX #2 above
      final quantity = int.parse(quantityController.text);

      // Create proposal details based on type
      ProposalDetails details;

      if (proposalType == ProposalType.exchange) {
        if (selectedMyInventory == null) {
          throw Exception('Please select a medicine to trade');
        }
        final exchangeQuantity = int.parse(exchangeQuantityController.text);

        details = ProposalDetails(
          offeredPrice: 0.0,
          requestedQuantity: quantity,
          currency: selectedCurrency,
          proposalType: ProposalType.exchange,
          exchangeMedicineId: selectedMyInventory!.medicineId,
          exchangeInventoryItemId: selectedMyInventory!.id,
          exchangeQuantity: exchangeQuantity,
        );
      } else {
        // Purchase proposal: include price
        final pricePerUnit = double.parse(priceController.text);
        final totalCost = quantity * pricePerUnit;

        // FIX #3: Check wallet balance for purchase proposals
        final hasSufficientBalance = await WalletService.hasSufficientBalance(
          currentUser.uid,
          totalCost,
        );

        if (!hasSufficientBalance) {
          final currentBalance = await WalletService.getBalance(currentUser.uid);
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  '❌ Insufficient balance. Required: ${totalCost.toStringAsFixed(2)} $selectedCurrency, Available: ${currentBalance.toStringAsFixed(2)} $selectedCurrency',
                ),
                backgroundColor: Colors.red,
                duration: const Duration(seconds: 6),
                action: SnackBarAction(
                  label: 'Add Money',
                  textColor: Colors.white,
                  onPressed: () {
                    // TODO: Navigate to wallet top-up screen
                  },
                ),
              ),
            );
          }
          setState(() {
            isLoading = false;
          });
          return;
        }

        details = ProposalDetails(
          offeredPrice: pricePerUnit,
          requestedQuantity: quantity,
          currency: selectedCurrency,
          proposalType: ProposalType.purchase,
        );
      }

      // FIX #4: Create proposal directly with correct details (no redundant factory call)
      final now = DateTime.now();
      final proposal = ExchangeProposal(
        id: '', // Will be set by service
        inventoryItemId: widget.inventoryItem.id,
        fromPharmacyId: currentUser.uid,
        toPharmacyId: widget.inventoryItem.pharmacyId,
        details: details,
        status: ProposalStatus.pending,
        createdAt: now,
        updatedAt: now,
        expiresAt: now.add(const Duration(hours: 48)),
      );

      // FIX #1: Use service layer (replaces direct Firestore access)
      await ExchangeProposalService.createProposal(proposal);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            proposalType == ProposalType.exchange
                ? 'Exchange proposal submitted successfully!'
                : 'Purchase proposal submitted successfully!',
          ),
          backgroundColor: Colors.green,
        ),
      );

      if (!mounted) return;
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
      if (mounted) {
        setState(() {
          isLoading = false;
        });
      }
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

/// Custom widget for proposal type button
class _ProposalTypeButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isSelected;
  final Color color;
  final VoidCallback onTap;

  const _ProposalTypeButton({
    required this.icon,
    required this.label,
    required this.isSelected,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
        decoration: BoxDecoration(
          color: isSelected ? color.withValues(alpha: 0.1) : Colors.grey.shade100,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected ? color : Colors.grey.shade300,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Column(
          children: [
            Icon(
              icon,
              color: isSelected ? color : Colors.grey.shade600,
              size: 32,
            ),
            const SizedBox(height: 8),
            Text(
              label,
              style: TextStyle(
                color: isSelected ? color : Colors.grey.shade700,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.w600,
                fontSize: 14,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
