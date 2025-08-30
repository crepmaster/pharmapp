import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../services/auth_service.dart';
import '../models/pharmacy_user.dart';

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
  final String pharmacyName;
  final String phoneNumber;
  final String address;

  const AuthSignUpRequested({
    required this.email,
    required this.password,
    required this.pharmacyName,
    required this.phoneNumber,
    required this.address,
  });

  @override
  List<Object> get props => [email, password, pharmacyName, phoneNumber, address];
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
    emit(AuthLoading());

    try {
      await AuthService.signIn(
        email: event.email,
        password: event.password,
      );

      final pharmacyData = await AuthService.getPharmacyData();
      if (pharmacyData != null) {
        final pharmacyUser = PharmacyUser.fromMap(
          pharmacyData,
          AuthService.currentUser!.uid,
        );
        emit(AuthAuthenticated(user: pharmacyUser));
      } else {
        emit(const AuthError(message: 'Pharmacy profile not found'));
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
        pharmacyName: event.pharmacyName,
        phoneNumber: event.phoneNumber,
        address: event.address,
      );

      final pharmacyData = await AuthService.getPharmacyData();
      if (pharmacyData != null) {
        final pharmacyUser = PharmacyUser.fromMap(
          pharmacyData,
          AuthService.currentUser!.uid,
        );
        emit(AuthAuthenticated(user: pharmacyUser));
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