# Sprint 2A.3 — TD-LICENSE-REGISTRATION-OWNED

À exécuter dans l'orchestrator uniquement, **après Sprint 2A.2** et
**avant Sprint 2B**.

## Validation architecte

Décision 2026-05-13 : **Option A / alpha verrouillée**.

La création d'une pharmacie est un write path réglementaire : elle doit
être backend-owned. Le client Flutter ne doit plus créer directement
`pharmacies/{uid}` pour les comptes pharmacie.

Raison principale : `licenseRequired` est piloté par
`system_config/main.countries.{countryCode}` depuis la console super
admin. Si un super admin active `licenseRequired=true` pour un pays à
14:00:00, une inscription pharmacie à 14:00:05 doit être évaluée avec
la config serveur fraîche, pas avec un snapshot `MasterDataService`
client possiblement stale.

Décisions de verrou pré-exécution 2026-05-13 :

1. **Unknown country = deny marketplace** : si `countryCode` est absent
   sur `pharmacies/{uid}`, ou si `countryCode` n'existe pas dans
   `system_config/main.countries`, les callables marketplace doivent
   refuser l'accès (`failed-precondition`). Le modèle doit être
   fail-closed.
2. **Tests counterparty pragmatiques** : ne pas construire un harness
   complet `firebase-functions-test` pour les deux accept callables. Le
   test existant du helper doit être renommé pour refléter son vrai
   périmètre, puis ajouter au minimum 1 test ciblé par callable pour les
   branches `fromPharmacyId` / `sellerPharmacyId` manquantes.
3. **Drift guard rules** : ajouter un test léger qui lit
   `PROTECTED_LICENSE_FIELDS` côté TypeScript et vérifie que chaque champ
   est bien présent dans `firestore.rules`. Les commentaires seuls ne
   suffisent pas pour une liste de sécurité.
4. **Un seul sprint 2A.3** : exécuter Option A registration + ces
   findings 2A.2 résiduels dans le même sprint, sauf si l'explorer
   constate que le refactor auth/session dépasse le scope. Dans ce cas,
   stop et proposer `2A.3.1`.

## Origine

Sprint 2A + 2A.1 + 2A.2 ont livré l'enforcement backend, les rules
deny-on-create/update et les tests, mais le flow actif de l'app unifiée
reste :

```text
Flutter UnifiedAuthService.signUp
  -> Firebase Auth client SDK
  -> transaction Firestore client users/{uid} + pharmacies/{uid}
```

Ce flow contourne l'initialisation licence backend de
`createPharmacyUser` et laisse une pharmacie mandatory naître sans
`licenseStatus`. Le gate marketplace fail-closed limite le risque
sécurité, mais l'architecture n'est pas canonique et complique Sprint 2B
et Sprint 3 Trial.

La revue architecte post-validation 2A.2 a aussi conservé 3 findings
résiduels à fermer ici :

- `F2A3-FINDING-1` : unknown country actuellement traité comme allow par
  `licenseGate.ts` ; doit devenir deny.
- `F2A3-FINDING-2` : le fichier
  `acceptCallables-license-gate.test.ts` teste le helper, pas les
  callables ; corriger le nom/claim et ajouter deux tests ciblés.
- `F2A3-FINDING-3` : `PROTECTED_LICENSE_FIELDS` est dupliqué dans
  `firestore.rules` ; ajouter un drift guard test.

## Objectif

Migrer l'inscription pharmacie vers un endpoint backend unique qui :

1. crée le compte Firebase Auth ;
2. crée `users/{uid}` et `pharmacies/{uid}` atomiquement autant que
   possible ;
3. lit `system_config/main.countries.{countryCode}.licenseRequired` au
   moment serveur du create ;
4. initialise les champs licence selon cette config fraîche ;
5. nettoie l'utilisateur Auth si l'écriture Firestore échoue ;
6. retourne à Flutter un résultat permettant d'ouvrir une session
   proprement après inscription ;
7. expose à Flutter une API d'inscription compatible avec Sprint 2B.

## Contrat canonique

Nom cible du nouveau callable : `createPharmacyRegistration`.

Le nom peut être challengé par l'explorer si le codebase impose une
convention différente, mais le contrat 2B doit référencer le même nom à
la fin du sprint.

Flow cible :

```text
Flutter UnifiedAuthService.signUp(userType: pharmacy)
  -> callable createPharmacyRegistration
  -> Firebase Admin Auth createUser
  -> Firestore users/{uid} + pharmacies/{uid}
  -> licenseStatus initialisé depuis system_config/main.countries
```

Les flows courier/admin ne sont pas refactorés dans ce sprint sauf si
une petite extraction est nécessaire pour ne pas dupliquer la logique
d'auth commune.

## Comportement licence attendu

### Registration

Pour `country.licenseRequired != true` :

- `licenseStatus = not_required`
- `licenseCountryCode = countryCode`
- aucune licence demandée par le backend
- inscription non mandatory non-régressée

Pour `country.licenseRequired == true` :

- le backend lit la config pays au moment du create ;
- si `licenseNumber` est fourni et passe `licenseFormatRegex` si
  configurée : `licenseStatus = pending_verification` ;
- si `licenseNumber` est absent : retourner une erreur structurée
  `failed-precondition` / `LICENSE_REQUIRED` pour permettre à l'UI de
  demander la licence immédiatement ;
- aucune pharmacie mandatory ne doit naître sans statut licence
  initialisé ;
- aucune écriture client directe de champ licence n'est autorisée.

Le backend est la source de vérité. Le snapshot client
`MasterDataCountry.licenseRequired` peut être utilisé pour pré-afficher
le champ en Sprint 2B, mais il ne décide jamais l'enforcement.

### Marketplace gate

Le gate marketplace doit appliquer :

- `countryCode` absent sur `pharmacies/{uid}` -> deny ;
- `countryCode` non présent dans `system_config/main.countries` -> deny ;
- `system_config/main` absent ou sans map `countries` -> deny ;
- `country.licenseRequired != true` -> allow ;
- `country.licenseRequired == true` + `licenseStatus=verified` -> allow ;
- `country.licenseRequired == true` + `licenseStatus=grace_period` et
  `licenseGraceEndsAt` futur -> allow ;
- tous les autres statuts ou champs absents -> deny.

Ce changement peut impacter des pharmacies historiques dont le pays n'a
pas encore été ajouté à `system_config/main.countries`. Le sprint ne doit
faire aucune mutation prod, mais doit documenter un audit dry-run à
exécuter avant deploy.

## Périmètre autorisé

- `functions/src/auth/unified-auth-functions.ts` ou nouveau fichier
  dédié `functions/src/createPharmacyRegistration.ts`
- `functions/src/shared/auth/unified-auth-service.ts`
- `functions/src/lib/licenseGate.ts`
- `functions/src/index.ts`
- tests backend sous `functions/src/__tests__/**`
- `shared/lib/services/unified_auth_service.dart`
- `pharmapp_unified/lib/screens/auth/unified_registration_screen.dart`
  strictement pour l'adaptation minimale à la nouvelle signature si
  nécessaire ; pas de design UI licence complet
- `firestore.rules` uniquement si l'explorer conclut que le client create
  de `pharmacies/{uid}` doit être totalement fermé pour les pharmacies
- scripts read-only sous `functions/scripts/**` ou `scripts/**` si
  l'explorer juge utile de documenter un audit unknown-country local/dry-run
- docs actives : `CLAUDE.md`, `docs/ACTIVE_DOCS.md`,
  `SPRINT_2B_LICENSE_UI_TASK.md`, ce contrat

## Périmètre interdit

- Pas de UI complète licence : toggle pays, écran review admin, profil
  licence, correction UX = Sprint 2B.
- Pas de marketplace visibility reads = Sprint 2B.
- Pas de Trial subscription = Sprint 3.
- Pas de Bloc 2 exchange mode = Sprint 4.
- Pas de migration destructive et pas de deploy prod.
- Pas de refactor global de tous les rôles auth si une migration
  pharmacie ciblée suffit.

## Solution Architect Refactoring Challenge

L'explorer doit répondre explicitement :

1. Peut-on étendre `UnifiedAuthService.createPharmacyUser` backend sans
   créer un second modèle auth concurrent ?
2. Le nouveau endpoint doit-il remplacer l'ancien HTTP
   `createPharmacyUser`, le déléguer, ou coexister temporairement ?
3. Quels champs exacts du `profileData` Flutter sont nécessaires pour
   créer `users/{uid}` et `pharmacies/{uid}` sans perte fonctionnelle ?
4. Quel niveau d'atomicité est réaliste entre Firebase Auth et Firestore,
   et quel cleanup anti-orphan est obligatoire ?
5. Les rules doivent-elles fermer complètement `allow create` client sur
   `pharmacies/{uid}` pour les pharmacies, ou le deny-on-license-fields
   existant suffit-il comme transition ?
6. Comment la réponse d'erreur backend permet-elle à Sprint 2B d'afficher
   une demande licence immédiate si le snapshot client était stale ?
7. Après création Auth par Admin SDK, comment le client est-il connecté :
   custom token retourné par le backend, ou
   `signInWithEmailAndPassword` côté Flutter après succès ? Justifier le
   choix en termes de sécurité, simplicité et UX.
8. Quels tests prouvent que le flag `licenseRequired` est lu serveur au
   moment du create ?
9. Quel est l'impact de passer unknown-country de allow à deny sur les
   pharmacies existantes ? Quel audit dry-run faut-il documenter ?
10. Peut-on tester les branches missing-counterparty sans harness lourd
    tout en évitant une fausse couverture ?
11. Comment garder `PROTECTED_LICENSE_FIELDS` et `firestore.rules`
    alignés sans générer automatiquement les rules ?

Décision finale obligatoire :

```text
Decision: EXTEND | REFACTOR_FIRST | STOP
```

## Explorer read-only

1. Lire `shared/lib/services/unified_auth_service.dart`.
2. Lire `functions/src/auth/unified-auth-functions.ts`.
3. Lire `functions/src/shared/auth/unified-auth-service.ts`.
4. Lire `firestore.rules` pour confirmer le create path actuel.
5. Lire les tests auth/functions existants et identifier le style de mock.
6. Lire le contrat 2B et vérifier les références au callable cible.
7. Répondre `SAFE TO PROCEED`.

Stop conditions :

- impossibilité de créer un compte Auth via Admin SDK avec cleanup
  fiable ;
- divergence majeure entre les champs écrits aujourd'hui par Flutter et
  ceux attendus par le backend ;
- besoin d'une refonte auth multi-rôles large pour migrer seulement les
  pharmacies ;
- tests backend impossibles à écrire ou à lancer.
- unknown-country fail-closed risque de bloquer un pays actif sans audit
  ou sans décision explicite ;
- le refactor auth/session dépasse un sprint M-L et exige une refonte
  multi-rôles.

## Writer

Implémenter par lots sûrs :

### Lot A — Unknown-country fail-closed

1. Modifier `evaluateLicenseGate` / `assertLicenseAllowsMarketplace`
   pour refuser `countryCode` absent, pays absent de
   `system_config/main.countries`, ou config système absente.
2. Ajouter tests unitaires :
   - missing `countryCode` -> deny ;
   - unknown `countryCode` -> deny ;
   - `system_config/main` absent/sans `countries` -> deny ;
   - pays connu `licenseRequired=false` -> allow conservé.
3. Documenter l'impact opérationnel et l'audit dry-run pré-deploy.

### Lot B — Counterparty tests honesty

1. Renommer `acceptCallables-license-gate.test.ts` si nécessaire pour
   refléter qu'il teste le helper, pas les callables.
2. Ajouter au minimum 1 test ciblé par callable :
   - `acceptExchangeProposal` avec proposal sans `fromPharmacyId` ->
     `failed-precondition` ;
   - `acceptMedicineRequestOffer` avec offer sans `sellerPharmacyId` ->
     `failed-precondition`.
3. Ne pas construire de full harness si ces deux branches sont testables
   proprement par mocks simples.

### Lot C — Drift guard protected license fields

1. Ajouter un test qui lit `firestore.rules` et vérifie que chaque entrée
   de `PROTECTED_LICENSE_FIELDS` est présente dans les helpers rules.
2. Le test doit échouer si un champ est ajouté côté TS sans rappel côté
   rules. Ne pas générer les rules automatiquement.

### Lot D — Backend-owned pharmacy registration

1. **Backend registration service** : extraire ou étendre le service
   backend pour créer une pharmacie avec anti-orphan protection,
   conservation des champs existants, wallet init et profil `users/{uid}`
   si requis par l'app.
2. **Callable `createPharmacyRegistration`** : endpoint callable
   region `europe-west1`, validation input, lecture fraîche de
   `system_config/main.countries`, init licence, erreurs structurées,
   stratégie de session client documentée.
3. **Compat ancien HTTP** : décider si `createPharmacyUser` délègue au
   nouveau service ou reste legacy. Documenter explicitement le statut
   legacy si conservé.
4. **Flutter service** : `UnifiedAuthService.signUp` route les
   inscriptions `UserType.pharmacy` vers le callable backend. Les rôles
   courier/admin gardent le comportement existant sauf décision
   explorer contraire.
5. **Registration screen minimal** : adapter l'appel si nécessaire pour
   passer `countryCode`, `licenseNumber` optionnel et gérer
   `LICENSE_REQUIRED`. Ne pas construire l'UI finale licence.
6. **Firestore rules** : si validé, refuser le client create direct de
   `pharmacies/{uid}` pour forcer le path canonique. Sinon documenter la
   transition et conserver les rules deny-on-license-fields.
7. **Tests registration** :
   - pays non mandatory -> create OK + `licenseStatus=not_required` ;
   - pays mandatory + licence valide -> create OK +
     `pending_verification` ;
   - pays mandatory + licence absente -> erreur `LICENSE_REQUIRED` et
     aucun orphan Auth/Firestore ;
   - regex invalid -> refus ;
   - flip config pays juste avant create -> nouvelle config appliquée ;
   - Firestore failure -> Auth cleanup tenté ;
   - le client peut obtenir une session valide après create selon la
     stratégie retenue ;
   - Flutter service appelle le callable pour `UserType.pharmacy` et ne
     write pas `pharmacies/{uid}` direct dans ce branch.
8. **Docs** : mettre à jour `CLAUDE.md`, `ACTIVE_DOCS.md`, 2B et ce
   contrat.

## Critères de done

- `UnifiedAuthService.signUp` Flutter n'écrit plus directement
  `pharmacies/{uid}` pour `UserType.pharmacy`.
- Le write path canonique pharmacie est backend-owned.
- `licenseRequired` est lu côté serveur au create.
- Une pharmacie mandatory ne peut pas naître sans `licenseStatus`
  initialisé.
- Marketplace gate fail-closed pour pays absent / inconnu.
- Tests réels couvrent les deux branches missing-counterparty.
- Drift guard protège `PROTECTED_LICENSE_FIELDS` vs `firestore.rules`.
- Le contrat 2B référence le callable réellement livré.
- Le flow post-create laisse l'utilisateur pharmacie connecté ou
  reconnectable sans étape manuelle incohérente.
- Sprint 3 peut démarrer son trial gate sur un write path canonique.
- Tests backend et analyses applicables documentés.

## Validation minimale

```bash
cd functions && npm run build
cd functions && npm run lint
cd functions && npm test
cd functions && npm run test:rules
cd shared && dart analyze
cd pharmapp_unified && flutter analyze
```

Si `flutter analyze` timeout, le rapport final doit l'indiquer avec la
commande exacte à relancer.

## Next sprint readiness

Sprint 2B ne peut démarrer que si ce sprint est `APPROVED` et finalisé.
Sprint 2B consommera le callable livré ici pour ajouter l'input licence
conditionnel, les écrans admin, le profil licence et la marketplace
visibility.
