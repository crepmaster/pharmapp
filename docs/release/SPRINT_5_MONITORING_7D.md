# Sprint 5 — Monitoring 7 jours post-deploy

**Type** : runbook (lock #5 Sprint 5 — pas de deploy auto, pas d'alertes
push créées par ce sprint).
**Cadence** : checks J+0 (deploy day), J+1, J+3, J+7. Owner default :
on-call backend.
**Source de vérité** : Cloud Logging Firebase Functions + Firestore
console + audit drift script.

---

## 1. Objectifs

Détecter, dans les 7 jours qui suivent un deploy backend (notamment un
deploy Sprint 4 sur staging ou prod), les régressions critiques suivantes :

1. License gate ne fail-close pas correctement → pharmacy non verified
   passe sur callable marketplace.
2. Medicine request exchange ne respecte pas lock #5 → double hold ou
   wallet write parasite.
3. `courierFee=0` inattendu sur des villes pourtant configurées
   (`system_config.citiesByCountry`).
4. Delivery completion failures (wallet inconsistency, ledger orphelin).
5. Drift remote functions vs local (régression deploy).
6. Inscriptions Ghana bloquées par `LICENSE_REQUIRED` sans suivi admin.
7. Anomalies wallet (held / deducted qui dérivent).

Pas d'alertes push créées ici. Le runbook documente les requêtes/checks
à exécuter manuellement (ou intégrer dans un job Cloud Scheduler dans
un sprint dédié si décision produit ultérieure).

---

## 2. Cadence et seuils

| Jour | Checks | Owner default |
|---|---|---|
| J+0 (deploy day) | All 7 checks below | Deployer |
| J+1 | Checks 1, 2, 3, 4 | On-call backend |
| J+3 | All 7 | On-call backend |
| J+7 | All 7 + retro write-up | Tech lead |

**Seuil d'alerte** par check défini ci-dessous (colonne "Seuil").

---

## 3. Les 7 checks

### Check 1 — License gate fail-closed effectif

**But** : prouver que la gate refuse bien les non-verified.

**Cloud Logging query (Firebase Functions)** :

```
resource.type="cloud_function"
resource.labels.function_name=~"createMedicineRequest|submitMedicineRequestOffer|acceptMedicineRequestOffer|createExchangeProposal|acceptExchangeProposal"
severity=WARNING
textPayload=~"Marketplace access requires a verified pharmacy license"
```

**Cadence** : J+0, J+1, J+3, J+7.

**Seuil normal** : > 0 (preuve que la gate s'active sur tentatives non
verified — sans tentative, la gate n'a rien à faire). Si 0 sur staging
pendant la recette, c'est qu'on n'a pas testé Scénario 7. Sur prod : 0
est OK si aucune pharmacie non-verified n'a tenté d'action.

**Seuil d'alerte** : aucun. Plutôt observer la tendance.

**Croisement** : `firestore.pharmacies` count avec `licenseStatus IN
('pending_verification', 'rejected', 'correction_needed', 'expired')`. Si
le compte augmente sans baisse correspondante des verify admin, ouvrir
un ticket "pharmacie bloquée orpheline".

---

### Check 2 — Sprint 4 lock #5 respecté (1 inventory hold à l'accept exchange)

**But** : sur chaque acceptance medicine request exchange, exactement
1 update inventaire (l'item requester) doit se produire. Pas 0, pas 2.

**Cloud Logging query** :

```
resource.type="cloud_function"
resource.labels.function_name="acceptMedicineRequestOffer"
jsonPayload.message=~"acceptExchangeRequestOfferIntoCanonicalProposal: success"
```

**Pour chaque match**, vérifier en parallèle dans `medicine_request_offers/{id}` :

- `offerType === 'exchange'`
- `status === 'converted'`

Puis dans `exchange_proposals/{linkedProposalId}` :

- `details.type === 'exchange'`
- `reservations.inventoryReserved === details.exchangeQuantity` (>0)
- `reservations.walletReserved === null`

Puis dans `pharmacy_inventory/{details.exchangeInventoryItemId}` :

- `reservedQuantity` doit avoir augmenté de `exchangeQuantity` vs juste
  avant l'acceptance.
- L'item seller racine (`exchange_proposals/{pid}.inventoryItemId`) doit
  être **inchangé** à ce stade (changement à la complétion).

**Seuil d'alerte** : toute incohérence sur 1 proposal exchange ⇒ ouvrir
P1 immédiat. Lock #5 régressé = barrière sécurité cassée.

---

### Check 3 — Courier fee résolu correctement

**But** : détecter `courierFee=0` inattendu sur des deliveries dont la
city DEVRAIT avoir une config.

**Cloud Logging query** :

```
resource.type="cloud_function"
resource.labels.function_name=~"acceptExchangeProposal|acceptMedicineRequestOffer"
jsonPayload.message=~"resolved courier fee"
jsonPayload.courierFee=0
```

**Croiser** chaque match avec `system_config/main.citiesByCountry[country][city]` :

- Si la city a `deliveryFee > 0` ou `exchangeFee > 0` ⇒ **anomalie** :
  le helper aurait dû résoudre > 0.
- Si la city n'a aucun fee config ⇒ comportement attendu (no-config
  posture documentée Sprint 4).

**Seuil d'alerte** : 1 anomalie (city configurée + fee=0) ⇒ P2.

**Vérifier aussi** : `deliveries` créés avec `proposalType='exchange'`
sur une city configurée doivent avoir `courierFee = exchangeFee` ou
`round(deliveryFee * 1.2)` (Sprint 4 formule centralisée).

---

### Check 4 — Delivery completion failures

**But** : détecter wallet / ledger / inventory inconsistencies au moment
du settlement courier.

**Cloud Logging query** :

```
resource.type="cloud_function"
resource.labels.function_name="completeExchangeDelivery"
severity>=ERROR
```

**Patterns à investiguer** :

- `Buyer has insufficient balance for courier fee` ⇒ buyer wallet drift
  entre l'acceptance et la livraison. Ouvrir wallet investigation P2.
- `Insufficient stock` ⇒ seller a vidé son stock entre l'acceptance et
  la livraison (race avec une autre action). Sprint 4 lock #5 sur
  l'exchange n'empêche pas ce cas car le seller item n'est pas holdé à
  l'accept — c'est documenté. Surveiller la fréquence.
- `not-found` sur inventory : possible suppression admin entre les deux
  étapes. P2.

**Seuil d'alerte** : > 0 erreur/jour sur staging la première semaine ⇒
investigation immédiate. Sur prod, > 1% des completions ⇒ P1.

---

### Check 5 — Drift remote functions vs local

**But** : aucune function en prod qui ne soit pas dans le source.

**Cadence** : J+0 (post-deploy), J+3, J+7.

**Commande** :

```bash
node functions/scripts/audit-remote-drift.mjs --project=<project>
```

**Attendu** :

- `remote_only: []`
- `local_only: []`
- `intersection.length === <count attendu>` (42 au 2026-04-22, 45+ après
  Sprint 4 si on a déployé `createPharmacyRegistration`, `getMarketplacePharmacies`,
  `setCountryLicenseConfig`).

**Seuil d'alerte** : tout drift ⇒ rollback ou hotfix immédiat.

---

### Check 6 — Inscriptions Ghana suivies par admin

**But** : éviter que des pharmacies Ghana restent en
`pending_verification` indéfiniment.

**Commande J+1, J+3, J+7** :

```bash
node functions/scripts/auditGhanaLicenseReadiness.mjs --project=<project>
```

**Compter dans la sortie** :

- `pending_deny` augmente J+0 → J+7 sans baisse ⇒ admin GH n'a pas
  reviewé. Notifier l'admin.
- `grace_expired_deny` > 0 ⇒ pharmacies en limbe (grace consommé sans
  decision admin). P2.

**Seuil d'alerte** : `pending_deny` > 10 et croît de >50% en 24h ⇒ P3
notification produit/admin team.

---

### Check 7 — Anomalies wallet (held / deducted divergence)

**But** : détecter wallet où `held` ou `deducted` ne se résorbent pas
après les flows attendus (acceptance + delivery completion).

**Firestore query** (manuel ou via script) :

```
wallets
where updatedAt < (now - 7 days)
where (held > 0 OR deducted > 0)
```

**Croiser** chaque hit avec `exchange_proposals` où `fromPharmacyId == wallet.id` :

- Si un `exchange_proposals` en statut `accepted` existe pour ce wallet
  avec `reservations.walletReserved === wallet.deducted` ⇒ OK, en cours
  de livraison.
- Sinon ⇒ wallet orphelin. P2 investigation.

**Seuil d'alerte** : > 0 wallet orphelin ⇒ ouvrir ticket par wallet.

---

## 4. Procédure escalation

| Sévérité | Délai max | Action |
|---|---|---|
| P0 | < 1h | Rollback du deploy ; notifier tech lead + CTO. |
| P1 | < 4h | Hotfix branch + commit + redeploy. |
| P2 | < 24h | Investigation, mitigation (script de fix data si nécessaire), ticket post-mortem. |
| P3 | < 7j | Backlog + monitoring continu. |

---

## 5. Owner default et contacts

- **On-call backend** : à définir dans `CLAUDE.md` (pas encore renseigné
  au 2026-05-14, voir backlog Sprint 5 résiduel).
- **Tech lead** : à définir.
- **Admin Ghana** : pharmacie en attente de review = responsabilité de
  l'admin GH country-scoped.

---

## 6. Sortie après J+7

Si tous les checks PASS sur 7 jours consécutifs :

1. Rédiger un brief 1-pager dans `docs/release/POST_DEPLOY_REPORT_<date>.md`
   listant les contre-vérifications passées.
2. Marquer Sprint 5 en `PASS` (transition de `CONDITIONAL PASS`) si la
   recette E2E a été exécutée.
3. Décommissionner les legacy HTTP endpoints `createExchangeHold` /
   `exchangeCapture` / `exchangeCancel` dans `index.ts` (TD-LEGACY-PHARMACY-HTTP-RETIREMENT
   du backlog `CLAUDE.md`).

Si un check FAIL sur 7 jours :

1. Documenter l'incident dans `docs/release/INCIDENT_<date>.md`.
2. Garder Sprint 5 en `CONDITIONAL PASS` jusqu'à résolution + nouvelle
   fenêtre 7j clean.

---

## 7. Évolutions futures (out-of-scope Sprint 5)

- Cloud Scheduler job qui exécute audit Ghana + drift audit tous les
  jours à 06:00 UTC et publie sur un Slack channel.
- BigQuery export Firestore avec dashboards Looker Studio sur wallet
  divergence + license bucket trends.
- Alerts Cloud Monitoring sur Functions error rate > seuil.

Ces évolutions sont des **features de monitoring** et nécessitent un
sprint produit séparé. Pas dans le périmètre Sprint 5 (lock #5).
