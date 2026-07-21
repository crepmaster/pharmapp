/// Shared state machine for the staging manual delivery progression.
///
/// Extracted from `exchange_status_screen.dart` so the pharmacy panel and the
/// courier timeline drive the SAME logic. Two client-side state machines for
/// one backend contract would drift the moment a phase is added, and the
/// screens would start disagreeing about which step is allowed next.
///
/// Everything here is pure: no widgets, no Firebase, no side effects. The
/// backend (`sandboxDeliveryAdvance`) remains the authority — these functions
/// only decide what to OFFER; every action is still validated server-side.
library;

/// Ordered outbound phases. Mirrors `OUTBOUND_PHASES` in
/// `functions/src/sandboxDeliveryAdvance.ts`; keep the two in sync.
const List<String> kOutboundPhases = [
  'assigned',
  'en_route_to_pickup',
  'picked_up',
  'en_route_to_dropoff',
  'delivered',
];

/// Human labels for a journey action (also drives the button text).
const Map<String, String> kJourneyActionLabels = {
  'start_pickup': 'Start pickup',
  'confirm_pickup': 'Confirm pickup',
  'start_delivery': 'Start delivery',
  'confirm_delivered': 'Confirm delivered',
  'start_return_pickup': 'Start return pickup',
  'confirm_return_pickup': 'Confirm return pickup',
  'start_return_delivery': 'Start return delivery',
  'confirm_return_delivered': 'Confirm return delivered',
};

/// Human labels for the current journey phase (display only).
const Map<String, String> kJourneyPhaseLabels = {
  'assigned': 'Assigned',
  'en_route_to_pickup': 'On the way to pickup',
  'picked_up': 'Picked up',
  'en_route_to_dropoff': 'On the way to drop-off',
  'delivered': 'Delivered',
  'not_required': 'No return',
  'awaiting_return': 'Awaiting return',
  'en_route_to_return_pickup': 'On the way to return pickup',
  'return_picked_up': 'Return picked up',
  'en_route_to_return_dropoff': 'On the way to return drop-off',
  'return_delivered': 'Return delivered',
};

/// Pure derivation of the SINGLE next allowed journey action from the current
/// phases. Returns null when nothing remains (delivered with no return, or
/// return_delivered). Return actions are only offered when [returnRequired].
String? nextJourneyAction({
  required String outboundPhase,
  required bool returnRequired,
  required String returnPhase,
}) {
  switch (outboundPhase) {
    case 'assigned':
      return 'start_pickup';
    case 'en_route_to_pickup':
      return 'confirm_pickup';
    case 'picked_up':
      return 'start_delivery';
    case 'en_route_to_dropoff':
      return 'confirm_delivered';
    case 'delivered':
      if (!returnRequired) return null;
      switch (returnPhase) {
        case 'not_required':
        case 'awaiting_return':
          return 'start_return_pickup';
        case 'en_route_to_return_pickup':
          return 'confirm_return_pickup';
        case 'return_picked_up':
          return 'start_return_delivery';
        case 'en_route_to_return_dropoff':
          return 'confirm_return_delivered';
        default:
          return null; // return_delivered
      }
    default:
      return null;
  }
}

/// Derive the outbound phase from the journey (preferred) or synthesize it
/// from the canonical delivery status when no journey exists yet.
String outboundPhaseFor(Map<String, dynamic>? journey, String status) {
  final p = journey?['outboundPhase'];
  if (p is String && p.isNotEmpty) return p;
  if (status == 'picked_up' || status == 'in_transit') return 'picked_up';
  if (status == 'delivered' || status == 'completed') return 'delivered';
  return 'assigned';
}

/// One row of the courier timeline.
class JourneyStep {
  /// The phase this step LEAVES when its action runs.
  final String fromPhase;

  /// The action to send to `sandboxDeliveryAdvance`, or null for the terminal
  /// row (`delivered`), which is an outcome rather than something to trigger.
  final String? action;

  /// Row label — the phase reached once the step is done.
  final String label;

  /// The step is behind the current position: already achieved.
  final bool done;

  /// This is the one step the courier may trigger right now.
  final bool actionable;

  const JourneyStep({
    required this.fromPhase,
    required this.action,
    required this.label,
    required this.done,
    required this.actionable,
  });
}

/// Builds the outbound timeline for rendering.
///
/// Exactly ONE row can be [actionable] — the one whose action equals
/// [nextJourneyAction]. Everything before the current phase is [done];
/// everything after is neither, so the UI can grey it out. A courier cannot
/// skip ahead or step back: the backend refuses it, and the UI does not even
/// offer it.
///
/// The return leg is intentionally absent: it has no canonical delivery model
/// and is driven from the pharmacy panel only.
List<JourneyStep> outboundJourneySteps({
  required String outboundPhase,
  required bool returnRequired,
  required String returnPhase,
}) {
  final next = nextJourneyAction(
    outboundPhase: outboundPhase,
    returnRequired: returnRequired,
    returnPhase: returnPhase,
  );
  // An unknown phase yields rank -1: nothing is marked done, and no row is
  // actionable unless `nextJourneyAction` recognises it. Failing closed beats
  // guessing a position on a state we do not understand.
  final currentRank = kOutboundPhases.indexOf(outboundPhase);

  return [
    for (var i = 0; i < kOutboundPhases.length; i++)
      () {
        final phase = kOutboundPhases[i];
        // The action that LEAVES the previous phase lands on this one.
        final action = i == 0
            ? null
            : nextJourneyAction(
                outboundPhase: kOutboundPhases[i - 1],
                returnRequired: false,
                returnPhase: 'not_required',
              );
        return JourneyStep(
          fromPhase: phase,
          action: action,
          label: kJourneyPhaseLabels[phase] ?? phase,
          done: currentRank >= 0 && i <= currentRank,
          actionable: action != null && action == next,
        );
      }(),
  ];
}
