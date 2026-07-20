library pharmapp_shared;

// Export services
export 'services/unified_auth_service.dart';
export 'services/unified_registration_service.dart';
export 'services/unified_wallet_service.dart';
export 'services/encryption_service.dart';
export 'services/authenticated_http_service.dart';
export 'services/master_data_service.dart';

// Export models
export 'models/unified_user.dart';
export 'models/payment_preferences.dart';
export 'models/country_config.dart';
export 'models/cities_config.dart';
export 'models/master_data_snapshot.dart';

// Export money — the transverse currency capability (MoneyContext,
// MoneyFormatter, MoneyContextService). See project memory
// `project-currency-money-context-sprint.md` for the architecture.
export 'money/money_context.dart';
export 'money/money_formatter.dart';
export 'money/money_context_service.dart';

// Export screens
export 'screens/auth/payment_method_screen.dart';
export 'screens/auth/country_payment_selection_screen.dart';