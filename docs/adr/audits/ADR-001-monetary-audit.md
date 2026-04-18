# ADR-001 Monetary Audit

Date: `2026-04-18`  
Related ADR: `ADR-001 Top-Up Architecture Multi-Country`

## Scope

Audit pass executed on:

- `functions/src/**`
- `pharmapp_unified/lib/**`
- `admin_panel/lib/**`
- `shared/lib/**` when it reads or formats monetary data

Legend:

- `major`: local currency major units as displayed by the business flow today
- `minor`: smallest currency unit (`10^decimals`)
- `ambiguous`: mixed writers/readers or semantic mismatch

## 1. Firestore Collections

### `wallets/{uid}`

| Champ | Type | Convention actuelle | Écrit par | Lu par | Verdict | Action Phase 1a |
| --- | --- | --- | --- | --- | --- | --- |
| `available` | `int/num` | mixte: major sur la plupart des flows, `x100` dans MTN status | `functions/src/mtnMomoCheckStatus.ts:127-148`; `functions/src/index.ts:258-279`; `functions/src/index.ts:1100-1137`; `functions/src/createExchangeProposal.ts:277-281`; `functions/src/lib/requestProposalBridge.ts:191-205` | `pharmapp_unified/lib/screens/pharmacy/pharmacy_main_screen.dart:371-442`; `pharmapp_unified/lib/screens/pharmacy/sandbox_testing_screen.dart:149-153`; `pharmapp_unified/lib/services/wallet_service.dart:29-39`; `shared/lib/services/unified_wallet_service.dart:96-112` | `ambiguous` | Introduire `availableMinor` pour les nouveaux top-ups, garder `available` en dual-read, supprimer toute logique UI `/100` |
| `held` | `int/num` | mixte par contamination du même wallet | `functions/src/index.ts:427-456`; `functions/src/createExchangeProposal.ts:277-281`; `functions/src/cancelExchangeProposal.ts:119-123`; `functions/src/acceptExchangeProposal.ts:154-157` | `pharmapp_unified/lib/screens/pharmacy/pharmacy_main_screen.dart:372-451`; `pharmapp_unified/lib/screens/pharmacy/sandbox_testing_screen.dart:342`; `shared/lib/services/unified_wallet_service.dart:227-230` | `ambiguous` | Même stratégie que `available`; ne pas migrer “en place” avant dual-read |
| `deducted` | `int/num` | major dans le sous-domaine proposals/delivery | `functions/src/acceptExchangeProposal.ts:153-177`; `functions/src/lib/requestProposalBridge.ts:191-207`; `functions/src/completeExchangeDelivery.ts:213-217` | backend seulement: `completeExchangeDelivery`, capture paiement exchange | `major legacy` | Figer en Phase `1a`; migrer plus tard avec le domaine exchange |

### `payments/{id}`

| Champ | Type | Convention actuelle | Écrit par | Lu par | Verdict | Action Phase 1a |
| --- | --- | --- | --- | --- | --- | --- |
| `amount` | `number` | major | `functions/src/mtnMomoTopupIntent.ts:135-148`; `functions/src/index.ts:244-255` | `functions/src/mtnMomoCheckStatus.ts:125-128`; webhook settlement `functions/src/index.ts:220-279` | `major` | Ajouter `amountMinor` sur les nouveaux intents top-up; garder `amount` en compat |
| `currency` | `string` | devise PSP réelle, pas toujours devise métier | `functions/src/mtnMomoTopupIntent.ts:139-141` | `functions/src/mtnMomoCheckStatus.ts:125`; `functions/src/index.ts:221-251` | `ambiguous` | En sandbox, documenter explicitement la différence PSP vs métier; ne pas l’utiliser comme devise wallet finale |
| `displayCurrency` | `string` | devise métier affichée côté app | `functions/src/mtnMomoTopupIntent.ts:141` | `functions/src/mtnMomoCheckStatus.ts:125` | `major helper` | Conserver tant que le sandbox MTN force `EUR` |

### `ledger/{id}`

| Champ | Type | Convention actuelle | Écrit par | Lu par | Verdict | Action Phase 1a |
| --- | --- | --- | --- | --- | --- | --- |
| `amount` | `number` | mixte: minor dans `mtnMomoCheckStatus`, major ailleurs | `functions/src/mtnMomoCheckStatus.ts:160-166`; `functions/src/index.ts:268-279`; `functions/src/index.ts:453-456`; `functions/src/index.ts:1132-1144`; `functions/src/lib/platformTreasury.ts:93-105`; `functions/src/lib/platformPayout.ts:101-113` | `shared/lib/services/unified_wallet_service.dart:183-202`; reporting/admin ad hoc | `ambiguous` | Ajouter `amountMinor` à toute nouvelle écriture; laisser `amount` legacy en lecture |
| `totalAmount` / `sellerAmount` / `courierFee` | `number` | major | `functions/src/completeExchangeDelivery.ts:267-323` | back-office / debug only | `major legacy` | Ne pas toucher en Phase `1a` |

### `exchanges/{id}`

| Champ | Type | Convention actuelle | Écrit par | Lu par | Verdict | Action Phase 1a |
| --- | --- | --- | --- | --- | --- | --- |
| `courierFee` | `number` | major | `functions/src/index.ts:402-456` | `functions/src/index.ts:544-676`; `functions/src/lib/exchange.ts` | `major legacy` | Figer pour compat; futur `courierFeeMinor` quand le domaine exchange migre |
| `holds.a` / `holds.b` | `number` | major | `functions/src/index.ts:403-445` | `functions/src/index.ts:545-676` | `major legacy` | Figer en Phase `1a` |
| `saleAmount` | `number` | major | `functions/src/index.ts:575-642` | `functions/src/index.ts:685-714` | `major legacy` | Figer en Phase `1a` |

### `exchange_proposals/{id}`

| Champ | Type | Convention actuelle | Écrit par | Lu par | Verdict | Action Phase 1a |
| --- | --- | --- | --- | --- | --- | --- |
| `details.pricePerUnit` | `double` | major | `functions/src/createExchangeProposal.ts:355-364`; `functions/src/lib/requestProposalBridge.ts:227-232`; `pharmapp_unified/lib/services/exchange_proposal_service.dart:51-53` | `pharmapp_unified/lib/screens/pharmacy/exchanges/proposals_screen.dart:277-287`; `pharmapp_unified/lib/screens/pharmacy/exchanges/exchange_status_screen.dart:160-164` | `major` | Préparer `pricePerUnitMinor`; ne pas casser le flow legacy Phase `1a` |
| `details.totalPrice` | `double` | major | `functions/src/createExchangeProposal.ts:371-405`; `functions/src/lib/requestProposalBridge.ts:231-252` | `functions/src/createExchangeProposal.ts:255-287`; `pharmapp_unified/lib/screens/pharmacy/exchanges/create_proposal_screen.dart:920-935`; `proposals_screen.dart:285-288` | `major` | Préparer `totalPriceMinor`; tester la comparaison wallet avant migration |
| `reservations.walletReserved` | `number` | major | `functions/src/createExchangeProposal.ts:370-373`; `functions/src/lib/requestProposalBridge.ts:250-252` | `functions/src/acceptExchangeProposal.ts:148-180`; `functions/src/cancelExchangeProposal.ts:113-132`; `functions/src/completeExchangeDelivery.ts:193-229` | `major legacy` | Figer en Phase `1a`; migrer avec le domaine proposals |

### `deliveries/{id}`

| Champ | Type | Convention actuelle | Écrit par | Lu par | Verdict | Action Phase 1a |
| --- | --- | --- | --- | --- | --- | --- |
| `totalPrice` | `number` | major | `functions/src/lib/requestProposalBridge.ts:321-324` | `functions/src/completeExchangeDelivery.ts:188-197` | `major` | Figer en Phase `1a`; migrer avec proposals/delivery |
| `courierFee` | `number` | major | `functions/src/lib/requestProposalBridge.ts:323`; legacy exchange API `pharmapp_unified/lib/services/exchange_service.dart:21-31` | `functions/src/completeExchangeDelivery.ts:188-190`; `pharmapp_unified/lib/screens/pharmacy/exchanges/exchange_status_screen.dart:195-197` | `major` | Figer en Phase `1a`; définir plus tard `courierFeeMinor` |

### `platform_treasuries/{countryCode}_{currencyCode}`

| Champ | Type | Convention actuelle | Écrit par | Lu par | Verdict | Action Phase 1a |
| --- | --- | --- | --- | --- | --- | --- |
| `availableBalance` | `number/double` | major | `functions/src/lib/platformTreasury.ts:69-85`; `functions/src/lib/platformPayout.ts:69-74`; `functions/src/lib/platformPayout.ts:226-230` | `admin_panel/lib/models/platform_treasury.dart:23-33`; `admin_panel/lib/screens/system_config/plans_tab.dart:324-357`; `plans_tab.dart:1553-1592` | `major legacy` | Figer en Phase `1a`; migrer en Phase `1b` ou avec `customer_funds_pools` |
| `pendingBalance` | `number/double` | major | `functions/src/lib/platformTreasury.ts:82-85`; `functions/src/lib/platformPayout.ts:70-73`; `functions/src/lib/platformPayout.ts:155-160` | `admin_panel/lib/models/platform_treasury.dart:27-33`; `plans_tab.dart:324-357`; `plans_tab.dart:1589-1592` | `major legacy` | Figer en Phase `1a` |
| `totalCollected` / `totalWithdrawn` | `number/double` | major | `functions/src/lib/platformTreasury.ts:71-85`; `functions/src/lib/platformPayout.ts:157-160` | `admin_panel/lib/models/platform_treasury.dart:29-33`; `plans_tab.dart:328-330` | `major legacy` | Figer en Phase `1a` |

### `platform_payout_requests/{id}`

| Champ | Type | Convention actuelle | Écrit par | Lu par | Verdict | Action Phase 1a |
| --- | --- | --- | --- | --- | --- | --- |
| `amount` | `number/double` | major | `functions/src/lib/platformPayout.ts:76-99`; `functions/src/requestPlatformPayout.ts:171-198` | `admin_panel/lib/models/payout_request.dart:17-18`; `admin_panel/lib/screens/system_config/plans_tab.dart:1165`; `plans_tab.dart:1252`; `plans_tab.dart:1314`; `plans_tab.dart:1648-1652` | `major legacy` | Figer en Phase `1a` |

### `subscription_payments/{id}`

| Champ | Type | Convention actuelle | Écrit par | Lu par | Verdict | Action Phase 1a |
| --- | --- | --- | --- | --- | --- | --- |
| `amount` | `number` | major | `functions/src/sandboxSubscriptionSuccess.ts:228-243` | admin subscription reporting `admin_panel/lib/services/subscription_service.dart:375-407` | `major legacy` | Figer en Phase `1a`; prévoir `amountMinor` pour les futurs paiements réels |

### `medicine_requests/{id}`

| Champ | Type | Convention actuelle | Écrit par | Lu par | Verdict | Action Phase 1a |
| --- | --- | --- | --- | --- | --- | --- |
| `currencyCode` | `string` | scope devise, pas un montant | `functions/src/createMedicineRequest.ts:87-125`; `pharmapp_unified/lib/services/medicine_request_service.dart:22-32` | `pharmapp_unified/lib/screens/pharmacy/requests/medicine_requests_screen.dart:29-74`; `medicine_requests_screen.dart:539` | `stable` | Aucun changement en Phase `1a` |

### `medicine_request_offers/{id}`

| Champ | Type | Convention actuelle | Écrit par | Lu par | Verdict | Action Phase 1a |
| --- | --- | --- | --- | --- | --- | --- |
| `unitPrice` | `double` | major | `functions/src/submitMedicineRequestOffer.ts:169-205`; `pharmapp_unified/lib/services/medicine_request_service.dart:49-58` | `pharmapp_unified/lib/screens/pharmacy/requests/medicine_requests_screen.dart:645`; `medicine_requests_screen.dart:1017` | `major` | Figer en Phase `1a`; migrer avec le domaine requests/offers |
| `totalPrice` | `double` | major | `functions/src/submitMedicineRequestOffer.ts:169-205` | `functions/src/lib/requestProposalBridge.ts:100-140`; `pharmapp_unified/lib/screens/pharmacy/requests/medicine_requests_screen.dart:645`; `medicine_requests_screen.dart:1052` | `major` | Figer en Phase `1a`; attention car le bridge touche ensuite le wallet |

## 2. Config / Non-Collection Monetary Sources

| Champ | Type | Convention actuelle | Écrit par | Lu par | Verdict | Action Phase 1a |
| --- | --- | --- | --- | --- | --- | --- |
| `dynamic_subscription_plans.pricesByCurrency[*]` | `double` | major | `admin_panel/lib/services/system_config_service.dart:329-376` | `admin_panel/lib/models/system_config.dart:178-228` | `major legacy` | Figer en Phase `1a` |
| `system_config.main.citiesByCountry[*].deliveryFee` | `double` | major | `admin_panel/lib/services/system_config_service.dart:148-149` | `admin_panel/lib/models/city_option.dart:9-10`; `admin_panel/lib/screens/system_config/cities_tab.dart:167` | `major legacy` | Figer en Phase `1a` |
| `CurrencyOption.decimals` | `int` | canonique pour la cible ADR | `admin_panel/lib/models/currency_option.dart:7-10` | formatage / future migration | `target canonical` | Utiliser comme source de vérité pour `*Minor` |

## 3. Incohérences Critiques

1. `payments.amount` est en `major`, puis `mtnMomoCheckStatus` le convertit en `amount * 100`, puis `wallets.available` est affiché avec `/100` dans `pharmacy_main_screen`, alors que `sandboxCredit` et `sandboxDebit` écrivent le wallet en brut et que `sandbox_testing_screen` l’affiche brut.
2. Le même champ `ledger.amount` sert à stocker des montants top-up MTN en `minor` et des montants sandbox, exchange, treasury, payout en `major`.
3. `create_proposal_screen` vérifie le solde via `WalletService.getBalance()` en lisant la valeur brute du wallet, alors que `pharmacy_main_screen` montre potentiellement ce même wallet après division par `100`.
4. `submitMedicineRequestOffer.totalPrice` est en `major`, puis `requestProposalBridge` déduit le wallet acheteur avec cette même convention, ce qui devient risqué si le wallet a déjà été pollué par un top-up MTN écrit en `minor`.
5. Les helpers partagés `UnifiedWalletService.createTopup`, `createSubscriptionPayment`, `createCourierWithdrawal`, `formatXAF` et `canPaySubscription` sont tous codés en `XAF major` et prolongent le legacy.

## 4. Champs Legacy À Figer En Phase 1a

- `wallets.available`, `wallets.held`, `wallets.deducted`
- `payments.amount`
- `ledger.amount`
- `exchanges.courierFee`, `exchanges.holds.*`, `exchanges.saleAmount`
- `exchange_proposals.details.totalPrice`, `exchange_proposals.reservations.walletReserved`
- `deliveries.totalPrice`, `deliveries.courierFee`
- `platform_treasuries.availableBalance`, `pendingBalance`, `totalCollected`, `totalWithdrawn`
- `platform_payout_requests.amount`
- `subscription_payments.amount`
- `medicine_request_offers.unitPrice`, `medicine_request_offers.totalPrice`
- `dynamic_subscription_plans.pricesByCurrency[*]`
- `system_config.main.citiesByCountry[*].deliveryFee`

Règle recommandée:

- Phase `1a` n’écrase pas ces champs existants.
- Phase `1a` ajoute les nouveaux champs `*Minor` là où on ouvre un nouveau flux top-up/payment.
- Les lecteurs critiques passent en dual-read explicite jusqu’à la migration Phase `1b`.

## 5. Décisions En Suspens

1. `wallets.available` legacy: faut-il interpréter les anciens wallets comme “major par défaut” sauf documents top-up MTN, ou créer un marqueur de version/source avant toute migration ?
2. `courierFee`: reste-t-il un domaine gelé en `major` jusqu’au sprint exchange, ou doit-il rejoindre la convention `minor` dès qu’un flux delivery touche un wallet migré ?
3. `payments.currency` vs `displayCurrency` en sandbox MTN: conserve-t-on cette dualité comme exception de test, ou l’isole-t-on dans des champs provider-spécifiques ?
4. `platform_treasuries` et `platform_payout_requests`: rejoignent-ils le standard `*Minor` en Phase `1b`, ou restent-ils en legacy jusqu’à l’introduction complète de `customer_funds_pools` ?
5. UI/admin models en `double`: veut-on conserver les `double` côté lecture/présentation et normaliser seulement au boundary, ou migrer aussi les modèles UI vers des entiers minor + formatter centralisé ?

## 6. Checklist De Risque Pour Phase 1a

Tester obligatoirement après migration:

- Top-up MTN sandbox: `mtnMomoTopupIntent` → `payments` → `mtnMomoCheckStatus` → `wallets` → `pharmacy_main_screen`
- Sandbox wallet tools: `sandboxCredit` / `sandboxDebit` → `wallets` → `sandbox_testing_screen`
- Purchase proposal flow: `create_proposal_screen` → `WalletService` → `createExchangeProposal` → `acceptExchangeProposal` → `completeExchangeDelivery`
- Medicine request bridge: `submitMedicineRequestOffer` → `requestProposalBridge` → `exchange_proposals` / `deliveries` / `wallets`
- Legacy exchange courier flow: `createExchangeHold` → `exchanges` / `wallets` / `ledger` → `exchangeCapture`
- Treasury/payout flow: `sandboxSubscriptionSuccess` → `platform_treasuries` / `subscription_payments` → `requestPlatformPayout` → `resolvePlatformPayout` → admin `plans_tab`
- Courier wallet flow: `UnifiedWalletService.getCourierEarnings` / `createCourierWithdrawal` → `courier_wallet_widget`

## 7. Recommended Phase 1a Cut

- Migrer uniquement les nouveaux top-ups/payments vers `amountMinor`
- Ajouter `amountMinor` aux nouvelles écritures `payments` et `ledger`
- Ne pas migrer `wallets` legacy sans dual-read et sans stratégie doc/version
- Corriger d’abord les lecteurs UI les plus dangereux:
  - `pharmacy_main_screen.dart`
  - `wallet_service.dart`
  - `unified_wallet_service.dart`

