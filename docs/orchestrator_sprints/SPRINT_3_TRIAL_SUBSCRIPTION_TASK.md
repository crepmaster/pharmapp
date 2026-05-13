# Sprint 3 — Trial Subscription Gate Aligned With License Verification

À exécuter dans l'orchestrator uniquement.

## Objectif

Construire le trial subscription manquant en l'alignant avec le gate licence.

## Décisions verrouillées

- Pays sans licence obligatoire : trial démarre à l'inscription.
- Pays avec licence obligatoire : trial démarre à `licenseStatus = verified`.
- 30 jours complets garantis après validation licence.
- Une pharmacie non vérifiée ne consomme pas son trial.
- Sprint 3 présuppose Sprint 2A.3 fermé : le trial doit s'accrocher au
  write path canonique backend-owned, pas au create Firestore direct
  historique.

### Décisions verrouillées (mise à jour 2026-05-13, post-F-LICENSE)

> Ces points sont **verrouillés par l'architecte avant run-start**. L'explorer doit confirmer les impacts mais NE doit PAS re-débattre ni proposer d'alternative. Exécuter le verrou.

1. **Retrait du `SubscriptionCreationService.createTrialSubscription` côté client pour le flow pharmacie.**
   - Raison : le trial doit être 100% accroché au write path canonique backend-owned. Le service Flutter actuel écrit dans `subscriptions/{id}` depuis le client alors que `firestore.rules` rend cette collection backend-only. Bruyant et fragile par construction — ne doit plus porter de logique métier.
   - Le call dans [pharmapp_unified/lib/screens/auth/unified_registration_screen.dart:891](../../pharmapp_unified/lib/screens/auth/unified_registration_screen.dart#L891) (`SubscriptionCreationService.createTrialSubscription(...)` après signUp pharmacy) est retiré pour `UserType.pharmacy`. Courier / admin restent sur leur flow legacy (out of scope Sprint 3).

2. **`createPharmacyRegistration` (Sprint 2A.3) devient le seul point d'initialisation trial à l'inscription pharmacie.**
   - **Pays non mandatory** : trial démarre immédiatement. Flat fields sur `pharmacies/{uid}` :
     - `hasActiveSubscription = true`
     - `subscriptionStatus = 'trial'`
     - `subscriptionStartDate = serverTimestamp() (now)`
     - `subscriptionEndDate = now + 30 days`
   - **Pays mandatory + licence fournie** : licence init à `licenseStatus = 'pending_verification'` (déjà géré 2A.3) ET subscription init à :
     - `hasActiveSubscription = false`
     - `subscriptionStatus = 'trial_pending_license'`
     - Pas de `subscriptionStartDate` / `subscriptionEndDate` (trial pas démarré).
   - **Pays mandatory sans licence** : déjà géré par 2A.3 — `LICENSE_REQUIRED` signal, pas d'inscription.

3. **Helper backend `startTrialForPharmacy` transactionnel et idempotent.**
   - Signature : `async function startTrialForPharmacy(db, uid, { trialDurationDays = 30 })`.
   - Idempotence : si `pharmacies/{uid}.subscriptionStatus` est déjà `'trial'` ou `'active'`, retourne `{ started: false, reason: 'already_active' }` sans modifier. Re-verify après rejection, double clic admin, retry callable, ou correction après rejet ne doivent JAMAIS recréer ni rallonger le trial.
   - Transactionnel : Firestore `runTransaction` lecture pharmacy → écriture flat fields, pour éviter race conditions sur double-verify concurrent.
   - **Si trial existe déjà** : pas de mutation. Le 30j initial reste autoritaire (verrou produit : pas d'extension).

4. **`adminVerifyPharmacyLicense` (Sprint 2a) appelle `startTrialForPharmacy` à la transition `licenseStatus → 'verified'`.**
   - Uniquement sur `action === 'verify'` (pas sur `reject` / `correction_needed`).
   - L'appel se fait dans la même transaction que la mutation license, ou immédiatement après commit (à trancher par l'explorer selon faisabilité).
   - Idempotence du helper garantit qu'une 2e verify (après une rejection puis re-soumission) ne crée pas de 2e trial : la pharmacie n'a droit qu'à un seul trial dans sa vie.

5. **`subscriptions/{id}` collection reste backend-only.**
   - Si l'explorer trouve que cette collection est conservée pour audit historique, elle reste backend-only avec `allow read` restreint et `allow write: if false` (déjà en place dans `firestore.rules`).
   - **La source runtime pour gates et rules reste les flat fields `pharmacies/{uid}.subscriptionStatus` + `subscriptionEndDate`**, parce que `hasActiveSubscription()` les lit déjà (firestore.rules:9-22).

6. **Le nouveau statut `'trial_pending_license'` ne doit PAS matcher `hasActiveSubscription()`.**
   - La rule actuelle lit `subscriptionStatus == 'active' || subscriptionStatus == 'trial'`. Conceptuellement OK puisque `'trial_pending_license'` n'est ni l'un ni l'autre — la pharmacie est correctement gatée hors marketplace.
   - **Test rules emulator obligatoire** : pharmacie avec `subscriptionStatus = 'trial_pending_license'` → `canCreateInventory` et `canCreateProposal` retournent false (proxy via `hasActiveSubscription()`).
   - Aucun changement de rule nécessaire si ce test passe. Si l'explorer trouve une incohérence, fixer la rule (pas le statut).

7. **Périmètre Flutter UI restreint à 2B.2a + minimum subscription_screen.**
   - `subscription_screen.dart` doit afficher le bon statut runtime : `trial`, `trial_pending_license`, `active`, `expired`. Pas de nouveau composant — extension d'affichage seulement.
   - Aucun changement aux registration / profile screens (déjà couverts 2B.2a).
   - Aucun marketplace consumer ne doit être retouché.

8. **Pas de split de sprint.** Le scope reste single Sprint 3.

## Résultat attendu

L'onboarding pharmacie a un état subscription fiable :

- `trial_pending_license` si licence obligatoire non vérifiée ;
- `trial` actif 30 jours après inscription ou validation selon pays ;
- expiration claire ;
- source backend autoritaire.

## Périmètre autorisé

- `functions/src/**` pour création/activation trial et tests.
- `shared/lib/models/**`, `shared/lib/services/**` pour lecture status si nécessaire.
- `pharmapp_unified/lib/**` pour affichage onboarding/subscription status.
- `admin_panel/lib/**` si affichage/admin action nécessaire.
- `firestore.rules` uniquement si enforcement subscription existant doit être ajusté.
- docs actives.

## Périmètre interdit

- Pas de paiement réel subscription.
- Pas de pricing refactor.
- Pas de Bloc 2 exchange mode.
- Pas de refactor wallet.
- Pas de migration destructive.

## Explorer read-only

Tâches :

1. Vérifier les fonctions subscription existantes.
2. Confirmer l'absence ou présence de `createTrialSubscription`.
3. Inspecter les champs subscription lus par :
   - inventory ;
   - proposals ;
   - medicine requests ;
   - UI subscription.
4. Inspecter la sortie de Sprint 2 F-LICENSE, incluant 2A.3
   registration backend-owned et 2B UI.
5. Proposer le modèle d'état trial.
6. Identifier la fonction d'activation à appeler quand licence devient `verified`.
7. Définir tests.

Stop conditions :

- Sprint 2A.3 ou Sprint 2B non terminé ;
- modèle subscription actuel incompatible sans refactor large ;
- décision produit manquante sur durée trial ou accès pendant pending license.

## Writer

Implémenter :

1. Helper backend `startTrialForPharmacy` idempotent.
2. Déclenchement à inscription si pays non mandatory.
3. Déclenchement à vérification licence si mandatory.
4. Statut `trial_pending_license` si mandatory non vérifié.
5. UI status clair.
6. Tests.
7. Docs.

## Critères de done

- Nouvelle pharmacie pays non mandatory obtient trial 30j à inscription.
- Nouvelle pharmacie pays mandatory obtient trial 30j à validation licence.
- Validation tardive donne bien 30j complets.
- Fonction idempotente : pas de double trial.
- Gates inventory/proposal/request respectent subscription + license.
- Docs à jour.

## Validation minimale

- `cd functions && npm run build && npm run lint && npm test`
- `cd pharmapp_unified && flutter analyze`
- tests ciblés si disponibles
