import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../services/pharmacy_auth_adapter.dart';
import '../models/pharmacy_user.dart';
import '../models/location_data.dart';

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
    on<AuthSignOutRequested>(_onSignOutRequested);
    on<AuthPasswordResetRequested>(_onPasswordResetRequested);
  }

  Future<void> _onAuthStarted(AuthStarted event, Emitter<AuthState> emit) async {
    emit(AuthLoading());

    try {
      final user = PharmacyAuthAdapter.currentUser;
      if (user != null) {
        final pharmacyData = await PharmacyAuthAdapter.getPharmacyData();
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
      final result = await PharmacyAuthAdapter.signIn(
        email: event.email,
        password: event.password,
      );
      // Firebase sign-in completed

      // Fetching user profile data
      final pharmacyData = await PharmacyAuthAdapter.getPharmacyData();
      // Profile data retrieved
      
      if (pharmacyData != null) {
        final pharmacyUser = PharmacyUser.fromMap(
          pharmacyData,
          PharmacyAuthAdapter.currentUser!.uid,
        );
        // Login successful
        emit(AuthAuthenticated(user: pharmacyUser));
      } else {
        // Debug statement removed for production security
        // Create a basic pharmacy profile for existing Firebase users
        try {
          await PharmacyAuthAdapter.createPharmacyProfile(
            pharmacyName: 'Pharmacy Profile (Update Required)',
            phoneNumber: 'Please update',
            address: 'Please update your address',
          );
          
          // Try to get the newly created profile
          final newPharmacyData = await PharmacyAuthAdapter.getPharmacyData();
          if (newPharmacyData != null) {
            final pharmacyUser = PharmacyUser.fromMap(
              newPharmacyData,
              PharmacyAuthAdapter.currentUser!.uid,
            );
            // Debug statement removed for production security
            emit(AuthAuthenticated(user: pharmacyUser));
          } else {
            emit(const AuthError(message: 'Failed to create pharmacy profile'));
          }
        } catch (e) {
          // Debug statement removed for production security
          emit(const AuthError(message: 'Unable to access pharmacy profile. Please contact support.'));
        }
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
      await PharmacyAuthAdapter.signUp(
        email: event.email,
        password: event.password,
        pharmacyName: event.pharmacyName,
        phoneNumber: event.phoneNumber,
        address: event.address,
        locationData: event.locationData,
      );
      // Debug statement removed for production security

      // Debug statement removed for production security
      final pharmacyData = await PharmacyAuthAdapter.getPharmacyData();
      // Debug statement removed for production security
      
      if (pharmacyData != null) {
        final pharmacyUser = PharmacyUser.fromMap(
          pharmacyData,
          PharmacyAuthAdapter.currentUser!.uid,
        );
        // Debug statement removed for production security
        emit(AuthAuthenticated(user: pharmacyUser));
      } else {
        // Debug statement removed for production security
        emit(const AuthError(message: 'Registration completed but profile not found'));
      }
    } catch (e) {
      // Debug statement removed for production security
      emit(AuthError(message: e.toString()));
    }
  }

  Future<void> _onSignOutRequested(
    AuthSignOutRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());
    await PharmacyAuthAdapter.signOut();
    emit(AuthUnauthenticated());
  }

  Future<void> _onPasswordResetRequested(
    AuthPasswordResetRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());

    try {
      await PharmacyAuthAdapter.resetPassword(event.email);
      emit(AuthPasswordResetSent());
    } catch (e) {
      emit(AuthError(message: e.toString()));
    }
  }
}