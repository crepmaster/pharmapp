// Sprint 2B.1 follow-up — regression test for the "country edit
// silently wipes license config" bug surfaced by the architect on
// commit 127a95d.
//
// Background : `SystemConfigService.upsertCountry` used to write
// `'countries.$code': country.toMap()`, which replaces the whole
// `countries.{code}` map server-side. Since `CountryOption.toMap()`
// deliberately excludes the 7 license fields (those are written via
// the backend callable `setCountryLicenseConfig`), any innocent edit
// of the country name / dial code / currency through `countries_tab`
// erased the previously-configured license rules.
//
// Fix : `upsertCountry` now builds dotted-paths (`countries.$code.name`,
// `countries.$code.dialCode`, ...) so an update only touches the base
// fields and the license configuration stays intact.
//
// This test asserts the payload shape — the production write itself
// is a Firestore SDK call we don't need to mock here, because the
// dotted-path semantics are guaranteed by Firestore: an `update()`
// with `'countries.CM.name'` only touches that one sub-key.
import 'package:admin_panel/models/country_option.dart';
import 'package:admin_panel/services/system_config_service.dart';
import 'package:flutter_test/flutter_test.dart';

const _baseCountry = CountryOption(
  code: 'CM',
  name: 'Cameroon',
  dialCode: '237',
  defaultCurrencyCode: 'XAF',
  timezone: 'Africa/Douala',
  enabled: true,
  defaultCityCode: 'douala',
  providerIds: ['mtn_momo_cm', 'orange_money_cm'],
  sortOrder: 10,
  // License fields explicitly set to non-default values — proves
  // they don't leak even when the model carries them in memory.
  licenseRequired: true,
  licenseLabel: 'Pharmacy License Number',
  licenseHelpText: 'PSI registration ID',
  licenseVerificationRequired: true,
  licenseFormatRegex: r'^[A-Z]{2}-\d{4}$',
  licenseDocumentRequired: true,
  licenseGracePeriodDays: 60,
);

void main() {
  group('SystemConfigService.buildCountryUpsertPayload', () {
    test(
        'never includes a raw `countries.{code}` key that would replace the map',
        () {
      final payload = SystemConfigService.buildCountryUpsertPayload(
          'CM', _baseCountry);
      expect(payload.containsKey('countries.CM'), isFalse,
          reason:
              'A raw "countries.CM" entry would replace the whole map on Firestore update and wipe license config.');
    });

    test('emits dotted-paths for every base country field', () {
      final payload = SystemConfigService.buildCountryUpsertPayload(
          'CM', _baseCountry);
      expect(payload['countries.CM.code'], equals('CM'));
      expect(payload['countries.CM.name'], equals('Cameroon'));
      expect(payload['countries.CM.dialCode'], equals('237'));
      expect(payload['countries.CM.defaultCurrencyCode'], equals('XAF'));
      expect(payload['countries.CM.timezone'], equals('Africa/Douala'));
      expect(payload['countries.CM.enabled'], isTrue);
      expect(payload['countries.CM.defaultCityCode'], equals('douala'));
      expect(payload['countries.CM.providerIds'],
          equals(['mtn_momo_cm', 'orange_money_cm']));
      expect(payload['countries.CM.sortOrder'], equals(10));
    });

    test(
        'does not include any of the 9 backend-controlled license fields',
        () {
      final payload = SystemConfigService.buildCountryUpsertPayload(
          'CM', _baseCountry);
      // The 7 country-level license fields owned by setCountryLicenseConfig.
      const licensePaths = [
        'countries.CM.licenseRequired',
        'countries.CM.licenseLabel',
        'countries.CM.licenseHelpText',
        'countries.CM.licenseVerificationRequired',
        'countries.CM.licenseFormatRegex',
        'countries.CM.licenseDocumentRequired',
        'countries.CM.licenseGracePeriodDays',
      ];
      for (final path in licensePaths) {
        expect(payload.containsKey(path), isFalse,
            reason:
                'License field "$path" must NOT be written by upsertCountry — it is owned by setCountryLicenseConfig callable.');
      }
    });

    test(
        'editing the country name only writes name + base fields, never license',
        () {
      // Edit scenario : admin renames Cameroon → Cameroun via countries_tab.
      final edited = _baseCountry.copyWith(name: 'Cameroun');
      final payload =
          SystemConfigService.buildCountryUpsertPayload('CM', edited);
      // The Firestore update will touch ONLY these dotted-paths.
      // `licenseRequired` etc. are absent, so the server-side stored
      // value remains whatever `setCountryLicenseConfig` last wrote.
      expect(payload['countries.CM.name'], equals('Cameroun'));
      expect(payload.containsKey('countries.CM.licenseRequired'), isFalse);
      expect(payload.containsKey('countries.CM.licenseFormatRegex'), isFalse);
      expect(payload.containsKey('countries.CM.licenseGracePeriodDays'),
          isFalse);
    });
  });
}
