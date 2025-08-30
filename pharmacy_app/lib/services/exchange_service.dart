import 'dart:convert';
import 'package:http/http.dart' as http;

class ExchangeService {
  static const String functionsUrl = 'https://us-central1-mediexchange.cloudfunctions.net';
  
  static Future<String> createHold({
    required String pharmacyAId,
    required String pharmacyBId,
    required int courierFeeXAF,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$functionsUrl/createExchangeHold'),
        headers: {'Content-Type': 'application/json'},
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
        Uri.parse('$functionsUrl/captureExchange'),
        headers: {'Content-Type': 'application/json'},
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
        Uri.parse('$functionsUrl/cancelExchange'),
        headers: {'Content-Type': 'application/json'},
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
      final response = await http.get(
        Uri.parse('$functionsUrl/getExchange?exchangeId=$exchangeId'),
        headers: {'Content-Type': 'application/json'},
      );
      
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        throw Exception('Failed to get exchange status: ${response.body}');
      }
    } catch (e) {
      throw Exception('Network error getting exchange: $e');
    }
  }
}