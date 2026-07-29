/// TD-COURIER-ASSIGN-GUARD (Lot A migration) — courier signUp routes through
/// the backend-owned `createCourierRegistration` callable, mirroring the
/// pharmacy entrypoint. The legacy client-side `createUserWithEmailAndPassword`
/// path MUST NOT be used for couriers anymore.
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:pharmapp_shared/services/unified_auth_service.dart';

class _MockFirebaseAuth extends Mock implements FirebaseAuth {}

class _MockFirebaseFunctions extends Mock implements FirebaseFunctions {}

class _MockHttpsCallable extends Mock implements HttpsCallable {}

class _MockHttpsCallableResult extends Mock
    implements HttpsCallableResult<Map<String, dynamic>> {}

class _MockUserCredential extends Mock implements UserCredential {}

class _MockUser extends Mock implements User {}

class _FakeMap extends Fake implements Map<String, dynamic> {}

void main() {
  setUpAll(() {
    registerFallbackValue(_FakeMap());
  });

  group('UnifiedAuthService.signUp — courier backend-owned entrypoint', () {
    late _MockFirebaseAuth mockAuth;
    late _MockFirebaseFunctions mockFunctions;
    late _MockHttpsCallable mockCallable;

    const validEmail = 'kwame@example.test';
    const validPassword = 'SuperSecret2026';
    final validProfile = <String, dynamic>{
      'fullName': 'Kwame Courier',
      'phoneNumber': '+233240000001',
      'vehicleType': 'motorcycle',
      'licensePlate': 'GH-1234-24',
      'countryCode': 'GH',
      'cityCode': 'accra',
    };

    setUp(() {
      mockAuth = _MockFirebaseAuth();
      mockFunctions = _MockFirebaseFunctions();
      mockCallable = _MockHttpsCallable();
      UnifiedAuthService.debugAuth = mockAuth;
      UnifiedAuthService.debugFunctions = mockFunctions;
      UnifiedAuthService.resetRateLimitForTest(validEmail);

      when(() => mockFunctions.httpsCallable('createCourierRegistration'))
          .thenReturn(mockCallable);
    });

    test('routes through createCourierRegistration callable, then signs in', () async {
      final mockResult = _MockHttpsCallableResult();
      when(() => mockResult.data).thenReturn(<String, dynamic>{
        'uid': 'kwame-uid',
        'email': validEmail,
      });
      when(() => mockCallable.call<Map<String, dynamic>>(any()))
          .thenAnswer((_) async => mockResult);

      final mockCred = _MockUserCredential();
      final mockUser = _MockUser();
      when(() => mockUser.uid).thenReturn('kwame-uid');
      when(() => mockCred.user).thenReturn(mockUser);
      when(() => mockAuth.signInWithEmailAndPassword(
            email: any(named: 'email'),
            password: any(named: 'password'),
          )).thenAnswer((_) async => mockCred);

      final credential = await UnifiedAuthService.signUp(
        email: validEmail,
        password: validPassword,
        userType: UserType.courier,
        profileData: validProfile,
      );

      // Callable invoked with the right name + payload shape.
      verify(() => mockFunctions.httpsCallable('createCourierRegistration'))
          .called(1);
      final captured = verify(
        () => mockCallable.call<Map<String, dynamic>>(captureAny()),
      ).captured;
      final payload = captured.first as Map<String, dynamic>;
      expect(payload['email'], equals(validEmail));
      expect(
        (payload['profileData'] as Map<String, dynamic>)['cityCode'],
        equals('accra'),
      );
      // No license number for couriers.
      expect(payload.containsKey('licenseNumber'), isFalse);

      // Session obtained; legacy client-create NOT used.
      verify(() => mockAuth.signInWithEmailAndPassword(
            email: validEmail,
            password: validPassword,
          )).called(1);
      verifyNever(() => mockAuth.createUserWithEmailAndPassword(
            email: any(named: 'email'),
            password: any(named: 'password'),
          ));
      expect(credential!.user?.uid, equals('kwame-uid'));
    });

    test('the pharmacy callable is never used for a courier signup', () async {
      final mockResult = _MockHttpsCallableResult();
      when(() => mockResult.data).thenReturn(<String, dynamic>{'uid': 'k', 'email': validEmail});
      when(() => mockCallable.call<Map<String, dynamic>>(any()))
          .thenAnswer((_) async => mockResult);
      final mockCred = _MockUserCredential();
      when(() => mockCred.user).thenReturn(_MockUser());
      when(() => mockAuth.signInWithEmailAndPassword(
            email: any(named: 'email'), password: any(named: 'password'),
          )).thenAnswer((_) async => mockCred);

      await UnifiedAuthService.signUp(
        email: validEmail,
        password: validPassword,
        userType: UserType.courier,
        profileData: validProfile,
      );

      verifyNever(() => mockFunctions.httpsCallable('createPharmacyRegistration'));
    });
  });
}
