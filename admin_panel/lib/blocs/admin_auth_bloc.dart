import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../models/admin_user.dart';
import '../services/admin_auth_service.dart';

// Events
abstract class AdminAuthEvent extends Equatable {
  const AdminAuthEvent();

  @override
  List<Object?> get props => [];
}

class AdminAuthStarted extends AdminAuthEvent {}

class AdminAuthLoginRequested extends AdminAuthEvent {
  final String email;
  final String password;

  const AdminAuthLoginRequested({
    required this.email,
    required this.password,
  });

  @override
  List<Object?> get props => [email, password];
}

class AdminAuthLogoutRequested extends AdminAuthEvent {}

class AdminAuthUserChanged extends AdminAuthEvent {
  final User? user;

  const AdminAuthUserChanged({required this.user});

  @override
  List<Object?> get props => [user];
}

// States
abstract class AdminAuthState extends Equatable {
  const AdminAuthState();

  @override
  List<Object?> get props => [];
}

class AdminAuthInitial extends AdminAuthState {}

class AdminAuthLoading extends AdminAuthState {}

class AdminAuthAuthenticated extends AdminAuthState {
  final AdminUser adminUser;

  const AdminAuthAuthenticated({required this.adminUser});

  @override
  List<Object?> get props => [adminUser];
}

class AdminAuthUnauthenticated extends AdminAuthState {}

class AdminAuthError extends AdminAuthState {
  final String message;

  const AdminAuthError({required this.message});

  @override
  List<Object?> get props => [message];
}

// BLoC
class AdminAuthBloc extends Bloc<AdminAuthEvent, AdminAuthState> {
  final AdminAuthService _authService = AdminAuthService();

  AdminAuthBloc() : super(AdminAuthInitial()) {
    on<AdminAuthStarted>(_onStarted);
    on<AdminAuthLoginRequested>(_onLoginRequested);
    on<AdminAuthLogoutRequested>(_onLogoutRequested);
    on<AdminAuthUserChanged>(_onUserChanged);

    // Listen to auth state changes
    _authService.authStateChanges.listen((user) {
      add(AdminAuthUserChanged(user: user));
    });
  }

  Future<void> _onStarted(
    AdminAuthStarted event,
    Emitter<AdminAuthState> emit,
  ) async {
    emit(AdminAuthLoading());
    
    try {
      final currentUser = _authService.currentUser;
      if (currentUser != null) {
        // Check if user is an admin
        final isAdmin = await _authService.isAuthenticatedAdmin();
        if (isAdmin) {
          final adminUser = await _authService.getAdminUser(currentUser.uid);
          if (adminUser != null) {
            emit(AdminAuthAuthenticated(adminUser: adminUser));
            return;
          }
        }
      }
      
      emit(AdminAuthUnauthenticated());
    } catch (e) {
      emit(AdminAuthError(message: 'Failed to initialize auth: ${e.toString()}'));
    }
  }

  Future<void> _onLoginRequested(
    AdminAuthLoginRequested event,
    Emitter<AdminAuthState> emit,
  ) async {
    print('🎯 BLoC: Login requested for ${event.email}');
    emit(AdminAuthLoading());
    print('🎯 BLoC: Loading state emitted');

    try {
      print('🎯 BLoC: Calling auth service...');
      final adminUser = await _authService.signInWithEmailAndPassword(
        email: event.email,
        password: event.password,
      );
      print('🎯 BLoC: Auth service returned: ${adminUser?.email ?? 'null'}');

      if (adminUser != null) {
        print('🎯 BLoC: Emitting authenticated state');
        emit(AdminAuthAuthenticated(adminUser: adminUser));
      } else {
        print('🎯 BLoC: Emitting error - null admin user');
        emit(const AdminAuthError(message: 'Failed to authenticate admin'));
      }
    } catch (e) {
      print('🎯 BLoC: Caught exception: $e');
      emit(AdminAuthError(message: e.toString()));
    }
  }

  Future<void> _onLogoutRequested(
    AdminAuthLogoutRequested event,
    Emitter<AdminAuthState> emit,
  ) async {
    emit(AdminAuthLoading());

    try {
      await _authService.signOut();
      emit(AdminAuthUnauthenticated());
    } catch (e) {
      emit(AdminAuthError(message: 'Failed to sign out: ${e.toString()}'));
    }
  }

  Future<void> _onUserChanged(
    AdminAuthUserChanged event,
    Emitter<AdminAuthState> emit,
  ) async {
    if (event.user == null) {
      emit(AdminAuthUnauthenticated());
    } else {
      try {
        // Verify admin status
        final isAdmin = await _authService.isAuthenticatedAdmin();
        if (isAdmin) {
          final adminUser = await _authService.getAdminUser(event.user!.uid);
          if (adminUser != null) {
            emit(AdminAuthAuthenticated(adminUser: adminUser));
            return;
          }
        }
        
        // Not an admin or inactive
        await _authService.signOut();
        emit(AdminAuthUnauthenticated());
      } catch (e) {
        emit(AdminAuthError(message: 'Authentication error: ${e.toString()}'));
      }
    }
  }
}