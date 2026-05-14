# F-BLOC2-P2 — Medicine Requests Exchange Mode (Sprint 4)

Date livraison : 2026-05-14
Orchestrator run : `20260513-235401-167aae`
Base commit : `7e1dbf0` (pre-lock architecte)

## Objectif

Étendre `medicine_requests` pour supporter `requestMode = purchase | exchange`,
avec offres strictement exclusives `offerType = purchase | exchange`.
Pas de mode `either`. Pas de soulte monétaire. L'échange est un barter pur.

## 9 décisions verrouillées (architecte, pré-run-start)

Toutes verrouillées avant écriture de code, conformes au pre-lock 2026-05-14
([SPRINT_4_MEDICINE_REQUESTS_EXCHANGE_TASK.md](orchestrator_sprints/SPRINT_4_MEDICINE_REQUESTS_EXCHANGE_TASK.md)) :

1. **Pas de nouveau champ mode** — `medicine_requests.requestMode` et
   `medicine_request_offers.offerType` réutilisés. Nouveau sous-objet
   `exchangeItem` uniquement quand `offerType === 'exchange'`.
   `acceptMedicineRequestOffer` exige `exchangeInventoryItemId` (item
   exact owned par requester) pour le path exchange.
2. **Exclusivité stricte** — `offerType === request.requestMode`. Sinon
   `failed-precondition`.
3. **Bridge canonique** — nouveau helper [functions/src/lib/exchangePipeline.ts](../functions/src/lib/exchangePipeline.ts).
   `createExchangeProposal` ET `acceptMedicineRequestOffer(exchange)` passent
   par les builders `buildCanonicalProposalDocument` /
   `buildCanonicalDeliveryDocument`. Pas de callable-to-callable, pas de
   duplication inline.
4. **License gate symétrique** — `submitMedicineRequestOffer` gate seller
   (déjà) + requester (nouveau). `acceptMedicineRequestOffer` gate caller
   (déjà) + seller (déjà). Matrice testée.
5. **Hold : schéma existant strict** — à `acceptMedicineRequestOffer(exchange)`,
   seul `exchangeInventoryItemId` (item requester) est holdé
   (`availableQuantity -= q`, `reservedQuantity += q`). L'item seller racine
   est vérifié à l'accept mais décrémenté à `completeExchangeDelivery`,
   exactement comme `createExchangeProposal`.
6. **Frais coursier** — 50/50 préservé. Aucune modification à
   `delivery.courierFee` ou son split. Le path exchange via
   medicine_request résout le fee dans la transaction via le helper
   partagé `resolveCourierFee(systemConfigData, country, city, ...)`
   (Sprint 4 Finding 1 fix, post-livraison) : lecture `system_config/main`
   et application de la même formule que `acceptExchangeProposal`
   (`exchangeFee` explicite ou `deliveryFee × 1.2`, sinon 12 % de
   `totalPrice` en fallback legacy — ce dernier vaut 0 pour le barter).
   Settlement 50/50 appliqué par `completeExchangeDelivery` sur le fee
   résolu.
7. **Snapshots inventaire** — `inventorySnapshot` côté offer rempli au
   submit (mirror `pharmacy_inventory` au time T). `exchangeItem` n'a PAS
   de snapshot au submit (le seller ne sait pas quel lot la requester
   choisira). Snapshot complet à l'acceptation :
   `details.exchangeInventorySnapshot` du proposal créé.
8. **UI** — pas de nouveau screen. Toggle `Purchase | Exchange` au
   `_showCreateRequestDialog`, sélection mode déduite de la request au
   `_MakeOfferDialog`, picker inventory à l'accept exchange via
   `_InventoryPickerDialog`.
9. **Pas de split de sprint** sous réserve du lock #5. Lock respecté
   strictement : aucune réservation symétrique des deux items à
   l'acceptation. Pas d'escalation.

## Contrats Firestore — diff

### `medicine_requests/{id}`

```ts
{
  // existant
  requesterPharmacyId: string,
  requesterSnapshot: { pharmacyName, address, phone },
  countryCode: string,
  cityCode: string,
  medicineId: string,
  medicineSnapshot: Map,
  requestedQuantity: number,
  currencyCode: string,
  notes: string,
  status: 'open'|'matched'|'fulfilled'|'cancelled'|'expired',
  selectedOfferId: string|null,
  createdAt, updatedAt, expiresAt,
  // Sprint 4 : valeur étendue, plus de 'either'
  requestMode: 'purchase' | 'exchange',
}
```

### `medicine_request_offers/{id}`

```ts
{
  // existant
  requestId, requesterPharmacyId, sellerPharmacyId, sellerSnapshot,
  inventoryItemId, inventorySnapshot,
  offeredQuantity, unitPrice, totalPrice, currencyCode, notes,
  status, linkedProposalId, createdAt, updatedAt,
  // Sprint 4 : valeur étendue
  offerType: 'purchase' | 'exchange',
  // Sprint 4 : nouveau, présent ssi offerType === 'exchange'.
  // `expiryDate` et `lotNumber` sont optionnels (amendement architecte
  // post-livraison, Finding 3 fix) — match d'inventaire à l'accept se
  // fait sur medicineId + dosage + form + quantité ; les deux derniers
  // champs sont purement informatifs / audit.
  exchangeItem?: {
    medicineId: string,
    medicineName: string,
    dosage: string,
    form: string,
    quantity: number,
    expiryDate?: string|null,
    lotNumber?: string|null,
  },
}
```

Pour `offerType === 'exchange'` : `unitPrice = 0`, `totalPrice = 0`
(barter pur, lock #1).

### `exchange_proposals/{id}` — shape canonique (inchangée, désormais centralisée)

```ts
{
  id, inventoryItemId,
  fromPharmacyId,   // buyer / requester
  toPharmacyId,     // seller / inventory owner
  details:
    | { type: 'purchase', quantity, unitPrice, totalPrice, currency, medicineName, medicineId, notes? }
    | { type: 'exchange', quantity, medicineName, medicineId,
        exchangeInventoryItemId, exchangeMedicineId, exchangeQuantity,
        exchangeInventorySnapshot: {
          medicineId, medicineName, dosage, form,
          packaging?, lotNumber?, expirationDate?, quantityAtAcceptance
        },
        notes? },
  status: 'pending' | 'accepted' | …,
  reservations: { walletReserved: number|null, inventoryReserved: number|null },
  inventorySnapshot: { … snapshot of seller item A … },
  acceptedBy?, acceptedAt?, acceptanceNotes?,
  createdAt, updatedAt, expiresAt,
  _sourceRequestId?, _sourceOfferId?,  // backreference quand créé via bridge
}
```

## Flux

### Purchase (inchangé)

1. `createMedicineRequest({requestMode: 'purchase', …})`
2. `submitMedicineRequestOffer({offerType: 'purchase', unitPrice > 0, …})`
3. `acceptMedicineRequestOffer({requestId, offerId})` :
   - bridge `acceptRequestOfferIntoCanonicalProposal` (purchase)
   - wallet `available → deducted`
   - proposal `accepted` créé via `buildCanonicalProposalDocument`
   - delivery `pending` créé via `buildCanonicalDeliveryDocument`
   - request `matched`, offer `converted`, autres offers `declined`
4. courier livre → `completeExchangeDelivery` finalise paiement + stock

### Exchange (Sprint 4)

1. `createMedicineRequest({requestMode: 'exchange', …})`
2. `submitMedicineRequestOffer({offerType: 'exchange', exchangeItem: {…}, …})`
   — `unitPrice` ignoré, pas de hold.
3. `acceptMedicineRequestOffer({requestId, offerId, exchangeInventoryItemId})` :
   - bridge `acceptExchangeRequestOfferIntoCanonicalProposal`
   - validation symétrique :
     - requester verified + seller verified (`assertLicenseAllowsMarketplace`)
     - city + status + ownership + medicine/dosage/form match
     - seller item A : qty suffisante + non expiré (validé, **non holdé**)
     - requester item B (`exchangeInventoryItemId`) : owned by requester +
       match `offer.exchangeItem` + qty suffisante + non expiré
   - **réserve uniquement requester item B** : `availableQuantity -= q`,
     `reservedQuantity += q`
   - proposal `accepted` (type=exchange) créé via builder canonique
   - delivery `pending` créé : `totalPrice=0` (barter), `courierFee`
     résolu via `resolveCourierFee` (Sprint 4 Finding 1 fix) depuis
     `system_config/main.citiesByCountry[country][city]` — `exchangeFee`
     explicite, ou `deliveryFee × 1.2`, ou `0` si pas de city config.
   - request `matched`, offer `converted`, autres offers `declined`
4. courier livre item A → `completeExchangeDelivery` :
   - décrément seller item A (déjà géré par le pipeline existant)
   - libère reserved sur requester item B + back-office transfert vers
     seller (déjà géré : voir [completeExchangeDelivery.ts:380-453](../functions/src/completeExchangeDelivery.ts#L380-L453))

## Fichiers modifiés

### Backend (functions/)

| Fichier | Type |
|---|---|
| [src/lib/exchangePipeline.ts](../functions/src/lib/exchangePipeline.ts) | **NEW** — helper canonique pur + reservation transactionnelle |
| [src/lib/requestProposalBridge.ts](../functions/src/lib/requestProposalBridge.ts) | Refactor purchase path + nouveau `acceptExchangeRequestOfferIntoCanonicalProposal` |
| [src/acceptMedicineRequestOffer.ts](../functions/src/acceptMedicineRequestOffer.ts) | Routing sur `offerType`, validation `exchangeInventoryItemId` |
| [src/submitMedicineRequestOffer.ts](../functions/src/submitMedicineRequestOffer.ts) | Parity matrix + exchangeItem + license counterparty (requester) |
| [src/createMedicineRequest.ts](../functions/src/createMedicineRequest.ts) | `requestMode` strict `purchase | exchange` |
| [src/createExchangeProposal.ts](../functions/src/createExchangeProposal.ts) | Refactor via `buildCanonicalProposalDocument` (shape canonique) |

### Tests Jest (functions/src/__tests__/)

| Fichier | Couverture |
|---|---|
| [exchangePipeline.test.ts](../functions/src/__tests__/exchangePipeline.test.ts) | 53 tests purs — `assertCanonicalMode`, `assertOfferMatchesRequest`, `validateExchangeItemInput`, `buildCanonicalProposalDocument`, `reserveExchangeInventory` matrix, et `resolveCourierFee` (8 tests : exchangeFee explicite / deliveryFee × 1.2 / no-config / unknown country / rounding) |
| [medicineRequestOfferFlows-sprint4.test.ts](../functions/src/__tests__/medicineRequestOfferFlows-sprint4.test.ts) | 14 tests callable-level — createMedicineRequest mode validation, submitMedicineRequestOffer parity matrix, license counterparty gate (REQ-4-LICENSE-REQUESTER), acceptMedicineRequestOffer branch routing |
| [acceptExchangeRequestOfferBridge.test.ts](../functions/src/__tests__/acceptExchangeRequestOfferBridge.test.ts) | 17 tests intégration bridge — happy path (lock #5 prouvé : 1 update inventaire requester only, 0 wallet, 0 seller inv write) + 4 courier-fee (exchangeFee, deliveryFee × 1.2, no-config, country inconnu) + 12 négatives |
| [createExchangeProposal-sprint4.test.ts](../functions/src/__tests__/createExchangeProposal-sprint4.test.ts) | 3 tests directs `createExchangeProposal` exchange branch (post-livraison Finding 1) — `medicineId` mismatch refusé via helper canonique, happy path avec snapshot fully-populated, ownership rejection |

**Total backend** : **338/338** Jest (was 251/251, +87). Helpers `resolveCourierFee` et `reserveExchangeInventory` désormais consommés par les **deux** producers de `exchange_proposals` — pas de duplication inline, contrats alignés.
Lint : ✅
Build TS : ✅

### Frontend (pharmapp_unified/lib/)

| Fichier | Type |
|---|---|
| [models/medicine_request.dart](../pharmapp_unified/lib/models/medicine_request.dart) | Retrait `either`. `RequestMode { purchase, exchange }` + `wire` extension |
| [models/medicine_request_offer.dart](../pharmapp_unified/lib/models/medicine_request_offer.dart) | Enum `OfferType` strict + classe `ExchangeItem` |
| [services/medicine_request_service.dart](../pharmapp_unified/lib/services/medicine_request_service.dart) | `createRequest(requestMode:)`, `submitPurchaseOffer`, `submitExchangeOffer(exchangeItem:)`, `acceptOffer(exchangeInventoryItemId?:)` |
| [screens/pharmacy/requests/medicine_requests_screen.dart](../pharmapp_unified/lib/screens/pharmacy/requests/medicine_requests_screen.dart) | Toggle `Purchase \| Exchange` create-request, branchement mode au make-offer + champs `exchangeItem`, `_InventoryPickerDialog` à l'accept exchange |

`flutter analyze` : ✅ 0 nouvelle erreur Sprint 4 (les 6 issues restantes sont préexistantes — qr_scanner_screen + pharmacy_main_screen).

## Sécurité Firestore

`firestore.rules` **non touché** : `medicine_requests` et
`medicine_request_offers` sont déjà `allow write: if false` (backend-only
via Admin SDK Cloud Functions). `exchange_proposals` également couvert.
Pas besoin de durcissement supplémentaire car les nouveaux champs
(`exchangeItem`, `requestMode='exchange'`, `details.exchangeInventoryItemId`)
sont écrits exclusivement par les callables backend.

## Tests Flutter

11 failures préexistantes dans `test/screens/auth/unified_registration_screen_test.dart`
(Sprint 2B.2a) — confirmées présentes sur le commit base `7e1dbf0` avant
toute modification Sprint 4. Hors périmètre, non régressions Sprint 4.

## Critères Done (rappel)

- [x] Purchase request/offer/accept ne régresse pas (13 tests pipeline +
  callable + bridge purchase + acceptCallables-input-validation Sprint 2A.3
  toujours verts).
- [x] Exchange request créée (createMedicineRequest Sprint 4 valide).
- [x] Exchange offer soumise sans prix (submitMedicineRequestOffer
  Sprint 4 + tests parity + exchangeItem).
- [x] Exchange accept vérifie les deux stocks dans une transaction
  (acceptExchangeRequestOfferIntoCanonicalProposal happy path test +
  négatives).
- [x] Stock disparu ou insuffisant → `failed-precondition` propre.
- [x] Frais coursier 50/50 préservés (architecture inchangée).
- [x] Pharmacie non vérifiée ne peut pas agir (license counterparty gate
  matrix testée des 2 côtés).
- [x] Docs à jour (ce fichier + CLAUDE.md + sprint task locked).

## Conformité aux 9 décisions verrouillées

| # | Décision | Statut | Preuve |
|---|---|---|---|
| 1 | Pas de champ `mode` nouveau | ✅ | Diff `requestMode` étendu, `exchangeItem` sous-objet seulement |
| 2 | Exclusivité stricte | ✅ | `medicineRequestOfferFlows-sprint4.test.ts` parity matrix |
| 3 | Pipeline canonique partagé | ✅ | `exchangePipeline.ts` consommé par `createExchangeProposal` ET `requestProposalBridge` (les 2 paths) |
| 4 | Counterparty exchange item validé à l'accept | ✅ | `exchangePipeline.reserveExchangeInventory` + bridge négatives |
| 5 | Hold strict (1 côté à l'accept) | ✅ | `acceptExchangeRequestOfferBridge.test.ts` happy path : `inventoryUpdates.length === 1`, seller inv writes === 0, wallet writes === 0 |
| 6 | Courier fee 50/50 inchangé | ✅ | Aucune modification `completeExchangeDelivery` ni `delivery.courierFee` |
| 7 | Pas de snapshot exchangeItem au submit | ✅ | `submitMedicineRequestOffer` n'écrit `exchangeItem` que tel quel; snapshot capturé à l'accept dans `details.exchangeInventorySnapshot` |
| 8 | License gate symétrique | ✅ | `submitMedicineRequestOffer` gate seller+requester ; `acceptMedicineRequestOffer` gate caller+seller. Test `requester license rejected → failed-precondition` |
| 9 | Pas de split de sprint | ✅ | Single sprint, lock #5 respecté |
