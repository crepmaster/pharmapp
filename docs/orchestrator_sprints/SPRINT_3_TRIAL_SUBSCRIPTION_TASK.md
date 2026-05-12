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
