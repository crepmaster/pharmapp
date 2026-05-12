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

---

## Statut final — 2026-05-12

**Run orchestrator :** `20260512-065209-a16494`

**Décision architecte :** EXTEND (la structure existante de validation MSISDN était saine, hardening ciblé sur le graceful fallback `methodCode` manquant).

**Hardening livré :**
- `isValidMsisdnForMethod(normalizedDigits, methodCode, warn)` durci dans [functions/src/createWithdrawalRequest.ts](../../functions/src/createWithdrawalRequest.ts) :
  - `methodCode` null/undefined/empty/whitespace → **reject** (was: pass)
  - `methodCode` inconnu de la table backend → **graceful fallback length-only check** conservé MAIS émet un `logger.warn` structuré (`reason: "unknown_method_code"`) pour permettre à ops de détecter la drift entre `system_config` et la table TypeScript via log aggregation
  - `methodCode` connu → strict regex contre le préfixe local après stripping international
- Helpers `isValidMsisdnForMethod` et `stripLeadingCountryCode` exportés pour testabilité (pattern aligné sur `resolveMinimumMinor` de 3.2c-α.1)
- Pas de modification de `EncryptionService.validatePhoneWithMethod` (source de vérité Dart — alignée par 3.2b)
- Pas de modification du wallet, ledger, payout adapters, autres callables

**Tests ajoutés :** 43 dans [functions/src/__tests__/createWithdrawalRequest-msisdn.test.ts](../../functions/src/__tests__/createWithdrawalRequest-msisdn.test.ts)
- Positif CM (MTN 65/67/68 ; Orange 69 ; Camtel 62) avec et sans préfixe pays 237
- Positif GH (MTN 24/54/55/59 ; Vodafone 20/50 ; AirtelTigo 26/27/56/57 ; Glo 23) avec et sans préfixe pays 233
- Négatif : cross-country (CM MSISDN + GH provider et vice-versa), wrong operator prefix (MTN-prefix + Orange provider et vice-versa)
- Négatif : length < 9 digits, methodCode = undefined/null/empty/whitespace
- Tolérance : unknown methodCode (ex. `mtn_zambia`) → pass length-only + warn structuré capturé en assert
- Smoke : signature avec `warn` argument optionnel (no-op par défaut)
- `stripLeadingCountryCode` parametrized sur 6 indicatifs (237/233/254/255/256/234)

**Validations exécutées :**
- `cd functions && npm run build` ✅ tsc clean
- `cd functions && npm run lint` ✅ eslint clean
- `cd functions && npm test` ✅ **125/125 pass** (82 préexistants + 43 nouveaux), zéro régression

**Aucune fuite MSISDN :** error message reste `"msisdn is invalid for the selected provider."` (générique, pas d'exposition du numéro ni du methodCode). `logger.warn` sur unknown methodCode ne logue PAS le MSISDN, uniquement le methodCode et la reason.

**Aucun changement hors scope** : `git status` post-commit confirme uniquement `functions/src/createWithdrawalRequest.ts`, `functions/src/__tests__/createWithdrawalRequest-msisdn.test.ts`, `CLAUDE.md`, et ce fichier.

**⚠️ Prérequis pre-deploy (non bloquant pour Sprint 1 mais critique pour le futur push prod) :**

Avant tout deploy de cette function en prod, exécuter un audit read-only de `system_config/main.mobileMoneyProviders` confirmant que **chaque provider avec `enabled=true` ET `supportsPayouts=true` a un `methodCode` non-vide**. Sans cet audit, le nouveau strictness peut provoquer une outage de payout pour des providers historiquement mal configurés.

Audit command suggéré :
```bash
# read-only check via Firestore console OU script
# pour chaque entry de mobileMoneyProviders :
#   if enabled && supportsPayouts && (!methodCode || methodCode.trim() === "") → flag
```

Sprint 1 ne déploie pas (per stop condition `Aucun deploy.` du contrat). Le deploy sera planifié séparément après audit prod.

**Légère ambiguïté héritée :** `mtn_momo` est aliasé à Cameroon (préfixes 65/67/68). Si une future ouverture d'un autre pays utilise `mtn_momo` sans suffixe pays, la validation prefix sera incorrecte. Documenté dans le commentaire Dart (`encryption_service.dart:153-155`) et reflété tel quel dans le backend. À ré-évaluer dans un sprint multi-country dédié si le cas se présente.
