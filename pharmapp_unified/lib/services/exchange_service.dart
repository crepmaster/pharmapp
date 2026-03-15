import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class ExchangeService {
  static const String functionsUrl = 'https://europe-west1-mediexchange.cloudfunctions.net';
  static final FirebaseAuth _auth = FirebaseAuth.instance;

  static Future<Map<String, String>> _authHeaders() async {
    final token = await _auth.currentUser?.getIdToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }
  
  static Future<String> createHold({
    required String pharmacyAId,
    required String pharmacyBId,
    required int courierFeeXAF,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$functionsUrl/createExchangeHold'),
        headers: await _authHeaders(),
        body: jsonEncode({
          'aId': pharmacyAId,
          'bId': pharmacyBId,
          'courierFee': courierFeeXAF * 100, // Convert to centimes
          'currency': 'XAF',
        }),
      );
      
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['exchangeId'];
      } else {
        throw Exception('Failed to create exchange hold: ${response.body}');
      }
    } catch (e) {
      throw Exception('Network error creating hold: $e');
    }
  }
  
  static Future<void> captureExchange({
    required String exchangeId,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$functionsUrl/exchangeCapture'),
        headers: await _authHeaders(),
        body: jsonEncode({
          'exchangeId': exchangeId,
        }),
      );
      
      if (response.statusCode != 200) {
        throw Exception('Failed to capture exchange: ${response.body}');
      }
    } catch (e) {
      throw Exception('Network error capturing exchange: $e');
    }
  }
  
  static Future<void> cancelExchange({
    required String exchangeId,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$functionsUrl/exchangeCancel'),
        headers: await _authHeaders(),
        body: jsonEncode({
          'exchangeId': exchangeId,
        }),
      );
      
      if (response.statusCode != 200) {
        throw Exception('Failed to cancel exchange: ${response.body}');
      }
    } catch (e) {
      throw Exception('Network error canceling exchange: $e');
    }
  }
  
  static Future<Map<String, dynamic>> getExchangeStatus({
    required String exchangeId,
  }) async {
    try {
      final doc = await FirebaseFirestore.instance
          .collection('exchanges')
          .doc(exchangeId)
          .get();

      if (doc.exists) {
        return {'exchangeId': doc.id, ...doc.data()!};
      } else {
        throw Exception('Exchange not found: $exchangeId');
      }
    } catch (e) {
      throw Exception('Error getting exchange status: $e');
    }
  }
}
