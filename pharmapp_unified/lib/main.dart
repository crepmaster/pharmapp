import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:google_fonts/google_fonts.dart';
import 'firebase_options.dart';
import 'navigation/role_router.dart';
import 'blocs/unified_auth_bloc.dart';
import 'screens/landing/app_selection_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  runApp(const PharmAppUnified());
}

class PharmAppUnified extends StatelessWidget {
  const PharmAppUnified({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider(
          create: (context) => UnifiedAuthBloc()..add(CheckAuthStatus()),
        ),
        // DeliveryBloc removed from global providers - now only created for courier users
        // This prevents pharmacy/admin users from triggering courier-specific Firestore queries
      ],
      child: MaterialApp(
        title: 'PharmApp - Medicine Exchange Platform',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: Colors.blue,
            brightness: Brightness.light,
          ),
          textTheme: GoogleFonts.interTextTheme(),
          useMaterial3: true,
          appBarTheme: AppBarTheme(
            backgroundColor: Colors.white,
            foregroundColor: Colors.grey.shade800,
            elevation: 0,
            titleTextStyle: GoogleFonts.inter(
              fontSize: 20,
              fontWeight: FontWeight.w600,
              color: Colors.grey.shade800,
            ),
          ),
          cardTheme: CardThemeData(
            elevation: 2,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          elevatedButtonTheme: ElevatedButtonThemeData(
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
        ),
        home: BlocBuilder<UnifiedAuthBloc, UnifiedAuthState>(
          builder: (context, state) {
            if (state is AuthLoading) {
              return const Scaffold(
                body: Center(
                  child: CircularProgressIndicator(),
                ),
              );
            }

            if (state is Authenticated) {
              // Auto-route to appropriate dashboard based on user role
              return RoleRouter(
                userType: state.userType,
                userData: state.userData,
              );
            }

            // Show app selection landing page (choose pharmacy or courier)
            return const AppSelectionScreen();
          },
        ),
      ),
    );
  }
}
