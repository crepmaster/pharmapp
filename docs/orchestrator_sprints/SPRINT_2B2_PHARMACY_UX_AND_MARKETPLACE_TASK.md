# Sprint 2B.2 — Pharmacy UX + Marketplace Enforcement

> ⚠️ **SUPERSEDED 2026-05-13** par split en deux contrats isolés (verdict architecte B) :
>
> - [SPRINT_2B2A_PHARMACY_UX_TASK.md](SPRINT_2B2A_PHARMACY_UX_TASK.md) — Pharmacy UX (registration LICENSE_REQUIRED handler + profile status + correction flow). À exécuter en premier.
> - [SPRINT_2B2B_MARKETPLACE_ENFORCEMENT_TASK.md](SPRINT_2B2B_MARKETPLACE_ENFORCEMENT_TASK.md) — Marketplace Enforcement (listing backend-owned + 6 consumers migrés + rules durcies). Décision **CALLABLE vs FLAG** verrouillée dans ce contrat, avec préférence callable sauf preuve triple par l'explorer.
>
> Motivation du split : éviter une revue mixée Pharmacy UX + Marketplace (trois surfaces : registration / profile / marketplace consumer migration + choix architectural backend non tranché), pattern identique à 2B → 2B.1 + 2B.2 (2026-05-13).
>
> Ce contrat reste préservé pour traçabilité git mais **ne doit plus être exécuté directement**. Reportez-vous aux deux contrats split ci-dessus.

---

À exécuter dans l'orchestrator uniquement, **après** Sprint 2B.1 fermé + APPROVED + finalized.

## Origine

Split du Sprint 2B monolithique acté par l'architecte le 2026-05-13. Voir [SPRINT_2B1_ADMIN_LICENSE_OPS_TASK.md](SPRINT_2B1_ADMIN_LICENSE_OPS_TASK.md) pour le contexte et le contrat 2B.1.

## Prérequis (hard dependency)

**Sprint 2B.1 doit être fermé**. Le profile / correction / registration flow pharmacie a besoin que l'admin puisse traiter (approve / reject / correction) les licences pour qu'un cycle de bout en bout fonctionne. Sans 2B.1, une pharmacie rejetée n'a aucun moyen de voir le verdict admin se concrétiser. Si 2B.1 n'est pas fermé, l'explorer 2B.2 doit répondre `SAFE TO PROCEED = NO`.

## Objectif

Rendre la feature licence end-to-end utilisable côté pharmacie + verrouiller la visibilité marketplace côté backend pour que les pharmacies non éligibles disparaissent vraiment des listings, pas via filtre client fragile.

## DoD (Definition of Done) — architect-locked

1. Une pharmacie qui s'inscrit pour un pays mandatory et n'a pas de licence est **re-prompt licence** par l'UI : le `details.code === 'LICENSE_REQUIRED'` retourné par le callable backend (contrat Sprint 2A.3.1) déclenche un état UI dédié qui re-collecte la licence et relance l'inscription. Aucune erreur générique.
2. Une pharmacie au statut `rejected` ou `correction_needed` voit le statut dans son profile + peut corriger via un flow dédié qui appelle `submitPharmacyLicense` (Sprint 2a).
3. **Les pharmacies non éligibles disparaissent des listings marketplace côté backend**. Pas un filtre client. Un nouveau callable `getMarketplacePharmacies` (ou équivalent backend-owned) filtre et retourne uniquement les pharmacies éligibles. Les 6 consumers Flutter actuels (medicine_requests, exchanges create/status, subscription, inventory, pharmacy_main) sont migrés pour consommer ce callable au lieu de queryer `collection('pharmacies')` direct.
4. Aucun changement à l'admin panel.
5. Aucun changement aux callables Sprint 2a / 2A.1 / 2A.2 / 2A.3 / 2B.1 (sauf si l'explorer prouve un ajout strict nécessaire).

## Décisions verrouillées

1. Contrat erreur LICENSE_REQUIRED : `FirebaseFunctionsException(code: 'failed-precondition', details: { code: 'LICENSE_REQUIRED' })` — Sprint 2A.3.1 a verrouillé ça côté `shared/lib/services/unified_auth_service.dart` via `rethrow` ; **2B.2 ne doit PAS changer ce contrat**, juste le consommer côté UI.
2. Marketplace listing backend-owned obligatoire. **Filtre client seul = inacceptable** (un client modifié bypass). Le backend doit être l'unique source de la liste marketplace.
3. Pas de upload Storage réel pour licenseDocumentUrl en 2B.2 — un champ texte URL suffit (utilisateur colle un lien). Upload Storage = sprint dédié si jamais besoin.
4. Pas de migration courier/admin vers backend-owned registration (verrou Sprint 2A.3 toujours valide).

## Périmètre autorisé

### Backend

- nouveau callable `functions/src/getMarketplacePharmacies.ts` (`onCall`) qui retourne la liste filtrée :
  - input : `{ countryCode: string, cityCode?: string }`
  - logique : query `pharmacies` filtré par `countryCode + cityCode`, puis pour chaque pharmacie évalue le license gate via `evaluateLicenseGate` (Sprint 2A.3) ; ne retourne que celles `allow`
  - sortie : `{ pharmacies: [{ uid, pharmacyName, address, locationData, ... }] }` (champs minimaux, **PAS** licenseStatus côté output)
- ou alternative architecturale (à trancher dans l'explorer 2B.2) : un Firestore trigger qui maintient un flag `marketplaceVisible: bool` calculé serveur sur `pharmacies/{uid}` à chaque transition `licenseStatus`. Les consumers utilisent une simple query `where('marketplaceVisible', '==', true)`.
- export dans `functions/src/index.ts`
- tests Jest backend : pharmacie verified visible, pending_verification cachée, grace_period actif visible, grace_period expiré cachée, rejected cachée, country non mandatory toutes visibles, unknown country denied.

### pharmapp_unified Flutter

- `pharmapp_unified/lib/screens/auth/unified_registration_screen.dart` :
  - lecture `MasterDataCountry.licenseRequired` pour le pays sélectionné → afficher champ licence conditionnel avec `licenseLabel` + `licenseHelpText` + validation regex client-side si `licenseFormatRegex`
  - sur callable error `details.code === 'LICENSE_REQUIRED'` → afficher le champ licence (cas où le snapshot client était stale), focus, et message clair "License required for {country}"
- `pharmapp_unified/lib/screens/pharmacy/profile/profile_screen.dart` : ajouter section "License status" :
  - badge avec statut courant
  - si `rejected` ou `correction_needed` : affichage `licenseRejectionReason` + bouton "Correct license" qui ouvre un flow de correction
- nouveau flow de correction : un dialog ou écran qui demande le `licenseNumber` (et optionnellement `licenseDocumentUrl`, `licenseExpiryDate`) puis appelle `submitPharmacyLicense` (Sprint 2a). Après succès, badge passe à `pending_verification`.
- migration des 6 consumers marketplace : remplacer les queries `collection('pharmacies').where(...)` direct par appel au nouveau callable `getMarketplacePharmacies`. Liste des fichiers à inspecter (l'explorer confirmera) :
  - `pharmapp_unified/lib/screens/pharmacy/requests/medicine_requests_screen.dart`
  - `pharmapp_unified/lib/screens/pharmacy/exchanges/create_proposal_screen.dart`
  - `pharmapp_unified/lib/screens/pharmacy/exchanges/exchange_status_screen.dart`
  - `pharmapp_unified/lib/screens/pharmacy/subscription_screen.dart`
  - `pharmapp_unified/lib/services/inventory_service.dart`
  - `pharmapp_unified/lib/screens/pharmacy/pharmacy_main_screen.dart`
- widget tests pharmapp_unified pour : registration (champ licence conditionnel), registration (LICENSE_REQUIRED handler), profile license status, correction flow

### Documentation

- `CLAUDE.md` : Sprint 2B.2 ajouté au tableau historique, backlog F-LICENSE marqué `end-to-end LIVRÉ`, section "ce qui n'est PAS livré" §2 retire la mention "UI 2B à venir"
- `docs/ACTIVE_DOCS.md` : 2B.2 marqué fermé
- `docs/orchestrator_sprints/README.md` : 2B.2 fermé
- statut final dans ce contrat

## Périmètre interdit

- Aucun changement `admin_panel/**` (out of scope, livré en 2B.1)
- Aucun changement aux 4 callables licence backend existants (`submitPharmacyLicense`, `adminVerifyPharmacyLicense`, `backfillLicenseGracePeriod`, `setCountryLicenseConfig`)
- Pas d'upload Firebase Storage réel
- Pas de refactor auth/registration global
- Pas de changement à `createPharmacyRegistration` sauf si l'explorer prouve une asymétrie strictement nécessaire avec l'UI
- Pas de Bloc 2 exchange mode (Sprint 4)
- Pas de Trial (Sprint 3)
- Pas de deploy prod

## Architecture Evidence Contract

| Path/Field | Write path | Read/consumption path | Authz | Negative/test path | Proof Required |
|---|---|---|---|---|---|
| `LICENSE_REQUIRED` contract UI | n/a — propage du backend Sprint 2A.3 | `unified_registration_screen.dart` catch `FirebaseFunctionsException` + `details.code === 'LICENSE_REQUIRED'` | n/a | callable throw avec autre code → UI affiche erreur générique, pas re-prompt licence | widget test : signUp pharmacy → throw LICENSE_REQUIRED → UI re-render avec champ licence + focus |
| Profile license status badge | n/a (read-only) | `profile_screen.dart` StreamBuilder ou Bloc sur `pharmacies/{currentUser.uid}.licenseStatus` | rules read existant (Sprint 2a) | pas de status / unknown status → "pending" par défaut + log warn | widget test : 7 statuts × badge correct |
| Profile correction flow | `submitPharmacyLicense` callable (Sprint 2a, inchangé) | profile screen → flow correction | callable check : caller is owner (Sprint 2a) | submit sans `licenseNumber` → erreur backend visible UI | widget test : flow happy path, validation client-side, callable invoqué avec bons args |
| Marketplace listing | `getMarketplacePharmacies` callable (NEW) | les 6 consumers Flutter via callable | callable auth check : authenticated | direct query Firestore `collection('pharmacies')` côté Flutter → **doit être supprimée** | test Jest : pharmacie rejected/expired/pending/grace-expired ne remonte PAS dans listing ; verified + grace-active remontent ; pharmacie d'un pays non mandatory remonte toujours |
| **Hard block contract** | Aucun client (modifié ou pas) ne doit pouvoir lister une pharmacie inéligible | listing endpoint backend = unique source | callable backend | test direct : essayer `collection('pharmacies').where('countryCode', '==', 'GH')` côté client → doit retourner soit rien soit uniquement éligibles (selon rule). Si rules permettent encore le read direct, document la dette comme `TD-MARKETPLACE-RULE-HARDEN` | widget test négatif : si on bypass le callable et qu'on querie Firestore direct, on récupère soit zéro pharmacie soit uniquement les éligibles |

## Solution Architect Refactoring Challenge (obligatoire)

L'explorer doit répondre :

1. Le `unified_registration_screen.dart` (931 lignes) lit-il déjà `MasterDataCountry` ? Où, comment, et avec quel pattern de réactivité (rebuild on country change) ?
2. Le profile_screen.dart consomme-t-il déjà la pharmacie via Bloc / StreamBuilder ? Quel pattern utiliser pour la section license status ?
3. Marketplace visibility : callable `getMarketplacePharmacies` OU flag `marketplaceVisible: bool` calculé serveur via trigger ? Tradeoffs :
   - Callable : explicit, testable, mais ajoute un round-trip par listing
   - Flag : query Firestore reste possible mais nécessite trigger Cloud Function pour maintenir le flag à chaque transition `licenseStatus`. Plus invasif côté backend mais plus fluide côté Flutter
   - **Décision attendue par l'explorer 2B.2**
4. Les 6 fichiers Flutter qui queryent `collection('pharmacies')` direct font-ils tous du marketplace listing, ou certains font-ils du lookup ciblé (one pharmacy by uid) qui n'a pas besoin de filter ? Distinguer pour ne pas casser les lookups individuels.
5. Les widget tests `pharmapp_unified` utilisent-ils déjà mocktail ? Sinon, ajouter mocktail à `pharmapp_unified/dev_dependencies` (déjà ajouté à `shared/` en 2A.3.1).
6. Faut-il un nouvel écran `license_correction_screen.dart` ou un dialog suffit ?
7. Sur LICENSE_REQUIRED post-soumission, l'UI doit-elle réafficher le formulaire complet ou juste pousser le champ licence ? UX call.

**Décision attendue** : `Decision: EXTEND | REFACTOR_FIRST | STOP`

Stop conditions :

- découverte qu'un upload Storage réel est nécessaire pour rendre l'expérience acceptable (split en 2B.2 + 2B.3)
- les 6 consumers Flutter incluent du code marketplace tellement complexe que migrer vers callable demande un refactor large (REFACTOR_FIRST hors scope)
- 2B.1 non finalisé

## Writer — lots

### Lot 1 — Backend `getMarketplacePharmacies` (ou flag, selon explorer)

Si callable :
- nouveau `functions/src/getMarketplacePharmacies.ts`
- export dans `functions/src/index.ts`
- nouveau `functions/src/__tests__/getMarketplacePharmacies.test.ts` avec ≥ 7 tests (verified, pending, grace-active, grace-expired, rejected, country non mandatory, unknown country)

Si flag :
- nouveau trigger Cloud Function `onUpdatePharmacyLicenseStatus` qui maintient `marketplaceVisible: bool`
- backfill `marketplaceVisible` pour les pharmacies existantes
- documenter dans `TD-MARKETPLACE-VISIBILITY-BACKFILL` si pas backfillé dans ce sprint

### Lot 2 — Registration UI conditional + LICENSE_REQUIRED handler

- `unified_registration_screen.dart` : section licence conditionnelle sur `MasterDataCountry.licenseRequired`
- handler `on FirebaseFunctionsException catch (e) if e.details['code'] == 'LICENSE_REQUIRED'` → re-affiche le champ + focus + message clair
- widget test : 3 cas (country mandatory licence fournie, country mandatory licence manquante → LICENSE_REQUIRED handler, country non mandatory → pas de champ licence)

### Lot 3 — Profile license status + correction flow

- `profile_screen.dart` : section badge + `licenseRejectionReason` + bouton correct
- dialog/écran de correction qui appelle `submitPharmacyLicense`
- widget test : statuts × affichage + flow correction happy path

### Lot 4 — Migration des 6 consumers marketplace

- chaque fichier listé migré pour consommer `getMarketplacePharmacies` (ou query le flag si choix flag)
- ne PAS casser les lookups individuels (one pharmacy by uid) qui restent en Firestore direct
- widget test négatif global : direct Firestore query côté Flutter sur un environnement test ne remonte PAS les non-éligibles si le rule est durci, OU document la dette `TD-MARKETPLACE-RULE-HARDEN`

### Lot 5 — Widget tests pharmapp_unified

- registration license input conditional (3 cas) + LICENSE_REQUIRED handler
- profile status badge × 7 statuts + correction flow
- marketplace consumer : appel du callable, pas de Firestore direct

### Lot 6 — Documentation

- `CLAUDE.md` : Sprint 2B.2 fermé, F-LICENSE end-to-end LIVRÉ, section "ce qui n'est PAS livré" §2 supprime "UI 2B à venir"
- `ACTIVE_DOCS.md` 2B.2 fermé
- `README.md` orchestrator sprint pack 2B.2 fermé
- ce contrat statut final

## Critères de done

- Nouveau callable (ou flag) marketplace visibility opérationnel + 7+ tests backend
- `unified_registration_screen.dart` reprompt LICENSE_REQUIRED correctement
- `profile_screen.dart` affiche statut + permet correction
- 6 consumers Flutter migrés vers backend listing
- Widget tests pharmapp_unified verts (≥ 8 nouveaux)
- 188 → 195+ backend Jest tests pass (+7 marketplace), zéro régression
- `cd functions && npm run build && npm run lint && npm test && npm run test:rules` ✅
- `cd shared && dart analyze` ✅ (inchangé)
- `cd admin_panel && flutter analyze && flutter test` ✅ (inchangé — 2B.1 livré)
- `cd pharmapp_unified && flutter analyze && flutter test` ✅ (nouveaux widget tests verts)
- CLAUDE.md F-LICENSE marqué `end-to-end LIVRÉ`

## Conditions de non-régression

- inscription pays non mandatory : inchangée
- inscription pays mandatory avec licence valide : succès, redirection dashboard
- inscription pays mandatory sans licence : LICENSE_REQUIRED affiché (was : erreur générique)
- courier/admin signup : flow client-write Sprint 2A.3 préservé
- exchange / medicine request flow : fonctionne sur listing marketplace filtré (les pharmacies éligibles uniquement)
- 2B.1 admin features : inchangées

## Validation minimale

```bash
cd functions && npm run build && npm run lint && npm test && npm run test:rules
cd shared && dart analyze
cd admin_panel && flutter analyze
cd pharmapp_unified && flutter analyze && flutter test
```
