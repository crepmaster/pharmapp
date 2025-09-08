import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../services/auth_service.dart';
import '../models/pharmacy_user.dart';
import '../models/location_data.dart';
import 'package:pharmapp_shared/models/payment_preferences.dart';

// Events
abstract class AuthEvent extends Equatable {
  const AuthEvent();

  @override
  List<Object?> get props => [];
}

class AuthStarted extends AuthEvent {}

class AuthSignInRequested extends AuthEvent {
  final String email;
  final String password;

  const AuthSignInRequested({
    required this.email,
    required this.password,
  });

  @override
  List<Object?> get props => [email, password];
}

class AuthSignUpRequested extends AuthEvent {
  final String email;
  final String password;
  final String pharmacyName;
  final String phoneNumber;
  final String address;
  final PharmacyLocationData? locationData;

  const AuthSignUpRequested({
    required this.email,
    required this.password,
    required this.pharmacyName,
    required this.phoneNumber,
    required this.address,
    this.locationData,
  });

  @override
  List<Object?> get props => [email, password, pharmacyName, phoneNumber, address, locationData];
}

class AuthSignUpWithPaymentPreferences extends AuthEvent {
  final String email;
  final String password;
  final String pharmacyName;
  final String phoneNumber;
  final String address;
  final PharmacyLocationData? locationData;
  final PaymentPreferences paymentPreferences;

  const AuthSignUpWithPaymentPreferences({
    required this.email,
    required this.password,
    required this.pharmacyName,
    required this.phoneNumber,
    required this.address,
    this.locationData,
    required this.paymentPreferences,
  });

  @override
  List<Object?> get props => [email, password, pharmacyName, phoneNumber, address, locationData, paymentPreferences];
}

class AuthSignOutRequested extends AuthEvent {}

class AuthPasswordResetRequested extends AuthEvent {
  final String email;

  const AuthPasswordResetRequested({required this.email});

  @override
  List<Object> get props => [email];
}

// States
abstract class AuthState extends Equatable {
  const AuthState();

  @override
  List<Object?> get props => [];
}

class AuthInitial extends AuthState {}

class AuthLoading extends AuthState {}

class AuthAuthenticated extends AuthState {
  final PharmacyUser user;

  const AuthAuthenticated({required this.user});

  @override
  List<Object> get props => [user];
}

class AuthUnauthenticated extends AuthState {}

class AuthError extends AuthState {
  final String message;

  const AuthError({required this.message});

  @override
  List<Object> get props => [message];
}

class AuthPasswordResetSent extends AuthState {}

// BLoC
class AuthBloc extends Bloc<AuthEvent, AuthState> {
  AuthBloc() : super(AuthInitial()) {
    on<AuthStarted>(_onAuthStarted);
    on<AuthSignInRequested>(_onSignInRequested);
    on<AuthSignUpRequested>(_onSignUpRequested);
    on<AuthSignUpWithPaymentPreferences>(_onSignUpWithPaymentPreferences);
    on<AuthSignOutRequested>(_onSignOutRequested);
    on<AuthPasswordResetRequested>(_onPasswordResetRequested);
  }

  Future<void> _onAuthStarted(AuthStarted event, Emitter<AuthState> emit) async {
    emit(AuthLoading());

    try {
      final user = AuthService.currentUser;
      if (user != null) {
        final pharmacyData = await AuthService.getPharmacyData();
        if (pharmacyData != null) {
          final pharmacyUser = PharmacyUser.fromMap(pharmacyData, user.uid);
          emit(AuthAuthenticated(user: pharmacyUser));
        } else {
          emit(AuthUnauthenticated());
        }
      } else {
        emit(AuthUnauthenticated());
      }
    } catch (e) {
      emit(AuthError(message: e.toString()));
    }
  }

  Future<void> _onSignInRequested(
    AuthSignInRequested event,
    Emitter<AuthState> emit,
  ) async {
    // Login process started
    emit(AuthLoading());

    try {
      // Calling Firebase authentication
      final result = await AuthService.signIn(
        email: event.email,
        password: event.password,
      );
      // Firebase sign-in completed

      // Fetching user profile data
      final pharmacyData = await AuthService.getPharmacyData();
      // Profile data retrieved
      
      if (pharmacyData != null) {
        final pharmacyUser = PharmacyUser.fromMap(
          pharmacyData,
          AuthService.currentUser!.uid,
        );
        // Login successful
        emit(AuthAuthenticated(user: pharmacyUser));
      } else {
        // Profile not found - user needs to register properly through unified system
        emit(const AuthError(message: 'Pharmacy profile not found. Please register again.'));
      }
    } catch (e) {
      // Debug statement removed for production security
      emit(AuthError(message: e.toString()));
    }
  }

  Future<void> _onSignUpRequested(
    AuthSignUpRequested event,
    Emitter<AuthState> emit,
  ) async {
    // Debug statement removed for production security
    emit(AuthLoading());

    try {
      // Debug statement removed for production security
      await AuthService.signUp(
        email: event.email,
        password: event.password,
        pharmacyName: event.pharmacyName,
        phoneNumber: event.phoneNumber,
        address: event.address,
        locationData: event.locationData,
      );
      // Debug statement removed for production security

      // Get pharmacy data with retry mechanism to handle Firestore consistency
      final pharmacyData = await AuthService.getPharmacyData(maxRetries: 5);
      
      if (pharmacyData != null) {
        final pharmacyUser = PharmacyUser.fromMap(
          pharmacyData,
          AuthService.currentUser!.uid,
        );
        emit(AuthAuthenticated(user: pharmacyUser));
      } else {
        // If profile still not found after retries, this indicates a backend issue
        emit(const AuthError(message: 'Registration successful but unable to retrieve profile. Please try signing in.'));
      }
    } catch (e) {
      // Debug statement removed for production security
      emit(AuthError(message: e.toString()));
    }
  }

  Future<void> _onSignUpWithPaymentPreferences(
    AuthSignUpWithPaymentPreferences event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());

    try {
      await AuthService.signUpWithPaymentPreferences(
        email: event.email,
        password: event.password,
        pharmacyName: event.pharmacyName,
        phoneNumber: event.phoneNumber,
        address: event.address,
        locationData: event.locationData,
        paymentPreferences: event.paymentPreferences,
      );

      // Get pharmacy data with retry mechanism to handle Firestore consistency
      final pharmacyData = await AuthService.getPharmacyData(maxRetries: 5);
      
      if (pharmacyData != null) {
        final pharmacyUser = PharmacyUser.fromMap(
          pharmacyData,
          AuthService.currentUser!.uid,
        );
        emit(AuthAuthenticated(user: pharmacyUser));
      } else {
        // If profile still not found after retries, this indicates a backend issue
        emit(const AuthError(message: 'Registration successful but unable to retrieve profile. Please try signing in.'));
      }
    } catch (e) {
      emit(AuthError(message: e.toString()));
    }
  }

  Future<void> _onSignOutRequested(
    AuthSignOutRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());
    await AuthService.signOut();
    emit(AuthUnauthenticated());
  }

  Future<void> _onPasswordResetRequested(
    AuthPasswordResetRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());

    try {
      await AuthService.resetPassword(event.email);
      emit(AuthPasswordResetSent());
    } catch (e) {
      emit(AuthError(message: e.toString()));
    }
  }
}