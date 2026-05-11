# Sprint 1 — 3.2c-β MSISDN Hardening

À exécuter dans l'orchestrator uniquement.

## Objectif

Fermer la dette de durcissement MSISDN liée aux retraits avant d'ouvrir les nouvelles features produit.

## Résultat attendu

Les retraits valident strictement la cohérence pays / provider / MSISDN, sans casser les flows existants Cameroon et Ghana.

## Périmètre autorisé

- `functions/src/createWithdrawalRequest.ts`
- `functions/src/__tests__/**` tests ciblés withdrawal/MSISDN
- `shared/lib/services/encryption_service.dart` uniquement si l'explorer prouve une asymétrie client/backend à corriger
- tests shared ciblés si nécessaire
- docs actives strictement nécessaires (`CLAUDE.md`, sprint status)

## Périmètre interdit

- Aucun top-up Paystack/MTN.
- Aucun changement wallet/ledger hors validation withdrawal.
- Aucun changement marketplace/exchange/delivery.
- Aucun changement admin UI.
- Aucun refactor money global.
- Aucun deploy.

## Explorer read-only

Tâches :

1. Lire `createWithdrawalRequest.ts`.
2. Lire `shared/lib/services/encryption_service.dart`.
3. Identifier le chemin exact de validation MSISDN côté backend.
4. Identifier le chemin exact côté client.
5. Vérifier les providers actifs dans `system_config` si fixtures disponibles localement, sinon documenter l'absence.
6. Définir le plus petit patch pour durcir :
   - stripping indicatif pays ;
   - préfixes opérateur ;
   - cohérence `provider.countryCode`;
   - cohérence `provider.methodCode`;
   - messages d'erreur non sensibles.
7. Proposer les tests à ajouter.

Stop conditions :

- nécessité de refactorer tout `EncryptionService`;
- nécessité de toucher payout adapters réels ;
- nécessité de changer le modèle wallet ;
- impossibilité de préserver Cameroon/Ghana.

## Writer

Implémenter seulement les validations et tests approuvés par l'explorer.

Contraintes :

- Fail closed pour provider incohérent.
- Aucun log de MSISDN en clair.
- Pas de nouvelle table de config parallèle.
- Les messages utilisateur ne doivent pas exposer les détails sensibles.

## Critères de done

- MSISDN Ghana et Cameroon validés par pays/provider.
- MSISDN incompatible provider refusé.
- Provider country mismatch refusé.
- Tests backend couvrent succès et refus.
- `CLAUDE.md` reflète le statut fermé du sprint.

## Validation minimale

- `cd functions && npm run build`
- `cd functions && npm run lint`
- `cd functions && npm test`

