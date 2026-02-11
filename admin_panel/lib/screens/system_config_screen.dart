import 'package:flutter/material.dart';
import '../models/system_config.dart';
import '../services/system_config_service.dart';

class SystemConfigScreen extends StatefulWidget {
  const SystemConfigScreen({super.key});

  @override
  State<SystemConfigScreen> createState() => _SystemConfigScreenState();
}

class _SystemConfigScreenState extends State<SystemConfigScreen> 
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  SystemConfig? _config;
  bool _isLoading = true;
  
  final _cityController = TextEditingController();
  final _deliveryRateController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadConfig();
  }

  Future<void> _loadConfig() async {
    setState(() => _isLoading = true);
    try {
      final config = await SystemConfigService.getSystemConfig();
      if (mounted) {
        setState(() {
          _config = config;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading config: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('System Configuration'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(icon: Icon(Icons.attach_money), text: 'Currency'),
            Tab(icon: Icon(Icons.location_city), text: 'Cities'),
            Tab(icon: Icon(Icons.subscriptions), text: 'Plans'),
          ],
        ),
      ),
      body: _isLoading 
          ? const Center(child: CircularProgressIndicator())
          : _config == null
              ? const Center(child: Text('Failed to load configuration'))
              : TabBarView(
                  controller: _tabController,
                  children: [
                    _buildCurrencyTab(),
                    _buildCitiesTab(),
                    _buildPlansTab(),
                  ],
                ),
    );
  }

  Widget _buildCurrencyTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Primary Currency',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: _config!.primaryCurrency,
                    decoration: const InputDecoration(
                      labelText: 'Select Primary Currency',
                      border: OutlineInputBorder(),
                    ),
                    items: _config!.supportedCurrencies.entries
                        .where((entry) => entry.value.isActive)
                        .map((entry) {
                      final currency = entry.value;
                      return DropdownMenuItem(
                        value: currency.code,
                        child: Text('${currency.code} - ${currency.name}'),
                      );
                    }).toList(),
                    onChanged: (value) {
                      if (value != null) {
                        _updatePrimaryCurrency(value);
                      }
                    },
                  ),
                ],
              ),
            ),
          ),
          
          const SizedBox(height: 16),
          
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Supported Currencies',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      ElevatedButton.icon(
                        onPressed: _showUpdateRatesDialog,
                        icon: const Icon(Icons.refresh),
                        label: const Text('Update Rates'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  
                  ...(_config!.supportedCurrencies.entries.map((entry) {
                    final currency = entry.value;
                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: currency.isActive ? Colors.green : Colors.grey,
                          child: Text(
                            currency.symbol,
                            style: const TextStyle(color: Colors.white, fontSize: 12),
                          ),
                        ),
                        title: Text('${currency.code} - ${currency.name}'),
                        subtitle: Text('Exchange Rate: ${currency.exchangeRate} ${currency.code} = 1 USD'),
                        trailing: Switch(
                          value: currency.isActive,
                          onChanged: (value) {
                            _toggleCurrencyStatus(currency.code, value);
                          },
                        ),
                      ),
                    );
                  })),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCitiesTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Add New City',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        flex: 2,
                        child: TextField(
                          controller: _cityController,
                          decoration: const InputDecoration(
                            labelText: 'City Name',
                            border: OutlineInputBorder(),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: _deliveryRateController,
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(
                            labelText: 'Delivery Rate (${_config!.primaryCurrency})',
                            border: const OutlineInputBorder(),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton(
                        onPressed: _addCity,
                        child: const Text('Add'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          
          const SizedBox(height: 16),
          
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Supported Cities & Delivery Rates',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 16),
                  
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: DataTable(
                      columns: const [
                        DataColumn(label: Text('City')),
                        DataColumn(label: Text('Delivery Rate')),
                        DataColumn(label: Text('Currency')),
                        DataColumn(label: Text('Actions')),
                      ],
                      rows: _config!.supportedCities.map((city) {
                        final rate = _config!.deliveryRatesByCity[city] ?? 0.0;
                        return DataRow(
                          cells: [
                            DataCell(Text(city)),
                            DataCell(Text(rate.toStringAsFixed(2))),
                            DataCell(Text(_config!.primaryCurrency)),
                            DataCell(
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.red),
                                onPressed: () => _removeCity(city),
                              ),
                            ),
                          ],
                        );
                      }).toList(),
                    ),
                  ),
                ],
              ),
            ),
          ),
          
          const SizedBox(height: 16),
          
          StreamBuilder<Map<String, List<Map<String, dynamic>>>>(
            stream: SystemConfigService.getPharmaciesByCity(),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }
              
              final pharmaciesByCity = snapshot.data ?? {};
              
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Pharmacies by City',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 16),
                      
                      ...pharmaciesByCity.entries.map((entry) {
                        final city = entry.key;
                        final pharmacies = entry.value;
                        
                        return ExpansionTile(
                          title: Text('$city (${pharmacies.length} pharmacies)'),
                          children: pharmacies.map((pharmacy) {
                            return ListTile(
                              title: Text(pharmacy['pharmacyName']),
                              subtitle: Text(pharmacy['email']),
                              trailing: Chip(
                                label: Text(pharmacy['subscriptionStatus']),
                                backgroundColor: pharmacy['subscriptionStatus'] == 'active'
                                    ? Colors.green.shade100
                                    : Colors.orange.shade100,
                              ),
                            );
                          }).toList(),
                        );
                      }),
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildPlansTab() {
    return StreamBuilder<List<DynamicSubscriptionPlan>>(
      stream: SystemConfigService.getSubscriptionPlans(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        
        final plans = snapshot.data ?? [];
        
        return SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              ElevatedButton.icon(
                onPressed: _showCreatePlanDialog,
                icon: const Icon(Icons.add),
                label: const Text('Create New Plan'),
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size(double.infinity, 48),
                ),
              ),
              
              const SizedBox(height: 16),
              
              if (plans.isEmpty)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      children: [
                        const Icon(Icons.subscriptions, size: 64, color: Colors.grey),
                        const SizedBox(height: 16),
                        const Text('No subscription plans found'),
                        const SizedBox(height: 8),
                        ElevatedButton(
                          onPressed: () async {
                            await SystemConfigService.createDefaultPlans();
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Default plans created!')),
                            );
                          },
                          child: const Text('Create Default Plans'),
                        ),
                      ],
                    ),
                  ),
                )
              else
                ...plans.map((plan) => _buildPlanCard(plan)),
            ],
          ),
        );
      },
    );
  }

  Widget _buildPlanCard(DynamicSubscriptionPlan plan) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  plan.name,
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                PopupMenuButton(
                  itemBuilder: (context) => [
                    const PopupMenuItem(value: 'edit', child: Text('Edit')),
                    const PopupMenuItem(value: 'delete', child: Text('Delete')),
                  ],
                  onSelected: (value) {
                    if (value == 'edit') {
                      _showEditPlanDialog(plan);
                    } else if (value == 'delete') {
                      _deletePlan(plan.id);
                    }
                  },
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(plan.description),
            const SizedBox(height: 16),
            
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Pricing by Currency:', style: TextStyle(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      ...plan.pricesByCurrency.entries.map((entry) {
                        final currency = _config!.supportedCurrencies[entry.key];
                        return Text('${currency?.symbol ?? entry.key} ${entry.value.toStringAsFixed(0)}/month');
                      }),
                    ],
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Features:', style: TextStyle(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      ...plan.features.take(3).map((feature) => Text('• $feature', style: const TextStyle(fontSize: 12))),
                      if (plan.features.length > 3)
                        Text('... and ${plan.features.length - 3} more', style: const TextStyle(fontSize: 12, fontStyle: FontStyle.italic)),
                    ],
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 16),
            Row(
              children: [
                Chip(
                  label: Text(plan.inventoryLimit == -1 ? 'Unlimited' : '${plan.inventoryLimit} medicines'),
                  backgroundColor: Colors.blue.shade100,
                ),
                const SizedBox(width: 8),
                Chip(
                  label: Text('${plan.trialDays} days trial'),
                  backgroundColor: Colors.green.shade100,
                ),
                const Spacer(),
                Switch(
                  value: plan.isActive,
                  onChanged: (value) => _togglePlanStatus(plan, value),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // Helper methods for actions
  Future<void> _updatePrimaryCurrency(String currencyCode) async {
    if (_config == null) return;
    
    final updatedConfig = _config!.copyWith(primaryCurrency: currencyCode);
    final success = await SystemConfigService.updateSystemConfig(updatedConfig);
    
    if (success) {
      setState(() => _config = updatedConfig);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Primary currency updated to $currencyCode')),
        );
      }
    }
  }

  void _showUpdateRatesDialog() {
    final controllers = <String, TextEditingController>{};
    
    for (final currency in _config!.supportedCurrencies.values) {
      controllers[currency.code] = TextEditingController(
        text: currency.exchangeRate.toString(),
      );
    }

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Update Exchange Rates'),
        content: SizedBox(
          width: 400,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: controllers.entries.map((entry) {
              final currency = _config!.supportedCurrencies[entry.key]!;
              return Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: TextField(
                  controller: entry.value,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: '${currency.name} (${currency.code})',
                    suffixText: '= 1 USD',
                    border: const OutlineInputBorder(),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              final newRates = <String, double>{};
              for (final entry in controllers.entries) {
                final rate = double.tryParse(entry.value.text);
                if (rate != null) {
                  newRates[entry.key] = rate;
                }
              }
              
              final success = await SystemConfigService.updateCurrencyRates(newRates);
              
              if (mounted) {
                Navigator.of(context).pop();
                if (success) {
                  _loadConfig();
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Exchange rates updated!')),
                  );
                }
              }
            },
            child: const Text('Update'),
          ),
        ],
      ),
    );
  }

  Future<void> _addCity() async {
    final cityName = _cityController.text.trim();
    final rateText = _deliveryRateController.text.trim();
    
    if (cityName.isEmpty || rateText.isEmpty) return;
    
    final rate = double.tryParse(rateText);
    if (rate == null) return;
    
    final success = await SystemConfigService.addCity(cityName, rate);
    
    if (success) {
      _cityController.clear();
      _deliveryRateController.clear();
      _loadConfig();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('City $cityName added!')),
        );
      }
    }
  }

  Future<void> _removeCity(String cityName) async {
    // Implementation for removing city
    // Would need to add this method to SystemConfigService
  }

  Future<void> _toggleCurrencyStatus(String currencyCode, bool isActive) async {
    // Implementation for toggling currency active status
  }

  Future<void> _togglePlanStatus(DynamicSubscriptionPlan plan, bool isActive) async {
    // Implementation for toggling plan active status
  }

  void _showCreatePlanDialog() {
    // Implementation for create plan dialog
  }

  void _showEditPlanDialog(DynamicSubscriptionPlan plan) {
    // Implementation for edit plan dialog
  }

  Future<void> _deletePlan(String planId) async {
    // Implementation for deleting plan
  }

  @override
  void dispose() {
    _tabController.dispose();
    _cityController.dispose();
    _deliveryRateController.dispose();
    super.dispose();
  }
}