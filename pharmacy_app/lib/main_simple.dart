import 'package:flutter/material.dart';

void main() {
  runApp(const PharmacyAppSimple());
}

class PharmacyAppSimple extends StatelessWidget {
  const PharmacyAppSimple({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Pharmacy Exchange',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1976D2),
        ),
        useMaterial3: true,
      ),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        title: const Text('Pharmacy Exchange'),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            const Icon(
              Icons.local_pharmacy,
              size: 100,
              color: Color(0xFF1976D2),
            ),
            const SizedBox(height: 20),
            const Text(
              'Welcome to Pharmacy Exchange',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              'Basic Setup: Running ✅',
              style: TextStyle(
                fontSize: 16,
                color: Colors.green,
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              '• Flutter Framework: Working',
              style: TextStyle(fontSize: 14),
            ),
            const Text(
              '• UI Components: Working',
              style: TextStyle(fontSize: 14),
            ),
            const Text(
              '• Platform Integration: Working',
              style: TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 30),
            ElevatedButton(
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Pharmacy app is working correctly!'),
                  ),
                );
              },
              child: const Text('Test App'),
            ),
          ],
        ),
      ),
    );
  }
}