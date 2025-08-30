import 'dart:convert';
import 'package:http/http.dart' as http;

class PaymentService {
  static const String functionsUrl = 'https://us-central1-mediexchange.cloudfunctions.net';
  
  static Future<Map<String, dynamic>> createTopup({
    required String userId,
    required int amountXAF,
    required String method,
    required String phoneNumber,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$functionsUrl/topupIntent'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'userId': userId,
          'method': method,
          'amount': amountXAF,
          'currency': 'XAF',
          'msisdn': phoneNumber,
        }),
      );
      
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        throw Exception('Failed to create topup: ${response.body}');
      }
    } catch (e) {
      throw Exception('Network error creating topup: $e');
    }
  }
  
  static Future<Map<String, dynamic>> getWalletBalance({
    required String userId,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$functionsUrl/getWallet?userId=$userId'),
        headers: {'Content-Type': 'application/json'},
      );
      
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        throw Exception('Failed to get wallet balance: ${response.body}');
      }
    } catch (e) {
      throw Exception('Network error getting wallet: $e');
    }
  }
}