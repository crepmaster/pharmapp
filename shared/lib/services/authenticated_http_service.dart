import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:firebase_auth/firebase_auth.dart';
import '../config/build_flags.dart';

/// Reusable authenticated HTTP client for all PharmApp services.
/// Injects Firebase ID token as Bearer header on every request.
class AuthenticatedHttpService {
  static final FirebaseAuth _auth = FirebaseAuth.instance;

  // Cloud Functions HTTP base URL. Gated by the shared `kUseEmulator` /
  // `kUseStaging` build flags from `pharmapp_shared/config/build_flags.dart`
  // (single source of truth). Tree-shaking elides the unused branches on
  // prod builds because the flags are compile-time constants.
  //
  // Priority : emulator > staging > prod. Only the `*_PROJECT_ID` /
  // `EMULATOR_*` env vars stay declared locally because they are getter-
  // specific formatters, not gates.
  static const String _emulatorProjectId =
      String.fromEnvironment('FIREBASE_PROJECT_ID', defaultValue: 'demo-pharmapp');
  static const String _emulatorHost =
      String.fromEnvironment('EMULATOR_HOST', defaultValue: 'localhost');
  static const String _emulatorFunctionsPort =
      String.fromEnvironment('EMULATOR_FUNCTIONS_PORT', defaultValue: '5001');
  static const String _stagingProjectId = String.fromEnvironment(
      'STAGING_PROJECT_ID',
      defaultValue: 'mediexchange-staging');

  /// Base URL for Cloud Functions (europe-west1).
  static String get functionsBaseUrl => kUseEmulator
      ? 'http://$_emulatorHost:$_emulatorFunctionsPort/$_emulatorProjectId/europe-west1'
      : kUseStaging
          ? 'https://europe-west1-$_stagingProjectId.cloudfunctions.net'
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
