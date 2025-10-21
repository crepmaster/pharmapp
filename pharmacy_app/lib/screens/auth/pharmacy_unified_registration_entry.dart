import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:pharmapp_unified/blocs/unified_auth_bloc.dart';
import 'package:pharmapp_unified/screens/auth/unified_registration_screen.dart';
import 'package:pharmapp_shared/screens/auth/country_payment_selection_screen.dart';
import 'package:pharmapp_shared/services/unified_auth_service.dart';

/// Entry point for pharmacy registration using unified authentication
/// This replaces the old RegisterScreen with the new unified system
class PharmacyUnifiedRegistrationEntry extends StatelessWidget {
  const PharmacyUnifiedRegistrationEntry({super.key});

  @override
  Widget build(BuildContext context) {
    return CountryPaymentSelectionScreen(
      title: 'Step 1: Select Your Location',
      subtitle: 'Choose your country and city',
      allowSkip: false,
      registrationScreenBuilder: (selectedCountry, selectedCity) {
        // Return unified registration screen with UnifiedAuthBloc provider
        return BlocProvider(
          create: (context) => UnifiedAuthBloc(),
          child: UnifiedRegistrationScreen(
            userType: UserType.pharmacy,
            selectedCountry: selectedCountry,
            selectedCity: selectedCity,
          ),
        );
      },
    );
  }
}
