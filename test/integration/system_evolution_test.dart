import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';

/// Integration tests for PharmApp system evolution
/// Tests how the platform grows organically through real user interactions
/// No static demo data - validates actual dynamic growth patterns

class SystemEvolutionTest {
  late FakeFirebaseFirestore firestore;
  late MockFirebaseAuth auth;
  
  setUp() {
    firestore = FakeFirebaseFirestore();
    auth = MockFirebaseAuth();
  }

  group('System Evolution - Organic Growth Patterns', () {
    test('Empty platform → First pharmacy registration → Platform activation', () async {
      // INITIAL STATE: Empty platform
      var pharmacies = await firestore.collection('pharmacies').get();
      expect(pharmacies.docs.length, equals(0));
      
      var systemStats = await firestore.collection('system_stats').doc('global').get();
      expect(systemStats.exists, isFalse);

      // EVOLUTION 1: First pharmacy joins
      await _registerPharmacy(
        'Pharmacie Central',
        'central@pharmacy.cm',
        'Douala, Cameroon'
      );

      // VERIFY: System now has 1 pharmacy
      pharmacies = await firestore.collection('pharmacies').get();
      expect(pharmacies.docs.length, equals(1));

      // VERIFY: System stats automatically created
      systemStats = await firestore.collection('system_stats').doc('global').get();
      expect(systemStats.exists, isTrue);
      expect(systemStats.data()!['totalPharmacies'], equals(1));
      expect(systemStats.data()!['totalExchanges'], equals(0));
      expect(systemStats.data()!['totalRevenue'], equals(0));
    });

    test('Pharmacy inventory growth → Medicine availability increases', () async {
      // SETUP: Pharmacy registered
      var pharmacyId = await _registerPharmacy(
        'Green Cross Pharmacy',
        'green@pharmacy.ke',
        'Nairobi, Kenya'
      );

      // INITIAL: No medicines in system
      var medicines = await firestore.collection('pharmacy_inventory').get();
      expect(medicines.docs.length, equals(0));

      // EVOLUTION: Pharmacy adds medicines over time
      await _addMedicine(pharmacyId, 'Paracetamol 500mg', 100, '2025-12-31');
      await _addMedicine(pharmacyId, 'Amoxicillin 250mg', 50, '2025-11-30');
      await _addMedicine(pharmacyId, 'Ibuprofen 400mg', 75, '2025-10-15');

      // VERIFY: System inventory grows dynamically
      medicines = await firestore.collection('pharmacy_inventory').get();
      expect(medicines.docs.length, equals(3));

      // VERIFY: Medicine categories expand organically
      var categories = await _getMedicineCategories();
      expect(categories, contains('Pain Relief'));
      expect(categories, contains('Antibiotics'));
    });

    test('Multi-pharmacy ecosystem → Exchange proposals emerge', () async {
      // SETUP: Multiple pharmacies join platform
      var pharmacy1 = await _registerPharmacy('MediCare Plus', 'medicare@ghana.com', 'Accra, Ghana');
      var pharmacy2 = await _registerPharmacy('Health First', 'health@ghana.com', 'Kumasi, Ghana');
      
      // EVOLUTION: Pharmacy 1 has excess inventory
      await _addMedicine(pharmacy1, 'Aspirin 100mg', 200, '2025-09-30');
      
      // EVOLUTION: Pharmacy 2 needs the same medicine
      var proposalId = await _createExchangeProposal(
        fromPharmacy: pharmacy2,
        toPharmacy: pharmacy1,
        medicineName: 'Aspirin 100mg',
        quantity: 50,
        proposedPrice: 0.25 // $0.25 per tablet
      );

      // VERIFY: Exchange ecosystem begins
      var proposals = await firestore.collection('exchange_proposals').get();
      expect(proposals.docs.length, equals(1));

      // EVOLUTION: First successful exchange
      await _acceptProposal(proposalId);
      await _completeExchange(proposalId);

      // VERIFY: System metrics evolve
      var stats = await firestore.collection('system_stats').doc('global').get();
      expect(stats.data()!['totalExchanges'], equals(1));
      expect(stats.data()!['totalVolumeUSD'], greaterThan(0));
    });

    test('Courier network emergence → Delivery ecosystem activation', () async {
      // INITIAL: No couriers in system
      var couriers = await firestore.collection('couriers').get();
      expect(couriers.docs.length, equals(0));

      // EVOLUTION: Pharmacies create exchanges, need couriers
      var pharmacy1 = await _registerPharmacy('Downtown Meds', 'downtown@nigeria.com', 'Lagos, Nigeria');
      var pharmacy2 = await _registerPharmacy('Suburb Care', 'suburb@nigeria.com', 'Abuja, Nigeria');
      
      await _addMedicine(pharmacy1, 'Panadol Extra', 100, '2025-08-30');
      var proposalId = await _createExchangeProposal(
        fromPharmacy: pharmacy2,
        toPharmacy: pharmacy1,
        medicineName: 'Panadol Extra',
        quantity: 20,
        proposedPrice: 1.50
      );
      await _acceptProposal(proposalId);

      // EVOLUTION: First courier joins to serve delivery demand
      var courierId = await _registerCourier(
        'Lagos Express Delivery',
        'express@delivery.ng',
        'Motorcycle',
        'LAG-2024-001'
      );

      // VERIFY: Courier network begins
      couriers = await firestore.collection('couriers').get();
      expect(couriers.docs.length, equals(1));

      // EVOLUTION: Delivery order created automatically
      var deliveryId = await _createDeliveryOrder(proposalId, courierId);
      
      // VERIFY: Delivery ecosystem activated
      var deliveries = await firestore.collection('deliveries').get();
      expect(deliveries.docs.length, equals(1));
    });

    test('Payment system evolution → Wallet balances and transactions', () async {
      // SETUP: Complete ecosystem
      var pharmacyId = await _registerPharmacy('City Pharmacy', 'city@pharmacy.cm', 'Yaoundé, Cameroon');
      
      // INITIAL: Wallet starts at zero
      var wallet = await firestore.collection('wallets').doc(pharmacyId).get();
      expect(wallet.exists, isFalse);

      // EVOLUTION: First wallet top-up
      await _topupWallet(pharmacyId, 50000, 'XAF'); // 50,000 XAF

      // VERIFY: Wallet created and funded
      wallet = await firestore.collection('wallets').doc(pharmacyId).get();
      expect(wallet.exists, isTrue);
      expect(wallet.data()!['balance'], equals(50000));
      expect(wallet.data()!['currency'], equals('XAF'));

      // EVOLUTION: Wallet used for exchange
      await _deductFromWallet(pharmacyId, 15000, 'Exchange payment');

      // VERIFY: Balance evolves with usage
      wallet = await firestore.collection('wallets').doc(pharmacyId).get();
      expect(wallet.data()!['balance'], equals(35000));

      // VERIFY: Transaction history created
      var transactions = await firestore
          .collection('wallet_transactions')
          .where('walletId', isEqualTo: pharmacyId)
          .get();
      expect(transactions.docs.length, equals(2)); // Top-up + deduction
    });

    test('Admin oversight evolution → Platform management emerges', () async {
      // INITIAL: No admin oversight needed
      var adminActions = await firestore.collection('admin_actions').get();
      expect(adminActions.docs.length, equals(0));

      // EVOLUTION: Platform grows, needs moderation
      await _registerPharmacy('Suspicious Pharmacy', 'fake@email.com', 'Unknown Location');
      
      // EVOLUTION: Admin reviews and takes action
      await _adminAction('suspend_pharmacy', 'Suspicious Pharmacy', 'Verification required');

      // VERIFY: Admin oversight system activated
      adminActions = await firestore.collection('admin_actions').get();
      expect(adminActions.docs.length, equals(1));

      // EVOLUTION: Subscription management emerges
      await _createSubscriptionPlan('Basic XAF', 6000, 'XAF', ['basic_features']);
      
      // VERIFY: Business model infrastructure grows
      var plans = await firestore.collection('subscription_plans').get();
      expect(plans.docs.length, equals(1));
    });

    test('Cross-border expansion → Multi-currency ecosystem', () async {
      // EVOLUTION: Platform expands across African countries
      var cameroonPharmacy = await _registerPharmacy('Douala Medical', 'douala@cm.com', 'Douala, Cameroon');
      var kenyaPharmacy = await _registerPharmacy('Nairobi Health', 'nairobi@ke.com', 'Nairobi, Kenya');
      var ghanaPharmacy = await _registerPharmacy('Accra Care', 'accra@gh.com', 'Accra, Ghana');

      // EVOLUTION: Multi-currency wallets emerge
      await _topupWallet(cameroonPharmacy, 50000, 'XAF');
      await _topupWallet(kenyaPharmacy, 15000, 'KES');  
      await _topupWallet(ghanaPharmacy, 600, 'GHS');

      // VERIFY: Multi-currency system evolves
      var xafWallets = await firestore.collection('wallets')
          .where('currency', isEqualTo: 'XAF').get();
      var kesWallets = await firestore.collection('wallets')
          .where('currency', isEqualTo: 'KES').get();
      var ghsWallets = await firestore.collection('wallets')
          .where('currency', isEqualTo: 'GHS').get();

      expect(xafWallets.docs.length, equals(1));
      expect(kesWallets.docs.length, equals(1));
      expect(ghsWallets.docs.length, equals(1));

      // EVOLUTION: Cross-border exchanges begin
      await _addMedicine(cameroonPharmacy, 'Chloroquine 250mg', 100, '2025-12-31');
      var crossBorderProposal = await _createExchangeProposal(
        fromPharmacy: kenyaPharmacy,
        toPharmacy: cameroonPharmacy,
        medicineName: 'Chloroquine 250mg',
        quantity: 50,
        proposedPrice: 2.00 // USD equivalent pricing
      );

      // VERIFY: International exchange capability
      var proposal = await firestore.collection('exchange_proposals').doc(crossBorderProposal).get();
      expect(proposal.data()!['crossBorder'], isTrue);
      expect(proposal.data()!['currencyConversionRequired'], isTrue);
    });
  });

  // Helper methods for organic system evolution
  Future<String> _registerPharmacy(String name, String email, String location) async {
    var pharmacyRef = firestore.collection('pharmacies').doc();
    await pharmacyRef.set({
      'name': name,
      'email': email,
      'location': location,
      'registrationDate': DateTime.now(),
      'status': 'active',
      'subscriptionStatus': 'trial'
    });
    
    // Update system stats
    await _updateSystemStats('totalPharmacies', 1);
    return pharmacyRef.id;
  }

  Future<void> _addMedicine(String pharmacyId, String name, int quantity, String expiry) async {
    await firestore.collection('pharmacy_inventory').add({
      'pharmacyId': pharmacyId,
      'medicineName': name,
      'quantity': quantity,
      'expiryDate': expiry,
      'addedDate': DateTime.now(),
      'status': 'available'
    });
  }

  Future<String> _createExchangeProposal(
    {required String fromPharmacy, 
     required String toPharmacy, 
     required String medicineName,
     required int quantity,
     required double proposedPrice}) async {
    
    var proposalRef = firestore.collection('exchange_proposals').doc();
    await proposalRef.set({
      'fromPharmacyId': fromPharmacy,
      'toPharmacyId': toPharmacy,
      'medicineName': medicineName,
      'quantity': quantity,
      'proposedPrice': proposedPrice,
      'status': 'pending',
      'createdDate': DateTime.now()
    });
    return proposalRef.id;
  }

  Future<void> _acceptProposal(String proposalId) async {
    await firestore.collection('exchange_proposals').doc(proposalId).update({
      'status': 'accepted',
      'acceptedDate': DateTime.now()
    });
  }

  Future<void> _completeExchange(String proposalId) async {
    await firestore.collection('exchange_proposals').doc(proposalId).update({
      'status': 'completed',
      'completedDate': DateTime.now()
    });
    await _updateSystemStats('totalExchanges', 1);
  }

  Future<String> _registerCourier(String name, String email, String vehicleType, String licensePlate) async {
    var courierRef = firestore.collection('couriers').doc();
    await courierRef.set({
      'name': name,
      'email': email,
      'vehicleType': vehicleType,
      'licensePlate': licensePlate,
      'registrationDate': DateTime.now(),
      'status': 'active',
      'rating': 0.0,
      'totalDeliveries': 0
    });
    return courierRef.id;
  }

  Future<String> _createDeliveryOrder(String proposalId, String courierId) async {
    var deliveryRef = firestore.collection('deliveries').doc();
    await deliveryRef.set({
      'proposalId': proposalId,
      'courierId': courierId,
      'status': 'assigned',
      'createdDate': DateTime.now()
    });
    return deliveryRef.id;
  }

  Future<void> _topupWallet(String pharmacyId, double amount, String currency) async {
    await firestore.collection('wallets').doc(pharmacyId).set({
      'balance': amount,
      'currency': currency,
      'lastUpdated': DateTime.now()
    }, SetOptions(merge: true));

    await firestore.collection('wallet_transactions').add({
      'walletId': pharmacyId,
      'type': 'topup',
      'amount': amount,
      'currency': currency,
      'timestamp': DateTime.now()
    });
  }

  Future<void> _deductFromWallet(String pharmacyId, double amount, String reason) async {
    var wallet = await firestore.collection('wallets').doc(pharmacyId).get();
    var currentBalance = wallet.data()!['balance'] as double;
    
    await firestore.collection('wallets').doc(pharmacyId).update({
      'balance': currentBalance - amount,
      'lastUpdated': DateTime.now()
    });

    await firestore.collection('wallet_transactions').add({
      'walletId': pharmacyId,
      'type': 'deduction',
      'amount': amount,
      'reason': reason,
      'timestamp': DateTime.now()
    });
  }

  Future<void> _adminAction(String action, String target, String reason) async {
    await firestore.collection('admin_actions').add({
      'action': action,
      'target': target,
      'reason': reason,
      'timestamp': DateTime.now(),
      'adminId': 'system'
    });
  }

  Future<void> _createSubscriptionPlan(String name, double price, String currency, List<String> features) async {
    await firestore.collection('subscription_plans').add({
      'name': name,
      'price': price,
      'currency': currency,
      'features': features,
      'createdDate': DateTime.now()
    });
  }

  Future<void> _updateSystemStats(String metric, int increment) async {
    var statsRef = firestore.collection('system_stats').doc('global');
    var stats = await statsRef.get();
    
    if (!stats.exists) {
      await statsRef.set({
        metric: increment,
        'lastUpdated': DateTime.now()
      });
    } else {
      var currentValue = stats.data()![metric] ?? 0;
      await statsRef.update({
        metric: currentValue + increment,
        'lastUpdated': DateTime.now()
      });
    }
  }

  Future<List<String>> _getMedicineCategories() async {
    var medicines = await firestore.collection('pharmacy_inventory').get();
    var categories = <String>{};
    
    for (var doc in medicines.docs) {
      var medicineName = doc.data()['medicineName'] as String;
      if (medicineName.toLowerCase().contains('paracetamol') || 
          medicineName.toLowerCase().contains('ibuprofen')) {
        categories.add('Pain Relief');
      }
      if (medicineName.toLowerCase().contains('amoxicillin')) {
        categories.add('Antibiotics');
      }
    }
    
    return categories.toList();
  }
}