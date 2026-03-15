import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:firebase_auth/firebase_auth.dart';

/// Reusable authenticated HTTP client for all PharmApp services.
/// Injects Firebase ID token as Bearer header on every request.
class AuthenticatedHttpService {
  static final FirebaseAuth _auth = FirebaseAuth.instance;

  /// Base URL for Cloud Functions (europe-west1).
  static const String functionsBaseUrl =
      'https://europe-west1-mediexchange.cloudfunctions.net';

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
