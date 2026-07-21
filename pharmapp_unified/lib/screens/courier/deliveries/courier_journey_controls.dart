import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

import '../../../models/delivery_journey.dart';

/// Staging-only actionable delivery timeline, on the COURIER's own screen.
///
/// The demo runs on the Web with no GPS and no QR scanning, so each journey
/// step has to be assertable by hand. The pharmacy panel
/// (`DemoDeliveryActions`) did that first; this puts the same progression
/// where it belongs — with the courier actually performing the delivery.
///
/// Deliberately ADDITIVE: it sits below the existing read-only
/// `Delivery Progress` card rather than replacing it, so the normal courier
/// flow (QR scan, photo proof) is untouched. It is rendered under
/// `if (kUseStaging)`, so the whole subtree tree-shakes out of a prod build.
///
/// The state machine comes from `delivery_journey.dart`, shared with the
/// pharmacy panel: two client-side machines for one backend contract would
/// drift, and the screens would disagree on which step is allowed.
///
/// The backend stays the authority. `sandboxDeliveryAdvance` re-checks the
/// phase, the caller's identity and its link to this delivery; a step shown
/// as actionable here can still be refused there, and that refusal is
/// surfaced rather than swallowed.
class CourierJourneyControls extends StatefulWidget {
  final String deliveryId;

  /// Test seam: when provided, actions call this instead of the real
  /// callable, so widget tests exercise the enabled/disabled/spinner/error
  /// paths without Firebase. Never set in production code.
  final Future<void> Function(String action)? actionRunner;

  /// Test seam for the delivery stream, same rationale.
  final Stream<Map<String, dynamic>?>? deliveryStream;

  const CourierJourneyControls({
    super.key,
    required this.deliveryId,
    this.actionRunner,
    this.deliveryStream,
  });

  @override
  State<CourierJourneyControls> createState() => CourierJourneyControlsState();
}

class CourierJourneyControlsState extends State<CourierJourneyControls> {
  String? _running;

  Stream<Map<String, dynamic>?> get _stream =>
      widget.deliveryStream ??
      FirebaseFirestore.instance
          .collection('deliveries')
          .doc(widget.deliveryId)
          .snapshots()
          .map((s) => s.data());

  Future<void> _run(String action) async {
    setState(() => _running = action);
    try {
      final runner = widget.actionRunner;
      if (runner != null) {
        await runner(action);
      } else {
        await FirebaseFunctions.instanceFor(region: 'europe-west1')
            .httpsCallable('sandboxDeliveryAdvance')
            .call({'deliveryId': widget.deliveryId, 'action': action});
      }
    } catch (e) {
      // Never swallowed: a step that did not happen must not look like it did.
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Step failed: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _running = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<Map<String, dynamic>?>(
      stream: _stream,
      builder: (context, snapshot) {
        if (!snapshot.hasData || snapshot.data == null) {
          return const SizedBox.shrink();
        }
        final data = snapshot.data!;
        final status = (data['status'] ?? 'pending').toString();
        final journey = data['sandboxJourney'] as Map<String, dynamic>?;
        final steps = outboundJourneySteps(
          outboundPhase: outboundPhaseFor(journey, status),
          returnRequired: journey?['returnRequired'] == true,
          returnPhase: (journey?['returnPhase'] ?? 'not_required').toString(),
        );

        return Card(
          elevation: 2,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.touch_app, color: Colors.orange, size: 22),
                    SizedBox(width: 10),
                    Text(
                      'Demo delivery steps',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'Tap each step as you complete it. No GPS or QR needed.',
                  style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                ),
                const SizedBox(height: 12),
                for (final step in steps) _buildRow(step),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildRow(JourneyStep step) {
    final busy = _running != null;
    final isRunning = _running == step.action;
    // Exactly one row is actionable at a time; the rest are shown so the
    // courier sees where they are in the journey, not to be pressed.
    final enabled = step.actionable && !busy;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Icon(
            step.done ? Icons.check_circle : Icons.radio_button_unchecked,
            color: step.done
                ? const Color(0xFF4CAF50)
                : step.actionable
                    ? Colors.orange
                    : Colors.grey[400],
            size: 20,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              step.label,
              style: TextStyle(
                fontWeight:
                    step.actionable ? FontWeight.bold : FontWeight.normal,
                color: step.done
                    ? const Color(0xFF4CAF50)
                    : step.actionable
                        ? Colors.black87
                        : Colors.grey[500],
              ),
            ),
          ),
          if (step.actionable)
            ElevatedButton(
              key: Key('courier-step-${step.action}'),
              onPressed: enabled ? () => _run(step.action!) : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.orange,
                foregroundColor: Colors.white,
                visualDensity: VisualDensity.compact,
              ),
              child: isRunning
                  ? const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor:
                            AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    )
                  : Text(kJourneyActionLabels[step.action] ?? step.action!),
            ),
        ],
      ),
    );
  }
}
