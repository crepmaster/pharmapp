import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:google_fonts/google_fonts.dart';
import 'firebase_options.dart';
import 'blocs/admin_auth_bloc.dart';
import 'screens/admin_login_screen.dart';
import 'screens/admin_dashboard_screen.dart';

// Sprint 5 phase 1 — emulator wiring gated by --dart-define flags. Same
// pattern as `pharmapp_unified/lib/main.dart` (commit 4d6c91d). Build
// prod never sees `useEmulator=true`, so admin_panel prod never resolves
// to localhost. To run admin_panel against the local Firebase Emulator
// Suite (S3 admin verify scenario) :
//
//   cd admin_panel
//   flutter run -d chrome --web-port=8087 \
//     --dart-define=USE_EMULATOR=true \
//     --dart-define=FIREBASE_PROJECT_ID=demo-pharmapp
//
// `firebase_options.dart` hardcodes the prod `projectId` ('mediexchange').
// We override it via synthetic FirebaseOptions when `USE_EMULATOR=true`
// so admin_panel sees the same emulator namespace as pharmapp_unified
// and the seed scripts.
const _useEmulator = bool.fromEnvironment('USE_EMULATOR');
const _emulatorProjectId =
    String.fromEnvironment('FIREBASE_PROJECT_ID', defaultValue: 'demo-pharmapp');
const _emulatorHost =
    String.fromEnvironment('EMULATOR_HOST', defaultValue: 'localhost');

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(
    options: _useEmulator
        ? const FirebaseOptions(
            apiKey: 'demo-api-key',
            appId: '1:123:web:demo',
            messagingSenderId: '123',
            projectId: _emulatorProjectId,
            authDomain: 'localhost',
          )
        : DefaultFirebaseOptions.currentPlatform,
  );

  if (_useEmulator) {
    await FirebaseAuth.instance.useAuthEmulator(_emulatorHost, 9099);
    FirebaseFirestore.instance.useFirestoreEmulator(_emulatorHost, 8080);
    FirebaseFunctions.instanceFor(region: 'europe-west1')
        .useFunctionsEmulator(_emulatorHost, 5001);
  }

  runApp(const AdminPanelApp());
}

class AdminPanelApp extends StatelessWidget {
  const AdminPanelApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NoWasteMed Admin Panel',
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
        inputDecorationTheme: InputDecorationTheme(
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          filled: true,
          fillColor: Colors.grey.shade50,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            padding: const EdgeInsets.symmetric(
              horizontal: 24,
              vertical: 16,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      ),
      home: BlocProvider(
        create: (context) => AdminAuthBloc()..add(AdminAuthStarted()),
        child: const AdminAuthWrapper(),
      ),
    );
  }
}

class AdminAuthWrapper extends StatelessWidget {
  const AdminAuthWrapper({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AdminAuthBloc, AdminAuthState>(
      builder: (context, state) {
        if (state is AdminAuthInitial || state is AdminAuthLoading) {
          return const Scaffold(
            body: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Initializing admin panel...'),
                ],
              ),
            ),
          );
        }

        if (state is AdminAuthAuthenticated) {
          return const AdminDashboardScreen();
        }

        return const AdminLoginScreen();
      },
    );
  }
}
