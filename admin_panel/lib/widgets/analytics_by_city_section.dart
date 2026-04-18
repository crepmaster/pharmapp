import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../services/analytics_service.dart';

/// Dashboard section that lists stats by country → city.
///
/// Fetches data via [AnalyticsService.computeStats]. Caller supplies the
/// current admin's countryScopes and super-admin flag.
class AnalyticsByCitySection extends StatefulWidget {
  final List<String> countryScopes;
  final bool isSuperAdmin;
  final Map<String, String> countryNames;
  final Map<String, Map<String, String>> cityNames;

  const AnalyticsByCitySection({
    super.key,
    required this.countryScopes,
    required this.isSuperAdmin,
    required this.countryNames,
    required this.cityNames,
  });

  @override
  State<AnalyticsByCitySection> createState() => _AnalyticsByCitySectionState();
}

class _AnalyticsByCitySectionState extends State<AnalyticsByCitySection> {
  late Future<List<CountryStats>> _future;

  @override
  void initState() {
    super.initState();
    _future = _fetch();
  }

  Future<List<CountryStats>> _fetch() {
    return AnalyticsService.computeStats(
      countryScopes: widget.countryScopes,
      isSuperAdmin: widget.isSuperAdmin,
      countryNames: widget.countryNames,
      cityNames: widget.cityNames,
    );
  }

  void _refresh() {
    setState(() => _future = _fetch());
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              'Statistics by Country & City',
              style: GoogleFonts.inter(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            const Spacer(),
            IconButton(
              icon: const Icon(Icons.refresh),
              tooltip: 'Refresh stats',
              onPressed: _refresh,
            ),
          ],
        ),
        const SizedBox(height: 12),
        FutureBuilder<List<CountryStats>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              );
            }
            if (snapshot.hasError) {
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    'Error loading statistics: ${snapshot.error}',
                    style: TextStyle(color: Colors.red.shade700),
                  ),
                ),
              );
            }
            final countries = snapshot.data ?? [];
            if (countries.isEmpty) {
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    'No data yet. Once pharmacies and couriers are active in '
                    'your scope, statistics will appear here.',
                    style: TextStyle(color: Colors.grey.shade600),
                  ),
                ),
              );
            }
            return Column(
              children: countries
                  .map((c) => _CountryCard(country: c))
                  .toList(),
            );
          },
        ),
      ],
    );
  }
}

class _CountryCard extends StatelessWidget {
  final CountryStats country;
  const _CountryCard({required this.country});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Country header with rollup totals
            Row(
              children: [
                Icon(Icons.flag, color: Colors.blue.shade700),
                const SizedBox(width: 8),
                Text(
                  '${country.countryDisplayName} (${country.countryCode})',
                  style: GoogleFonts.inter(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 16,
              runSpacing: 4,
              children: [
                _rollupChip(
                  '🏥 ${country.pharmaciesActive}/${country.pharmaciesTotal} pharmacies',
                ),
                _rollupChip(
                  '🛵 ${country.couriersActive}/${country.couriersTotal} couriers',
                ),
                _rollupChip(
                  '📦 ${country.exchangesTotal} exchanges (${country.exchangesPending} pending)',
                ),
                _rollupChip(
                  '🚚 ${country.deliveriesTotal} deliveries (${country.deliveriesPending} pending)',
                ),
                if (country.volumeByCurrency.isNotEmpty)
                  _rollupChip(
                    '💰 ${_formatVolumes(country.volumeByCurrency)}',
                  ),
              ],
            ),
            const Divider(height: 24),

            // City breakdown
            if (country.cities.isEmpty)
              Text(
                'No city data.',
                style: TextStyle(color: Colors.grey.shade600),
              )
            else
              ...country.cities.map((c) => _CityRow(city: c)),
          ],
        ),
      ),
    );
  }

  Widget _rollupChip(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.blue.shade50,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600),
      ),
    );
  }

  String _formatVolumes(Map<String, double> byCurrency) {
    final parts = byCurrency.entries
        .map((e) => '${_formatNumber(e.value)} ${e.key}')
        .toList();
    return parts.join(' · ');
  }

  String _formatNumber(double v) {
    final int rounded = v.round();
    return rounded.toString().replaceAllMapped(
          RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
          (m) => '${m[1]},',
        );
  }
}

class _CityRow extends StatefulWidget {
  final CityStats city;
  const _CityRow({required this.city});

  @override
  State<_CityRow> createState() => _CityRowState();
}

class _CityRowState extends State<_CityRow> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final city = widget.city;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            borderRadius: BorderRadius.circular(6),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        _expanded ? Icons.expand_less : Icons.expand_more,
                        size: 20,
                        color: Colors.grey.shade600,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        city.cityDisplayName,
                        style: GoogleFonts.inter(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: Colors.grey.shade800,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Padding(
                    padding: const EdgeInsets.only(left: 28),
                    child: Wrap(
                      spacing: 12,
                      runSpacing: 4,
                      children: [
                        _metric(
                          '🏥',
                          '${city.pharmaciesActive}/${city.pharmaciesTotal} active',
                          'Pharmacies',
                        ),
                        _metric(
                          '🛵',
                          '${city.couriersActive}/${city.couriersTotal} active',
                          'Couriers',
                        ),
                        _metric(
                          '📦',
                          '${city.exchangesTotal} total · ${city.exchangesPending} pending · ${city.exchangesCompleted} done',
                          'Exchanges',
                        ),
                        _metric(
                          '🚚',
                          '${city.deliveriesTotal} total · ${city.deliveriesPending} pending · ${city.deliveriesCompleted} done',
                          'Deliveries',
                        ),
                        if (city.volumeByCurrency.isNotEmpty)
                          _metric(
                              '💰', _formatVolumes(city.volumeByCurrency), 'Volume'),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (_expanded) ...[
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.only(left: 28, right: 4, bottom: 8),
              child: _buildExpandedDetails(city),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildExpandedDetails(CityStats city) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (city.pharmacies.isNotEmpty) ...[
          Text(
            '🏥 Pharmacies (${city.pharmacies.length})',
            style: GoogleFonts.inter(
                fontSize: 13, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          ...city.pharmacies.map((e) => _entityTile(e, isPharmacy: true)),
          const SizedBox(height: 12),
        ],
        if (city.couriers.isNotEmpty) ...[
          Text(
            '🛵 Couriers (${city.couriers.length})',
            style: GoogleFonts.inter(
                fontSize: 13, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          ...city.couriers.map((e) => _entityTile(e, isPharmacy: false)),
        ],
        if (city.pharmacies.isEmpty && city.couriers.isEmpty)
          Text(
            'No pharmacies or couriers registered in this city yet.',
            style: TextStyle(
                color: Colors.grey.shade600, fontStyle: FontStyle.italic),
          ),
      ],
    );
  }

  Widget _entityTile(EntityRow e, {required bool isPharmacy}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            margin: const EdgeInsets.only(right: 8),
            decoration: BoxDecoration(
              color: e.isActive ? Colors.green : Colors.grey,
              shape: BoxShape.circle,
            ),
          ),
          Expanded(
            flex: 2,
            child: Text(
              e.name,
              style: GoogleFonts.inter(
                  fontSize: 12, fontWeight: FontWeight.w600),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Expanded(
            flex: 2,
            child: Text(
              e.email,
              style: TextStyle(fontSize: 11, color: Colors.grey.shade700),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Expanded(
            flex: 2,
            child: Text(
              e.phone,
              style: TextStyle(fontSize: 11, color: Colors.grey.shade700),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (!isPharmacy && e.extra != null && e.extra!.isNotEmpty)
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                e.extra!,
                style: TextStyle(fontSize: 10, color: Colors.blue.shade700),
              ),
            ),
        ],
      ),
    );
  }

  Widget _metric(String icon, String value, String label) {
    return Tooltip(
      message: label,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: Colors.grey.shade300),
        ),
        child: Text(
          '$icon $value',
          style: const TextStyle(fontSize: 12),
        ),
      ),
    );
  }

  String _formatVolumes(Map<String, double> byCurrency) {
    final parts = byCurrency.entries
        .map((e) => '${_formatNumber(e.value)} ${e.key}')
        .toList();
    return parts.join(' · ');
  }

  String _formatNumber(double v) {
    final int rounded = v.round();
    return rounded.toString().replaceAllMapped(
          RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
          (m) => '${m[1]},',
        );
  }
}
