import 'package:flutter/material.dart';
import '../../models/payment_preferences.dart';
import '../../services/encryption_service.dart';

class PaymentMethodScreen extends StatefulWidget {
  const PaymentMethodScreen({
    super.key,
    required this.onPaymentMethodSelected,
    this.allowSkip = true,
    this.title = 'Choose Payment Method',
    this.subtitle = 'Select your preferred mobile money operator for payments',
  });

  final Function(PaymentPreferences) onPaymentMethodSelected;
  final bool allowSkip;
  final String title;
  final String subtitle;

  @override
  State<PaymentMethodScreen> createState() => _PaymentMethodScreenState();
}

class _PaymentMethodScreenState extends State<PaymentMethodScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  
  String _selectedMethod = '';
  bool _autoPayFromWallet = false;
  bool _isLoading = false;
  String? _phoneError;

  final List<PaymentMethod> _paymentMethods = [
    PaymentMethod(
      id: 'mtn',
      name: 'MTN MoMo',
      logo: '📱',
      color: Colors.yellow,
      description: 'MTN Mobile Money',
    ),
    PaymentMethod(
      id: 'orange',
      name: 'Orange Money',
      logo: '🧡',
      color: Colors.orange,
      description: 'Orange Mobile Money',
    ),
  ];

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  void _validatePhone(String value) {
    setState(() {
      _phoneError = null;
    });

    if (value.isEmpty) return;

    // Remove country code and spaces
    String phone = value.replaceAll('+237', '').replaceAll(' ', '');
    
    // Use EncryptionService for validation
    if (!EncryptionService.isValidCameroonPhone(phone)) {
      setState(() {
        _phoneError = 'Enter a valid Cameroon mobile number (6XXXXXXXX)';
      });
      return;
    }
    
    // Cross-validate with selected payment method
    if (_selectedMethod.isNotEmpty && !EncryptionService.validatePhoneWithMethod(phone, _selectedMethod)) {
      setState(() {
        _phoneError = 'This number is not compatible with ${_selectedMethod.toUpperCase()}';
      });
      return;
    }
  }

  void _onPhoneChanged(String value) {
    // Auto-format phone number
    String phone = value.replaceAll('+237', '').replaceAll(' ', '');
    if (phone.length <= 9 && RegExp(r'^[0-9]*$').hasMatch(phone)) {
      if (phone.isNotEmpty && !phone.startsWith('6') && !phone.startsWith('7') && !phone.startsWith('8') && !phone.startsWith('9')) {
        return; // Don't update if first digit is invalid
      }
      _validatePhone(phone);
    }
  }

  void _selectPaymentMethod() {
    if (_selectedMethod.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select a payment method'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_formKey.currentState?.validate() != true || _phoneError != null) {
      return;
    }

    setState(() {
      _isLoading = true;
    });

    // Clean phone number
    String cleanPhone = _phoneController.text.replaceAll('+237', '').replaceAll(' ', '');
    
    // Validate with encryption service
    if (!EncryptionService.isValidCameroonPhone(cleanPhone)) {
      setState(() {
        _isLoading = false;
        _phoneError = 'Invalid Cameroon phone number format';
      });
      return;
    }
    
    // Cross-validate phone with payment method
    if (!EncryptionService.validatePhoneWithMethod(cleanPhone, _selectedMethod)) {
      setState(() {
        _isLoading = false;
        _phoneError = 'Phone number does not match selected operator';
      });
      return;
    }
    
    // Block test numbers in production
    if (EncryptionService.isProductionEnvironment() && EncryptionService.isTestPhoneNumber(cleanPhone)) {
      setState(() {
        _isLoading = false;
        _phoneError = 'Test numbers not allowed in production';
      });
      return;
    }
    
    // Create secure preferences with encryption
    final preferences = PaymentPreferences.createSecure(
      method: _selectedMethod,
      phoneNumber: cleanPhone,
      autoPayFromWallet: _autoPayFromWallet,
      isSetupComplete: true,
    );

    // Simulate network delay
    Future.delayed(const Duration(milliseconds: 500), () {
      if (mounted) {
        widget.onPaymentMethodSelected(preferences);
      }
    });
  }

  void _skipSetup() {
    final preferences = PaymentPreferences.empty();
    widget.onPaymentMethodSelected(preferences);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.black87),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header
                Text(
                  widget.title,
                  style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  widget.subtitle,
                  style: TextStyle(
                    fontSize: 16,
                    color: Colors.grey[600],
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 32),

                // Payment Methods
                Text(
                  'Mobile Money Operator',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey[800],
                  ),
                ),
                const SizedBox(height: 16),

                ..._paymentMethods.map((method) => _buildPaymentMethodTile(method)),

                const SizedBox(height: 24),

                // Phone Number Input
                if (_selectedMethod.isNotEmpty) ...[
                  Text(
                    'Phone Number',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Colors.grey[800],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      TextFormField(
                        controller: _phoneController,
                        decoration: InputDecoration(
                          hintText: PaymentPreferences.getSandboxNumber(_selectedMethod),
                          prefixText: '+237 ',
                          errorText: _phoneError,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: Colors.grey[300]!),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: Colors.grey[300]!),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(color: Colors.blue, width: 2),
                          ),
                          filled: true,
                          fillColor: Colors.grey[50],
                          contentPadding: const EdgeInsets.all(16),
                        ),
                        keyboardType: TextInputType.phone,
                        onChanged: _onPhoneChanged,
                        validator: (value) {
                          if (value == null || value.isEmpty) {
                            return 'Please enter your phone number';
                          }
                          return _phoneError;
                        },
                      ),
                      const SizedBox(height: 8),
                      if (!EncryptionService.isProductionEnvironment())
                        Text(
                          'Development test number: ${PaymentPreferences.getSandboxNumber(_selectedMethod)}',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.blue[600],
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Auto-pay option
                  Row(
                    children: [
                      Checkbox(
                        value: _autoPayFromWallet,
                        onChanged: (value) {
                          setState(() {
                            _autoPayFromWallet = value ?? false;
                          });
                        },
                      ),
                      Expanded(
                        child: Text(
                          'Use wallet balance first when available',
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.grey[700],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                ],

                SizedBox(height: MediaQuery.of(context).size.height * 0.1), // Dynamic spacing

                // Action Buttons
                if (_selectedMethod.isNotEmpty)
                  Container(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : _selectPaymentMethod,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue,
                        foregroundColor: Colors.white,
                        elevation: 2,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        disabledBackgroundColor: Colors.grey[300],
                        disabledForegroundColor: Colors.grey[600],
                      ),
                      child: _isLoading 
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                            ),
                          )
                        : const Text(
                            'Continue',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                    ),
                  ),

                if (widget.allowSkip) ...[
                  const SizedBox(height: 16),
                  TextButton(
                    onPressed: _isLoading ? null : _skipSetup,
                    child: const Text(
                      'Skip for now',
                      style: TextStyle(
                        fontSize: 16,
                        color: Colors.grey,
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 24),

                // Info text
                Text(
                  'You can change your payment method later in Settings.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[500],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPaymentMethodTile(PaymentMethod method) {
    final isSelected = _selectedMethod == method.id;
    
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: () {
          setState(() {
            _selectedMethod = method.id;
            _phoneError = null;
          });
        },
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            border: Border.all(
              color: isSelected ? method.color : Colors.grey[300]!,
              width: isSelected ? 2 : 1,
            ),
            borderRadius: BorderRadius.circular(12),
            color: isSelected ? method.color.withValues(alpha: 0.1) : Colors.grey[50],
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: method.color.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Center(
                  child: Text(
                    method.logo,
                    style: const TextStyle(fontSize: 20),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      method.name,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: Colors.black87,
                      ),
                    ),
                    Text(
                      method.description,
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.grey[600],
                      ),
                    ),
                  ],
                ),
              ),
              if (isSelected)
                Icon(
                  Icons.check_circle,
                  color: method.color,
                  size: 24,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class PaymentMethod {
  const PaymentMethod({
    required this.id,
    required this.name,
    required this.logo,
    required this.color,
    required this.description,
  });

  final String id;
  final String name;
  final String logo;
  final Color color;
  final String description;
}