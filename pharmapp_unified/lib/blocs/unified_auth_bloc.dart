import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:pharmapp_shared/services/unified_auth_service.dart';
import 'package:pharmapp_shared/models/unified_user.dart';

// Events
abstract class UnifiedAuthEvent extends Equatable {
  @override
  List<Object?> get props => [];
}

class CheckAuthStatus extends UnifiedAuthEvent {}

class SignInRequested extends UnifiedAuthEvent {
  final String email;
  final String password;

  SignInRequested({required this.email, required this.password});

  @override
  List<Object?> get props => [email, password];
}

class SignOutRequested extends UnifiedAuthEvent {}

class SwitchRole extends UnifiedAuthEvent {
  final UserType newRole;

  SwitchRole(this.newRole);

  @override
  List<Object?> get props => [newRole];
}

class PasswordResetRequested extends UnifiedAuthEvent {
  final String email;

  PasswordResetRequested({required this.email});

  @override
  List<Object?> get props => [email];
}

// States
abstract class UnifiedAuthState extends Equatable {
  @override
  List<Object?> get props => [];
}

class AuthInitial extends UnifiedAuthState {}

class AuthLoading extends UnifiedAuthState {}

class Authenticated extends UnifiedAuthState {
  final User user;
  final UserType userType;
  final Map<String, dynamic> userData;
  final List<UserType> availableRoles;

  Authenticated({
    required this.user,
    required this.userType,
    required this.userData,
    this.availableRoles = const [],
  });

  @override
  List<Object?> get props => [user, userType, userData, availableRoles];
}

class Unauthenticated extends UnifiedAuthState {
  final String? message;

  Unauthenticated({this.message});

  @override
  List<Object?> get props => [message];
}

class AuthError extends UnifiedAuthState {
  final String error;

  AuthError(this.error);

  @override
  List<Object?> get props => [error];
}

class PasswordResetSent extends UnifiedAuthState {}

// BLoC
class UnifiedAuthBloc extends Bloc<UnifiedAuthEvent, UnifiedAuthState> {
  UnifiedAuthBloc() : super(AuthInitial()) {
    on<CheckAuthStatus>(_onCheckAuthStatus);
    on<SignInRequested>(_onSignInRequested);
    on<SignOutRequested>(_onSignOutRequested);
    on<SwitchRole>(_onSwitchRole);
    on<PasswordResetRequested>(_onPasswordResetRequested);
  }

  Future<void> _onCheckAuthStatus(
    CheckAuthStatus event,
    Emitter<UnifiedAuthState> emit,
  ) async {
    emit(AuthLoading());

    try {
      final user = UnifiedAuthService.currentUser;

      if (user == null) {
        emit(Unauthenticated());
        return;
      }

      // Detect user type and load profile
      final userProfile = await UnifiedAuthService.getUserProfile(user.uid);

      if (userProfile == null) {
        emit(Unauthenticated(message: 'User profile not found'));
        return;
      }

      // Check for multiple roles (e.g., user is both pharmacy owner and courier)
      final availableRoles = await UnifiedAuthService.getAvailableRoles(user.uid);

      emit(Authenticated(
        user: user,
        userType: _convertRoleToUserType(userProfile.user.role),
        userData: userProfile.roleData,
        availableRoles: availableRoles,
      ));
    } catch (e) {
      emit(AuthError('Failed to check auth status: ${e.toString()}'));
    }
  }

  Future<void> _onSignInRequested(
    SignInRequested event,
    Emitter<UnifiedAuthState> emit,
  ) async {
    emit(AuthLoading());

    try {
      final userProfile = await UnifiedAuthService.signIn(
        email: event.email,
        password: event.password,
      );

      if (userProfile == null) {
        emit(AuthError('Sign in failed'));
        return;
      }

      // Check for multiple roles
      final availableRoles = await UnifiedAuthService.getAvailableRoles(userProfile.user.uid);

      emit(Authenticated(
        user: UnifiedAuthService.currentUser!,
        userType: _convertRoleToUserType(userProfile.user.role),
        userData: userProfile.roleData,
        availableRoles: availableRoles,
      ));
    } on FirebaseAuthException catch (e) {
      emit(AuthError(_getFirebaseErrorMessage(e)));
    } catch (e) {
      emit(AuthError('Sign in failed: ${e.toString()}'));
    }
  }

  Future<void> _onSignOutRequested(
    SignOutRequested event,
    Emitter<UnifiedAuthState> emit,
  ) async {
    emit(AuthLoading());

    try {
      await UnifiedAuthService.signOut();
      emit(Unauthenticated(message: 'Signed out successfully'));
    } catch (e) {
      emit(AuthError('Sign out failed: ${e.toString()}'));
    }
  }

  Future<void> _onSwitchRole(
    SwitchRole event,
    Emitter<UnifiedAuthState> emit,
  ) async {
    if (state is! Authenticated) return;

    final currentState = state as Authenticated;

    if (!currentState.availableRoles.contains(event.newRole)) {
      emit(AuthError('You do not have access to this role'));
      return;
    }

    emit(AuthLoading());

    try {
      // Load profile for the new role
      final userProfile = await UnifiedAuthService.getUserProfileByType(
        currentState.user.uid,
        event.newRole,
      );

      if (userProfile == null) {
        emit(AuthError('Failed to switch role'));
        return;
      }

      emit(Authenticated(
        user: currentState.user,
        userType: event.newRole,
        userData: userProfile.roleData,
        availableRoles: currentState.availableRoles,
      ));
    } catch (e) {
      emit(AuthError('Role switch failed: ${e.toString()}'));
    }
  }

  Future<void> _onPasswordResetRequested(
    PasswordResetRequested event,
    Emitter<UnifiedAuthState> emit,
  ) async {
    emit(AuthLoading());

    try {
      await UnifiedAuthService.resetPassword(event.email);
      emit(PasswordResetSent());
    } catch (e) {
      emit(AuthError('Password reset failed: ${e.toString()}'));
    }
  }

  /// Convert UserRole (from model) to UserType (for auth)
  UserType _convertRoleToUserType(UserRole role) {
    switch (role) {
      case UserRole.pharmacy:
        return UserType.pharmacy;
      case UserRole.courier:
        return UserType.courier;
      case UserRole.admin:
        return UserType.admin;
      case UserRole.user:
        return UserType.pharmacy; // Default fallback
    }
  }

  String _getFirebaseErrorMessage(FirebaseAuthException e) {
    switch (e.code) {
      case 'user-not-found':
        return 'No user found with this email';
      case 'wrong-password':
        return 'Incorrect password';
      case 'invalid-email':
        return 'Invalid email address';
      case 'user-disabled':
        return 'This account has been disabled';
      case 'too-many-requests':
        return 'Too many failed attempts. Please try again later';
      default:
        return 'Authentication failed: ${e.message}';
    }
  }
}
