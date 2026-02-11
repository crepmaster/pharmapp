import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:pharmapp_unified/blocs/unified_auth_bloc.dart';
import 'firebase_options.dart';
import 'screens/auth/login_screen.dart';
import 'screens/main/dashboard_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const CourierApp());
}

class CourierApp extends StatelessWidget {
  const CourierApp({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => UnifiedAuthBloc()..add(CheckAuthStatus()),
      child: MaterialApp(
        title: 'Courier Delivery',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF4CAF50), // Green for courier app
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
    return BlocBuilder<UnifiedAuthBloc, UnifiedAuthState>(
      builder: (context, state) {
        if (state is AuthLoading) {
          return const Scaffold(
            body: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.delivery_dining,
                    size: 80,
                    color: Color(0xFF4CAF50),
                  ),
                  SizedBox(height: 20),
                  CircularProgressIndicator(
                    color: Color(0xFF4CAF50),
                  ),
                  SizedBox(height: 16),
                  Text(
                    'Loading Courier App...',
                    style: TextStyle(
                      fontSize: 16,
                      color: Color(0xFF4CAF50),
                    ),
                  ),
                ],
              ),
            ),
          );
        } else if (state is Authenticated) {
          return const DashboardScreen();
        } else {
          return const LoginScreen();
        }
      },
    );
  }
}