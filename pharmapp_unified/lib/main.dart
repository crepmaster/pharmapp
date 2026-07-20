import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:pharmapp_shared/config/build_flags.dart';
import 'firebase_options.dart';
import 'navigation/role_router.dart';
import 'blocs/unified_auth_bloc.dart';
import 'screens/landing/app_selection_screen.dart';

// Sprint 5 phase 1 — emulator wiring gated by --dart-define flags. The
// production build never sees `useEmulator=true`, so the prod app never
// resolves localhost. To run against the local Firebase Emulator Suite :
//
//   flutter run -d chrome --web-port=8086 \
//     --dart-define=USE_EMULATOR=true \
//     --dart-define=FIREBASE_PROJECT_ID=demo-pharmapp
//
// `firebase_options.dart` hardcodes the prod `projectId` ('mediexchange'),
// so we MUST override `projectId` in `FirebaseOptions` when using the
// emulator — otherwise the seed (which writes to `demo-pharmapp`) and the
// app (which would read from `mediexchange`) would look at different
// emulator namespaces.
// `kUseEmulator` / `kUseStaging` come from `pharmapp_shared/config/build_flags.dart`
// (single source of truth). The `_emulator*` / `_staging*` formatters below
// stay local to this file because they are Firebase-options-specific.
const _emulatorProjectId =
    String.fromEnvironment('FIREBASE_PROJECT_ID', defaultValue: 'demo-pharmapp');
const _emulatorHost =
    String.fromEnvironment('EMULATOR_HOST', defaultValue: 'localhost');

// Sprint 5 phase 2 — staging wiring. A `USE_STAGING=true` build initialises
// Firebase against the real staging project (mediexchange-staging) instead of
// prod. The staging config is passed via `--dart-define` (NOT committed — keys
// stay out of source per CLAUDE.md "Testing phase"). Prod build sees neither
// flag → DefaultFirebaseOptions (mediexchange). Build example:
//
//   flutter build web \
//     --dart-define=USE_STAGING=true \
//     --dart-define=STAGING_API_KEY=... \
//     --dart-define=STAGING_APP_ID=... \
//     --dart-define=STAGING_SENDER_ID=... \
//     --dart-define=STAGING_PROJECT_ID=mediexchange-staging
const _stagingApiKey = String.fromEnvironment('STAGING_API_KEY');
const _stagingAppId = String.fromEnvironment('STAGING_APP_ID');
const _stagingSenderId = String.fromEnvironment('STAGING_SENDER_ID');
const _stagingProjectId =
    String.fromEnvironment('STAGING_PROJECT_ID', defaultValue: 'mediexchange-staging');

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(
    options: kUseEmulator
        ? const FirebaseOptions(
            apiKey: 'demo-api-key',
            appId: '1:123:web:demo',
            messagingSenderId: '123',
            projectId: _emulatorProjectId,
            authDomain: 'localhost',
          )
        : kUseStaging
            ? const FirebaseOptions(
                apiKey: _stagingApiKey,
                appId: _stagingAppId,
                messagingSenderId: _stagingSenderId,
                projectId: _stagingProjectId,
                authDomain: '$_stagingProjectId.firebaseapp.com',
              )
            : DefaultFirebaseOptions.currentPlatform,
  );

  if (kUseEmulator) {
    await FirebaseAuth.instance.useAuthEmulator(_emulatorHost, 9099);
    FirebaseFirestore.instance.useFirestoreEmulator(_emulatorHost, 8080);
    FirebaseFunctions.instanceFor(region: 'europe-west1')
        .useFunctionsEmulator(_emulatorHost, 5001);
  }

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
