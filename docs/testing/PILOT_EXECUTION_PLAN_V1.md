# Plan d'exécution Post-Pilote Flux Achat — V1

**Date** : 2026-03-16
**Statut** : Validé par architecte (Codex)
**Objectif** : Corriger les gaps identifiés lors du pilote E2E flux achat, puis valider de bout en bout avant de passer au flux d'échange.

---

## Résumé des gaps

| # | Gap | Sévérité | Description |
|---|-----|----------|-------------|
| G1 | Stock non décrémenté après vente | P1 | `completeExchangeDelivery.ts` ne décrémente pas le vendeur pour `purchase` |
| G2 | Item fantôme post-livraison | P1 | L'item créé chez le destinataire a un schéma incompatible avec le modèle Flutter |
| G3 | Ledger incomplet | P2 | Pas de ledger pour hold initial ni passage held→deducted |
| G4 | Unknown Pharmacy côté courrier | P2 | `pharmacyName` vide dans les documents pharmacies pilotes |
| G5 | UIDs bruts dans Exchange Details | P2 | Pas de résolution de noms dans l'écran Exchange Status |
| G6 | $0.00 / devise courrier | P2 | Mismatch de noms de champs delivery (totalPrice vs totalValue, courierFee vs deliveryFee) |
| G7 | Historique livraisons courrier | P2 | Dashboard courrier = placeholder statique |
| G8 | Protection doublon proposition | P3 | Rien n'indique qu'une offre existe déjà sur un produit |
| G9 | Solde wallet non visible à l'achat | P3 | L'acheteur ne voit pas son solde disponible |
| G10 | Pricing display | P3 | FCFA 25/month au lieu de FCFA 25,000/month |
| G11 | Toggle availableForExchange | P3 | Flag write-only, pas d'action UI |

## Découverte architecturale : surcharge sémantique from/to

**Problème identifié** : `fromPharmacyId`/`toPharmacyId` portent deux sémantiques différentes :
- **Finance** : buyer (from) / seller (to) — correct dans `completeExchangeDelivery.ts`
- **Logistique** : pickup (from) / dropoff (to) — inversé pour un achat

**Décision d'architecture** (validée par Codex) :
- `exchange_proposals` : garde les rôles métier/financiers (`from` = buyer, `to` = seller)
- `deliveries` : doit porter les rôles logistiques (`from` = pickup = vendeur, `to` = dropoff = acheteur)
- `completeExchangeDelivery.ts` : lire buyer/seller depuis la **proposal**, pas depuis la delivery

---

## Séquence d'exécution

### Lot 1 : Contrat de données (G6 + G4/G5)

#### Étape 1 — G6 : Aligner le modèle delivery Flutter avec le backend
- **Option validée** : C (renommer + fallback)
- **Contrat canonique** : `courierFee`, `totalPrice`, `currency`
- **Fichiers** :
  - `delivery.dart` : lire `courierFee` (fallback `deliveryFee`), `totalPrice` (fallback `totalValue`), `currency`
  - `available_orders_screen.dart`, `active_delivery_screen.dart` : supprimer `$` hardcodé, formater selon `currency`
- **Statut** : fallback appliqué dans `delivery.dart`, reste le formatting UI et le renommage des propriétés Dart

#### Étape 2 — G4/G5 : Stabiliser les noms de pharmacie
- **Option validée** : C (inscription + fallback backend + patch données)
- **Cause racine** : `pharmacyName` vide dans Firestore, le formulaire écrit dans `name`/`displayName` mais pas `pharmacyName`
- **Actions** :
  - Corriger `unified_registration_screen.dart` / `unified_auth_service.dart` pour écrire `pharmacyName`
  - Ajouter fallback backend dans `acceptExchangeProposal.ts` : `pharmacyName || name || displayName`
  - Patcher les données pilotes existantes
  - G5 (UIDs bruts) : lookup UI dans `exchange_status_screen.dart` sur `pharmacies/{id}`
- **Contrat canonique** : `pharmacyName` = source de vérité métier

### Lot 2 : Cœur métier (Contrat delivery + Stock)

#### Étape 4 — Fix contrat delivery pour achat
- **Option validée** : A (delivery = logistique pure, finance = proposal)
- **Actions** :
  - `acceptExchangeProposal.ts` : pour `purchase`, écrire `fromPharmacy*` = vendeur (pickup), `toPharmacy*` = acheteur (dropoff)
  - `completeExchangeDelivery.ts` : lire buyer/seller depuis `proposal.fromPharmacyId`/`proposal.toPharmacyId`
  - `delivery.dart` : pas de changement nécessaire (from = pickup, to = dropoff est déjà sa sémantique)
- **Vigilance** : les anciennes deliveries de test ont une sémantique mixte — repartir sur des données fraîches
- **Gate** : ne pas toucher G1/G2 avant que cette étape soit validée

#### Étape 5 — G1/G2 : Stock vendeur + item acheteur (Option A+)
- **Dépendance** : étape 4 terminée
- **Actions** :
  - Ajouter décrémentation stock vendeur pour `purchase` dans `completeExchangeDelivery.ts`
    - Source : `proposal.inventoryItemId`
    - Quantité : `proposal.details.quantity`
    - Lire l'inventaire vendeur dans Phase 1b (avant les writes)
  - Corriger le schéma de l'item créé chez l'acheteur pour matcher le modèle Flutter :
    - `batch.expirationDate` (pas `expirationDate` à la racine)
    - `batch.lotNumber` (pas `batchNumber`)
    - `availabilitySettings.availableForExchange` (pas `isAvailableForExchange`)
    - Reprendre les métadonnées complètes depuis l'inventaire source
  - Cas limite : stock vendeur insuffisant au moment de la livraison → erreur ou warning

### Lot 3 : Vérification comptable

#### Étape 6 — G3 : Vérifier le ledger
- **Nature** : vérification, forte probabilité d'ouvrir un gap
- **État connu** :
  - `completeExchangeDelivery.ts` crée : `exchange_delivery_payment`, `courier_fee` (×2), `courier_payment`
  - `createExchangeProposal.ts` : **pas de ledger** pour le hold initial (available → held)
  - `acceptExchangeProposal.ts` : **pas de ledger** pour le passage held → deducted
- **Actions** : inspecter `ledger/` après un flux complet, documenter les entrées manquantes
- **Décision produit** : faut-il ajouter les ledger entries pour hold et deducted ? (probable oui pour audit trail complet)

### Lot 4 : Retest complet

#### Étape 7 — Retest flux achat E2E
- **Prérequis** : étapes 1-6 terminées
- **Règles** :
  - Repartir sur une **nouvelle** proposition et delivery (pas de réutilisation des docs existants)
  - Toujours passer par l'**UI courrier** pour `delivered` (jamais d'écriture Firestore directe)
- **Procédure** :
  1. Nouvelle proposition d'achat (pilotA → pilotB)
  2. Acceptation (pilotB)
  3. Vérifier document delivery : pickup = vendeur, dropoff = acheteur
  4. Courrier (pilotC) accepte et progresse via UI jusqu'à delivered
  5. Vérifier les 6 snapshots :
     - `exchange_proposals/{id}` — statut completed
     - `deliveries/{id}` — statut delivered, from = vendeur, to = acheteur
     - `pharmacy_inventory/{sellerItem}` — quantité décrémentée
     - `pharmacy_inventory/{buyerItem}` — item créé, bon schéma
     - `wallets/{buyer,seller,courier}` — montants cohérents
     - `ledger/` filtré par deliveryId — entrées complètes
- **Gate 2** : tous les checks passent → flux achat validé → ouvrir le flux d'échange

### Lot 5 : Post-achat (après Gate 2)

| # | Tâche | Fichier |
|---|-------|---------|
| G7 | Historique livraisons courrier | `courier_main_screen.dart` |
| G8 | Protection doublon proposition | `create_proposal_screen.dart` |
| G9 | Solde wallet visible à l'achat | `create_proposal_screen.dart` |
| G10 | Pricing display milliers | `subscription_screen.dart` |
| G11 | Toggle Published/Private | `inventory_browser_screen.dart` |

### Arbitrages métier ouverts (hors scope pilote)

| # | Sujet | Quand |
|---|-------|-------|
| A1 | Broadcast vs assignment courrier | Avant scaling |
| A2 | Création livraison immédiate vs différée | Avant scaling |
| A3 | Timeout sans courrier | Avant production |

---

## Table de mapping — Flux Achat (référence)

| Champ | Rôle financier | Rôle logistique (après fix) |
|-------|---------------|---------------------------|
| `proposal.fromPharmacyId` | Acheteur (buyer) | Destinataire (dropoff) |
| `proposal.toPharmacyId` | Vendeur (seller) | Expéditeur (pickup) |
| `delivery.fromPharmacyId` | — | Pickup = vendeur |
| `delivery.toPharmacyId` | — | Dropoff = acheteur |
| Stock décrémenté | — | Vendeur (proposal.toPharmacyId) |
| Stock incrémenté | — | Acheteur (proposal.fromPharmacyId) |
| Wallet débité | Buyer (proposal.fromPharmacyId) | — |
| Wallet crédité | Seller (proposal.toPharmacyId) | — |
| Courier payé | delivery.courierId | — |
