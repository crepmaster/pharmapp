# Sprint 2 — F-LICENSE: Country-Configurable Pharmacy License Gate

À exécuter dans l'orchestrator uniquement.

## Objectif

Mettre en place la licence pharmacie obligatoire configurable par pays, pilotée par super admin, avec accès limité tant que la licence n'est pas validée.

## Décisions verrouillées

- Source de vérité : `system_config/main.countries.{countryCode}`.
- Pas de hardcode Ghana comme stratégie principale.
- Pays existants activés rétroactivement avec délai de grâce de 30 jours.
- Accès limité pour licence non vérifiée hors période de grâce.
- Validation function-based dès ce sprint.

## Modèle cible country

Chaque pays peut porter :

- `licenseRequired: bool`
- `licenseLabel: string`
- `licenseHelpText: string`
- `licenseVerificationRequired: bool`
- `licenseFormatRegex: string?`
- `licenseDocumentRequired: bool`
- `licenseGracePeriodDays: number` default `30`

## Modèle cible pharmacy

- `licenseNumber: string?`
- `licenseCountryCode: string?`
- `licenseStatus: not_required | pending_verification | verified | rejected | correction_needed | expired | grace_period`
- `licenseExpiryDate: timestamp?`
- `licenseDocumentUrl: string?`
- `licenseVerifiedBy: uid?`
- `licenseVerifiedAt: timestamp?`
- `licenseRejectionReason: string?`
- `licenseGraceEndsAt: timestamp?`

## Gate d'accès

Pour un pays `licenseRequired = true`, une pharmacie non `verified` et hors grâce :

Autorisé :

- créer/éditer profil ;
- préparer inventaire privé ;
- uploader/corriger licence.

Interdit :

- publier inventaire dans marketplace ;
- créer `exchange_proposals` ;
- accepter une proposition ;
- créer `medicine_requests` ;
- soumettre/accept medicine request offer ;
- apparaître dans marketplace public.

## Périmètre autorisé

- `functions/src/**` uniquement pour fonctions license/profile/gate nécessaires.
- `shared/lib/models/**`, `shared/lib/services/**` pour master data et status license.
- `pharmapp_unified/lib/screens/auth/**`, profile/license UI, inventory publish gate si nécessaire.
- `admin_panel/lib/**` pour country config et workflow verification.
- `firestore.rules` pour enforcement minimal et backend-only writes sensibles.
- `firestore.indexes.json` si requêtes admin nécessaires.
- tests ciblés.
- docs actives.

## Périmètre interdit

- Pas de Bloc 2 exchange mode.
- Pas de trial subscription.
- Pas de refactor auth global non nécessaire.
- Pas de refactor money.
- Pas de deploy prod.

## Explorer read-only

Tâches :

1. Inspecter `MasterDataSnapshot`, `MasterDataService`, `SystemConfig` admin.
2. Inspecter l'inscription pharmacie actuelle.
3. Inspecter `pharmacies` rules et callables auth/profile existantes.
4. Identifier où appliquer le gate marketplace/runtime.
5. Vérifier si Storage upload existe déjà pour documents ; sinon proposer MVP minimal.
6. Définir la stratégie function-based pour :
   - validation inscription ;
   - update license ;
   - verify/reject license admin ;
   - backfill grace period.
7. Définir les tests minimaux.
8. Répondre `SAFE TO PROCEED`.

Stop conditions :

- impossible d'appliquer le gate backend sans refactor massif ;
- absence d'un chemin fiable pour lire `system_config/main`;
- nécessité d'intégrer une API registre national ;
- upload document exige une architecture Storage trop large pour ce sprint.

## Writer

Implémenter par lots sûrs :

1. Master data country license fields.
2. Admin panel country toggle + labels.
3. Pharmacy registration license fields conditionnels.
4. Backend validation / functions.
5. Admin verification workflow.
6. Runtime gates sur marketplace/actions sensibles.
7. Backfill script/report grace period.
8. Docs.

## Critères de done

- Super admin peut configurer license required par pays.
- App mobile rend la licence obligatoire selon config.
- Backend refuse la création/update incohérente.
- Pharmacie non vérifiée est limitée.
- Backfill grace period existe ou rapport de migration existe.
- Admin peut vérifier/rejeter.
- Ghana peut être activé sans code change.
- Docs actives à jour.

## Validation minimale

- `cd functions && npm run build && npm run lint && npm test`
- `cd shared && dart analyze`
- `cd admin_panel && flutter analyze`
- `cd pharmapp_unified && flutter analyze`
- tests ciblés license si ajoutés

