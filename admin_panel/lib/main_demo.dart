import 'package:flutter/material.dart';

void main() {
  runApp(const AdminPanelDemo());
}

class AdminPanelDemo extends StatelessWidget {
  const AdminPanelDemo({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PharmApp Admin Panel - Demo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF2196F3),
          brightness: Brightness.light,
        ),
        useMaterial3: true,
      ),
      home: const DemoLoginScreen(),
    );
  }
}

class DemoLoginScreen extends StatefulWidget {
  const DemoLoginScreen({super.key});

  @override
  State<DemoLoginScreen> createState() => _DemoLoginScreenState();
}

class _DemoLoginScreenState extends State<DemoLoginScreen> {
  final _emailController = TextEditingController(text: 'admin@pharmapp.com');
  final _passwordController = TextEditingController(text: 'demo123');

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[50],
      body: Center(
        child: Container(
          width: 400,
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.1),
                blurRadius: 10,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.admin_panel_settings,
                size: 80,
                color: Theme.of(context).primaryColor,
              ),
              const SizedBox(height: 24),
              Text(
                'PharmApp Admin Panel',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'African Pharmaceutical Exchange Platform',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.grey[600],
                ),
              ),
              const SizedBox(height: 32),
              TextField(
                controller: _emailController,
                decoration: const InputDecoration(
                  labelText: 'Admin Email',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.email),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _passwordController,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Password',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.lock),
                ),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.of(context).pushReplacement(
                      MaterialPageRoute(
                        builder: (context) => const DemoDashboardScreen(),
                      ),
                    );
                  },
                  child: const Text('Login to Demo'),
                ),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.blue[50],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  children: [
                    Text(
                      'Demo Credentials',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Colors.blue[700],
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Email: admin@pharmapp.com\nPassword: demo123',
                      style: TextStyle(
                        color: Colors.blue[600],
                        fontSize: 12,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class DemoDashboardScreen extends StatelessWidget {
  const DemoDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('PharmApp Admin Dashboard'),
        backgroundColor: Theme.of(context).primaryColor,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () {
              Navigator.of(context).pushReplacement(
                MaterialPageRoute(
                  builder: (context) => const DemoLoginScreen(),
                ),
              );
            },
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Platform Overview',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 24),
            Expanded(
              child: GridView.count(
                crossAxisCount: 4,
                crossAxisSpacing: 16,
                mainAxisSpacing: 16,
                children: [
                  _buildMetricCard(
                    'Total Pharmacies',
                    '2,847',
                    Icons.local_pharmacy,
                    Colors.blue,
                  ),
                  _buildMetricCard(
                    'Active Couriers',
                    '1,423',
                    Icons.delivery_dining,
                    Colors.green,
                  ),
                  _buildMetricCard(
                    'Monthly Revenue',
                    '\$127,450',
                    Icons.attach_money,
                    Colors.orange,
                  ),
                  _buildMetricCard(
                    'Total Exchanges',
                    '18,392',
                    Icons.swap_horiz,
                    Colors.purple,
                  ),
                  _buildMetricCard(
                    'XAF Transactions',
                    '45.2M XAF',
                    Icons.currency_exchange,
                    Colors.teal,
                  ),
                  _buildMetricCard(
                    'Cities Active',
                    '25 Cities',
                    Icons.location_city,
                    Colors.indigo,
                  ),
                  _buildMetricCard(
                    'Success Rate',
                    '97.8%',
                    Icons.check_circle,
                    Colors.green[700]!,
                  ),
                  _buildMetricCard(
                    'Countries',
                    '4 Countries',
                    Icons.flag,
                    Colors.red,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.green[50],
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.green[200]!),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.check_circle,
                    color: Colors.green[600],
                    size: 32,
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Production Ready - Security Score: 9/10',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.green[800],
                            fontSize: 16,
                          ),
                        ),
                        Text(
                          'Enterprise-grade security, multi-currency support, 3 apps deployed across Africa',
                          style: TextStyle(
                            color: Colors.green[700],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMetricCard(String title, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            icon,
            size: 32,
            color: color,
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            title,
            style: TextStyle(
              fontSize: 12,
              color: Colors.grey[600],
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}