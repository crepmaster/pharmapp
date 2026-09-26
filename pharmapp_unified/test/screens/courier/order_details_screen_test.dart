import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pharmapp_unified/models/delivery.dart';
import 'package:pharmapp_unified/screens/courier/deliveries/order_details_screen.dart';

void main() {
  final delivery = Delivery(
    id: 'delivery-1',
    exchangeId: 'proposal-1',
    courierId: '',
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
    status: DeliveryStatus.pending,
    courierFee: 10,
    totalPrice: 100,
    currency: 'GHS',
    createdAt: DateTime(2026, 9, 26),
  );

  Widget host(
    Future<void> Function(String) runner, {
    Map<String, dynamic>? deliveryData,
    Stream<Map<String, dynamic>?>? planStream,
  }) =>
      MaterialApp(
        home: Builder(builder: (context) {
          return Scaffold(
            body: ElevatedButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => OrderDetailsScreen(
                    delivery: delivery,
                    acceptRunner: runner,
                    transportPlanStream: planStream ??
                        Stream.value(
                            deliveryData ?? {'proposalType': 'purchase'}),
                  ),
                ),
              ),
              child: const Text('Open order'),
            ),
          );
        }),
      );

  Future<void> openAndFindAccept(WidgetTester tester) async {
    await tester.tap(find.text('Open order'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Accept This Delivery'));
  }

  testWidgets('accept calls the server once and waits before success',
      (tester) async {
    final calls = <String>[];
    final pending = Completer<void>();
    await tester.pumpWidget(host((id) {
      calls.add(id);
      return pending.future;
    }));
    await openAndFindAccept(tester);

    await tester.tap(find.text('Accept This Delivery'));
    await tester.pump();
    expect(calls, ['delivery-1']);
    expect(find.text('Delivery accepted successfully!'), findsNothing);
    expect(
      tester
          .widget<ElevatedButton>(
            find.ancestor(
              of: find.byType(CircularProgressIndicator).last,
              matching: find.byType(ElevatedButton),
            ),
          )
          .onPressed,
      isNull,
    );

    pending.complete();
    await tester.pumpAndSettle();
    expect(find.text('Open order'), findsOneWidget);
  });

  testWidgets('server refusal stays on detail and shows an error',
      (tester) async {
    await tester.pumpWidget(host((_) async {
      throw Exception('already assigned');
    }));
    await openAndFindAccept(tester);
    await tester.tap(find.text('Accept This Delivery'));
    await tester.pump();
    expect(find.textContaining('already assigned'), findsOneWidget);
    expect(find.text('Order Details'), findsOneWidget);
  });

  testWidgets('shows both medicine legs before accepting an exchange',
      (tester) async {
    await tester.pumpWidget(host((_) async {}, deliveryData: {
      'stockTransit': {
        'version': 1,
        'outbound': {
          'fromPharmacyId': 'seller',
          'toPharmacyId': 'buyer',
          'medicineName': 'Medicine X',
          'quantity': 5,
          'lotNumber': 'LOT-X',
        },
        'return': {
          'fromPharmacyId': 'buyer',
          'toPharmacyId': 'seller',
          'medicineName': 'Medicine Y',
          'quantity': 4,
          'lotNumber': 'LOT-Y',
        },
      },
    }));
    await tester.tap(find.text('Open order'));
    await tester.pumpAndSettle();

    expect(find.text('Transport plan · 2 legs'), findsOneWidget);
    expect(find.text('Outbound: Seller Pharmacy → Buyer Pharmacy'),
        findsOneWidget);
    expect(find.text('Medicine X · 5 units · Lot LOT-X'), findsOneWidget);
    expect(
        find.text('Return: Buyer Pharmacy → Seller Pharmacy'), findsOneWidget);
    expect(find.text('Medicine Y · 4 units · Lot LOT-Y'), findsOneWidget);
    expect(find.text('Accept This Delivery'), findsOneWidget);
  });

  testWidgets('sale does not show a return transport plan', (tester) async {
    await tester.pumpWidget(host((_) async {}, deliveryData: {
      'proposalType': 'purchase',
    }));
    await tester.tap(find.text('Open order'));
    await tester.pumpAndSettle();
    expect(find.text('Transport plan · 2 legs'), findsNothing);
    expect(find.text('Accept This Delivery'), findsOneWidget);
  });

  testWidgets('cannot accept before both exchange legs are visible',
      (tester) async {
    final plans = StreamController<Map<String, dynamic>?>();
    addTearDown(plans.close);
    await tester.pumpWidget(host((_) async {}, planStream: plans.stream));
    await tester.tap(find.text('Open order'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Accept This Delivery'));

    ElevatedButton acceptButton() => tester.widget<ElevatedButton>(
        find.widgetWithText(ElevatedButton, 'Accept This Delivery'));
    expect(acceptButton().onPressed, isNull);

    plans.add({
      'stockTransit': {
        'version': 1,
        'outbound': {'medicineName': 'Medicine X'},
      },
    });
    await tester.pump();
    expect(acceptButton().onPressed, isNull);

    plans.add({
      'stockTransit': {
        'version': 1,
        'outbound': {
          'fromPharmacyId': 'seller',
          'toPharmacyId': 'buyer',
          'medicineName': 'Medicine X',
          'quantity': 5,
        },
        'return': {
          'fromPharmacyId': 'buyer',
          'toPharmacyId': 'seller',
          'medicineName': 'Medicine Y',
          'quantity': 4,
        },
      },
    });
    await tester.pump();
    expect(acceptButton().onPressed, isNotNull);
  });
}
