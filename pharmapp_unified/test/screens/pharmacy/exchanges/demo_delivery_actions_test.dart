import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pharmapp_unified/screens/pharmacy/exchanges/exchange_status_screen.dart';

/// Demo delivery controls (staging manual delivery progression).
///
/// The pure derivation (nextJourneyAction / outboundPhaseFor) is tested
/// directly; the widget is exercised via its `actionRunner` test seam so the
/// spinner / disabled / error paths never touch Firebase.
void main() {
  group('nextJourneyAction (pure)', () {
    String? next(String outbound,
            {bool ret = false, String rp = 'not_required'}) =>
        nextJourneyAction(
            outboundPhase: outbound, returnRequired: ret, returnPhase: rp);

    test('outbound chain exposes exactly one next action per phase', () {
      expect(next('assigned'), 'start_pickup');
      expect(next('en_route_to_pickup'), 'confirm_pickup');
      expect(next('picked_up'), 'start_delivery');
      expect(next('en_route_to_dropoff'), 'confirm_delivered');
    });

    test('delivered without return → no next action', () {
      expect(next('delivered', ret: false), isNull);
    });

    test('return chain only when returnRequired', () {
      expect(next('delivered', ret: true, rp: 'awaiting_return'),
          'start_return_pickup');
      expect(next('delivered', ret: true, rp: 'en_route_to_return_pickup'),
          'confirm_return_pickup');
      expect(next('delivered', ret: true, rp: 'return_picked_up'),
          'start_return_delivery');
      expect(next('delivered', ret: true, rp: 'en_route_to_return_dropoff'),
          'confirm_return_delivered');
      expect(next('delivered', ret: true, rp: 'return_delivered'), isNull);
    });

    test('return actions are NOT offered when returnRequired is false', () {
      expect(next('delivered', ret: false, rp: 'awaiting_return'), isNull);
    });
  });

  group('outboundPhaseFor (pure)', () {
    test('prefers the journey phase when present', () {
      expect(
          outboundPhaseFor({'outboundPhase': 'en_route_to_dropoff'}, 'pending'),
          'en_route_to_dropoff');
    });

    test('synthesizes from status when no journey (survives a refresh)', () {
      expect(outboundPhaseFor(null, 'pending'), 'assigned');
      expect(outboundPhaseFor(null, 'picked_up'), 'picked_up');
      expect(outboundPhaseFor(null, 'in_transit'), 'picked_up');
      expect(outboundPhaseFor(null, 'delivered'), 'delivered');
      expect(outboundPhaseFor(null, 'completed'), 'delivered');
    });
  });

  Widget host(Widget child) => MaterialApp(home: Scaffold(body: child));

  DemoDeliveryActions widget({
    String status = 'pending',
    Map<String, dynamic>? journey,
    Future<void> Function(String action)? runner,
  }) =>
      DemoDeliveryActions(
        deliveryId: 'd-1',
        currentStatus: status,
        journey: journey,
        actionRunner: runner ?? (_) async {},
      );

  group('DemoDeliveryActions widget', () {
    testWidgets('title is "Demo delivery controls"', (tester) async {
      await tester.pumpWidget(host(widget()));
      expect(find.text('Demo delivery controls'), findsOneWidget);
    });

    testWidgets('shows exactly one next-action button', (tester) async {
      await tester.pumpWidget(host(widget(status: 'pending')));
      expect(find.byKey(const Key('demo-next-action')), findsOneWidget);
      expect(find.text('Start pickup'), findsOneWidget);
      // No other journey label leaks in.
      expect(find.text('Confirm delivered'), findsNothing);
    });

    testWidgets('shows the current phase label', (tester) async {
      await tester.pumpWidget(host(widget(
        journey: {'outboundPhase': 'en_route_to_dropoff'},
        status: 'picked_up',
      )));
      expect(find.byKey(const Key('demo-phase-label')), findsOneWidget);
      expect(find.text('Step: On the way to drop-off'), findsOneWidget);
      expect(find.text('Confirm delivered'), findsOneWidget);
    });

    testWidgets('return controls hidden when returnRequired is false',
        (tester) async {
      await tester.pumpWidget(host(widget(
        journey: {
          'outboundPhase': 'delivered',
          'returnRequired': false,
          'returnPhase': 'not_required'
        },
        status: 'delivered',
      )));
      expect(find.byKey(const Key('demo-next-action')), findsNothing);
      expect(find.textContaining('return'), findsNothing);
      expect(find.textContaining('All steps done'), findsOneWidget);
    });

    testWidgets('return control shown when returnRequired is true',
        (tester) async {
      await tester.pumpWidget(host(widget(
        journey: {
          'outboundPhase': 'delivered',
          'returnRequired': true,
          'returnPhase': 'awaiting_return'
        },
        status: 'delivered',
      )));
      expect(find.text('Start return pickup'), findsOneWidget);
    });

    testWidgets('failed status offers Reset', (tester) async {
      await tester.pumpWidget(host(widget(status: 'failed')));
      expect(find.text('Reset delivery'), findsOneWidget);
      expect(find.byKey(const Key('demo-next-action')), findsNothing);
    });

    testWidgets('button shows inline spinner and is disabled during the call',
        (tester) async {
      final completer = Completer<void>();
      await tester.pumpWidget(host(widget(runner: (_) => completer.future)));

      expect(find.byType(CircularProgressIndicator), findsNothing);
      await tester.tap(find.byKey(const Key('demo-next-action')));
      await tester.pump(); // start the async op

      // Inline spinner visible; button disabled (onPressed null).
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      final btn = tester
          .widget<ElevatedButton>(find.byKey(const Key('demo-next-action')));
      expect(btn.onPressed, isNull);

      completer.complete();
      await tester.pumpAndSettle();
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });

    testWidgets('backend error shows a red snackbar', (tester) async {
      await tester.pumpWidget(host(widget(runner: (_) async {
        throw Exception('boom');
      })));
      await tester.tap(find.byKey(const Key('demo-next-action')));
      await tester.pump(); // trigger
      await tester.pump(); // snackbar
      expect(find.textContaining('Demo action failed'), findsOneWidget);
      // The failure must READ as a failure, not just say so.
      final snack = tester.widget<SnackBar>(find.byType(SnackBar));
      expect(snack.backgroundColor, Colors.red);
    });

    testWidgets('renders no hardcoded currency or money amount',
        (tester) async {
      await tester.pumpWidget(host(widget(
        journey: {'outboundPhase': 'en_route_to_dropoff'},
        status: 'picked_up',
      )));
      expect(find.textContaining('XAF'), findsNothing);
      expect(find.textContaining('GHS'), findsNothing);
      expect(find.textContaining('FCFA'), findsNothing);
      expect(find.textContaining(RegExp(r'\d')), findsNothing);
    });
  });
}
