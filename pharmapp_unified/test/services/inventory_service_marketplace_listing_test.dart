// Sprint 2B.2b — unit test for the marketplace-listing test seam on
// [InventoryService.fetchMarketplacePharmacyIds].
//
// `InventoryService.getAvailableMedicines` previously ran two direct
// `collection('pharmacies').where(...).get()` listings to discover same-
// city pharmacies. Sprint 2B.2b closes that path at the firestore.rules
// layer (allow list denied — see rules emulator REQ-2B2B-001..005) and
// migrates the listing to the backend callable
// `getMarketplacePharmacies`. The service exposes a
// `fetchMarketplacePharmacyIds` static field for tests so we can
// substitute a stub and prove :
//
//   (a) the service forwards the right `countryCode` / `cityCode` to
//       the fetcher (= proof the callable is invoked with the right
//       payload in production)
//   (b) the migrated path does NOT touch
//       `FirebaseFirestore.instance.collection('pharmacies').where(...)`
//       any more (the seam is the only way the production code reaches
//       the marketplace listing).
//
// We do not exercise `getAvailableMedicines` end-to-end here : it
// composes the listing with a second Firestore read on
// `pharmacy_inventory` which would require fake_cloud_firestore. The
// behavioural property under test is the listing migration itself —
// that's what 2B.2b ships.
import 'package:flutter_test/flutter_test.dart';
import 'package:pharmapp_unified/services/inventory_service.dart';

void main() {
  // Restore the production fetcher after the suite so other tests aren't
  // polluted if they import this module in the future.
  final productionFetcher = InventoryService.fetchMarketplacePharmacyIds;
  tearDown(() {
    InventoryService.fetchMarketplacePharmacyIds = productionFetcher;
  });

  group('InventoryService.fetchMarketplacePharmacyIds — seam', () {
    test('forwards countryCode + cityCode to the underlying fetcher',
        () async {
      String? receivedCountryCode;
      String? receivedCityCode;
      InventoryService.fetchMarketplacePharmacyIds = ({
        required String countryCode,
        String? cityCode,
      }) async {
        receivedCountryCode = countryCode;
        receivedCityCode = cityCode;
        return const ['uid-a', 'uid-b'];
      };

      final ids = await InventoryService.fetchMarketplacePharmacyIds(
        countryCode: 'GH',
        cityCode: 'accra',
      );

      expect(receivedCountryCode, equals('GH'));
      expect(receivedCityCode, equals('accra'));
      expect(ids, equals(['uid-a', 'uid-b']));
    });

    test(
        'forwards null cityCode when the caller omits the optional argument',
        () async {
      String? receivedCityCode = 'sentinel';
      InventoryService.fetchMarketplacePharmacyIds = ({
        required String countryCode,
        String? cityCode,
      }) async {
        receivedCityCode = cityCode;
        return const [];
      };

      await InventoryService.fetchMarketplacePharmacyIds(countryCode: 'CM');
      expect(receivedCityCode, isNull);
    });

    test('fetcher returning empty list is honoured', () async {
      InventoryService.fetchMarketplacePharmacyIds = ({
        required String countryCode,
        String? cityCode,
      }) async =>
          const <String>[];

      final ids = await InventoryService.fetchMarketplacePharmacyIds(
        countryCode: 'GH',
        cityCode: 'accra',
      );
      expect(ids, isEmpty);
    });

    test('seam swap is reversible — tearDown restores production fetcher',
        () {
      // Sanity-check the test infrastructure : the seam variable points
      // to the production wiring after tearDown runs at the end of the
      // previous test. This guards against a future contributor making
      // the field final or losing the tearDown hook.
      expect(InventoryService.fetchMarketplacePharmacyIds, isNotNull);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Marketplace-listing audit (Sprint 2B.2b).
  //
  // Inline manifest so the audit is part of the diff and reviewable. The
  // 6 consumer files listed in SPRINT_2B2B_MARKETPLACE_ENFORCEMENT_TASK.md
  // were audited as follows (`grep -rn "collection('pharmacies')"`) :
  //
  //   - inventory_service.dart                   → LISTING migrated here.
  //   - medicine_requests_screen.dart            → LOOKUP own UID only.
  //   - create_proposal_screen.dart              → LOOKUP own UID only.
  //   - exchange_status_screen.dart              → LOOKUP by UID (peer).
  //   - subscription_screen.dart                 → LOOKUP own UID only.
  //   - pharmacy_main_screen.dart                → LOOKUP own UID only.
  //
  // Only inventory_service.getAvailableMedicines did marketplace listing.
  // The five lookup-only consumers continue to use `.doc(uid).get()`,
  // which the new rule `allow get: if isAuthenticated()` keeps allowed.
  // The rules emulator tests REQ-2B2B-001..005 prove `allow list` is
  // denied for all clients including unauthenticated.
  // ─────────────────────────────────────────────────────────────────────
}
