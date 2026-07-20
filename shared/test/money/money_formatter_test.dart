import 'package:flutter_test/flutter_test.dart';
import 'package:pharmapp_shared/money/money_context.dart';
import 'package:pharmapp_shared/money/money_formatter.dart';
import 'package:pharmapp_shared/models/master_data_snapshot.dart';

MasterDataSnapshot _snapshotWith(List<MasterDataCurrency> currencies) {
  return MasterDataSnapshot(
    source: MasterDataSource.remote,
    primaryCountryCode: 'GH',
    countries: const {},
    citiesByCountry: const {},
    currencies: {for (final c in currencies) c.code: c},
    providers: const {},
  );
}

void main() {
  group('MoneyFormatter.formatMajor', () {
    test('GHS uses master data symbol and 2 decimals', () {
      final master = _snapshotWith(const [
        MasterDataCurrency(
          code: 'GHS',
          name: 'Ghanaian Cedi',
          symbol: 'GH₵',
          enabled: true,
          sortOrder: 0,
          decimals: 2,
        ),
      ]);
      expect(
        MoneyFormatter.formatMajor(1250, currencyCode: 'GHS', master: master),
        'GH₵ 1,250.00',
      );
    });

    test('XAF uses master data symbol and 0 decimals', () {
      final master = _snapshotWith(const [
        MasterDataCurrency(
          code: 'XAF',
          name: 'CFA Franc',
          symbol: 'FCFA',
          enabled: true,
          sortOrder: 0,
          decimals: 0,
        ),
      ]);
      expect(
        MoneyFormatter.formatMajor(6000, currencyCode: 'XAF', master: master),
        'FCFA 6,000',
      );
    });

    test('falls back to currency code when snapshot omits currency', () {
      final master = _snapshotWith(const []);
      expect(
        MoneyFormatter.formatMajor(1250, currencyCode: 'GHS', master: master),
        'GHS 1,250.00',
      );
    });

    test('falls back to 0 decimals for known-zero-decimal ISO codes', () {
      final master = _snapshotWith(const []);
      expect(
        MoneyFormatter.formatMajor(5000, currencyCode: 'XOF', master: master),
        'XOF 5,000',
      );
      expect(
        MoneyFormatter.formatMajor(3000, currencyCode: 'UGX', master: master),
        'UGX 3,000',
      );
    });

    test('defaults to 2 decimals when currency unknown and not in fallback table', () {
      final master = _snapshotWith(const []);
      expect(
        MoneyFormatter.formatMajor(42.5, currencyCode: 'FOO', master: master),
        'FOO 42.50',
      );
    });

    test('handles null master (no snapshot) — pure fallback path', () {
      expect(
        MoneyFormatter.formatMajor(9.99, currencyCode: 'USD'),
        'USD 9.99',
      );
    });
  });

  group('MoneyFormatter.formatMinor', () {
    test('GHS minor 125000 → GH₵ 1,250.00', () {
      final master = _snapshotWith(const [
        MasterDataCurrency(
          code: 'GHS',
          name: 'Ghanaian Cedi',
          symbol: 'GH₵',
          enabled: true,
          sortOrder: 0,
          decimals: 2,
        ),
      ]);
      expect(
        MoneyFormatter.formatMinor(125000, currencyCode: 'GHS', master: master),
        'GH₵ 1,250.00',
      );
    });

    test('XAF minor 6000 → FCFA 6,000 (no division, decimals=0)', () {
      final master = _snapshotWith(const [
        MasterDataCurrency(
          code: 'XAF',
          name: 'CFA Franc',
          symbol: 'FCFA',
          enabled: true,
          sortOrder: 0,
          decimals: 0,
        ),
      ]);
      expect(
        MoneyFormatter.formatMinor(6000, currencyCode: 'XAF', master: master),
        'FCFA 6,000',
      );
    });
  });

  group('MoneyFormatter.formatForContext', () {
    test('uses context currency + locale', () {
      final master = _snapshotWith(const [
        MasterDataCurrency(
          code: 'GHS',
          name: 'Ghanaian Cedi',
          symbol: 'GH₵',
          enabled: true,
          sortOrder: 0,
          decimals: 2,
        ),
      ]);
      const context = MoneyContext(
        countryCode: 'GH',
        currencyCode: 'GHS',
        symbol: 'GH₵',
        decimals: 2,
        locale: 'en_GH',
      );
      expect(
        MoneyFormatter.formatForContext(1250, context: context, master: master),
        'GH₵ 1,250.00',
      );
    });
  });

  group('MoneyContext', () {
    test('is value-equal by all fields', () {
      const a = MoneyContext(
        countryCode: 'GH',
        currencyCode: 'GHS',
        symbol: 'GH₵',
        decimals: 2,
        locale: 'en_GH',
      );
      const b = MoneyContext(
        countryCode: 'GH',
        currencyCode: 'GHS',
        symbol: 'GH₵',
        decimals: 2,
        locale: 'en_GH',
      );
      const c = MoneyContext(
        countryCode: 'CM',
        currencyCode: 'XAF',
        symbol: 'FCFA',
        decimals: 0,
        locale: 'fr_CM',
      );
      expect(a, equals(b));
      expect(a.hashCode, equals(b.hashCode));
      expect(a, isNot(equals(c)));
    });
  });
}
