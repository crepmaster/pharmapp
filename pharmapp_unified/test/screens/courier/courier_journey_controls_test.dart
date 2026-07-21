import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pharmapp_unified/models/delivery_journey.dart';
import 'package:pharmapp_unified/screens/courier/deliveries/courier_journey_controls.dart';

/// Courier-side actionable timeline.
///
/// The pure derivation is tested directly; the widget goes through its
/// `deliveryStream` / `actionRunner` seams so nothing touches Firebase.
void main() {
  group('outboundJourneySteps (pure)', () {
    List<JourneyStep> steps(String phase) => outboundJourneySteps(
          outboundPhase: phase,
          returnRequired: false,
          returnPhase: 'not_required',
        );

    test('renders the five outbound phases in order', () {
      expect(steps('assigned').map((s) => s.fromPhase).toList(), kOutboundPhases);
    });

    test('exactly ONE step is actionable at any phase', () {
      for (final phase in kOutboundPhases) {
        final actionable = steps(phase).where((s) => s.actionable).toList();
        // `delivered` is terminal with no return: nothing left to press.
        expect(actionable.length, phase == 'delivered' ? 0 : 1,
            reason: 'phase $phase');
      }
    });

    test('the actionable step is the one nextJourneyAction names', () {
      final s = steps('picked_up').firstWhere((x) => x.actionable);
      expect(s.action, 'start_delivery');
      expect(
        s.action,
        nextJourneyAction(
          outboundPhase: 'picked_up',
          returnRequired: false,
          returnPhase: 'not_required',
        ),
      );
    });

    test('past steps are done, future ones are neither done nor actionable', () {
      final s = steps('picked_up');
      expect(s[0].done, isTrue); // assigned
      expect(s[2].done, isTrue); // picked_up (current)
      expect(s[4].done, isFalse); // delivered
      expect(s[4].actionable, isFalse);
    });

    test('an UNKNOWN phase marks nothing done and offers nothing', () {
      // Fail closed: guessing a position on a state we do not understand
      // would let a courier skip a step.
      final s = steps('teleported');
      expect(s.every((x) => !x.done), isTrue);
      expect(s.every((x) => !x.actionable), isTrue);
    });
  });

  Widget host(Widget child) => MaterialApp(home: Scaffold(body: child));

  CourierJourneyControls widget({
    String status = 'pending',
    Map<String, dynamic>? journey,
    Future<void> Function(String action)? runner,
  }) =>
      CourierJourneyControls(
        deliveryId: 'd-1',
        actionRunner: runner ?? (_) async {},
        deliveryStream: Stream.value({
          'status': status,
          if (journey != null) 'sandboxJourney': journey,
        }),
      );

  group('CourierJourneyControls widget', () {
    testWidgets('shows the five steps with a single tappable button',
        (tester) async {
      await tester.pumpWidget(host(widget()));
      await tester.pump();
      expect(find.text('Demo delivery steps'), findsOneWidget);
      expect(find.byType(ElevatedButton), findsOneWidget);
      expect(find.text('Start pickup'), findsOneWidget);
    });

    testWidgets('the offered step follows the journey phase', (tester) async {
      await tester.pumpWidget(host(widget(
        status: 'picked_up',
        journey: {'outboundPhase': 'en_route_to_dropoff'},
      )));
      await tester.pump();
      expect(find.byKey(const Key('courier-step-confirm_delivered')),
          findsOneWidget);
      expect(find.text('Start pickup'), findsNothing);
    });

    testWidgets('a delivered journey offers nothing', (tester) async {
      await tester.pumpWidget(host(widget(
        status: 'delivered',
        journey: {'outboundPhase': 'delivered', 'returnRequired': false},
      )));
      await tester.pump();
      expect(find.byType(ElevatedButton), findsNothing);
    });

    testWidgets('button shows a spinner and is disabled during the call',
        (tester) async {
      final completer = Completer<void>();
      await tester.pumpWidget(host(widget(runner: (_) => completer.future)));
      await tester.pump();

      await tester.tap(find.byType(ElevatedButton));
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      final btn = tester.widget<ElevatedButton>(find.byType(ElevatedButton));
      expect(btn.onPressed, isNull);

      completer.complete();
      await tester.pumpAndSettle();
    });

    testWidgets('a backend refusal is surfaced, never swallowed',
        (tester) async {
      await tester.pumpWidget(host(widget(runner: (_) async {
        throw Exception('permission-denied');
      })));
      await tester.pump();
      await tester.tap(find.byType(ElevatedButton));
      await tester.pump();
      await tester.pump();
      expect(find.textContaining('Step failed'), findsOneWidget);
      final snack = tester.widget<SnackBar>(find.byType(SnackBar));
      expect(snack.backgroundColor, Colors.red);
    });

    testWidgets('renders no currency or money amount', (tester) async {
      await tester.pumpWidget(host(widget(
        status: 'picked_up',
        journey: {'outboundPhase': 'picked_up'},
      )));
      await tester.pump();
      expect(find.textContaining('XAF'), findsNothing);
      expect(find.textContaining('GHS'), findsNothing);
    });
  });
}
