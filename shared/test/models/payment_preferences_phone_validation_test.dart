/// Sprint 2E — Unit tests for PaymentPreferences.isPhoneValid
///
/// Verifies that isPhoneValid is country-aware: delegates to CountryConfig
/// when countryCode or country enum is present, falls back to Cameroon-only
/// validation for legacy records with no country context.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:pharmapp_shared/models/payment_preferences.dart';
import 'package:pharmapp_shared/models/country_config.dart';

PaymentPreferences _prefs({
  required String countryCode,
  required String method,
  required String phone,
}) {
  return PaymentPreferences.createSecure(
    method: method,
    phoneNumber: phone,
    countryCode: countryCode,
  );
}

void main() {
  // ---------------------------------------------------------------------------
  // Cameroon — CM
  // ---------------------------------------------------------------------------
  group('isPhoneValid — Cameroon (CM)', () {
    test('MTN valid prefix 677 is accepted', () {
      expect(_prefs(countryCode: 'CM', method: 'mtn_cameroon', phone: '677123456').isPhoneValid, isTrue);
    });

    test('Orange valid prefix 694 is accepted', () {
      expect(_prefs(countryCode: 'CM', method: 'orange_cameroon', phone: '694123456').isPhoneValid, isTrue);
    });

    test('Invalid Cameroon prefix 100 is rejected', () {
      expect(_prefs(countryCode: 'CM', method: 'mtn_cameroon', phone: '100123456').isPhoneValid, isFalse);
    });

    test('Kenyan M-Pesa number is rejected for CM country', () {
      // 712345678 is a valid Kenya M-Pesa prefix but not a valid Cameroon prefix.
      expect(_prefs(countryCode: 'CM', method: 'mtn_cameroon', phone: '712345678').isPhoneValid, isFalse);
    });
  });

  // ---------------------------------------------------------------------------
  // Kenya — KE
  // ---------------------------------------------------------------------------
  group('isPhoneValid — Kenya (KE)', () {
    test('M-Pesa valid prefix 712 is accepted', () {
      expect(_prefs(countryCode: 'KE', method: 'mpesa_kenya', phone: '712345678').isPhoneValid, isTrue);
    });

    test('Airtel Kenya valid prefix 730 is accepted', () {
      expect(_prefs(countryCode: 'KE', method: 'airtel_kenya', phone: '730123456').isPhoneValid, isTrue);
    });

    test('Cameroon MTN number is rejected for KE country', () {
      expect(_prefs(countryCode: 'KE', method: 'mpesa_kenya', phone: '677123456').isPhoneValid, isFalse);
    });
  });

  // ---------------------------------------------------------------------------
  // Tanzania — TZ
  // ---------------------------------------------------------------------------
  group('isPhoneValid — Tanzania (TZ)', () {
    test('M-Pesa Tanzania valid prefix 74 is accepted', () {
      expect(_prefs(countryCode: 'TZ', method: 'mpesa_tanzania', phone: '741234567').isPhoneValid, isTrue);
    });

    test('Tigo Tanzania valid prefix 71 is accepted', () {
      expect(_prefs(countryCode: 'TZ', method: 'tigo_tanzania', phone: '712345678').isPhoneValid, isTrue);
    });

    test('Invalid Tanzania prefix 99 is rejected', () {
      expect(_prefs(countryCode: 'TZ', method: 'mpesa_tanzania', phone: '991234567').isPhoneValid, isFalse);
    });
  });

  // ---------------------------------------------------------------------------
  // Uganda — UG
  // ---------------------------------------------------------------------------
  group('isPhoneValid — Uganda (UG)', () {
    test('MTN Uganda valid prefix 77 is accepted', () {
      expect(_prefs(countryCode: 'UG', method: 'mtn_uganda', phone: '771234567').isPhoneValid, isTrue);
    });

    test('Airtel Uganda valid prefix 70 is accepted', () {
      expect(_prefs(countryCode: 'UG', method: 'airtel_uganda', phone: '701234567').isPhoneValid, isTrue);
    });

    test('Cameroon Orange number is rejected for UG country', () {
      expect(_prefs(countryCode: 'UG', method: 'mtn_uganda', phone: '694123456').isPhoneValid, isFalse);
    });
  });

  // ---------------------------------------------------------------------------
  // Nigeria — NG
  // ---------------------------------------------------------------------------
  group('isPhoneValid — Nigeria (NG)', () {
    test('MTN Nigeria valid prefix 803 is accepted', () {
      expect(_prefs(countryCode: 'NG', method: 'mtn_nigeria', phone: '8031234567').isPhoneValid, isTrue);
    });

    test('Airtel Nigeria valid prefix 802 is accepted', () {
      expect(_prefs(countryCode: 'NG', method: 'airtel_nigeria', phone: '8021234567').isPhoneValid, isTrue);
    });

    test('Invalid Nigeria prefix 100 is rejected', () {
      expect(_prefs(countryCode: 'NG', method: 'mtn_nigeria', phone: '1001234567').isPhoneValid, isFalse);
    });
  });

  // ---------------------------------------------------------------------------
  // Legacy fallback — no country context
  // ---------------------------------------------------------------------------
  group('isPhoneValid — legacy (no countryCode, no country)', () {
    test('Valid Cameroon number is accepted via legacy Cameroon fallback', () {
      final prefs = PaymentPreferences.createSecure(
        method: 'mtn_cameroon',
        phoneNumber: '677123456',
        // no countryCode, no country
      );
      expect(prefs.isPhoneValid, isTrue);
    });

    test('Non-Cameroon number is rejected by Cameroon fallback', () {
      final prefs = PaymentPreferences.createSecure(
        method: 'mpesa_kenya',
        phoneNumber: '712345678',
        // no countryCode, no country — falls back to Cameroon check
      );
      expect(prefs.isPhoneValid, isFalse);
    });
  });

  // ---------------------------------------------------------------------------
  // Legacy Country enum path
  // ---------------------------------------------------------------------------
  group('isPhoneValid — legacy Country enum (no countryCode)', () {
    test('Kenya number valid when country enum is set to kenya', () {
      final prefs = PaymentPreferences(
        defaultMethod: 'mpesa_kenya',
        defaultPhone: '712345678',
        country: Country.kenya,
      );
      expect(prefs.isPhoneValid, isTrue);
    });

    test('Cameroon number valid when country enum is set to cameroon', () {
      final prefs = PaymentPreferences(
        defaultMethod: 'mtn_cameroon',
        defaultPhone: '677123456',
        country: Country.cameroon,
      );
      expect(prefs.isPhoneValid, isTrue);
    });
  });
}
