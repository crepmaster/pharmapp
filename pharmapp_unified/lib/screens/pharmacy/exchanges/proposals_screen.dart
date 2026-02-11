import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../../models/exchange_proposal.dart';
import '../../../models/pharmacy_inventory.dart';
import 'exchange_status_screen.dart';

class ProposalsScreen extends StatefulWidget {
  const ProposalsScreen({super.key});

  @override
  State<ProposalsScreen> createState() => _ProposalsScreenState();
}

class _ProposalsScreenState extends State<ProposalsScreen> 
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final currentUserId = FirebaseAuth.instance.currentUser?.uid;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
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
        title: const Text('Proposals'),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          tabs: const [
            Tab(text: 'Received'),
            Tab(text: 'Sent'),
            Tab(text: 'Active'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildReceivedProposals(),
          _buildSentProposals(),
          _buildActiveExchanges(),
        ],
      ),
    );
  }

  Widget _buildReceivedProposals() {
    if (currentUserId == null) {
      return const Center(child: Text('Please log in to view proposals'));
    }

    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('exchange_proposals')
          .where('toPharmacyId', isEqualTo: currentUserId)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        if (snapshot.hasError) {
          return Center(child: Text('Error: ${snapshot.error}'));
        }

        final proposals = (snapshot.data?.docs.map((doc) {
          return ExchangeProposal.fromFirestore(doc);
        }).toList() ?? [])
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt)); // Sort by newest first

        if (proposals.isEmpty) {
          return _buildEmptyState(
            'No proposals received',
            'Proposals from other pharmacies will appear here',
            Icons.inbox,
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16.0),
          itemCount: proposals.length,
          itemBuilder: (context, index) {
            final proposal = proposals[index];
            return _buildReceivedProposalCard(proposal);
          },
        );
      },
    );
  }

  Widget _buildSentProposals() {
    if (currentUserId == null) {
      return const Center(child: Text('Please log in to view proposals'));
    }

    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('exchange_proposals')
          .where('fromPharmacyId', isEqualTo: currentUserId)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        if (snapshot.hasError) {
          return Center(child: Text('Error: ${snapshot.error}'));
        }

        final proposals = (snapshot.data?.docs.map((doc) {
          return ExchangeProposal.fromFirestore(doc);
        }).toList() ?? [])
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt)); // Sort by newest first

        if (proposals.isEmpty) {
          return _buildEmptyState(
            'No proposals sent',
            'Browse available medicines to make your first proposal',
            Icons.send,
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16.0),
          itemCount: proposals.length,
          itemBuilder: (context, index) {
            final proposal = proposals[index];
            return _buildSentProposalCard(proposal);
          },
        );
      },
    );
  }

  Widget _buildActiveExchanges() {
    if (currentUserId == null) {
      return const Center(child: Text('Please log in to view exchanges'));
    }

    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('exchange_proposals')
          .where('status', isEqualTo: 'accepted')
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        if (snapshot.hasError) {
          return Center(child: Text('Error: ${snapshot.error}'));
        }

        final proposals = snapshot.data?.docs.map((doc) {
          return ExchangeProposal.fromFirestore(doc);
        }).where((proposal) =>
            proposal.fromPharmacyId == currentUserId ||
            proposal.toPharmacyId == currentUserId).toList() ?? [];

        if (proposals.isEmpty) {
          return _buildEmptyState(
            'No active exchanges',
            'Accepted proposals will show delivery progress here',
            Icons.local_shipping,
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16.0),
          itemCount: proposals.length,
          itemBuilder: (context, index) {
            final proposal = proposals[index];
            return _buildActiveExchangeCard(proposal);
          },
        );
      },
    );
  }

  Widget _buildReceivedProposalCard(ExchangeProposal proposal) {
    return FutureBuilder<PharmacyInventoryItem?>(
      future: _getInventoryItem(proposal.inventoryItemId),
      builder: (context, snapshot) {
        final inventoryItem = snapshot.data;
        
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
                    Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        color: _getStatusColor(proposal.status),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      proposal.status.displayName,
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: _getStatusColor(proposal.status),
                      ),
                    ),
                    const Spacer(),
                    Text(
                      _formatDate(proposal.createdAt),
                      style: TextStyle(
                        color: Colors.grey[500],
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
                
                const SizedBox(height: 12),
                
                if (inventoryItem != null) ...[
                  Text(
                    inventoryItem.medicine?.name ?? 'Unknown Medicine',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    '${inventoryItem.medicine?.genericName ?? 'Unknown'} • ${inventoryItem.medicine?.strength ?? ''}',
                    style: TextStyle(color: Colors.grey[600]),
                  ),
                ] else
                  const Text('Loading medicine details...'),
                
                const SizedBox(height: 12),
                
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.grey[50],
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Quantity:'),
                          Text('${proposal.details.requestedQuantity} units'),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Price per unit:'),
                          Text('${proposal.details.offeredPrice} ${proposal.details.currency}'),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Total:', style: TextStyle(fontWeight: FontWeight.bold)),
                          Text(
                            '${proposal.details.totalOfferAmount} ${proposal.details.currency}',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                
                if (proposal.isPending) ...[
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton(
                          onPressed: () => _acceptProposal(proposal),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.green,
                            foregroundColor: Colors.white,
                          ),
                          child: const Text('Accept'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => _rejectProposal(proposal),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.red,
                            side: const BorderSide(color: Colors.red),
                          ),
                          child: const Text('Reject'),
                        ),
                      ),
                    ],
                  ),
                ] else ...[
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => ExchangeStatusScreen(
                              proposalId: proposal.id,
                              exchangeId: null, // Will be loaded from proposal
                            ),
                          ),
                        );
                      },
                      child: const Text('View Details'),
                    ),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildSentProposalCard(ExchangeProposal proposal) {
    return FutureBuilder<PharmacyInventoryItem?>(
      future: _getInventoryItem(proposal.inventoryItemId),
      builder: (context, snapshot) {
        final inventoryItem = snapshot.data;
        
        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          elevation: 2,
          child: InkWell(
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => ExchangeStatusScreen(
                    proposalId: proposal.id,
                    exchangeId: null,
                  ),
                ),
              );
            },
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          color: _getStatusColor(proposal.status),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        proposal.status.displayName,
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: _getStatusColor(proposal.status),
                        ),
                      ),
                      const Spacer(),
                      Text(
                        _formatDate(proposal.createdAt),
                        style: TextStyle(
                          color: Colors.grey[500],
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                  
                  const SizedBox(height: 12),
                  
                  if (inventoryItem != null) ...[
                    Text(
                      inventoryItem.medicine?.name ?? 'Unknown Medicine',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      '${inventoryItem.medicine?.genericName ?? 'Unknown'} • ${inventoryItem.medicine?.strength ?? ''}',
                      style: TextStyle(color: Colors.grey[600]),
                    ),
                  ] else
                    const Text('Loading medicine details...'),
                  
                  const SizedBox(height: 8),
                  
                  Text(
                    'Offered: ${proposal.details.totalOfferAmount} ${proposal.details.currency} for ${proposal.details.requestedQuantity} units',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  
                  if (proposal.rejectionReason != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.red.shade50,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        'Reason: ${proposal.rejectionReason}',
                        style: TextStyle(
                          color: Colors.red.shade700,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildActiveExchangeCard(ExchangeProposal proposal) {
    final isMyExchange = proposal.fromPharmacyId == currentUserId;
    
    return FutureBuilder<PharmacyInventoryItem?>(
      future: _getInventoryItem(proposal.inventoryItemId),
      builder: (context, snapshot) {
        final inventoryItem = snapshot.data;
        
        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          elevation: 2,
          child: InkWell(
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => ExchangeStatusScreen(
                    proposalId: proposal.id,
                    exchangeId: null,
                  ),
                ),
              );
            },
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.local_shipping, color: Colors.green),
                      const SizedBox(width: 8),
                      Text(
                        isMyExchange ? 'You are buying' : 'You are selling',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.green.shade100,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Text(
                          'In Progress',
                          style: TextStyle(
                            color: Colors.green,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                  
                  const SizedBox(height: 12),
                  
                  if (inventoryItem != null) ...[
                    Text(
                      inventoryItem.medicine?.name ?? 'Unknown Medicine',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      '${proposal.details.requestedQuantity} units • ${proposal.details.totalOfferAmount} ${proposal.details.currency}',
                      style: TextStyle(color: Colors.grey[600]),
                    ),
                  ],
                  
                  const SizedBox(height: 12),
                  
                  // Delivery status placeholder
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
                            'Courier assignment pending. You will be notified when delivery starts.',
                            style: TextStyle(
                              color: Colors.blue.shade700,
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
        );
      },
    );
  }

  Widget _buildEmptyState(String title, String subtitle, IconData icon) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 64, color: Colors.grey),
          const SizedBox(height: 16),
          Text(
            title,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.grey,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            subtitle,
            style: const TextStyle(color: Colors.grey),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Future<PharmacyInventoryItem?> _getInventoryItem(String inventoryItemId) async {
    try {
      final doc = await FirebaseFirestore.instance
          .collection('pharmacy_inventory')
          .doc(inventoryItemId)
          .get();
      
      if (doc.exists) {
        return PharmacyInventoryItem.fromFirestore(doc);
      }
    } catch (e) {
      debugPrint('Error loading inventory item: $e');
    }
    return null;
  }

  Color _getStatusColor(ProposalStatus status) {
    switch (status) {
      case ProposalStatus.pending:
        return Colors.orange;
      case ProposalStatus.accepted:
        return Colors.green;
      case ProposalStatus.rejected:
        return Colors.red;
      case ProposalStatus.expired:
        return Colors.grey;
      case ProposalStatus.completed:
        return Colors.blue;
      case ProposalStatus.cancelled:
        return Colors.purple;
    }
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final difference = now.difference(date);
    
    if (difference.inDays > 0) {
      return '${difference.inDays}d ago';
    } else if (difference.inHours > 0) {
      return '${difference.inHours}h ago';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes}m ago';
    } else {
      return 'Just now';
    }
  }

  Future<void> _acceptProposal(ExchangeProposal proposal) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Accept Proposal'),
        content: Text(
          'Accept this proposal for ${proposal.details.totalOfferAmount} ${proposal.details.currency}?\n\nThis will create an exchange hold and notify the buyer.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
            child: const Text('Accept'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await proposal.acceptProposal();

        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Proposal accepted! Exchange created.'),
            backgroundColor: Colors.green,
          ),
        );
      } catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to accept proposal: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _rejectProposal(ExchangeProposal proposal) async {
    final reasonController = TextEditingController();
    
    final reason = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reject Proposal'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Why are you rejecting this proposal?'),
            const SizedBox(height: 16),
            TextField(
              controller: reasonController,
              decoration: const InputDecoration(
                hintText: 'Reason (optional)',
                border: OutlineInputBorder(),
              ),
              maxLines: 2,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, reasonController.text),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Reject'),
          ),
        ],
      ),
    );

    if (reason != null) {
      try {
        await proposal.rejectProposal(reason.isEmpty ? 'No reason provided' : reason);

        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Proposal rejected'),
            backgroundColor: Colors.orange,
          ),
        );
      } catch (e) {
        if (!mounted) return;
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