import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/barcode_medicine_data.dart';

/// Service for looking up medicine information from various APIs
class MedicineLookupService {
  static const MedicineLookupService _instance = MedicineLookupService._internal();
  factory MedicineLookupService() => _instance;
  const MedicineLookupService._internal();

  // API endpoints for medicine data lookup
  static const String _openFdaBaseUrl = 'https://api.fda.gov/drug';
  static const String _gs1BaseUrl = 'https://www.gs1.org/services/verified-by-gs1';
  
  // Timeout for API requests
  static const Duration _requestTimeout = Duration(seconds: 10);

  /// Look up medicine information from barcode data
  Future<BarcodeMedicineData> lookupMedicine(BarcodeMedicineData scannedData) async {
    try {
      // Try multiple lookup strategies
      BarcodeMedicineData? result;

      // 1. Try GTIN lookup if available
      if (scannedData.gtin != null) {
        result = await _lookupByGTIN(scannedData);
        if (result.hasBasicInfo) return result;
      }

      // 2. Try NDC lookup for US products
      final ndc = _extractNDC(scannedData.gtin);
      if (ndc != null) {
        result = await _lookupByNDC(scannedData, ndc);
        if (result.hasBasicInfo) return result;
      }

      // 3. Try generic barcode lookup
      result = await _lookupGenericBarcode(scannedData);
      if (result.hasBasicInfo) return result;

      // If all lookups fail, return original data marked as unverified
      return scannedData;

    } catch (e) {
      print('Medicine lookup error: $e');
      return scannedData.copyWithApiData(isVerified: false);
    }
  }

  /// Look up medicine by GTIN using multiple data sources
  Future<BarcodeMedicineData> _lookupByGTIN(BarcodeMedicineData scannedData) async {
    try {
      // Try OpenFDA API first
      final fdaResult = await _queryOpenFDA(scannedData.gtin!);
      if (fdaResult.hasBasicInfo) return fdaResult;

      // Try GS1 registry (if available)
      // Note: GS1 API requires authentication and is often commercial
      // For demonstration, we'll simulate a response
      
      return scannedData.copyWithApiData(isVerified: false);
    } catch (e) {
      print('GTIN lookup error: $e');
      return scannedData.copyWithApiData(isVerified: false);
    }
  }

  /// Look up medicine by NDC (National Drug Code) using FDA API
  Future<BarcodeMedicineData> _lookupByNDC(BarcodeMedicineData scannedData, String ndc) async {
    try {
      final url = Uri.parse('$_openFdaBaseUrl/ndc.json?search=product_ndc:"$ndc"&limit=1');
      
      final response = await http.get(url).timeout(_requestTimeout);
      
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        
        if (data['results'] != null && data['results'].isNotEmpty) {
          final result = data['results'][0];
          
          return scannedData.copyWithApiData(
            brandName: result['brand_name'],
            genericName: result['generic_name'],
            manufacturer: result['labeler_name'],
            dosageForm: result['dosage_form_name'],
            isVerified: true,
          );
        }
      }

      return scannedData.copyWithApiData(isVerified: false);
    } catch (e) {
      print('NDC lookup error: $e');
      return scannedData.copyWithApiData(isVerified: false);
    }
  }

  /// Query OpenFDA API for drug information
  Future<BarcodeMedicineData> _queryOpenFDA(String gtin) async {
    try {
      // OpenFDA drug labeling API
      final labelUrl = Uri.parse('$_openFdaBaseUrl/label.json?search=openfda.upc:"$gtin"&limit=1');
      
      final response = await http.get(labelUrl).timeout(_requestTimeout);
      
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        
        if (data['results'] != null && data['results'].isNotEmpty) {
          final result = data['results'][0];
          final openFda = result['openfda'] ?? {};
          
          return BarcodeMedicineData(
            gtin: gtin,
            brandName: _getFirstItem(openFda['brand_name']),
            genericName: _getFirstItem(openFda['generic_name']),
            manufacturer: _getFirstItem(openFda['manufacturer_name']),
            dosageForm: _getFirstItem(openFda['dosage_form']),
            barcodeType: BarcodeType.ean13, // Assume EAN-13 for FDA data
            rawData: gtin,
            isVerified: true,
          );
        }
      }

      // Try drug product API as fallback
      final productUrl = Uri.parse('$_openFdaBaseUrl/drugsfda.json?search=openfda.upc:"$gtin"&limit=1');
      final productResponse = await http.get(productUrl).timeout(_requestTimeout);
      
      if (productResponse.statusCode == 200) {
        final productData = jsonDecode(productResponse.body);
        
        if (productData['results'] != null && productData['results'].isNotEmpty) {
          final result = productData['results'][0];
          final openFda = result['openfda'] ?? {};
          
          return BarcodeMedicineData(
            gtin: gtin,
            brandName: _getFirstItem(openFda['brand_name']),
            genericName: _getFirstItem(openFda['generic_name']),
            manufacturer: _getFirstItem(openFda['manufacturer_name']),
            barcodeType: BarcodeType.ean13,
            rawData: gtin,
            isVerified: true,
          );
        }
      }

      return BarcodeMedicineData.empty(gtin, BarcodeType.ean13);
    } catch (e) {
      print('OpenFDA lookup error: $e');
      return BarcodeMedicineData.empty(gtin, BarcodeType.ean13);
    }
  }

  /// Generic barcode lookup using alternative sources
  Future<BarcodeMedicineData> _lookupGenericBarcode(BarcodeMedicineData scannedData) async {
    try {
      // Could integrate with other APIs like:
      // - European Medicines Agency (EMA)
      // - WHO Global Health Observatory
      // - Open Food Facts (for some OTC medicines)
      // - Country-specific medicine databases
      
      // For demonstration, simulate a successful lookup for known test barcodes
      if (_isTestBarcode(scannedData.rawData)) {
        return _generateTestMedicineData(scannedData);
      }

      return scannedData.copyWithApiData(isVerified: false);
    } catch (e) {
      print('Generic barcode lookup error: $e');
      return scannedData.copyWithApiData(isVerified: false);
    }
  }

  /// Check if barcode is a test/demo barcode
  bool _isTestBarcode(String barcode) {
    const testBarcodes = [
      '1234567890123', // Test EAN-13
      '0123456789012', // Test UPC-A
      '123456789012',  // Test UPC
    ];
    return testBarcodes.contains(barcode);
  }

  /// Generate test medicine data for demonstration
  BarcodeMedicineData _generateTestMedicineData(BarcodeMedicineData scannedData) {
    // Return demo medicine data based on barcode
    switch (scannedData.rawData) {
      case '1234567890123':
        return scannedData.copyWithApiData(
          brandName: 'Panadol',
          genericName: 'Paracetamol',
          manufacturer: 'GlaxoSmithKline',
          strength: '500mg',
          dosageForm: 'Tablet',
          packageSize: '20 tablets',
          isVerified: true,
        );
      case '0123456789012':
        return scannedData.copyWithApiData(
          brandName: 'Amoxil',
          genericName: 'Amoxicillin',
          manufacturer: 'GlaxoSmithKline',
          strength: '250mg',
          dosageForm: 'Capsule',
          packageSize: '21 capsules',
          isVerified: true,
        );
      default:
        return scannedData.copyWithApiData(isVerified: false);
    }
  }

  /// Get first item from array or return null
  String? _getFirstItem(dynamic value) {
    if (value is List && value.isNotEmpty) {
      return value.first.toString();
    } else if (value is String) {
      return value;
    }
    return null;
  }

  /// Validate medicine data from API response
  bool _isValidMedicineData(Map<String, dynamic> data) {
    return data.containsKey('brand_name') || 
           data.containsKey('generic_name') ||
           data.containsKey('product_name');
  }

  /// Format strength information consistently
  String? _formatStrength(dynamic strength) {
    if (strength is String) {
      return strength;
    } else if (strength is List && strength.isNotEmpty) {
      return strength.first.toString();
    }
    return null;
  }

  /// Get cached medicine data (for performance)
  Future<BarcodeMedicineData?> getCachedMedicine(String barcode) async {
    // TODO: Implement local caching using SharedPreferences or SQLite
    // This would store frequently looked up medicines locally
    return null;
  }

  /// Cache medicine data for future use
  Future<void> cacheMedicine(BarcodeMedicineData medicineData) async {
    // TODO: Implement local caching
    // Store verified medicine data locally with expiration time
  }

  /// Extract potential NDC (National Drug Code) from GTIN
  String? _extractNDC(String? gtin) {
    if (gtin == null || gtin.length != 14) return null;
    
    // NDC is often embedded in GTIN for US products
    // This is a simplified extraction - real implementation would need
    // more sophisticated parsing based on manufacturer prefix
    if (gtin.startsWith('003') || gtin.startsWith('030')) {
      return gtin.substring(3, 13); // Extract 10-digit NDC
    }
    
    return null;
  }
}