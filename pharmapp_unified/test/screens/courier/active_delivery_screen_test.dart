import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pharmapp_unified/models/delivery.dart';
import 'package:pharmapp_unified/screens/courier/deliveries/active_delivery_screen.dart';

void main() {
  testWidgets('physical exchange uses the journey and hides old manual actions',
      (tester) async {
    final updates = StreamController<Map<String, dynamic>?>.broadcast();
    final delivery = Delivery(
      id: 'delivery-1',
      exchangeId: 'proposal-1',
      courierId: 'courier-1',
      pickup: const DeliveryLocation(
        pharmacyId: 'seller',
        pharmacyName: 'Seller Pharmacy',
        address: 'Pickup Street',
      ),
      delivery: const DeliveryLocation(
        pharmacyId: 'buyer',
        pharmacyName: 'Buyer Pharmacy',
        address: 'Dropoff Street',
      ),
      items: const [],
      status: DeliveryStatus.accepted,
      courierFee: 10,
      totalPrice: 0,
      currency: 'GHS',
      createdAt: DateTime(2026, 9, 26),
    );

    await tester.pumpWidget(MaterialApp(
      home: ActiveDeliveryScreen(
        delivery: delivery,
        deliveryStream: updates.stream,
      ),
    ));
    updates.add({
      'status': 'picked_up',
      'proposalType': 'exchange',
      'stockTransit': {
        'version': 1,
        'return': {'quantity': 5, 'medicineName': 'Medicine Y'},
      },
      'sandboxJourney': {
        'outboundPhase': 'delivered',
        'returnRequired': true,
        'returnPhase': 'awaiting_return',
      },
    });
    await tester.pump();

    expect(find.text('PICKED UP'), findsOneWidget);
    expect(find.text('Scan Pickup QR Code'), findsNothing);
    expect(find.text('Scan Delivery QR Code'), findsNothing);
    expect(find.text('Manual'), findsNothing);
    expect(find.text('Return: 5 × Medicine Y'), findsOneWidget);

    await updates.close();
  });
}
