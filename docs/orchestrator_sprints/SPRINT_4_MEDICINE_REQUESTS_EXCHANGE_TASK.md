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

