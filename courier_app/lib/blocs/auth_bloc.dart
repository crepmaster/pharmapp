import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../services/auth_service.dart';
import '../models/courier_user.dart';
import 'package:pharmapp_shared/models/payment_preferences.dart';

// Events
abstract class AuthEvent extends Equatable {
  const AuthEvent();

  @override
  List<Object> get props => [];
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
  List<Object> get props => [email, password];
}

class AuthSignUpRequested extends AuthEvent {
  final String email;
  final String password;
  final String fullName;
  final String phoneNumber;
  final String vehicleType;
  final String licensePlate;

  const AuthSignUpRequested({
    required this.email,
    required this.password,
    required this.fullName,
    required this.phoneNumber,
    required this.vehicleType,
    required this.licensePlate,
  });

  @override
  List<Object> get props => [email, password, fullName, phoneNumber, vehicleType, licensePlate];
}

class AuthSignUpWithPaymentPreferences extends AuthEvent {
  final String email;
  final String password;
  final String fullName;
  final String phoneNumber;
  final String vehicleType;
  final String licensePlate;
  final String? city;
  final PaymentPreferences paymentPreferences;

  const AuthSignUpWithPaymentPreferences({
    required this.email,
    required this.password,
    required this.fullName,
    required this.phoneNumber,
    required this.vehicleType,
    required this.licensePlate,
    this.city,
    required this.paymentPreferences,
  });

  @override
  List<Object> get props => [
        email,
        password,
        fullName,
        phoneNumber,
        vehicleType,
        licensePlate,
        if (city != null) city!,
        paymentPreferences,
      ];
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
  final CourierUser user;

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
        final courierData = await AuthService.getCourierData();
        if (courierData != null) {
          final courierUser = CourierUser.fromMap(courierData, user.uid);
          emit(AuthAuthenticated(user: courierUser));
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
    emit(AuthLoading());

    try {
      await AuthService.signIn(
        email: event.email,
        password: event.password,
      );

      final courierData = await AuthService.getCourierData();
      if (courierData != null) {
        final courierUser = CourierUser.fromMap(
          courierData,
          AuthService.currentUser!.uid,
        );
        emit(AuthAuthenticated(user: courierUser));
      } else {
        emit(const AuthError(message: 'Courier profile not found'));
      }
    } catch (e) {
      emit(AuthError(message: e.toString()));
    }
  }

  Future<void> _onSignUpRequested(
    AuthSignUpRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());

    try {
      await AuthService.signUp(
        email: event.email,
        password: event.password,
        fullName: event.fullName,
        phoneNumber: event.phoneNumber,
        vehicleType: event.vehicleType,
        licensePlate: event.licensePlate,
      );

      final courierData = await AuthService.getCourierData();
      if (courierData != null) {
        final courierUser = CourierUser.fromMap(
          courierData,
          AuthService.currentUser!.uid,
        );
        emit(AuthAuthenticated(user: courierUser));
      }
    } catch (e) {
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
        fullName: event.fullName,
        phoneNumber: event.phoneNumber,
        vehicleType: event.vehicleType,
        licensePlate: event.licensePlate,
        paymentPreferences: event.paymentPreferences,
        operatingCity: event.city ?? '',
      );

      final courierData = await AuthService.getCourierData();
      if (courierData != null) {
        final courierUser = CourierUser.fromMap(
          courierData,
          AuthService.currentUser!.uid,
        );
        emit(AuthAuthenticated(user: courierUser));
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