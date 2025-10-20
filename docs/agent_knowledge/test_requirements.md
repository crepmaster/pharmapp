# PharmApp Test Requirements

*Dernière mise à jour : 2025-10-20*

> Standards de test pour l'agent Testeur. Tous les tests doivent fournir des preuves tangibles.

## 🎯 Objectifs Généraux

- **Zéro tolérance** : Aucun test ne peut être validé sans preuve concrète
- **Reproductibilité** : Tous les tests doivent être reproductibles
- **Traçabilité** : Toutes les preuves doivent être archivées
- **Exhaustivité** : Couvrir les cas nominaux ET les edge cases

## 📋 Types de Tests Requis

### 1. Tests Unitaires (Code-level)

**Scope** : Fonctions individuelles, helpers, utilitaires

**Requirements** :
- [ ] Exit code 0 pour succès
- [ ] Coverage >80% des fonctions critiques
- [ ] Mocks pour Firebase et APIs externes
- [ ] Tests isolés (pas de side effects)

**Preuve Requise** :
- Output de la commande de test avec exit code
- Rapport de coverage
- Liste des tests passés/échoués

**Exemple** :
```bash
npm test -- creditWallet.test.ts > test_output.txt
echo "Exit code: $?" >> test_output.txt
npm run coverage >> coverage_report.txt
```

---

### 2. Tests d'Intégration (Component-level)

**Scope** : Workflows complets avec Firebase Emulator

**Requirements** :
- [ ] Firebase Emulator running
- [ ] État initial connu et documenté
- [ ] État final vérifié dans Firestore
- [ ] Logs capturés et analysés

**Preuve Requise** :
- Screenshot/export de l'état Firebase AVANT le test
- Output de la commande de test
- Screenshot/export de l'état Firebase APRÈS le test
- Logs applicatifs pendant le test

**Exemple** :
```bash
# État AVANT
curl -s "http://127.0.0.1:8080/v1/projects/demo-mediexchange/databases/(default)/documents/wallets/user123" > state_before.json

# Exécuter test
npm test -- integration/topup.test.ts > test_output.txt

# État APRÈS
curl -s "http://127.0.0.1:8080/v1/projects/demo-mediexchange/databases/(default)/documents/wallets/user123" > state_after.json

# Comparer
diff state_before.json state_after.json > state_diff.txt
```

---

### 3. Tests End-to-End (System-level)

**Scope** : Workflows complets depuis UI jusqu'à Firebase

**Requirements** :
- [ ] Apps running (pharmacy 8084, courier 8085, etc.)
- [ ] Test account utilisé (09092025@promoshake.net)
- [ ] Screenshots de chaque étape
- [ ] Vérification Firebase après chaque action
- [ ] Logs capturés de bout en bout

**Preuve Requise** :
- Screenshots de chaque étape UI
- État Firebase vérifié après chaque action
- Logs applicatifs complets
- Rapport consolidé avec timeline

**Exemple** :
```bash
# 1. État initial
curl -s "http://127.0.0.1:8080/v1/.../wallets/user123" > e2e_1_initial.json

# 2. Action: Registration
# [Screenshot 1: page registration]
# [Screenshot 2: form filled]
# [Screenshot 3: success message]

# 3. Vérification Firebase
curl -s "http://127.0.0.1:8080/v1/.../pharmacies/user123" > e2e_2_pharmacy_created.json
curl -s "http://127.0.0.1:8080/v1/.../wallets/user123" > e2e_2_wallet_created.json

# 4. Compile les preuves
cat e2e_*.json > e2e_proof_bundle.json
```

---

### 4. Tests de Webhooks

**Scope** : Endpoints webhook (MTN, Orange, etc.)

**Requirements** :
- [ ] Token valide ET token invalide testés
- [ ] Idempotence testée (même payload 2x)
- [ ] Différents statuts testés (SUCCESSFUL, FAILED)
- [ ] Vérification wallet après webhook
- [ ] Vérification `webhook_logs` et `idempotency`

**Preuve Requise** :
- Output de chaque appel webhook avec status code
- État wallet AVANT et APRÈS
- Contenu `webhook_logs` collection
- Contenu `idempotency` collection

**Exemple** :
```bash
# Test 1: Token invalide
curl -X POST http://localhost:5001/.../momoWebhook \
  -H "Content-Type: application/json" \
  -H "X-Callback-Token: INVALID_TOKEN" \
  -d '{"status":"SUCCESSFUL",...}' > webhook_test_1_invalid.txt
# Attendu: 401 Unauthorized

# Test 2: Token valide, première fois
curl -X POST http://localhost:5001/.../momoWebhook \
  -H "X-Callback-Token: $MOMO_TOKEN" \
  -d '{...}' > webhook_test_2_valid.txt
# Attendu: 200 OK, wallet crédité

# Vérifier wallet
curl -s "http://127.0.0.1:8080/v1/.../wallets/user123" > wallet_after_webhook.json

# Test 3: Idempotence (même payload)
curl -X POST http://localhost:5001/.../momoWebhook \
  -H "X-Callback-Token: $MOMO_TOKEN" \
  -d '{...}' > webhook_test_3_duplicate.txt
# Attendu: 200 OK, wallet INCHANGÉ

# Vérifier idempotency
curl -s "http://127.0.0.1:8080/v1/.../idempotency" > idempotency_check.json
```

---

### 5. Tests de Sécurité

**Scope** : Tentatives d'accès non autorisés

**Requirements** :
- [ ] Test sans auth token → doit fail
- [ ] Test avec token d'un autre user → doit fail
- [ ] Test de modification directe Firestore → doit fail (rules)
- [ ] Test de webhook avec token invalide → doit return 401

**Preuve Requise** :
- Output de chaque tentative avec status/error
- Vérification que l'action a été bloquée
- Logs de sécurité

**Exemple** :
```bash
# Tentative lecture wallet d'un autre user
# [code Flutter qui essaie de lire wallet d'un autre user]
# Attendu: Permission denied error

# Tentative modification directe wallet
# [code Flutter qui essaie de modifier available]
# Attendu: Permission denied error

# Capturer les erreurs
flutter run > flutter_security_test.log 2>&1
grep -i "permission denied" flutter_security_test.log > security_test_proof.txt
```

---

## 📊 Critères de Succès par Type de Test

### Tests Backend (Cloud Functions)

**Must Have** :
- [ ] Exit code 0 (npm test)
- [ ] Aucune erreur dans les logs
- [ ] État Firebase correspond à l'attendu
- [ ] Timestamps corrects (timezone Africa/Douala)
- [ ] Transactions atomiques validées

**Nice to Have** :
- [ ] Performance acceptable (<2s pour opérations simples)
- [ ] Logs structurés et clairs

### Tests Frontend (Flutter)

**Must Have** :
- [ ] App compile sans erreur
- [ ] UI affiche les données correctes
- [ ] Loading states visibles
- [ ] Error messages appropriés
- [ ] Navigation fonctionne

**Nice to Have** :
- [ ] Responsive sur différentes tailles
- [ ] Animations smooth

### Tests d'Intégration

**Must Have** :
- [ ] Workflow complet fonctionne de A à Z
- [ ] État Firebase cohérent à chaque étape
- [ ] Aucune erreur dans les logs
- [ ] Rollback correct si échec

**Nice to Have** :
- [ ] Performance end-to-end acceptable

---

## 🔍 Vérifications Firebase Obligatoires

Pour CHAQUE test impliquant Firebase, vérifier :

### Collections à Vérifier

#### `wallets` collection
```bash
# Vérifier balance
curl -s "http://127.0.0.1:8080/v1/.../wallets/{userId}" | jq '.fields.available.integerValue'
curl -s "http://127.0.0.1:8080/v1/.../wallets/{userId}" | jq '.fields.held.integerValue'

# Vérifier timestamp
curl -s "http://127.0.0.1:8080/v1/.../wallets/{userId}" | jq '.fields.updatedAt.timestampValue'
```

#### `payments` collection
```bash
# Vérifier status
curl -s "http://127.0.0.1:8080/v1/.../payments/{paymentId}" | jq '.fields.status.stringValue'

# Vérifier provider TX ID
curl -s "http://127.0.0.1:8080/v1/.../payments/{paymentId}" | jq '.fields.providerTxId.stringValue'
```

#### `webhook_logs` collection
```bash
# Lister les logs récents
curl -s "http://127.0.0.1:8080/v1/.../webhook_logs" | jq '.documents[] | .name'

# Vérifier un log spécifique
curl -s "http://127.0.0.1:8080/v1/.../webhook_logs/{logId}" | jq '.fields'
```

#### `idempotency` collection
```bash
# Vérifier qu'une clé existe
curl -s "http://127.0.0.1:8080/v1/.../idempotency/mtn_{txId}" | jq '.fields.processedAt.timestampValue'
```

#### `exchanges` collection
```bash
# Vérifier status exchange
curl -s "http://127.0.0.1:8080/v1/.../exchanges/{exchangeId}" | jq '.fields.status.stringValue'

# Vérifier holds
curl -s "http://127.0.0.1:8080/v1/.../exchanges/{exchangeId}" | jq '{sellerHold: .fields.sellerHold.integerValue, buyerHold: .fields.buyerHold.integerValue}'
```

#### `ledger` collection
```bash
# Lister les transactions d'un user
curl -s "http://127.0.0.1:8080/v1/.../ledger?where=userId:{userId}" | jq '.documents[] | {type: .fields.type.stringValue, amount: .fields.amount.integerValue}'
```

---

## 📁 Structure des Preuves

### Organisation des Fichiers

```
/test_proofs
  /{test_run_id}
    /logs
      - application.log           # Logs app complets
      - firebase_emulator.log     # Logs emulator
    /outputs
      - test_output.txt           # Output commandes de test
      - coverage_report.txt       # Rapport coverage
    /firebase_states
      - state_before.json         # État Firebase AVANT
      - state_after.json          # État Firebase APRÈS
      - state_diff.txt            # Diff des états
    /screenshots
      - step_1_registration.png
      - step_2_payment.png
      - step_3_wallet.png
    /webhooks
      - webhook_request.json      # Payload envoyé
      - webhook_response.txt      # Response reçue
    - test_proof_report.md        # Rapport consolidé
```

### Fichier test_proof_report.md

**Structure Obligatoire** :

```markdown
# Test Proof Report - [Feature] - [Date]

## Résumé Exécutif
**Test Run ID** : {timestamp}
**Durée Totale** : X minutes Y secondes
**Tests Passés** : X / Y
**Tests Échoués** : Z
**Status Global** : ✅ PASS / ❌ FAIL

## Tests Effectués

### Test 1: [Nom du Test]
**ID** : TEST-001
**Type** : Unit / Integration / E2E
**Durée** : X secondes
**Status** : ✅ PASS

#### Objectif
[Description de ce que teste ce test]

#### Commande Exécutée
```bash
[commande exacte]
```

#### Output
```
[output capturé]
Exit code: 0
```

#### Firebase Vérification
**État AVANT** :
```json
{wallet: {available: 5000, held: 0}}
```

**État APRÈS** :
```json
{wallet: {available: 6000, held: 0}}
```

**Diff** :
- available: 5000 → 6000 (+1000) ✅

#### Logs Pertinents
```
[2025-10-20 15:30:45] [WEBHOOK] Processing MTN webhook
[2025-10-20 15:30:45] [WALLET] Credited user123 with 1000 XAF
```

#### Preuves Générées
- `test_output.txt`
- `state_before.json`
- `state_after.json`
- `logs/application.log` (lignes 150-200)

#### Validation
- [x] Exit code 0
- [x] Wallet crédité du bon montant
- [x] Ledger entry créée
- [x] Aucune erreur dans les logs

---

[... répéter pour chaque test ...]

## Statistiques Globales

### Par Type
- Unit Tests: 10 / 10 ✅
- Integration Tests: 5 / 5 ✅
- E2E Tests: 3 / 3 ✅
- Webhook Tests: 4 / 4 ✅
- Security Tests: 2 / 2 ✅

### Par Criticité
- Critical Path: 8 / 8 ✅
- Important: 12 / 12 ✅
- Minor: 4 / 4 ✅

## Fichiers de Preuve

Tous les fichiers sont disponibles dans:
`/test_proofs/{test_run_id}/`

## Recommandations

### Issues Trouvés
[Si des bugs trouvés, les lister ici]

### Améliorations Suggérées
[Optimisations possibles]

## Conclusion

**Verdict** : ✅ Tous les tests passés avec preuves
**Prêt pour Production** : OUI / NON
**Prochaine Action** : [Déploiement / Corrections / Re-test]
```

---

## 🎯 Checklist Avant de Valider un Test

Avant de dire "test passé", vérifier :

- [ ] J'ai exécuté la commande de test ET capturé son output
- [ ] Exit code est 0 (ou code attendu si test d'erreur)
- [ ] J'ai vérifié l'état Firebase AVANT le test
- [ ] J'ai vérifié l'état Firebase APRÈS le test
- [ ] J'ai capturé les logs applicatifs pendant le test
- [ ] J'ai créé un rapport `test_proof_report.md` avec TOUTES les preuves
- [ ] Tous les fichiers de preuve sont dans `/test_proofs/{test_run_id}/`
- [ ] Je peux reproduire le test en suivant mes instructions

---

## 🚫 Erreurs à Éviter

### ❌ Ne JAMAIS faire :
- Affirmer qu'un test a passé sans montrer l'output
- Dire "j'ai vérifié Firebase" sans montrer les données
- Utiliser des screenshots flous ou partiels
- Oublier de capturer les logs
- Ne pas vérifier les edge cases
- Tester seulement le happy path

### ✅ TOUJOURS faire :
- Capturer TOUS les outputs (stdout + stderr)
- Vérifier Firebase avec curl/API (pas juste UI)
- Tester les cas d'erreur (token invalide, fonds insuffisants, etc.)
- Archiver toutes les preuves
- Créer un rapport consolidé
- Tester l'idempotence (même action 2x)

---

## 📚 Références

- `coding_guidelines.md` : Standards à respecter dans le code testé
- `common_mistakes.md` : Erreurs à vérifier qu'elles ne sont pas présentes
- `pharmapp_patterns.md` : Patterns à valider dans les tests
- `review_checklist.md` : Points à vérifier en plus des tests fonctionnels

---

**Note** : Ces requirements évoluent. Si de nouveaux types de tests sont nécessaires, mettre à jour ce fichier.
