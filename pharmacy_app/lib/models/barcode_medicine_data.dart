import 'package:equatable/equatable.dart';

/// Data structure for medicine information extracted from barcode scanning
class BarcodeMedicineData extends Equatable {
  final String? gtin; // Global Trade Item Number (from EAN-13 or GS1)
  final String? ndc; // National Drug Code (US)
  final String? brandName;
  final String? genericName;
  final String? manufacturer;
  final String? strength;
  final String? dosageForm;
  final String? packageSize;
  final String? lotNumber; // From GS1 DataMatrix
  final DateTime? expiryDate; // From GS1 DataMatrix
  final String? serialNumber; // From GS1 DataMatrix (optional)
  final BarcodeType barcodeType;
  final String rawData; // Original scanned data
  final bool isVerified; // Whether data has been verified against API

  const BarcodeMedicineData({
    this.gtin,
    this.ndc,
    this.brandName,
    this.genericName,
    this.manufacturer,
    this.strength,
    this.dosageForm,
    this.packageSize,
    this.lotNumber,
    this.expiryDate,
    this.serialNumber,
    required this.barcodeType,
    required this.rawData,
    this.isVerified = false,
  });

  /// Creates an empty/unverified instance for manual entry fallback
  factory BarcodeMedicineData.empty(String rawData, BarcodeType type) {
    return BarcodeMedicineData(
      barcodeType: type,
      rawData: rawData,
      isVerified: false,
    );
  }

  /// Creates instance with API-verified data
  BarcodeMedicineData copyWithApiData({
    String? brandName,
    String? genericName,
    String? manufacturer,
    String? strength,
    String? dosageForm,
    String? packageSize,
    bool isVerified = true,
  }) {
    return BarcodeMedicineData(
      gtin: gtin,
      ndc: ndc,
      brandName: brandName ?? this.brandName,
      genericName: genericName ?? this.genericName,
      manufacturer: manufacturer ?? this.manufacturer,
      strength: strength ?? this.strength,
      dosageForm: dosageForm ?? this.dosageForm,
      packageSize: packageSize ?? this.packageSize,
      lotNumber: lotNumber,
      expiryDate: expiryDate,
      serialNumber: serialNumber,
      barcodeType: barcodeType,
      rawData: rawData,
      isVerified: isVerified,
    );
  }

  /// Whether this contains enough data to auto-fill a medicine form
  bool get hasBasicInfo => brandName != null || genericName != null;

  /// Whether this contains expiry information from GS1 DataMatrix
  bool get hasExpiryInfo => expiryDate != null;

  /// Whether this contains lot/batch information
  bool get hasLotInfo => lotNumber != null;

  @override
  List<Object?> get props => [
        gtin,
        ndc,
        brandName,
        genericName,
        manufacturer,
        strength,
        dosageForm,
        packageSize,
        lotNumber,
        expiryDate,
        serialNumber,
        barcodeType,
        rawData,
        isVerified,
      ];
}

/// Types of barcodes supported for medicine scanning
enum BarcodeType {
  ean13('EAN-13'),
  dataMatrix('GS1 DataMatrix'),
  gs1DataBar('GS1 DataBar'),
  upcA('UPC-A'),
  code128('Code 128'),
  qrCode('QR Code'),
  unknown('Unknown');

  const BarcodeType(this.displayName);
  final String displayName;

  /// Whether this barcode type can contain expiry/lot information
  bool get canContainExpiryInfo => this == BarcodeType.dataMatrix;

  /// Whether this is a linear (1D) barcode
  bool get isLinear => [
        BarcodeType.ean13,
        BarcodeType.upcA,
        BarcodeType.gs1DataBar,
        BarcodeType.code128,
      ].contains(this);

  /// Whether this is a 2D barcode
  bool get is2D => [
        BarcodeType.dataMatrix,
        BarcodeType.qrCode,
      ].contains(this);
}

/// Result of barcode scanning operation
class BarcodeScanResult extends Equatable {
  final BarcodeMedicineData? medicineData;
  final String? error;
  final bool success;

  const BarcodeScanResult._({
    this.medicineData,
    this.error,
    required this.success,
  });

  /// Successful scan result
  factory BarcodeScanResult.success(BarcodeMedicineData medicineData) {
    return BarcodeScanResult._(
      medicineData: medicineData,
      success: true,
    );
  }

  /// Failed scan result
  factory BarcodeScanResult.error(String error) {
    return BarcodeScanResult._(
      error: error,
      success: false,
    );
  }

  @override
  List<Object?> get props => [medicineData, error, success];
}