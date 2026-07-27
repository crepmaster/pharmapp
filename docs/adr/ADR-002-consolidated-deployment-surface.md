# ADR-002 — Consolidated deployment surface

- **Statut** : ACCEPTÉ. Décision `ADR-DEC-002-01` (§6) prise et implémentée le 2026-07-21.
- **Date** : 2026-07-21
- **Remplace** : les consignes successives données en conversation entre le 2026-07-21 et ce jour. **Ce document est désormais la seule référence** ; aucune modification ne doit être entreprise sur la base d'un message de conversation.
- **Contexte git initial** *(au moment de la rédaction, historique)* : branche `chore/deploy-integrity`, HEAD `859af425`, deux commits au-dessus de `origin/main` (`17197d9e`), non poussés ; travaux A+B et isolation outillage non committés.
- **État courant** *(2026-07-27)* : tout le travail est committé et poussé. HEAD `0779b4407b4097e9bc14c2669f3c94341d1a7688`, trois commits au-dessus de `origin/main` (`17197d9e`, inchangé). Prouvé depuis un clone indépendant (`C:\tmp\pharmapp-preflight-proof`) : installations déterministes, **preflight intégral PASS**, suite déployeur **253/253**, Firestore Rules **104/104**, CLI Firebase locale **15.24.0**, hash Functions `sha256:446d3a5dd04d6b0bd659d2d2d3a38cb262ce30db1e13978ef68297b7b6e20bdf` (recalculé à l'identique). **PR #1 ouverte, non fusionnée** (base `main`, head `chore/deploy-integrity`, MERGEABLE/CLEAN).

> ⛔ **NE PAS EXÉCUTER les commandes citées dans ce document.** Cet ADR consigne
> l'historique de ce qui a été retiré ; les commandes de déploiement Firebase /
> GCloud qu'il reproduit sont **interdites**, jamais des instructions. Seul
> `npm run deploy:staging -- preflight --project=mediexchange-staging` existe ;
> les phases `expand`, `contract` et `verify` ne sont pas implémentées.

---

## 1. Pourquoi ce document existe

Un déploiement staging du 2026-07-21 a mis en ligne des règles Firestore dont la callable dépendante n'était pas déployée, laissant staging dans un état pire qu'avant. La cause immédiate était un artefact compilé périmé ; la cause structurelle était qu'aucune barrière ne séparait « ce que je crois déployer » de « ce qui part réellement ».

Les travaux qui ont suivi ont été pilotés par instructions successives en conversation. Deux fois, une instruction s'est révélée incomplète parce qu'elle reposait sur une vue **locale** du déployeur plutôt que sur un inventaire du dépôt — provoquant du rework. Ce document gèle la surface pour que cela cesse.

**Règle méthodologique retenue** : aucune architecture n'est qualifiée de globale avant que l'inventaire du dépôt, des consommateurs, des configurations, du déploiement et de la documentation active ait été exécuté et présenté.

---

## 2. Inventaire de référence (exécuté 2026-07-21)

### 2.1 Configuration et packaging

| Élément | Valeur constatée |
|---|---|
| `firebase.json` racine | `functions.source = "functions"` ; `predeploy` = build puis `verify:exports` ; pas de `functions.ignore` (défauts Firebase) ; Functions + Firestore + émulateurs + 2 cibles Hosting |
| `pharmapp_unified/firebase.json` | *(état au moment de l'inventaire)* Firestore uniquement — **retiré depuis** par `ADR-DEC-002-01`, voir §6.0 |
| `.firebaserc` | alias `dev`/`prod`/`staging` ; **aucun alias `default`** ; cibles Hosting par projet |
| `functions/package.json` | `main = "lib/index.js"` ; **aucun `firebase-tools`** |
| `functions/package-lock.json` | byte-identique à HEAD (blob `dea3b8e3`) |
| `tools/deploy/` | lockfile dédié, `firebase-tools` épinglé `15.24.0` |
| CI versionné | **aucun** (`.github`, GitLab, Jenkins) |
| Hooks | un seul : `.husky/pre-commit` → `validate:fast` |
| `node_modules` racine | **561 fichiers / 41 paquets suivis par git** → `TD-DEP-ROOT-NODEMODULES` |

### 2.2 Surfaces exécutables

Aucun script versionné suivi ne lance `firebase deploy`, `gcloud functions deploy`, `gcloud run deploy` ni `hosting:channel:deploy`. Les occurrences restantes dans `scripts/deploy*` sont des commentaires, messages de refus ou motifs du drift-guard.

**Mais** *(au moment de l'inventaire)* `.claude/agents/pharmapp-deployer.md` était une définition d'agent versionnée, `tools: git, firebase, gcloud`, contenant `firebase deploy --only functions --project=pharmapp-prod` (`--force` inclus, projet `pharmapp-prod` inexistant). Un chemin agentique exécutable, pas de la documentation. **Fermé le 2026-07-22 (§4sexies)** : agent archivé, cinq autres agents privés de la capacité `firebase`.

### 2.3 Documentation faisant autorité

Composants opérationnels de la surface, pas de la prose :

*(État au moment de l'inventaire — tous neutralisés le 2026-07-22, §4sexies.)*

| Document | Autorité | Contournement (inventaire) |
|---|---|---|
| `CLAUDE.md` | injecté à chaque session | 4 `firebase deploy` **sans `--project`** |
| `docs/release/STAGING_WORKFLOW.md` | **autoritaire via `CLAUDE.md` l.99**, PAS via `ACTIVE_DOCS.md` (correction : il n'y est pas listé) | 5 `firebase deploy` bruts |
| `docs/guides/DEPLOYMENT_GUIDE.md` | listé dans `ACTIVE_DOCS.md` | production, CLI globale |
| `docs/release/STAGING_SETUP_FIREBASE_PROJECT.md` | actif | staging + production |
| `docs/release/SPRINT_5_E2E_CLOSURE_PLAN.md` | actif | staging |
| `README.md` | actif | installation globale Firebase, émulateur direct — **corrigé lot 1A** |

**Correction d'imprécision** : `docs/release/STAGING_SETUP_EMULATOR.md` était listé ici comme surface de contournement — **à tort**. Vérifié : **0** `firebase deploy`, usage émulateur/CLI globale en lecture seule. Ce n'est pas une surface de déploiement.

Autorité **NON VÉRIFIÉE** : `pharmapp_unified/docs/*` (les 7 restants ne prescrivent aucun déploiement — vérifié §6.0), `docs/testing/PILOT_PRE_IMPLEMENTATION_ANALYSIS_V1.md` (2 commandes descriptives, **retirées le 2026-07-22**). Les deux documents dangereux de `pharmapp_unified` sont **archivés** avec avertissement (§6.0).

Archives explicites (hors surface) : `docs/archive/**`, `CLAUDE-ARCHIVE.md`, `flutter-backup/**`.

### 2.4 Permissions opérateur

`.claude/settings.local.json` autorise historiquement des commandes Firebase/GCloud directes. Ce n'est pas un script du dépôt, mais c'est une surface de contournement opérateur réelle.

---

## 3. Décisions gelées

### Exécution sans shell ni shim

`npm` et le CLI Firebase sont des programmes JavaScript, exécutés sous le Node courant : `node <npm_execpath>`, `node <firebase.js>`. Motif : Node refuse de lancer un `.cmd`/`.bat` sans shell depuis le correctif CVE-2024-27980, rendant « résoudre `npm.cmd` » et « jamais `shell: true` » mutuellement incompatibles sur Windows. Ne lancer ni l'un ni l'autre dissout la contradiction.

- `REQ-B-EXEC-01` — `npm_execpath` présent, absolu, existant, entrée JavaScript ; sinon `NPM_RUNTIME_UNRESOLVED`. Lancement direct de `deploy-staging.mjs` refusé.
- `REQ-B-EXEC-02` — CLI Firebase issu d'un lockfile du dépôt, jamais global.
- `REQ-B-EXEC-03` — arguments en tableau, jamais de chaîne jointe.
- `REQ-B-EXEC-04` — timeout par commande, sortie bornée et rédigée, **ligne de commande rédigée elle aussi**.
- `REQ-B-EXEC-05` — le timeout termine tout l'arbre descendant.

**Frontière du shell** : le déployeur n'en crée aucun. npm peut en utiliser un pour les scripts déclarés dans `package.json` ; ceux-ci sont constants et versionnés, sans donnée utilisateur ni secret interpolé. `test:rules` imbrique une commande de cette nature et est audité comme telle.

**Note technique mesurée** : sous Windows, un descendant `detached: false` meurt avec son parent (job object libuv) ; un descendant `detached: true` **survit**. C'est le cas qui a laissé le port 8080 occupé. L'atteindre exige de tuer l'arbre pendant que le parent vit encore — d'où un runner asynchrone, `spawnSync` tuant le fils avant qu'on reprenne la main.

### Isolation outillage / runtime

- `REQ-DEP-ISO-01` — les dépendances d'outillage ne modifient jamais le graphe runtime Functions. Responsable : `tools/deploy/` + lockfile dédié.
- `REQ-DEP-ISO-02` — `tools/deploy/node_modules` ignoré, aucun descendant suivi.

**Motif mesuré, non théorique** : `firebase-tools` placé dans `functions/devDependencies` a re-résolu le graphe expédié à Cloud Functions — `protobufjs` 7.5.4 → 7.6.5, 7 autres paquets déplacés, `@protobufjs/inquire` supprimé. Un outil de livraison modifiait le code déployé.

### Point d'entrée unique

- `REQ-CLI-SINGLE-01` — **portée : scripts versionnés uniquement**. Aucun script ne déclenche de déploiement. *Correctement implémenté dans ce périmètre.*
- `REQ-CLI-LOCAL-01` — usages Firebase non mutants via CLI local verrouillé et **allowlist de capacités** (`serve-functions`, `test-rules`). Aucun passthrough : un wrapper générique redeviendrait le contournement qu'on vient de retirer.
- `REQ-WRAP-PATH-01` — résolution ancrée sur `import.meta.url`, cwd fixé explicitement.

### Phases, jamais un bouton unique

Firebase ne bascule pas Functions, Rules et Hosting atomiquement. La compatibilité est un jugement métier qu'un script ne peut pas inférer : l'opérateur la déclare.

```
preflight   aucune mutation
expand      additif    (hors périmètre de ce lot)
contract    restrictif (hors périmètre de ce lot)
verify      lecture    (hors périmètre de ce lot)
```

- `REQ-A-07` — une phase fermée ne doit jamais suggérer de contournement.

### Verrou mono-instance

`REQ-B-LOCK-01..05` — création atomique `wx`, identité complète (UUID/phase/pid/hostname/SHA/timestamp), libération par UUID seulement, **un échec de libération interdit d'annoncer un succès**, un crash conserve le verrou (un verrou abandonné est une question pour un humain, pas une minuterie).

---

## 4. Exigences décidées et état d'implémentation

| ID | Exigence | État |
|---|---|---|
| `REQ-DEP-SURFACE-01` | Aucun code, configuration Firebase alternative, agent autonome, document autoritatif ou commande sans projet explicite ne permet de contourner le point d'entrée approuvé. Preuve : balayage conjoint scripts + manifests + `firebase.json` + `.claude/agents` + `CLAUDE.md` + `ACTIVE_DOCS.md` + docs actives. | **SATISFAIT ET VÉRIFIÉ le 2026-07-22 (§4sexies)**. Les 3 catégories restantes fermées : agent archivé + 5 agents sans capacité `firebase` ; `CLAUDE.md` et 5 docs actifs neutralisés ; garde dynamique `deploySurface.test.mjs`. Antérieurement : config alternative (lot 1A) et branche obsolète (lot 1B). |
| `REQ-CONFIG-SINGLE-01` | Une seule configuration Firebase peut cibler un projet distant. | **IMPLÉMENTÉ ET VÉRIFIÉ** (§6.0), garde mutation-testé |
| `REQ-BRANCH-SURFACE-01` | Une branche distante obsolète ne doit pas conserver une surface de déploiement incompatible avec la branche canonique. Preuve : inventaire des branches distantes, branche par défaut, configurations Firebase par branche durable, protections / PR / consommateurs. | **SATISFAIT ET VÉRIFIÉ le 2026-07-22** — voir §4bis |
| `REQ-DOC-STATE-01` | Tout document est soit listé dans `ACTIVE_DOCS.md`, soit physiquement sous `docs/archive/`. Le troisième état est interdit. | Partiellement traité : les 2 documents dangereux sont archivés avec avertissement (§6.0) ; la règle générale reste à instaurer (lot 6) |
| `REQ-PROJECT-EXPLICIT-01` | Toute commande pouvant joindre Firebase fixe un projet autorisé. Motif : `.firebaserc` n'a pas d'alias `default`, la cible dépend du dernier `firebase use`, état non versionné, par machine. | **SATISFAIT le 2026-07-22** — wrapper `--project=demo-pharmapp` (§4quater) + env strip `GCLOUD_PROJECT` ; agent déployeur archivé et docs actifs neutralisés (§4sexies), donc plus aucune commande sans projet dans une surface active ; la seule commande exposée est `npm run deploy:staging -- preflight --project=mediexchange-staging`, garde `deploySurface.test.mjs`. |
| `REQ-C-FB-01` | Après `npm ci`, preflight exige le CLI local et refuse son absence. | **SATISFAIT ET VÉRIFIÉ le 2026-07-22** — voir §4ter |
| `REQ-PREFLIGHT-INSTALL-01` | Installation déterministe depuis les lockfiles : `npm ci --prefix functions` **et** `npm ci --prefix tools/deploy`. | **SATISFAIT ET VÉRIFIÉ le 2026-07-22** — voir §4ter |
| `REQ-PREFLIGHT-RULES-01` | `test:rules` exécuté dans le preflight, via le wrapper fermé et la CLI verrouillée. | **SATISFAIT ET VÉRIFIÉ le 2026-07-22** — voir §4ter |
| `REQ-PREFLIGHT-HASH-01` | Hash déterministe **et reproductible** de l'artefact réellement packagé. | **RÉFUTÉ le 2026-07-27 puis CORRIGÉ** (§4septies) — le hash capturait `firestore-debug.log`, non reproductible entre runs ; corrigé sur les deux frontières (packaging + cwd Rules isolé). **Nouvelle preuve inter-clones due** avant de le déclarer re-satisfait. |
| `REQ-PREFLIGHT-DRIFT-01` | Second contrôle git après build/tests : une modification concurrente postérieure au premier contrôle passe aujourd'hui. | **SATISFAIT ET VÉRIFIÉ le 2026-07-22** — voir §4quinquies |
| `REQ-CONFIG-ROOT-01` | Le déployeur lit `ROOT/firebase.json`. | **PARTIEL** — ancrage `ROOT` sur `import.meta.url` testé (« the root config is the one the deployer actually reads ») ; une configuration structurellement hostile est refusée par les vérificateurs (`checkFunctionsSource`/`checkPredeployHook`). **Reste manquant** : un test bout-en-bout qui lance le déployeur depuis un autre `cwd` avec un second `firebase.json` hostile physiquement présent. |


### 4bis. `REQ-BRANCH-SURFACE-01` — fermeture de la surface de branches (2026-07-22)

`origin/master` était la dernière branche durable portant une surface de
déploiement incompatible. Son sommet `1e9bbbf9` (2025-10-27) précédait la
centralisation : **aucun `firestore.rules` à la racine**, sa seule politique de
sécurité étant `pharmapp_unified/firestore.rules` (219 lignes, contre 657
canoniques aujourd'hui), plus deux configurations `courier_app/firebase.json`
et `pharmacy_app/firebase.json` pour des dossiers supprimés depuis. Un
déploiement depuis un checkout de cette branche n'aurait pas dégradé les
règles : il aurait posé une politique de trois générations antérieure, sans
qu'aucun garde de `main` ne puisse l'en empêcher — les gardes vivent sur `main`.

**Autorisation** : accordée explicitement par le propriétaire du produit le
2026-07-22, pour les deux références dans la même opération.

| Preuve | Résultat |
|---|---|
| `git push origin --delete master` | `- [deleted] master` |
| `git branch -d master` (jamais `-D` : git confirme lui-même la fusion) | `Deleted branch master (was 1e9bbbf9)` |
| `git ls-remote origin refs/heads/master` | aucune sortie |
| `git branch --list master` | aucune sortie |
| `git ls-remote --symref origin HEAD` | `ref: refs/heads/main` |
| `git rev-parse origin/main` | `17197d9ed7c928b62cdd49687c0baf8915de8c99`, inchangé |
| Branches distantes restantes | `refs/heads/main` uniquement |
| Branche par défaut GitHub | `main` |
| Lot 1A pendant l'opération | intact — 3 suppressions, 2 renommages, 4 modifiés, 11 non suivis ; `HEAD` toujours `859af425`, aucun commit ajouté |

**Réversibilité** : `1e9bbbf91a022a926b071b9aa99074a77ad271e9` est contenu dans
`main` ; la branche est recréable à l'identique par
`git push origin 1e9bbbf9:refs/heads/master`.

Constats préalables ayant fondé la décision (recoupés via l'API GitHub) :
`master` ancêtre de `main`, **0 commit unique**, aucune PR ouverte dans le
dépôt, aucune protection de branche (HTTP 404), aucun ruleset, aucune CI
versionnée.


### 4ter. Preflight déterministe et Rules obligatoires (2026-07-22)

Ordre effectif : contrôles Git/config → verrou → `npm ci` functions → `npm ci`
tools/deploy → résolution CLI **obligatoire** → comparaison au lockfile →
build / exports / Jest / barrière / auto-test → **Rules** → libération vérifiée.

**Environnement Firebase, isolé sur deux axes distincts** — vérifié dans
firebase-tools 15.24.0, pas supposé :

| Store | Résolution réelle | Traitement | Motif |
|---|---|---|---|
| configstore (identifiants, consentement analytics, préférences) | `XDG_CONFIG_HOME`, sinon `~/.config` | **éphémère**, `mkdtemp` sous `.deploy`, supprimé à la sortie contrôlée | une exécution ne doit pas dépendre de ce sous quoi le développeur est connecté — c'était la cause de la divergence local/sandbox, résolue depuis (voir §5) |
| binaires émulateur (~60 Mo) | `FIREBASE_EMULATORS_PATH`, sinon `~/.cache/firebase/emulators` | **persistant, repo-local** sous `.deploy/emulators` | un cache binaire n'est pas de la configuration ; le rendre éphémère re-téléchargerait à chaque run et rendrait la barrière dépendante du réseau |

Conséquence assumée : le premier run d'un checkout neuf télécharge l'émulateur une fois.

| Preuve d'acceptation | Résultat |
|---|---|
| Installation depuis `node_modules` absents | `npm ci` functions 12 s, tools/deploy 12 s, via `process.execPath` + `npm_execpath` |
| Lockfiles avant/après | **inchangés** (md5 identiques, functions et tools) |
| Arbres reconstruits | functions 445 paquets **sans** firebase-tools ; tools/deploy 475 paquets, CLI 15.24.0 |
| CLI locale absente | refus structuré `FIREBASE_CLI_NOT_LOCAL` |
| Version installée ≠ verrouillée (15.25.1 vs 15.24.0, essai réel) | refus structuré `FIREBASE_CLI_VERSION_MISMATCH` |
| CLI globale piégée **en tête du `PATH`** | jamais invoquée — le leurre ne s'exécute pas, Rules 104/104 |
| `HOME`, `USERPROFILE`, `XDG_CONFIG_HOME` pointant vers l'inexistant | Rules **104/104** malgré tout |
| Config utilisateur globale | md5 **et** mtime identiques avant/après : ni lue-modifiée, ni écrite |
| `test:rules` réellement exécuté | oui — 104/104, pas seulement planifié |
| Échec Rules bloque la suite | `gate()` refuse ; ordre prouvé : Rules avant manifeste et avant libération du verrou |
| Ports 8080 / 4400 / 4500, sandbox, processus java | libres / nettoyées / aucun |
| Staging | non contacté — aucune commande mutante, aucun projet réel |
| Suite du déployeur | **155/155** (état à la clôture de ce lot ; portée à 187/187 par le durcissement §4quater) |

**Non prouvé dans ce lot** : le preflight intégral bout-en-bout. Il refuse à
`WORKTREE_DIRTY`, ce qui est correct puisque le lot n'est pas committé — et la
barrière de propreté n'a délibérément pas été affaiblie pour le rendre
atteignable. Preuve reportée après commit poussé.

### 4quater. Durcissement isolation d'environnement + nettoyage fail-closed (2026-07-22, ACCEPTÉ)

Revue architecte en deux passes sur le lot §4ter. Cinq findings fermés, sans
rework d'architecture, **acceptés le 2026-07-22 après réexécution sandboxée
indépendante**.

| Finding | Correction | Preuve |
|---|---|---|
| Environnement non déterministe (`DEBUG` hérité, et fuite potentielle de `FIREBASE_TOKEN`, `GCLOUD_PROJECT`, ADC, `*_EMULATOR_HOST`) | `isolatedEnv` filtre par familles (insensible à la casse) puis impose config, cache, `CLOUDSDK_CONFIG` et `GOOGLE_APPLICATION_CREDENTIALS` vers un fichier inexistant | suite **187/187** et Rules **104/104** sous environnement parent hostile ; `spawnFn` injecté prouve qu'aucun secret n'atteint l'enfant |
| État enfant indéterminé `(null, null)` produisait `process.exit(null)` lu comme succès | `FIREBASE_CLI_EXIT_UNKNOWN`, `exitCode: 1` | tests comportementaux 11-12 |
| Création de sandbox non structurée (throw brut hors verdict) | `FIREBASE_SANDBOX_CREATE_FAILED`, `cleanup.attempted: false`, aucune suppression tentée | tests 13-14 |
| Handlers enfant hors `try` (child sans `on`, `on` qui lève) | traités `FIREBASE_CLI_SPAWN_FAILED` + nettoyage | tests 15-16 |
| Preuve d'intégration ne passait pas par `runIsolatedFirebase` | réécrite : vrai CLI/spawn/filesystem via `runIsolatedFirebase`, sandbox créé sous `stateDir` puis absent | test réel, cache voisin intact, profil intact |
| `serve-functions` sans projet explicite (`REQ-PROJECT-EXPLICIT-01`) | `--project=demo-pharmapp` ; aucun appelant ne peut le remplacer | assertions de plan |

Décision d'ADC ajoutée par l'architecte : supprimer `CLOUDSDK_CONFIG` ne suffit
pas (repli des libs Google sur la config gcloud globale) — il faut le rediriger
**et** pointer les Application Default Credentials vers un fichier inexistant,
pour qu'une capacité prétendument locale qui tenterait de s'authentifier échoue
bruyamment au lieu de joindre un vrai projet avec l'identité de l'opérateur.

Le `sweepOrphanSandboxes` initialement écrit a été **retiré** : les orphelins
sont acceptés dans ce lot (sous `.deploy`, uniques, jamais réutilisés, sans
credential valide, incapables de rendre un run vert), seule leur documentation
honnête est requise. Aucun sweep automatique.

### 4quinquies. Hash d'artefact + contrôle Git final (2026-07-22, ACCEPTÉ)

Deux garanties ajoutées en fin de preflight, dans l'ordre canonique :

```
build / verify:exports / Jest / barrière / auto-test / Rules
→ hash Functions
→ second contrôle Git complet
→ écriture du manifeste
→ libération vérifiée du verrou
→ succès
```

**Hash de l'artefact** — `scripts/deployArtifact.mjs`. SHA-256 sur la liste
triée `{chemin relatif, sha256(contenu)}` des fichiers **réellement admissibles
au packaging Firebase**, pas sur un tarball (dates, ordre d'archive) ni sur le
seul `lib/index.js`. La règle d'inclusion est **celle de Firebase**, lue dans
`prepareFunctionsUpload.js` : `ignore = config.functions.ignore || [node_modules,
.git]` + `[firebase-debug.log, firebase-debug.*.log, .runtimeconfig.json]`,
matching `minimatch(matchBase, dot)` sur le basename à toute profondeur. Point
clé vérifié en source : `supportGitIgnore` **n'est pas passé**, donc `.gitignore`
est ignoré et `functions/lib` **est** packagé bien qu'il soit gitignoré — c'est
précisément pourquoi le contrôle Git seul ne suffit pas et que le hash est
nécessaire. Les cinq motifs par défaut sont exactement `ALLOWED_FUNCTIONS_IGNORE`,
et `checkFunctionsIgnore` borne la config à cet allowlist sans slash, ce qui
rend le matcher de basename fidèle et suffisant.

| Preuve | Résultat |
|---|---|
| Ensemble de fichiers vs `readdirRecursive` de firebase-tools (cross-check autoritatif) | **228 = 228, 0 divergence** — inclusion identique à Firebase |
| Même contenu, répertoire absolu différent (vrai arbre) | même hash *(dans un même clone ; la reproductibilité **entre runs** a été réfutée puis corrigée — voir §4septies)* |
| mtime modifié, ordre d'énumération inversé | hash inchangé |
| Édition / ajout / suppression / **renommage** d'un fichier packagé | hash différent (le chemin fait partie de chaque enregistrement) |
| Fichier exclu (`node_modules` racine **et nesté**, `.git`, logs debug, `.runtimeconfig.json`) | hash inchangé |
| `node_modules_notes.js` (ressemble sans être exclu) | hash **différent** — le matcher ancre, ne fait pas de sous-chaîne |
| `lib/` inclus dans le hash | oui — l'artefact couvre le code gitignoré |

**Liens symboliques — durcissement 2026-07-22 (correction de prémisse).** Une
revue avait demandé de *sauter* les liens, croyant Firebase les ignorer. La
source dit l'inverse pour le chemin Functions : `prepareFunctionsUpload.js`
appelle `readdirRecursive` **sans** `ignoreSymlinks`, donc Firebase **suit** les
liens via `statSync` et empaquette leur cible (y compris hors de `functions/`).
Le drapeau `ignoreSymlinks: true` n'existe que dans `archiveDirectory.js`
(Hosting/extensions), jamais pour Functions. Prouvé par exécution du vrai
`readdirRecursive` : `link.js` et `linkdir/inside.js` inclus. Sauter les liens
aurait donc **introduit** la divergence que le hash doit interdire. Le hasher les
suit, comme Firebase — et le commentaire du code l'énonce désormais explicitement.

Seul risque résiduel réel : un **cycle** de liens ferait boucler la marche (et
`firebase deploy` lui-même). Un détecteur fail-closed l'interdit, via une **pile
des `realpath` des répertoires ancêtres de la branche courante** — et non un
ensemble global de visités, qui écraserait à tort un second alias vers une même
cible que Firebase empaquette sous les deux chemins.

| Preuve liens | Résultat |
|---|---|
| Lien vers fichier / vers répertoire | inclus ; ensemble **identique** à `readdirRecursive` |
| Deux alias vers la même cible | **les deux** inclus (pile par branche, pas de dédup global) |
| Lien sortant de `functions/` | suivi — c'est le payload que Firebase enverrait |
| Cycle direct et indirect (liens réels) | refusés `FUNCTIONS_ARTIFACT_SYMLINK_CYCLE` en **~4 ms**, aucun hash partiel, aucun manifeste |
| Terminaison sans privilège symlink | test injecté (fs factice) : refus après **2 lectures**, garde anti-boucle à 1000 non atteint |

**Contrôle Git final** — `checkNoGitDrift`, indépendant du contrôle initial,
exécuté **après tout ce qui peut toucher le worktree**. Refuse : fichier
suivi/non suivi apparu, `HEAD` déplacé même avec worktree propre, changement de
branche, HEAD détachée, et **déplacement de la référence distante** vérifié par
un **nouveau `git ls-remote`** (pas `origin/<branch>` en cache, sinon un
force-push passerait). Fail-closed : toute observation finale illisible refuse.

| Preuve | Résultat |
|---|---|
| Fichier réel injecté dans le worktree pendant un gate | détecté `GIT_DRIFT_WORKTREE`, message cite le fichier, worktree restauré |
| Commit concurrent / worktree propre, branche, détachée, remote déplacé, remote disparu, source non-`ls-remote`, champs illisibles | chacun son code de refus dédié (tests unitaires) |
| Faux positif possible ? | non — `functions/lib`, `node_modules`, `.deploy` sont gitignorés, le status final reste propre après build (vérifié) |

**Manifeste** — écrit **uniquement** après hash ET contrôle de dérive (les deux
peuvent `die` avant). `functionsArtifactHash` renseigné, `functionsVerified: true`
(build + exports + tests passés), `hostingArtifactHash: null`,
`hostingVerified: false` (Hosting hors périmètre, énoncé et non implicite). Le
verrou est libéré **après** l'écriture, jamais avant les contrôles.

**Suite : 216/216**, y compris sous environnement parent hostile. Rules réels
104/104, profil/lockfiles/cache/ports intacts, `HEAD` `859af425`.

**Limite honnête (à documenter, non un défaut)** : ce lot garantit l'identité du
payload **au moment du preflight** et l'absence de dérive Git jusqu'au contrôle
final. Il ne garantit pas seul qu'un futur déploiement enverra ce même payload —
les phases mutantes `expand`/`contract` devront **recalculer et comparer** le
hash juste avant envoi. C'est une exigence reportée à ces phases, pas une lacune
du preflight.

### 4sexies. Fermeture des surfaces agent + documentation (2026-07-22, ACCEPTÉ)

`REQ-CLI-SINGLE-01` ne couvrait que les scripts. `REQ-DEP-SURFACE-01` restait
réfuté par trois chemins non-scripts : un agent invocable, `CLAUDE.md` injecté à
chaque session, et des documents autoritatifs — chacun portant un `firebase
deploy` copiable atteignant staging ou la production sans passer par la barrière.

**Formulation canonique appliquée partout** :

```text
Le déploiement direct est interdit. Seul le preflight local est disponible :
npm run deploy:staging -- preflight --project=mediexchange-staging
Les phases expand, contract et verify ne sont pas implémentées.
Aucune commande de déploiement Firebase ou GCloud ne doit être exécutée directement.
```

Aucune documentation n'est redirigée vers une phase mutante fermée : les étapes
de déploiement sont **gelées comme état-cible non exécutable**, pas remplacées
par une commande qui n'existe pas.

| Surface | Action | Détail |
|---|---|---|
| `pharmapp-deployer.md` | **archivé** (`git mv` → `docs/archive/`) | bandeau non exécutable préfixé **avant** le frontmatter → l'agent n'est plus chargeable ; historique Git préservé ; référence corrigée dans `pharmapp_unified/README.md` |
| 5 autres agents | **capacité retirée** | `firebase` retiré de `tools:` (codeur, reviewer ×2, testeur, tester) — leurs missions passent par npm/le wrapper |
| `CLAUDE.md` | **réécrit** | 4 commandes directes → preflight explicitement ciblé staging |
| `STAGING_WORKFLOW.md` | **neutralisé** | garde son rôle de source de vérité ; 5 phases → tableau d'état-cible non exécutable |
| `DEPLOYMENT_GUIDE.md` | **page de statut** | 530 lignes de procédure prod → page de statut sécurisé, zéro commande copiable |
| `STAGING_SETUP_FIREBASE_PROJECT.md` | **neutralisé** | setup conservé ; `firebase use` + 3 `firebase deploy` → ordre-cible descriptif |
| `SPRINT_5_E2E_CLOSURE_PLAN.md` | **actif + neutralisé** | reste consommé (recette, provenance des 8 scénarios) ; commandes gelées |
| `PILOT_PRE_IMPLEMENTATION_ANALYSIS_V1.md` | **littéraux retirés** | 2 commandes descriptives supprimées, pas seulement annotées |

**Garde structurel** — `scripts/deploySurface.test.mjs`, 18 tests, dynamique
(découverte récursive, jamais de liste fixe) :

- **Portée** : **tout `.md` ET `.txt` du dépôt** (176 fichiers), pas seulement
  `docs/**` + `CLAUDE.md`. Deux élargissements successifs, chacun imposé par une
  zone aveugle prouvée : (a) `README.md` et `pharmapp_unified/README.md`
  documentent le déploiement et étaient hors périmètre ; (b) les guides de
  restauration `flutter-backup/*.txt` prescrivaient des déploiements Rules et
  Functions **sans projet explicite**, et le scan Markdown-seul ne les voyait
  pas. Seuls `node_modules`, `.git`, `.dart_tool`, `build/` sont exclus comme
  non-documents.
- **Frontières de chemin, jamais de sous-chaîne.** Toute exclusion et toute
  exemption matche un **composant de chemin** (`[\\/]nom[\\/]`). Un
  `/node_modules/` nu aurait aussi avalé un document actif simplement *nommé*
  ainsi — `docs/node_modules_migration_notes.md` — qui serait devenu **invisible**
  : ni scanné comme actif, ni soumis au bandeau. C'est la catégorie la plus
  stricte, donc celle qui doit être la plus serrée. Même correction appliquée à
  `flutter-backup` côté exemptions, où le défaut était de même nature mais moins
  grave (une exemption impose au moins le bandeau).
- **Exemptions nominatives, sous condition** : `docs/archive/`, `docs/adr/`,
  `CLAUDE-ARCHIVE.md`, `flutter-backup/`, `.claude/agents/` (contrôlé à part).
  `flutter-backup/` n'est **plus** exempté globalement — il l'est désormais au
  même titre que les autres archives, c'est-à-dire **à la condition** ci-dessous.
- **Agents** : aucun agent actif n'a `firebase`/`gcloud` en `tools:` ni de commande
  de déploiement dans son corps ; le déployeur est absent de `.claude/agents/` et
  présent en archive.
- **Formes évasives** couvertes : préfixe `npx`, **options placées avant le verbe**
  (`firebase --project=X deploy`), **continuations de ligne** (`\` + retour, jointes
  avant analyse), formes GCloud analogues, `--force` en contexte de déploiement.
- **Règle preflight dynamique** : **chaque** occurrence de `npm run deploy:staging`
  dans la surface active est découverte et validée — phase exactement `preflight`,
  exactement un `--project`, valeur exactement `mediexchange-staging`, aucun
  argument nommant une phase fermée. Lire seulement `CLAUDE.md` ne suffisait pas.
- **`REQ-DOC-BANNER` — l'exemption est une condition, pas un angle mort.** Tout
  fichier exempté qui **conserve** une commande interdite doit porter, dans ses
  2000 premiers caractères, le marqueur explicite **`NE PAS EXÉCUTER`**. Sans
  cela, un lecteur rencontre une commande production copiable sans rien qui lui
  dise qu'elle est interdite — c'était exactement l'état des guides
  `flutter-backup/*.txt` et de `CLAUDE-ARCHIVE.md` (référencé depuis `CLAUDE.md`
  et `ACTIVE_DOCS.md`, avec un bandeau parlant d'« informations obsolètes » mais
  n'interdisant pas l'exécution). **11 fichiers** portent désormais ce bandeau,
  ADR-002 compris. Un test anti-vacuité exige qu'au moins 5 exemptés portent
  réellement une commande, sinon le contrôle passerait à vide.
- **Sept tests mutants** : doc hostile, agent hostile, invocation sans projet,
  invocation ciblant la production, forme évasive multiligne avec option avant le
  verbe, **`.txt` prescrivant un déploiement**, **archive sans bandeau** — plus un
  test « ne crie pas au loup » (prose, note de dette `--force`,
  `firebase apps:sdkconfig`) pour qu'il ne soit pas désactivé par attrition.
  Nettoyage systématique en `finally`.
- **Probant par mutation** : réduire la portée à `docs/**` (17/18), naïfiser le
  motif (15/18), retirer le join des continuations (16/18), revenir au scan
  Markdown-seul (20/23), ré-exempter globalement `flutter-backup/` (21/23),
  neutraliser l'exigence de bandeau (22/23) — chacune fait **échouer** le garde.

**Ce que le garde ne prétend PAS être.** Retirer `firebase`/`gcloud` des `tools:`
ferme les **capacités déclarées** et les **instructions directes** — c'est une
garantie **normative et détective**, portée par le dépôt et ses tests. Ce n'est
**pas une isolation système** : un agent disposant d'un shell pourrait
techniquement invoquer un binaire installé sur la machine. Le dépôt ne peut pas
sandboxer l'exécution ; il peut refuser de prescrire, de déclarer la capacité, et
détecter toute réintroduction.

`REQ-DEP-SURFACE-01` et `REQ-PROJECT-EXPLICIT-01` passent **satisfaits**.

**Hors périmètre, explicitement** : phases mutantes, commit/push, staging, preuve
depuis checkout propre, et la règle documentaire globale `REQ-DOC-STATE-01` (le
troisième état ni-indexé-ni-archivé reste une dette distincte).

---

### 4septies. Reproductibilité du hash — défaut trouvé et corrigé (2026-07-27)

**Contradiction découverte lors de la synchronisation de preuve.** Le jalon
affirmait le hash « recalculé à l'identique » ; c'était vrai **dans un même
clone** (recalcul après écriture), **pas entre deux exécutions indépendantes**.
Une re-vérification depuis un second clone l'a réfuté :

| Preuve | Hash | Fichiers | Statut |
|---|---|---|---|
| Jalon (clone `0779b440`) | `sha256:446d3a5d…` | 228 | **contaminé** par un log transitoire |
| Seconde exécution (clone `aaa42573`) | `sha256:4840800f…` | 228 | confirme la **non-reproductibilité** |
| Les deux clones, log exclu | `sha256:0ef19980…` | 227 | **identiques** → le payload métier n'avait pas changé |

**Cause racine, prouvée par exécution** : le gate Rules tourne avec
`cwd = functions/` et l'émulateur Firestore y écrit `firestore-debug.log`
(timestamps, ports, chemins absolus — non déterministe), **avant** l'étape de
hash. La liste d'ignore par défaut de Firebase couvre `firebase-debug.log` et
`firebase-debug.*.log` mais **pas** `firestore-debug.log` ; le hasher, fidèle à
cette liste, l'incluait donc. `REQ-PREFLIGHT-HASH-01` (« reproductible ») était
**réfutée** jusqu'à cette correction.

**Correctif — sur les DEUX frontières, jamais une exclusion parallèle dans le
seul hasher** (qui ferait diverger le hash de ce que Firebase empaquette) :

1. **Packaging réel** — `firebase.json` déclare désormais
   `functions.ignore = ["node_modules", ".git", "*-debug.log"]` (Firebase y
   ajoute ses trois internes). Le hasher continue de lire la config réelle.
   `checkFunctionsIgnore` **exige** désormais une liste explicite contenant
   `*-debug.log` (nouveaux refus : `FUNCTIONS_IGNORE_MISSING`, `…_INCOMPLETE`
   sur `*-debug.log`, `…_DUPLICATE`, `…_EXCLUDES_LIB`), transformant la
   correction en invariant contrôlé.
2. **Isolation du gate Rules** — `test-rules` tourne désormais depuis la
   **sandbox** (cwd), avec `--config <firebase.json absolu>` et une commande
   Jest entièrement absolue (`jest.rules.config.cjs` ancré sur `__dirname` :
   `rootDir` + `tsconfig`). L'émulateur écrit son log **dans la sandbox**, qui
   est supprimée à la fin — **plus jamais dans `functions/`**. Cache émulateur
   préservé à côté.

**Vérifié cette session** : Rules réelles **104/104** via le nouveau chemin,
**0** `*-debug.log` dans `functions/` après run, suite `261/261` (hostile
incluse), tests d'hasher prouvant que deux `firestore-debug.log` de contenus
différents donnent le même hash, cross-check de parité avec `readdirRecursive`
de firebase-tools inchangé.

**`0ef19980…` n'est PAS encore gravé comme hash canonique** : c'est un candidat
mesuré. Il ne devient la référence qu'après un nouveau preflight depuis un clone
neuf (preuve inter-clones, publiée dans la PR #1).

---

## 5. Défauts connus dans le code livré

| Défaut | Emplacement | Gravité |
|---|---|---|
| ~~Le preflight annonce « Firebase CLI … resolved from **functions'** lockfile » alors qu'il résout depuis `tools/deploy`.~~ **RÉSOLU le 2026-07-22** → « resolved from **tools/deploy's** lockfile ». | `scripts/deploy-staging.mjs` | ~~Message trompeur dans une barrière~~ |
| ~~**Seconde occurrence, trouvée le 2026-07-22** : le refus de `checkFirebaseRuntime` dit « must come from **functions'** locked dependencies ». Même oubli que ci-dessus, commis au même moment lors du passage à `tools/deploy`.~~ **RÉSOLU le 2026-07-22** → « must come from **tools/deploy's** locked dependencies ». Code `FIREBASE_CLI_NOT_LOCAL` inchangé. | `scripts/deployChecks.mjs` | ~~Message trompeur dans un refus~~ |
| **Garde anti-régression (2026-07-22, durci)** : un test **découvre récursivement** les `.js`/`.cjs`/`.mjs` sous `scripts/` et `tools/deploy/bin/` (tests exclus) et scanne leur **texte brut** — la tournure est interdite même en commentaire d'un script exécutable, car un commentaire périmé trompe le lecteur autant qu'un `console.log`. Un test mutant plante un nouveau script et prouve que la découverte dynamique le détecte (là où l'ancienne liste fixe de six fichiers l'aurait manqué). L'ADR conserve l'historique et n'est pas sous ces racines. | `scripts/deployIsolation.test.mjs` | — |
| ~~Le câblage de `concludeRelease` dans le CLI est couvert par lecture, pas par exécution en sous-processus : le bloc final n'est atteignable qu'avec un worktree propre et poussé.~~ **RÉSOLU (2026-07-27)** : le preflight intégral, exécuté depuis un clone propre et poussé, a traversé le bloc final — `concludeRelease` libère le verrou, écrit le manifeste et affiche « preflight passed ». Le chemin est désormais exercé de bout en bout, pas seulement lu. | `scripts/deploy-staging.mjs` | ~~Couverture~~ résolu |
| Le chemin POSIX de `killTree` n'est pas exécuté sur cette plateforme. | `scripts/deployRunner.mjs` | Couverture |
| Tests de terminaison d'arbre anormalement longs (~60 s). | `scripts/deployRunner.test.mjs` | Hygiène |

### Divergence de résultats de tests — RÉSOLUE (2026-07-22)

Historique du symptôme, conservé parce qu'il justifie l'isolation d'environnement :

| Étape | Local (worktree) | Session sandboxée | Cause |
|---|---|---|---|
| Avant isolation | 138/138 | 135/138 | deux tests lançaient la CLI sans `isolatedEnv` et lisaient le configstore du profil |
| Isolation partielle | 155/155 | 154/155 | un `DEBUG` hérité modifiait la sortie CLI et cassait une assertion de version |
| **Isolation complète** | **187/187** | **187/187** | `isolatedEnv` filtre `DEBUG`/`FIREBASE_*`/`GOOGLE_*`/`*_EMULATOR_HOST` et impose config, cache, `CLOUDSDK_CONFIG`, ADC vers un fichier inexistant |

**Convergence prouvée dans les deux sessions**, y compris avec un environnement
parent hostile (`DEBUG=true`, `FIREBASE_TOKEN`, `GCLOUD_PROJECT=mediexchange`,
`GOOGLE_APPLICATION_CREDENTIALS`, `FIRESTORE_EMULATOR_HOST=evil:9999`) : suite
187/187, Rules réels 104/104 sans demande d'authentification.

**Leçon conservée** : une barrière dont la suite ne passe que dans un
environnement est plus faible qu'elle n'en a l'air. La divergence n'était pas un
artefact de session — c'était une dépendance réelle au profil de l'opérateur,
que le CI aurait aussi subie. C'est ce qui a rendu l'isolation d'environnement
bloquante et non cosmétique. Un compte rendu croisé reste noté **RAPPORTÉ, NON
VÉRIFIÉ** tant qu'il n'a pas été réexécuté dans la session qui le cite ; ici la
convergence 187/187 est confirmée des deux côtés.

---

## 6. `ADR-DEC-002-01` — Configuration Firebase canonique (DÉCIDÉ, IMPLÉMENTÉ)

**Décision, prise le 2026-07-21** : `firebase.json`, `firestore.rules` et
`firestore.indexes.json` **à la racine** sont les seules sources canoniques.
Les trois duplicatas sous `pharmapp_unified/` sont retirés. **Aucun mécanisme de
synchronisation ni de compatibilité temporaire** ne sera créé : deux copies, c'est
deux autorités. Les applications Flutter consomment Firebase à l'exécution mais
ne possèdent pas la politique de sécurité du backend.

**Arbitrage assumé** : entre une dépendance externe inconnue qui **échouerait
visiblement** et une régression de sécurité **silencieuse** en production,
l'architecture choisit l'échec visible. Toute automatisation externe doit opérer
depuis la racine et passer par le point d'entrée approuvé.

### 6.0 Exécution (2026-07-21)

| Action | Preuve |
|---|---|
| 3 fichiers supprimés | blobs tracés avant retrait : `d4d918a8`, `0ea0349c`, `af58b679` |
| 2 documents dangereux archivés | `git` détecte des **renommages** → historique préservé ; bandeau non exécutable en tête |
| Aucun autre document à risque | balayage de `pharmapp_unified/**.md` : 0 autre prescrivant un déploiement |
| Flutter non impacté | `flutter pub get` (`pubspec.lock` **inchangé**) puis `flutter analyze` → **4 problèmes, 0 lié** : `firebase_options.dart` est gitignoré (l. 76, pratique de sécurité) et `assets/` ne contient aucun fichier suivi |
| Gardes structurels | `REQ-CONFIG-SINGLE-01` : un seul `firebase.json` suivi, un seul couple rules/indexes, duplicatas absents du disque, config hostile refusée par les vérificateurs |
| Garde probant | **test mutant** : réintroduire un `firebase.json` secondaire fait échouer le garde ; le retirer le fait passer |
| Suite | **143/143** |

Les deux documents archivés portent en tête un avertissement expliquant que
suivre leurs instructions produisait l'un de deux résultats faux — correctif
jamais déployé, ou perte de 17 collections et 13 index en production.

---

## 6bis. Dossier d'instruction ayant conduit à la décision

`pharmapp_unified/firebase.json` déclare `firestore.rules` + `firestore.indexes.json`, et ces fichiers **existent** dans ce répertoire. Ils divergent de ceux de la racine :

| | racine | `pharmapp_unified/` |
|---|---:|---:|
| lignes | 657 | 269 |
| collections `match` | 30 | 13 |
| `deliveryStatusNotTerminal` | 4 | **0** |
| `exchange_proposals` verrouillé | oui | **non** |
| `licenseStatus` / `licenseVerifiedAt` | 3 / 2 | **0 / 0** |
| `subscriptionStatus` (paywall C2) | 6 | **0** |
| `countryCode` (frontière C1) | 22 | **0** |
| `medicine_requests`, `delivery_issues`, `notifications`, `withdrawal` | présents | **absents** |

Dernier commit : racine `dd8a9114` ; duplicata `6acb7f1e` (« Pilot v6 »).

**Risque** : `firebase deploy --only firestore` lancé avec `cwd = pharmapp_unified/` annulerait F-LICENSE, le paywall, la frontière currency et le lot 2 — **sans erreur**, la configuration étant valide. `REQ-CONFIG-ROOT-01` ne protège pas ce cas : il protège `deploy-staging`, pas un opérateur parti de ce répertoire.

### 6.1 Recherche de consommateurs — exécutée 2026-07-21

Le préalable posé ci-dessus (« identifier les consommateurs ») a été levé.

**Consommateurs techniques : aucun.** Aucun script (`.bat/.cmd/.ps1/.sh/.mjs/.js`), aucun `package.json`, hook, CI ou configuration IDE, aucun test Rules, aucun wrapper Firebase, aucun code Flutter ne charge `pharmapp_unified/firebase.json` ni `pharmapp_unified/firestore.rules`. Le wrapper émulateur démarre depuis `functions/` et remonte au `firebase.json` racine. Les mentions dans le code Dart sont des commentaires décrivant le contrat de sécurité distant.

**Consommateurs humains : trois documents.**

| Document | Indexé `ACTIVE_DOCS` | Ce qu'il prescrit |
|---|---|---|
| `pharmapp_unified/docs/FIREBASE_SECURITY_AUDIT.md` | **non** | nomme `pharmapp_unified/firestore.rules` comme fichier à éditer (2×), puis `firebase deploy --only firestore:rules --project mediexchange` — **production** |
| `pharmapp_unified/IMPROVEMENTS_IMPLEMENTED.md` | **non** | `firebase deploy --only firestore:rules,firestore:indexes` **sans `--project`**, depuis un document situé dans le répertoire piégé |
| `docs/guides/DEPLOYMENT_GUIDE.md` | oui | contribue à `REQ-PROJECT-EXPLICIT-01` / `REQ-DEP-SURFACE-01`, **mais pas à §6** : ses déploiements de règles portent `--project` et précèdent le `cd pharmapp_unified` (l. 494), lequel ne sert qu'au build Flutter |

**Provenance** : règles créées 2025-10-05 ; `firebase.json` et indexes ajoutés 2026-02-11 ; dernières modifications pendant le pilote jusqu'au 2026-03-15 ; aucune évolution après `6acb7f1e`. Les protections ultérieures n'ont continué que dans les règles racine. Résidu d'une ancienne surface de déploiement, conservé après la centralisation.

**Aucun travail non fusionné ne les concerne** (vérifié `git log --all` + `git stash` + worktrees) :

| Vérification | Résultat |
|---|---|
| refs (branches locales/distantes, tags) touchant les 3 fichiers | 8 commits, tous ≤ `6acb7f1e` (2026-03-15) |
| `6acb7f1e` contenu dans | `main` et `chore/deploy-integrity` — donc fusionné, rien en attente |
| stashes touchant les 3 fichiers | **aucun** (10 stashes inspectés, non modifiés) |
| troisième worktree `worktree-agent-a821dff1` | à `7e8d8532`, ancêtre de `main` — rien d'inédit |

*Note connexe (résolue)* : `origin/master` / `master` portaient encore une surface de déploiement obsolète. **Supprimées le 2026-07-22** — voir §4bis.

**Les indexes divergent aussi** : racine 15 index, duplicata **2**. Or `IMPROVEMENTS_IMPLEMENTED.md` déploie `firestore:rules,firestore:indexes` ensemble.

**Chaîne de ciblage complète et vérifiée** : il n'existe **pas** de `pharmapp_unified/.firebaserc`. Depuis ce répertoire, firebase-tools trouve donc le `firebase.json` **local** (le duplicata) mais remonte au `.firebaserc` **racine** pour le projet. Comme `IMPROVEMENTS_IMPLEMENTED.md` omet `--project`, la cible est celle du dernier `firebase use` — et `docs/guides/DEPLOYMENT_GUIDE.md` (l. 58, document indexé actif) prescrit `firebase use mediexchange`, soit la **production**. La chaîne « règles périmées → production » est donc complète et documentée, sans qu'aucune étape ne soit une supposition.

### 6.2 Requalification du risque

`FIREBASE_SECURITY_AUDIT.md` ne précise aucun répertoire d'exécution. Les deux issues sont donc fausses :

| Exécuté depuis | Résultat |
|---|---|
| la racine | les bonnes règles partent, mais l'édition prescrite — faite dans le fichier périmé — **ne part jamais**. Le correctif de sécurité paraît appliqué et ne l'est pas. |
| `pharmapp_unified/` | l'édition part, **et 17 collections perdent leur protection**. |

Le document **garantit un décalage entre ce qui est édité et ce qui est déployé**, quel que soit le répertoire. Ce n'est pas seulement un contournement : c'est un piège silencieux dans les deux sens, et il vise la production.

### 6.3 Faille de la politique d'archive

Les deux documents porteurs des instructions dangereuses ne sont **ni indexés dans `ACTIVE_DOCS.md`, ni présents dans `docs/archive/`**. La règle du dépôt — « ce qui n'est pas dans l'index est archivé » — est donc déclarative et non structurelle : un troisième état existe, et c'est précisément celui qu'occupent ces fichiers. À traiter au titre de `REQ-DEP-SURFACE-01`.

### 6.4 État de la décision

| Question | Résultat |
|---|---|
| Consommateur applicatif / runtime | aucun trouvé |
| Build Flutter | ne les consomme pas |
| Tests actuels | aucun |
| Automatisation de déploiement | aucune |
| Usage historique | prouvé |
| Instructions humaines encore accessibles | prouvées, dont une visant la production |
| Usage externe non versionné | **NON VÉRIFIÉ** |
| Nécessité actuelle légitime | **NON DÉMONTRÉE** |

La décision n'est plus bloquée par un consommateur interne inconnu. Elle l'est uniquement par la possibilité d'un usage externe ou non versionné — commande manuelle, procédure locale, outil hors dépôt — **qui ne peut être écarté que par une déclaration explicite du propriétaire du produit**.

Aucun feu vert de commit ou de déploiement ne doit être donné avant cette déclaration.

---

## 7. Hors périmètre, explicitement

- `TD-DEP-ROOT-NODEMODULES` — détrackage du `node_modules` racine, après audit d'usage.
- Phases mutantes `expand` / `contract` / `verify`.
- Flutter Hosting.
- Stock V2.
- Alignement de la documentation active et neutralisation des permissions opérateur : **après** que le preflight soit vert, pas avant.

---

## 8. Ordre de reprise

1. ~~Trancher §6~~ — **FAIT** : `ADR-DEC-002-01`, duplicatas retirés, gardes en place (§6.0).
1bis. ~~Lot 1B — retirer `origin/master`~~ — **FAIT** le 2026-07-22 sur autorisation
   explicite, preuves en §4bis. `REQ-BRANCH-SURFACE-01` satisfait.
2. ~~`REQ-C-FB-01`, `REQ-PREFLIGHT-INSTALL-01`, `REQ-PREFLIGHT-RULES-01`, `REQ-PREFLIGHT-HASH-01`, `REQ-PREFLIGHT-DRIFT-01`.~~ **FAIT** (§4ter, §4quinquies).
3. ~~Corriger les défauts du §5.~~ **FAIT** — messages `functions' lockfile` corrigés ; couverture `concludeRelease` résolue par le preflight complet.
4. ~~Rendre la suite verte via l'invocation npm officielle et un environnement Firebase local maîtrisé, dans les deux environnements.~~ **FAIT** — 253/253, convergente local **et** sandbox hostile (§4quater).
5. ~~Tests manquants : `firebase.json` hostile, hash, dérive concurrente.~~ **FAIT** pour le hash et la dérive ; `firebase.json` hostile refusé au niveau vérificateur, test bout-en-bout cwd résiduel (voir `REQ-CONFIG-ROOT-01`, §4).
6. ~~Preflight complet depuis un check-out propre.~~ **FAIT** (2026-07-27) — clone indépendant, preflight intégral PASS, hash recalculé identique.
7. ~~Aligner ensuite la documentation active et les permissions.~~ **FAIT** (§4sexies) — documentation active alignée ; permissions opérateur `.claude/settings.local.json` restent une dette hors périmètre.
8. ~~Examiner le diff consolidé avant toute décision de commit/push.~~ **FAIT** — revue consolidée des 51 chemins, commit atomique `0779b440`, push, **PR #1 ouverte**.

---

## 9. État à la date de cet ADR

```
Lot A (verdicts purs)                    VÉRIFIÉ
Lot B (runner, verrou)                   VÉRIFIÉ
Isolation outillage/runtime              VÉRIFIÉ
REQ-DEP-SURFACE-01                       SATISFAIT — agent archivé, docs
                                         neutralisés, garde dynamique (§4sexies)
Duplicata pharmapp_unified               CLOS — retiré, gardes mutation-testés
REQ-CONFIG-SINGLE-01                     IMPLÉMENTÉ ET VÉRIFIÉ
REQ-CONFIG-ROOT-01                       PARTIEL — ancrage testé, test cwd
                                         bout-en-bout résiduel (§4)
REQ-BRANCH-SURFACE-01                    SATISFAIT ET VÉRIFIÉ
REQ-C-FB-01 / INSTALL-01 / RULES-01      SATISFAITS ET VÉRIFIÉS
Isolation env + nettoyage fail-closed    ACCEPTÉ — suite 187→253/253
REQ-PROJECT-EXPLICIT-01                  SATISFAIT (§4sexies)
Contrôle Git final                       SATISFAIT ET VÉRIFIÉ
Hash artefact — reproductibilité         RÉFUTÉE (log) puis CORRIGÉE (§4septies)
                                         preuve inter-clones due avant merge
Preflight reproductible                  PROUVÉ bout-en-bout depuis clone
                                         propre poussé (2026-07-27)
concludeRelease exercé en sous-process   RÉSOLU par le preflight complet
Commit + push                            FAIT — HEAD 0779b440 poussé
PR #1 (base main ← chore/deploy-integ.)  OUVERTE, non fusionnée, MERGEABLE
Lot C                                    FERMÉ
```

**Lots suivants identifiés** (pas des correctifs cachés) : ~~(1) hash d'artefact
+ contrôle Git final~~ **FAIT (§4quinquies)** ; ~~(2) correction des deux messages
`functions' lockfile`~~ **FAIT (§5)** ; ~~(3) fermeture des chemins documentaires
et de l'agent autonome~~ **FAIT (§4sexies)** ; (4) preuve finale depuis un
checkout propre après commit poussé.

Commit et push effectués ; PR #1 ouverte. Aucun merge, déploiement ou contact staging.
