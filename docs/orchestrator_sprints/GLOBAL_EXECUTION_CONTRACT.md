# Global Execution Contract — PharmApp Closure Program

À appliquer à tous les sprints de ce dossier.

## Source de vérité

La source de vérité courante du projet est `CLAUDE.md` à la racine du repo.

Les documents historiques peuvent être consultés, mais ne doivent jamais contredire `CLAUDE.md` dans une décision d'implémentation. Si un document ancien contredit `CLAUDE.md`, le document ancien doit être déplacé vers `docs/archive/` ou réduit à un stub.

## Décisions produit verrouillées

1. Licence pharmacie obligatoire pilotée par `system_config/main.countries.{countryCode}`.
2. Activation rétroactive d'une licence obligatoire avec délai de grâce de 30 jours.
3. Pays avec licence obligatoire : accès limité tant que `licenseStatus != verified`, sauf période de grâce active.
4. Trial subscription :
   - pays sans licence obligatoire : démarre à l'inscription ;
   - pays avec licence obligatoire : démarre à `licenseStatus = verified` ;
   - 30 jours complets garantis après vérification, même si l'admin valide tard.
5. Medicine Requests Bloc 2 P2 :
   - MVP = `purchase` ou `exchange` uniquement ;
   - pas de `either` ;
   - pas de soulte monétaire ;
   - échange = barter pur ;
   - frais coursier conservés en split 50/50.

Ces décisions ne doivent pas être rouvertes par un sprint sauf demande explicite du propriétaire produit.

## Mode d'exécution obligatoire

- Exécuter via orchestrator, pas en thread principal.
- Utiliser un agent explorer read-only avant tout edit.
- Pour tout sprint qui touche un modèle métier, une règle d'autorisation, Firestore rules, auth, paiement, subscription, ou un flux marketplace, l'explorer doit inclure un **Solution Architect Refactoring Challenge** avant de conclure `SAFE TO PROCEED`.
- Utiliser un seul writer.
- Aucun writer parallèle.
- Le writer ne commence que si l'explorer répond explicitement `SAFE TO PROCEED = YES`.
- Si `SAFE TO PROCEED = NO`, aucun edit.

## Solution Architect Refactoring Challenge

Avant tout sprint fonctionnel ou de sécurité, l'explorer doit challenger l'architecture existante comme un architecte solution, pas seulement chercher le plus petit patch.

Le challenge doit répondre explicitement :

1. `Can we extend the existing module safely?`
2. `Would a refactor reduce risk before adding the feature?`
3. `What duplicated source of truth exists today?`
4. `What canonical model or field should own the behavior?`
5. `What read paths and write paths must be switched together?`
6. `What migration/backfill is required?`
7. `What should explicitly NOT be refactored in this sprint?`

Règles :

- Si le système existant peut être étendu proprement, ne pas créer de module parallèle.
- Si une feature exige un modèle canonique absent, créer d'abord le refactor minimal qui établit ce modèle.
- Si un refactor est nécessaire mais dépasse le sprint, répondre `SAFE TO PROCEED = NO` et proposer un sprint de refactor dédié.
- Toute introduction d'un champ canonique doit couvrir write path, read path, règles d'autorisation, tests, et documentation.
- Toute dette volontairement conservée doit être nommée dans `Residual risks`.

## Règles de documentation obligatoires

Chaque sprint qui modifie le comportement doit mettre à jour les docs actives :

- `CLAUDE.md` : état du sprint, ce qui est livré, ce qui reste à faire.
- `docs/ACTIVE_DOCS.md` : si créé ou affecté par le sprint.
- Le contrat du sprint exécuté : ajouter une section de statut final ou pointer vers le rapport du run.
- Toute doc active touchée par le changement.

Interdiction de marquer un sprint terminé si :

- une doc active pointe encore vers `pharmacy_app/` ou `courier_app/` comme cible d'exécution ;
- une doc active annonce une feature livrée alors qu'elle reste partielle ;
- les commandes de validation dans la doc ne correspondent pas au repo courant.

## Format obligatoire du rapport explorer

Chaque explorer répond exactement avec :

1. `Current state`
2. `Relevant code paths`
3. `Relevant documentation paths`
4. `Risk assessment`
5. `Solution Architect Refactoring Challenge`
6. `Minimal implementation plan`
7. `Documentation update plan`
8. `SAFE TO PROCEED = YES/NO`
9. `Triggered stop condition`

Si aucune stop condition n'est déclenchée : `Triggered stop condition: NONE`.

## Format obligatoire du rapport writer

Chaque writer répond exactement avec :

1. `Files changed`
2. `Behavior changed`
3. `Security / authorization impact`
4. `Migration / backfill impact`
5. `Documentation updated`
6. `Tests run / results`
7. `Residual risks`
8. `Next sprint readiness`

## Stop conditions globales

Répondre `SAFE TO PROCEED = NO` si :

- le sprint nécessite une décision produit non verrouillée ;
- le patch exige un refactor hors périmètre ;
- une règle de sécurité ne peut pas être appliquée côté backend ou rules ;
- la doc active est trop contradictoire pour définir l'état réel ;
- le sprint nécessite un deploy prod ou une action destructive non explicitement autorisée ;
- les tests de validation minimaux ne peuvent pas être lancés ni remplacés par une justification claire.

## Validation minimale globale

Selon les fichiers touchés :

- `functions/` : `npm run build`, `npm run lint`, `npm test`
- `shared/` : `dart analyze`, tests ciblés si disponibles
- `pharmapp_unified/` : `flutter analyze`, tests ciblés si disponibles
- `admin_panel/` : `flutter analyze`, tests ciblés si disponibles
- `firestore.rules` / `firestore.indexes.json` : validation syntaxique/config et revue manuelle obligatoire

Si `flutter analyze` timeout, le rapport final doit l'indiquer explicitement et fournir la commande exacte à relancer.
