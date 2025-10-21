/// Multi-Country Configuration for PharmApp
/// Supports Cameroon, Kenya, Tanzania, Uganda, Nigeria
///
/// Features:
/// - Country-specific mobile money operators
/// - Phone number prefix validation
/// - Currency configuration
/// - Operator branding

enum Country {
  cameroon,
  kenya,
  tanzania,
  uganda,
  nigeria,
}

enum PaymentOperator {
  // Cameroon
  mtnCameroon,
  orangeCameroon,

  // Kenya
  mpesaKenya,
  airtelKenya,

  // Tanzania
  mpesaTanzania,
  tigoTanzania,
  airtelTanzania,

  // Uganda
  mtnUganda,
  airtelUganda,

  // Nigeria
  mtnNigeria,
  airtelNigeria,
  gloNigeria,
  nineMobile,
}

/// Country-specific configuration
class CountryConfig {
  final Country country;
  final String name;
  final String countryCode; // e.g., "237" for Cameroon
  final String currency; // e.g., "XAF"
  final String currencySymbol; // e.g., "FCFA"
  final List<PaymentOperator> availableOperators;
  final Map<PaymentOperator, OperatorConfig> operatorConfigs;
  final List<String> majorCities; // Major cities for geographic grouping

  const CountryConfig({
    required this.country,
    required this.name,
    required this.countryCode,
    required this.currency,
    required this.currencySymbol,
    required this.availableOperators,
    required this.operatorConfigs,
    required this.majorCities,
  });

  /// Get operator config by operator
  OperatorConfig? getOperatorConfig(PaymentOperator operator) {
    return operatorConfigs[operator];
  }

  /// Validate phone number for this country
  bool isValidPhoneNumber(String phoneNumber, PaymentOperator operator) {
    final config = operatorConfigs[operator];
    if (config == null) return false;

    // Remove all non-digits
    final digitsOnly = phoneNumber.replaceAll(RegExp(r'\D'), '');

    // Check if it starts with country code
    if (digitsOnly.startsWith(countryCode)) {
      final localNumber = digitsOnly.substring(countryCode.length);
      return config.isValidLocalNumber(localNumber);
    }

    // Check if it's a local number
    return config.isValidLocalNumber(digitsOnly);
  }

  /// Format phone number for display (masked)
  String formatPhoneNumber(String phoneNumber) {
    final digitsOnly = phoneNumber.replaceAll(RegExp(r'\D'), '');

    if (digitsOnly.length >= 4) {
      final firstTwo = digitsOnly.substring(0, 2);
      final lastTwo = digitsOnly.substring(digitsOnly.length - 2);
      final stars = '*' * (digitsOnly.length - 4);
      return '$firstTwo$stars$lastTwo';
    }

    return phoneNumber;
  }
}

/// Operator-specific configuration
class OperatorConfig {
  final PaymentOperator operator;
  final String name;
  final String displayName;
  final List<String> validPrefixes; // Local prefixes (without country code)
  final int minLength; // Minimum local number length
  final int maxLength; // Maximum local number length
  final String logoAsset; // Asset path for operator logo
  final String primaryColor; // Hex color for branding

  const OperatorConfig({
    required this.operator,
    required this.name,
    required this.displayName,
    required this.validPrefixes,
    required this.minLength,
    required this.maxLength,
    required this.logoAsset,
    required this.primaryColor,
  });

  /// Validate local number (without country code)
  bool isValidLocalNumber(String localNumber) {
    // Check length
    if (localNumber.length < minLength || localNumber.length > maxLength) {
      return false;
    }

    // Check prefix
    return validPrefixes.any((prefix) => localNumber.startsWith(prefix));
  }

  /// Get full operator display name
  String get fullDisplayName => displayName;
}

/// Pre-configured countries
class Countries {
  /// 🇨🇲 CAMEROON Configuration
  static const cameroon = CountryConfig(
    country: Country.cameroon,
    name: 'Cameroon',
    countryCode: '237',
    currency: 'XAF',
    currencySymbol: 'FCFA',
    availableOperators: [
      PaymentOperator.mtnCameroon,
      PaymentOperator.orangeCameroon,
    ],
    majorCities: [
      'Douala',
      'Yaoundé',
      'Bafoussam',
      'Bamenda',
      'Garoua',
      'Maroua',
      'Ngaoundéré',
      'Bertoua',
      'Kumba',
      'Limbe',
    ],
    operatorConfigs: {
      PaymentOperator.mtnCameroon: OperatorConfig(
        operator: PaymentOperator.mtnCameroon,
        name: 'MTN Mobile Money',
        displayName: 'MTN Mobile Money',
        validPrefixes: ['650', '651', '652', '653', '654', '670', '671', '672', '673', '674', '675', '676', '677', '678', '679', '680', '681', '682', '683', '684', '685'],
        minLength: 9,
        maxLength: 9,
        logoAsset: 'assets/images/operators/mtn_logo.png',
        primaryColor: '#FFCB05', // MTN Yellow
      ),
      PaymentOperator.orangeCameroon: OperatorConfig(
        operator: PaymentOperator.orangeCameroon,
        name: 'Orange Money',
        displayName: 'Orange Money',
        validPrefixes: ['690', '691', '692', '693', '694', '695', '696', '697', '698', '699'],
        minLength: 9,
        maxLength: 9,
        logoAsset: 'assets/images/operators/orange_logo.png',
        primaryColor: '#FF7900', // Orange
      ),
    },
  );

  /// 🇰🇪 KENYA Configuration
  static const kenya = CountryConfig(
    country: Country.kenya,
    name: 'Kenya',
    countryCode: '254',
    currency: 'KES',
    currencySymbol: 'KSh',
    availableOperators: [
      PaymentOperator.mpesaKenya,
      PaymentOperator.airtelKenya,
    ],
    majorCities: [
      'Nairobi',
      'Mombasa',
      'Kisumu',
      'Nakuru',
      'Eldoret',
    ],
    operatorConfigs: {
      PaymentOperator.mpesaKenya: OperatorConfig(
        operator: PaymentOperator.mpesaKenya,
        name: 'M-Pesa',
        displayName: 'M-Pesa (Safaricom)',
        validPrefixes: ['700', '701', '702', '703', '704', '705', '706', '707', '708', '709', '710', '711', '712', '713', '714', '715', '716', '717', '718', '719', '720', '721', '722', '723', '724', '725', '726', '727', '728', '729'],
        minLength: 9,
        maxLength: 9,
        logoAsset: 'assets/images/operators/mpesa_logo.png',
        primaryColor: '#00A859', // M-Pesa Green
      ),
      PaymentOperator.airtelKenya: OperatorConfig(
        operator: PaymentOperator.airtelKenya,
        name: 'Airtel Money',
        displayName: 'Airtel Money',
        validPrefixes: ['730', '731', '732', '733', '734', '735', '736', '737', '738', '739'],
        minLength: 9,
        maxLength: 9,
        logoAsset: 'assets/images/operators/airtel_logo.png',
        primaryColor: '#E60000', // Airtel Red
      ),
    },
  );

  /// 🇹🇿 TANZANIA Configuration
  static const tanzania = CountryConfig(
    country: Country.tanzania,
    name: 'Tanzania',
    countryCode: '255',
    currency: 'TZS',
    currencySymbol: 'TSh',
    availableOperators: [
      PaymentOperator.mpesaTanzania,
      PaymentOperator.tigoTanzania,
      PaymentOperator.airtelTanzania,
    ],
    majorCities: [
      'Dar es Salaam',
      'Dodoma',
      'Mwanza',
      'Arusha',
      'Mbeya',
    ],
    operatorConfigs: {
      PaymentOperator.mpesaTanzania: OperatorConfig(
        operator: PaymentOperator.mpesaTanzania,
        name: 'M-Pesa',
        displayName: 'M-Pesa (Vodacom)',
        validPrefixes: ['74', '75', '76'],
        minLength: 9,
        maxLength: 9,
        logoAsset: 'assets/images/operators/mpesa_logo.png',
        primaryColor: '#E60000', // Vodacom Red
      ),
      PaymentOperator.tigoTanzania: OperatorConfig(
        operator: PaymentOperator.tigoTanzania,
        name: 'Tigo Pesa',
        displayName: 'Tigo Pesa',
        validPrefixes: ['71', '65', '67'],
        minLength: 9,
        maxLength: 9,
        logoAsset: 'assets/images/operators/tigo_logo.png',
        primaryColor: '#0066CC', // Tigo Blue
      ),
      PaymentOperator.airtelTanzania: OperatorConfig(
        operator: PaymentOperator.airtelTanzania,
        name: 'Airtel Money',
        displayName: 'Airtel Money',
        validPrefixes: ['68', '69', '78'],
        minLength: 9,
        maxLength: 9,
        logoAsset: 'assets/images/operators/airtel_logo.png',
        primaryColor: '#E60000', // Airtel Red
      ),
    },
  );

  /// 🇺🇬 UGANDA Configuration
  static const uganda = CountryConfig(
    country: Country.uganda,
    name: 'Uganda',
    countryCode: '256',
    currency: 'UGX',
    currencySymbol: 'USh',
    availableOperators: [
      PaymentOperator.mtnUganda,
      PaymentOperator.airtelUganda,
    ],
    majorCities: [
      'Kampala',
      'Gulu',
      'Lira',
      'Mbarara',
      'Jinja',
    ],
    operatorConfigs: {
      PaymentOperator.mtnUganda: OperatorConfig(
        operator: PaymentOperator.mtnUganda,
        name: 'MTN Mobile Money',
        displayName: 'MTN Mobile Money',
        validPrefixes: ['77', '78'],
        minLength: 9,
        maxLength: 9,
        logoAsset: 'assets/images/operators/mtn_logo.png',
        primaryColor: '#FFCB05', // MTN Yellow
      ),
      PaymentOperator.airtelUganda: OperatorConfig(
        operator: PaymentOperator.airtelUganda,
        name: 'Airtel Money',
        displayName: 'Airtel Money',
        validPrefixes: ['70', '75'],
        minLength: 9,
        maxLength: 9,
        logoAsset: 'assets/images/operators/airtel_logo.png',
        primaryColor: '#E60000', // Airtel Red
      ),
    },
  );

  /// 🇳🇬 NIGERIA Configuration
  static const nigeria = CountryConfig(
    country: Country.nigeria,
    name: 'Nigeria',
    countryCode: '234',
    currency: 'NGN',
    currencySymbol: '₦',
    availableOperators: [
      PaymentOperator.mtnNigeria,
      PaymentOperator.airtelNigeria,
      PaymentOperator.gloNigeria,
      PaymentOperator.nineMobile,
    ],
    majorCities: [
      'Lagos',
      'Abuja',
      'Kano',
      'Ibadan',
      'Port Harcourt',
    ],
    operatorConfigs: {
      PaymentOperator.mtnNigeria: OperatorConfig(
        operator: PaymentOperator.mtnNigeria,
        name: 'MTN MoMo',
        displayName: 'MTN Mobile Money',
        validPrefixes: ['703', '706', '803', '806', '810', '813', '814', '816', '903', '906'],
        minLength: 10,
        maxLength: 10,
        logoAsset: 'assets/images/operators/mtn_logo.png',
        primaryColor: '#FFCB05', // MTN Yellow
      ),
      PaymentOperator.airtelNigeria: OperatorConfig(
        operator: PaymentOperator.airtelNigeria,
        name: 'Airtel Money',
        displayName: 'Airtel Money',
        validPrefixes: ['701', '708', '802', '808', '812', '901', '902', '904', '907', '912'],
        minLength: 10,
        maxLength: 10,
        logoAsset: 'assets/images/operators/airtel_logo.png',
        primaryColor: '#E60000', // Airtel Red
      ),
      PaymentOperator.gloNigeria: OperatorConfig(
        operator: PaymentOperator.gloNigeria,
        name: 'Glo Mobile Money',
        displayName: 'Glo Mobile Money',
        validPrefixes: ['705', '805', '807', '811', '815', '905'],
        minLength: 10,
        maxLength: 10,
        logoAsset: 'assets/images/operators/glo_logo.png',
        primaryColor: '#00A859', // Glo Green
      ),
      PaymentOperator.nineMobile: OperatorConfig(
        operator: PaymentOperator.nineMobile,
        name: '9mobile Payment',
        displayName: '9mobile Payment',
        validPrefixes: ['809', '817', '818', '909', '908'],
        minLength: 10,
        maxLength: 10,
        logoAsset: 'assets/images/operators/9mobile_logo.png',
        primaryColor: '#006F3F', // 9mobile Green
      ),
    },
  );

  /// Get all available countries
  static List<CountryConfig> get all => [
        cameroon,
        kenya,
        tanzania,
        uganda,
        nigeria,
      ];

  /// Get country by enum
  static CountryConfig? getByCountry(Country country) {
    switch (country) {
      case Country.cameroon:
        return cameroon;
      case Country.kenya:
        return kenya;
      case Country.tanzania:
        return tanzania;
      case Country.uganda:
        return uganda;
      case Country.nigeria:
        return nigeria;
    }
  }

  /// Get country by name
  static CountryConfig? getByName(String name) {
    try {
      return all.firstWhere(
        (config) => config.name.toLowerCase() == name.toLowerCase(),
      );
    } catch (e) {
      return null;
    }
  }
}
