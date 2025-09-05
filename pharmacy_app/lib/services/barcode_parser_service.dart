import 'package:mobile_scanner/mobile_scanner.dart' as scanner;
import '../models/barcode_medicine_data.dart';

/// Service for parsing medicine barcode data
class BarcodeParserService {
  static const BarcodeParserService _instance = BarcodeParserService._internal();
  factory BarcodeParserService() => _instance;
  const BarcodeParserService._internal();

  /// Parse scanned barcode data into medicine information
  BarcodeScanResult parseBarcode(scanner.BarcodeCapture capture) {
    try {
      for (final barcode in capture.barcodes) {
        final rawValue = barcode.rawValue;
        if (rawValue == null || rawValue.isEmpty) continue;

        final barcodeType = _mapBarcodeFormat(barcode.format);
        
        // Parse based on barcode type
        switch (barcodeType) {
          case BarcodeType.dataMatrix:
            return _parseGS1DataMatrix(rawValue);
          case BarcodeType.ean13:
          case BarcodeType.upcA:
            return _parseLinearBarcode(rawValue, barcodeType);
          case BarcodeType.gs1DataBar:
            return _parseGS1DataBar(rawValue);
          default:
            return _parseGenericBarcode(rawValue, barcodeType);
        }
      }

      return BarcodeScanResult.error('No valid barcode data found');
    } catch (e) {
      return BarcodeScanResult.error('Error parsing barcode: ${e.toString()}');
    }
  }

  /// Map mobile_scanner format to our BarcodeType enum
  BarcodeType _mapBarcodeFormat(scanner.BarcodeFormat format) {
    switch (format) {
      case scanner.BarcodeFormat.ean13:
        return BarcodeType.ean13;
      case scanner.BarcodeFormat.upcA:
        return BarcodeType.upcA;
      case scanner.BarcodeFormat.dataMatrix:
        return BarcodeType.dataMatrix;
      case scanner.BarcodeFormat.code128:
        return BarcodeType.code128;
      case scanner.BarcodeFormat.qrCode:
        return BarcodeType.qrCode;
      default:
        return BarcodeType.unknown;
    }
  }

  /// Parse GS1 DataMatrix containing GTIN, lot, expiry, serial
  BarcodeScanResult _parseGS1DataMatrix(String data) {
    try {
      // GS1 DataMatrix format uses Application Identifiers (AIs)
      // Common AIs for pharmaceuticals:
      // (01) = GTIN
      // (10) = Lot/Batch
      // (17) = Expiry Date (YYMMDD)
      // (21) = Serial Number

      String? gtin;
      String? lotNumber;
      DateTime? expiryDate;
      String? serialNumber;

      // Parse GS1 data with Application Identifiers
      final parsed = _parseGS1Data(data);
      
      gtin = parsed['01']; // GTIN
      lotNumber = parsed['10']; // Lot/Batch
      serialNumber = parsed['21']; // Serial Number
      
      // Parse expiry date (17)YYMMDD format
      final expiryStr = parsed['17'];
      if (expiryStr != null && expiryStr.length == 6) {
        try {
          final year = 2000 + int.parse(expiryStr.substring(0, 2));
          final month = int.parse(expiryStr.substring(2, 4));
          final day = int.parse(expiryStr.substring(4, 6));
          expiryDate = DateTime(year, month, day);
        } catch (e) {
          // Debug statement removed for production security
        }
      }

      return BarcodeScanResult.success(
        BarcodeMedicineData(
          gtin: gtin,
          lotNumber: lotNumber,
          expiryDate: expiryDate,
          serialNumber: serialNumber,
          barcodeType: BarcodeType.dataMatrix,
          rawData: data,
          isVerified: false,
        ),
      );
    } catch (e) {
      return BarcodeScanResult.error('Error parsing GS1 DataMatrix: ${e.toString()}');
    }
  }

  /// Parse linear barcodes (EAN-13, UPC-A) that contain only GTIN
  BarcodeScanResult _parseLinearBarcode(String data, BarcodeType type) {
    try {
      // Linear barcodes typically contain just the GTIN
      String? gtin;
      
      if (type == BarcodeType.ean13 && data.length == 13) {
        gtin = data;
      } else if (type == BarcodeType.upcA && data.length == 12) {
        gtin = '0$data'; // Convert UPC-A to GTIN-13 format
      }

      return BarcodeScanResult.success(
        BarcodeMedicineData(
          gtin: gtin,
          barcodeType: type,
          rawData: data,
          isVerified: false,
        ),
      );
    } catch (e) {
      return BarcodeScanResult.error('Error parsing linear barcode: ${e.toString()}');
    }
  }

  /// Parse GS1 DataBar (more complex format)
  BarcodeScanResult _parseGS1DataBar(String data) {
    // GS1 DataBar can contain additional data beyond GTIN
    // For now, treat similar to linear barcode but mark for potential expansion
    return BarcodeScanResult.success(
      BarcodeMedicineData(
        gtin: data.length >= 12 ? data : null,
        barcodeType: BarcodeType.gs1DataBar,
        rawData: data,
        isVerified: false,
      ),
    );
  }

  /// Generic parser for unknown barcode types
  BarcodeScanResult _parseGenericBarcode(String data, BarcodeType type) {
    return BarcodeScanResult.success(
      BarcodeMedicineData.empty(data, type),
    );
  }

  /// Parse GS1 Application Identifier data format
  Map<String, String> _parseGS1Data(String data) {
    final Map<String, String> result = {};
    
    if (!data.startsWith(']d2') && !data.startsWith('01')) {
      // Try to handle data without GS1 prefix
      if (data.length >= 14) {
        result['01'] = data.substring(0, 14); // Assume first 14 digits are GTIN
      }
      return result;
    }

    String workingData = data;
    
    // Remove GS1 prefix if present
    if (workingData.startsWith(']d2')) {
      workingData = workingData.substring(3);
    }

    int position = 0;
    while (position < workingData.length - 1) {
      // Look for AI (2 digits in parentheses or just 2 digits)
      String? ai;
      int aiLength = 0;
      
      if (position < workingData.length - 3 && workingData[position] == '(') {
        // AI in parentheses format
        final endParen = workingData.indexOf(')', position);
        if (endParen != -1) {
          ai = workingData.substring(position + 1, endParen);
          aiLength = endParen - position + 1;
        }
      } else if (position < workingData.length - 1) {
        // AI without parentheses (more common in actual barcode data)
        ai = workingData.substring(position, position + 2);
        aiLength = 2;
      }

      if (ai == null) break;

      position += aiLength;

      // Determine value length based on AI
      int valueLength = _getAIValueLength(ai, workingData, position);
      if (position + valueLength > workingData.length) {
        valueLength = workingData.length - position;
      }

      if (valueLength > 0) {
        final value = workingData.substring(position, position + valueLength);
        result[ai] = value;
        position += valueLength;
      } else {
        break;
      }
    }

    return result;
  }

  /// Get expected value length for GS1 Application Identifier
  int _getAIValueLength(String ai, String data, int position) {
    switch (ai) {
      case '01': // GTIN
        return 14;
      case '10': // Batch/Lot - variable length, look for next AI or end
        return _findNextAIPosition(data, position) - position;
      case '17': // Expiry date
        return 6;
      case '21': // Serial number - variable length
        return _findNextAIPosition(data, position) - position;
      default:
        return _findNextAIPosition(data, position) - position;
    }
  }

  /// Find position of next Application Identifier or end of data
  int _findNextAIPosition(String data, int startPos) {
    // Look for next AI (assume 2-digit numeric AI)
    for (int i = startPos + 1; i < data.length - 1; i++) {
      final substr = data.substring(i, i + 2);
      if (RegExp(r'^\d{2}$').hasMatch(substr)) {
        // Check if this could be a valid AI
        if (['01', '10', '17', '21', '11', '13', '15'].contains(substr)) {
          return i;
        }
      }
    }
    return data.length; // No next AI found
  }

  /// Validate if a string could be a valid GTIN
  bool isValidGTIN(String? gtin) {
    if (gtin == null || (gtin.length != 12 && gtin.length != 13 && gtin.length != 14)) {
      return false;
    }

    // Basic numeric check
    return RegExp(r'^\d+$').hasMatch(gtin);
  }

  /// Extract potential NDC (National Drug Code) from GTIN
  String? extractNDC(String? gtin) {
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