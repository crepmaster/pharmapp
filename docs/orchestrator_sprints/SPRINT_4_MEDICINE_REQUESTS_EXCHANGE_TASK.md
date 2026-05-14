# Sprint 4 — F-BLOC2-P2: Medicine Requests Exchange Mode

À exécuter dans l'orchestrator uniquement.

## Objectif

Étendre le module existant `medicine_requests` pour supporter achat ou échange, sans créer de nouveau système parallèle.

## Décisions verrouillées

- MVP modes : `purchase` et `exchange`.
- Pas de `either`.
- Pas de soulte monétaire.
- Échange = barter pur.
- `submitOffer(exchange)` ne réserve pas l'inventaire.
- `acceptOffer(exchange)` vérifie et réserve atomiquement les deux items.
- Frais coursier conservés en 50/50.

### Décisions verrouillées (mise à jour 2026-05-14, pre-run-start)

> Ces points sont **verrouillés par l'architecte avant run-start** (pré-lock à partir de la note des 5 ambiguïtés write path / read path entre `medicine_requests` et `exchange_proposals`). L'explorer doit confirmer les impacts mais NE doit PAS re-débattre ni proposer d'alternative. Exécuter le verrou.

1. **Forme canonique des documents — pas de nouveaux champs `mode`/`mode-bis`**
   - Conserver le champ existant `requestMode` sur `medicine_requests/{id}`. **Ne pas** ajouter un second champ `mode`.
   - Conserver le champ existant `offerType` sur `medicine_request_offers/{id}`. **Ne pas** ajouter un second champ mode côté offer.
   - `medicine_request_offers.inventoryItemId` + `inventorySnapshot` + `offeredQuantity` = item que le seller **fournit** au requester. Donc l'item qui satisfait `request.medicineId`. Cette sémantique reste identique entre `purchase` et `exchange`.
   - Pour `offerType === 'exchange'` uniquement, ajouter un sous-objet `exchangeItem` = item **demandé par le seller en retour** (l'item que la requester pharmacy doit donner au seller). Shape : `{ medicineId, medicineName, dosage, form, quantity, expiryDate?, lotNumber? }`. `expiryDate` et `lotNumber` sont **optionnels** (amendement architecte post-livraison, Finding 3) — le seller ne connaît pas toujours le lot exact qu'il veut recevoir, et `medicineId + dosage + form + quantity` suffisent à matcher un item d'inventaire requester. Si fournis, ils sont stockés tels quels pour audit ; sinon `null`.
   - **Amendement architecte (critical)** : à l'acceptation `exchange`, **la requester doit fournir ou confirmer un `exchangeInventoryItemId` exact**, owned par elle, validé contre `exchangeItem` (médicament + dosage + form match, quantity suffisante). Sans cet ID, on ne peut pas réserver atomiquement un stock réel. Ce paramètre devient mandatory dans le payload `acceptMedicineRequestOffer` pour le mode `exchange`.

2. **Exclusivité stricte request / offer**
   - `offerType` **doit être strictement égal à** `request.requestMode`.
   - `purchase` request **refuse** offer `exchange` → `failed-precondition` côté `submitMedicineRequestOffer`.
   - `exchange` request **refuse** offer `purchase` → `failed-precondition` côté `submitMedicineRequestOffer`.
   - Aucun mode `either`. Aucune tolérance hybride.

3. **Bridge canonique — option A bornée**
   - Créer ou étendre un helper transactionnel `functions/src/lib/exchangePipeline.ts` qui centralise la validation, la réservation `availableQuantity -> reservedQuantity`, et la shape canonique d'un `exchange_proposals/{id}`.
   - `createExchangeProposal` ET `acceptMedicineRequestOffer(exchange)` doivent passer par ce helper et produire **le même contrat `exchange_proposals`** consommé par `acceptExchangeProposal`, `cancelExchangeProposal`, `completeExchangeDelivery`.
   - **Pas de callable-vers-callable** (firebase pattern anti-pattern : pas de `httpsCallable().call()` depuis un autre callable backend).
   - **Pas de duplication inline** du flow exchange entre les deux callables.

4. **License gate counterparty — symétrique**
   - `acceptMedicineRequestOffer(exchange)` doit fail-closed sur :
     - requester pharmacy introuvable.
     - seller pharmacy introuvable.
     - `assertLicenseAllowsMarketplace(requesterUid)` ko.
     - `assertLicenseAllowsMarketplace(sellerUid)` ko.
     - n'importe quel ID counterparty manquant dans le payload ou le document.
   - **Tests obligatoires** : matrice license counterparty sur les deux côtés (requester verified mais seller rejected → deny ; seller verified mais requester rejected → deny ; les deux verified → allow).

5. **Hold / réservation — réutilisation stricte du schéma existant**
   - **Ne pas inventer un nouveau schéma de hold.** Le pattern actuel `createExchangeProposal` est : `pharmacy_inventory/{id}.availableQuantity` décrémenté et `reservedQuantity` incrémenté **uniquement sur `details.exchangeInventoryItemId`** (l'item de la counterparty B). L'item seller racine `inventoryItemId` n'est PAS hold à l'acceptation : il est juste vérifié à l'accept et décrémenté à `completeExchangeDelivery`.
   - `acceptMedicineRequestOffer(exchange)` suit **exactement le même schéma** :
     - L'`exchangeItem` (item demandé par seller, fourni par requester via `exchangeInventoryItemId`) → réservé à l'acceptation (`availableQuantity -= offeredQuantity` ; `reservedQuantity += offeredQuantity`).
     - L'`inventoryItemId` (item seller racine, fourni au requester) → vérifié à accept, décrémenté à `completeExchangeDelivery` via le pipeline existant.
   - **Conséquence sur scope** : single sprint préservé. Si l'explorer juge qu'une réservation symétrique stricte des deux items dès acceptation est nécessaire, c'est **STOP** et split obligatoire en 4a (backend pipeline + complete/cancel settlement) + 4b (UI). L'architecte garde le contrôle sur ce trade-off.

6. **Frais coursier** : 50/50 préservé. Aucune modification à `delivery.courierFee` ou son split.

7. **Snapshots inventaire** : `inventorySnapshot` côté offer reste rempli au moment de `submitOffer` (mirror `pharmacy_inventory` au time T). Pour `exchangeItem`, le snapshot n'a PAS lieu d'être au submit (le seller ne décide pas l'item exact que la requester va lui donner — il décrit juste un besoin). Le snapshot complet de l'item échangé arrive à l'acceptation, dans le `details.exchangeInventorySnapshot` du proposal créé.

8. **UI** : `medicine_requests_screen.dart` + `medicine_request_service.dart` + models gagnent les champs nécessaires. Pas de nouveau screen. Toggle `Purchase | Exchange` au create request + au submit offer. À l'accept exchange, pop-up qui demande à la requester de **picker** un item de son propre inventaire pour fournir l'`exchangeInventoryItemId` (le snapshot inventaire est lu en local pour le sélecteur).

9. **Pas de split de sprint** sous réserve du lock #5. Si #5 dérive, escalation immédiate.

## Périmètre autorisé

- `functions/src/createMedicineRequest.ts`
- `functions/src/submitMedicineRequestOffer.ts`
- `functions/src/acceptMedicineRequestOffer.ts`
- `functions/src/lib/requestProposalBridge.ts` ou nouveau helper dédié exchange si plus propre
- tests `functions/src/__tests__/**`
- `pharmapp_unified/lib/models/medicine_request*.dart`
- `pharmapp_unified/lib/services/medicine_request_service.dart`
- `pharmapp_unified/lib/screens/pharmacy/requests/medicine_requests_screen.dart`
- rules/indexes uniquement si nécessaires
- docs actives

## Périmètre interdit

- Pas de nouveau module `product_search`.
- Pas de `either`.
- Pas de soulte.
- Pas de refactor global exchange/delivery.
- Pas de refactor money / `amountMinor`.
- Pas de trial/license gate hors consommation des helpers existants.

## Explorer read-only

Tâches :

1. Inspecter le module `medicine_requests` complet.
2. Inspecter le pipeline canonical `exchange_proposals` et `deliveries`.
3. Inspecter les gates license + subscription livrés aux sprints 2/3.
4. Définir la forme minimale d'une offer exchange :
   - item offert par seller ;
   - item attendu/requested côté requester ;
   - quantités ;
   - snapshots ;
   - no price.
5. Définir la transaction d'acceptation exchange.
6. Définir les changements UI.
7. Définir tests backend.

Stop conditions :

- Sprints 2/3 non terminés ;
- impossible de préserver purchase flow ;
- exchange acceptance exige refactor large delivery ;
- besoin d'introduire soulte ou `amountMinor`.

## Writer

Implémenter :

1. Backend create request : accepter `purchase | exchange`.
2. Backend submit offer : accepter `purchase | exchange`.
3. Validations compatibilité request/offer.
4. Accept purchase : préserver comportement existant.
5. Accept exchange : transaction atomique des deux inventaires + proposal/delivery.
6. UI create request mode.
7. UI submit offer mode.
8. Tests.
9. Docs.

## Critères de done

- Purchase request/offer/accept ne régresse pas.
- Exchange request créée.
- Exchange offer soumise sans prix.
- Exchange accept vérifie les deux stocks dans une transaction.
- Stock disparu ou insuffisant -> `failed-precondition` propre.
- Frais coursier 50/50 appliqués.
- Pharmacie non vérifiée/non trial ne peut pas agir.
- Docs à jour.

## Validation minimale

- `cd functions && npm run build && npm run lint && npm test`
- `cd pharmapp_unified && flutter analyze`
- tests ciblés UI/service si disponibles
