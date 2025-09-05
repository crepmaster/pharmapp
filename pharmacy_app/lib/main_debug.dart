import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'firebase_options.dart';
import 'blocs/auth_bloc.dart';
import 'screens/auth/login_screen.dart';
import 'screens/main/dashboard_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    // Debug statement removed for production security
  } catch (e) {
    // Debug statement removed for production security
  }
  
  runApp(const PharmacyApp());
}

class PharmacyApp extends StatelessWidget {
  const PharmacyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) {
        // Debug statement removed for production security
        final bloc = AuthBloc();
        bloc.add(AuthStarted());
        return bloc;
      },
      child: MaterialApp(
        title: 'Pharmacy Exchange Debug',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF1976D2),
          ),
          useMaterial3: true,
        ),
        home: const AuthWrapper(),
        debugShowCheckedModeBanner: false,
      ),
    );
  }
}

class AuthWrapper extends StatelessWidget {
  const AuthWrapper({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocListener<AuthBloc, AuthState>(
      listener: (context, state) {
        // Debug statement removed for production security
        if (state is AuthError) {
          // Debug statement removed for production security
        }
      },
      child: BlocBuilder<AuthBloc, AuthState>(
        builder: (context, state) {
          // Debug statement removed for production security
          
          if (state is AuthLoading) {
            return const Scaffold(
              body: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.local_pharmacy,
                      size: 80,
                      color: Color(0xFF1976D2),
                    ),
                    SizedBox(height: 20),
                    CircularProgressIndicator(
                      color: Color(0xFF1976D2),
                    ),
                    SizedBox(height: 16),
                    Text(
                      'Loading Pharmacy Exchange...',
                      style: TextStyle(
                        fontSize: 16,
                        color: Color(0xFF1976D2),
                      ),
                    ),
                  ],
                ),
              ),
            );
          } else if (state is AuthAuthenticated) {
            // Debug statement removed for production security
            return const DashboardScreen();
          } else if (state is AuthError) {
            return Scaffold(
              body: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(
                      Icons.error,
                      size: 80,
                      color: Colors.red,
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Auth Error: ${state.message}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.red),
                    ),
                    const SizedBox(height: 20),
                    ElevatedButton(
                      onPressed: () {
                        context.read<AuthBloc>().add(AuthStarted());
                      },
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            );
          } else {
            // Debug statement removed for production security
            return const LoginScreen();
          }
        },
      ),
    );
  }
}