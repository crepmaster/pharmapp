/// Firebase Configuration Validator
/// Validates Firebase configuration at runtime and ensures secure setup
/// Used across all PharmApp applications for consistent configuration validation

import 'package:firebase_core/firebase_core.dart';

class FirebaseConfigValidator {
  
  /// Validates Firebase configuration for security compliance
  static bool validateConfiguration(FirebaseOptions options) {
    // Check required fields are present
    if (options.apiKey.isEmpty || 
        options.appId.isEmpty || 
        options.projectId.isEmpty) {
      return false;
    }
    
    // Validate project ID matches expected pattern
    if (!_isValidProjectId(options.projectId)) {
      return false;
    }
    
    // Check for development/demo configurations in production
    if (_isProductionEnvironment() && _isDevelopmentConfig(options)) {
      return false;
    }
    
    return true;
  }
  
  /// Checks if the project ID follows expected naming conventions
  static bool _isValidProjectId(String projectId) {
    // PharmApp uses 'mediexchange' for production
    const validProjects = ['mediexchange', 'mediexchange-dev', 'mediexchange-test'];
    return validProjects.contains(projectId);
  }
  
  /// Detects if running in production environment
  static bool _isProductionEnvironment() {
    // In production builds, kDebugMode is false
    const bool isDebug = bool.fromEnvironment('dart.vm.product') == false;
    return !isDebug;
  }
  
  /// Detects development configuration patterns
  static bool _isDevelopmentConfig(FirebaseOptions options) {
    // Check for demo/test patterns in configuration
    return options.projectId.contains('demo') ||
           options.projectId.contains('test') ||
           options.authDomain?.contains('demo') == true;
  }
  
  /// Gets environment-appropriate Firebase options
  static FirebaseOptions getValidatedOptions({
    required FirebaseOptions defaultOptions,
    String? environment,
  }) {
    // Validate the configuration
    if (!validateConfiguration(defaultOptions)) {
      throw FirebaseException(
        plugin: 'firebase_core',
        code: 'invalid-configuration',
        message: 'Invalid Firebase configuration detected. '
                'Please check your firebase_options.dart file.',
      );
    }
    
    return defaultOptions;
  }
  
  /// Configuration security warnings for development
  static List<String> getSecurityWarnings(FirebaseOptions options) {
    final warnings = <String>[];
    
    // Check for common security issues
    if (options.apiKey.startsWith('AIzaSyDemo') || 
        options.apiKey.contains('test') || 
        options.apiKey.contains('demo')) {
      warnings.add('Demo/test API key detected - not suitable for production');
    }
    
    if (options.projectId.contains('demo') || options.projectId.contains('test')) {
      warnings.add('Demo/test project ID detected - ensure production configuration');
    }
    
    return warnings;
  }
}