import 'package:flutter_test/flutter_test.dart';
import 'package:pharmapp_unified/screens/pharmacy/sandbox_testing_screen.dart';

/// Pure derivation of sandbox quick-amount chips from the currency's credit
/// cap. No per-currency map anywhere — the same percentages scale to any
/// configured cap.
void main() {
  group('sandboxQuickAmounts', () {
    test('XAF cap 100000 → 1000/2500/5000/10000/25000/50000', () {
      expect(
        sandboxQuickAmounts(100000),
        [1000, 2500, 5000, 10000, 25000, 50000],
      );
    });

    test('GHS cap 2000 → 20/50/100/200/500/1000', () {
      expect(sandboxQuickAmounts(2000), [20, 50, 100, 200, 500, 1000]);
    });

    test('null cap → empty (chips hidden, manual entry kept)', () {
      expect(sandboxQuickAmounts(null), isEmpty);
    });

    test('zero or negative cap → empty (no fabricated fallback)', () {
      expect(sandboxQuickAmounts(0), isEmpty);
      expect(sandboxQuickAmounts(-100), isEmpty);
    });

    test('every derived amount is a positive integer within the cap', () {
      for (final cap in [2000, 100000, 5000, 12345]) {
        final amounts = sandboxQuickAmounts(cap);
        expect(amounts, isNotEmpty);
        for (final a in amounts) {
          expect(a, greaterThan(0));
          expect(a, lessThanOrEqualTo(cap));
        }
      }
    });

    test('amounts are strictly increasing (deduped, ordered)', () {
      final amounts = sandboxQuickAmounts(100000);
      for (var i = 1; i < amounts.length; i++) {
        expect(amounts[i], greaterThan(amounts[i - 1]));
      }
    });

    test('a tiny cap drops degenerate (0 / duplicate) amounts', () {
      // cap 20 → 0.2, 0.5, 1, 2, 5, 10 → round → 0,1,1,2,5,10.
      // 0 dropped, duplicate 1 collapsed → [1, 2, 5, 10].
      expect(sandboxQuickAmounts(20), [1, 2, 5, 10]);
    });
  });
}
