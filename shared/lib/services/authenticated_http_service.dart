import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:firebase_auth/firebase_auth.dart';

/// Reusable authenticated HTTP client for all PharmApp services.
/// Injects Firebase ID token as Bearer header on every request.
class AuthenticatedHttpService {
  static final FirebaseAuth _auth = FirebaseAuth.instance;

  // Sprint 5 phase 1 emulator HTTP routing — Single source of truth for the
  // Cloud Functions HTTP base URL. Gated by the same `--dart-define` flags
  // as `pharmapp_unified/lib/main.dart`'s Firebase wiring so the prod build
  // never resolves to localhost. When `USE_EMULATOR=true`, points at the
  // local Functions emulator endpoint (which honours `useFunctionsEmulator`).
  // Otherwise, the canonical prod europe-west1 URL.
  //
  // Why a getter and not a `const`: the prod URL is still a constant string,
  // but selecting between prod and emulator at runtime requires evaluating
  // `bool.fromEnvironment` — those are compile-time constants but the *if*
  // can't be const. Tree-shaking elides the emulator branch on prod builds
  // because `_useEmulator` is `false` at compile time.
  static const bool _useEmulator = bool.fromEnvironment('USE_EMULATOR');
  static const String _emulatorProjectId =
      String.fromEnvironment('FIREBASE_PROJECT_ID', defaultValue: 'demo-pharmapp');
  static const String _emulatorHost =
      String.fromEnvironment('EMULATOR_HOST', defaultValue: 'localhost');
  static const String _emulatorFunctionsPort =
      String.fromEnvironment('EMULATOR_FUNCTIONS_PORT', defaultValue: '5001');

  /// Base URL for Cloud Functions (europe-west1).
  static String get functionsBaseUrl => _useEmulator
      ? 'http://$_emulatorHost:$_emulatorFunctionsPort/$_emulatorProjectId/europe-west1'
      : 'https://europe-west1-mediexchange.cloudfunctions.net';

  /// Returns JSON headers with Bearer token (if user is authenticated).
  static Future<Map<String, String>> authJsonHeaders() async {
    final token = await _auth.currentUser?.getIdToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  /// Authenticated GET request.
  static Future<http.Response> get(Uri uri) async {
    final headers = await authJsonHeaders();
    return http.get(uri, headers: headers);
  }

  /// Authenticated POST request with JSON body.
  static Future<http.Response> post(
    Uri uri,
    Map<String, dynamic> body,
  ) async {
    final headers = await authJsonHeaders();
    return http.post(uri, headers: headers, body: jsonEncode(body));
  }
}
