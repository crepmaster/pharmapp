import 'package:flutter_test/flutter_test.dart';
import 'package:pharmapp_unified/services/wallet_service.dart';

void main() {
  test('GHS pharmacy balance is compared in major units', () {
    final balance = WalletService.pharmacyBalanceMajorFromWalletUnits(10000);
    expect(balance, 100);
    expect(WalletService.pharmacyBalanceIsInsufficient(balance!, 120), isTrue);
    expect(WalletService.pharmacyBalanceIsInsufficient(balance, 100), isFalse);
  });

  test('XAF pharmacy balance still uses the legacy major × 100 convention', () {
    final balance = WalletService.pharmacyBalanceMajorFromWalletUnits(500000);
    expect(balance, 5000);
    expect(WalletService.pharmacyBalanceIsInsufficient(balance!, 5000), isFalse);
    expect(WalletService.pharmacyBalanceIsInsufficient(balance, 5001), isTrue);
  });

  test('GHS floating multiplication does not trigger a false insufficient warning', () {
    final balance = WalletService.pharmacyBalanceMajorFromWalletUnits(30)!;
    expect(WalletService.pharmacyBalanceIsInsufficient(balance, 0.1 * 3), isFalse);
  });

  test('unknown wallet balance is not presented as zero', () {
    expect(WalletService.pharmacyBalanceMajorFromWalletUnits(null), isNull);
    expect(WalletService.pharmacyBalanceMajorFromWalletUnits('10000'), isNull);
    expect(WalletService.pharmacyBalanceMajorFromWalletUnits(-1), isNull);
  });
}
