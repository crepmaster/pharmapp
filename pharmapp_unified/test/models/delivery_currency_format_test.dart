import 'package:flutter_test/flutter_test.dart';
import 'package:pharmapp_unified/models/delivery.dart';

void main() {
  test('courier money labels preserve GHS fractional major units', () {
    expect(Delivery.formatAmount(12.50, 'GHS'), contains('12.50'));
    expect(Delivery.formatAmount(12.50, 'GHS'), contains('GHS'));
  });

  test('courier money labels use zero decimal places for XAF', () {
    expect(Delivery.formatAmount(2400, 'XAF'), contains('2,400'));
    expect(Delivery.formatAmount(2400, 'XAF'), isNot(contains('.00')));
  });
}
