# Contract: Admin Master Data, Treasury, and Payouts V1

## 1. Objet

Ce contrat definit l'architecture cible pour:

- le cockpit admin de gestion des referentiels runtime
- la source de verite runtime pour pays, villes, devises et mobile money
- la remuneration de la plateforme admin en contexte multi-pays
- la tresorerie plateforme par pays/devise
- les comptes de retrait admin par pays/devise/provider

Ce contrat est la base d'implementation. Il remplace toute decision implicite sur ces sujets pour le scope V1.

Il etend et supersede, pour le scope V1 runtime/admin, la spec precedente:

- `docs/specs/FEATURE_SPEC_COUNTRY_CITY_MANAGEMENT.md`

## 2. Perimetre

Le scope V1 couvre:

- gestion admin des pays
- gestion admin des villes
- gestion admin des devises
- gestion admin des providers mobile money
- lecture runtime partagee de ce master data dans les apps
- tresorerie plateforme par pays/devise
- comptes de retrait admin par pays/devise/provider
- base de remuneration plateforme pour abonnements

Le scope V1 ne couvre pas:

- conversion FX automatique entre devises
- retrait admin automatique
- moteur de settlement multi-provider externe
- secrets API providers dans Firestore
- refonte complete des paiements mobile money
- commissions transactionnelles avancees sur achat/echange, sauf si ajoutees explicitement dans un lot ulterieur

## 3. Contexte et contraintes

L'architecture actuelle a deja:

- un admin panel dedie dans `admin_panel/`
- un ecran `SystemConfigScreen` et un `SystemConfigService`
- des configs statiques cote app dans `shared/lib/models/country_config.dart` et `shared/lib/models/cities_config.dart`
- un backend Firebase avec Firestore, Auth et Cloud Functions
- un modele wallet simple, mono-devise par document

Contraintes structurantes:

- le runtime mobile/web doit pouvoir lire les referentiels sans release applicative
- les secrets providers restent hors Firestore, dans Firebase Secrets ou equivalent serveur
- l'admin ne doit pas etre remunere directement dans un wallet utilisateur multi-devise bricolé
- la plateforme doit raisonner par circuit local: pays + devise

## 4. Decisions d'architecture

### 4.1 Source de verite runtime

`system_config/main` est la source de verite runtime unique pour:

- countries
- citiesByCountry
- currencies
- mobileMoneyProviders
- revenuePolicies

Le choix de `system_config/main` est retenu pour V1 car:

- il est coherent avec l'existant
- il minimise le blast radius par rapport a 4 collections separees
- le volume de donnees reste faible et stable sur le scope V1

### 4.2 Lecture partagee

Un `MasterDataService` partage sera la seule couche de lecture runtime du referentiel.

Ordre de lecture:

1. Firestore `system_config/main`
2. fallback statique temporaire cote `shared/`
3. echec explicite si aucune source valide n'est disponible

### 4.3 Remuneration plateforme

La plateforme est remuneree d'abord dans une tresorerie interne, pas dans le wallet personnel d'un admin.

Modele retenu:

- revenus plateforme accumules dans `platform_treasuries/{country}_{currency}`
- retrait admin manuel vers un compte de payout local
- un compte de payout par marche actif si les rails mobile money sont locaux

### 4.4 Modele devises

Le modele wallet utilisateur existant reste mono-devise par document.

Pour V1:

- pas de wallet admin multi-devise
- pas de fusion cross-currency
- une tresorerie plateforme par couple `countryCode + currencyCode`

### 4.5 Confidentialite

`system_config/main` ne stocke aucune credenciale secrete:

- pas de token webhook
- pas de client secret provider
- pas de mot de passe payout

Les secrets restent cote backend.

## 5. Conventions d'identifiants

### 5.1 Codes

- `countryCode`: ISO 3166-1 alpha-2 uppercase, ex: `CM`, `KE`, `NG`
- `currencyCode`: ISO 4217 uppercase, ex: `XAF`, `KES`, `NGN`
- `cityCode`: slug lowercase stable, ex: `douala`, `yaounde`, `nairobi`
- `providerId`: snake case stable, ex: `mtn_cm`, `orange_cm`, `mpesa_ke`

### 5.2 Documents

- `system_config/main`
- `platform_treasuries/CM_XAF`
- `platform_treasuries/KE_KES`
- `admin_payout_accounts/{autoId}`

## 6. Schema Firestore

## 6.1 `system_config/main`

Document unique de configuration runtime.

```json
{
  "schemaVersion": 1,
  "status": "active",
  "primaryCountryCode": "CM",
  "primaryCurrencyCode": "XAF",
  "countries": {
    "CM": {
      "code": "CM",
      "name": "Cameroon",
      "dialCode": "237",
      "defaultCurrencyCode": "XAF",
      "timezone": "Africa/Douala",
      "enabled": true,
      "defaultCityCode": "douala",
      "providerIds": ["mtn_cm", "orange_cm"],
      "sortOrder": 10
    },
    "KE": {
      "code": "KE",
      "name": "Kenya",
      "dialCode": "254",
      "defaultCurrencyCode": "KES",
      "timezone": "Africa/Nairobi",
      "enabled": true,
      "defaultCityCode": "nairobi",
      "providerIds": ["mpesa_ke", "airtel_ke"],
      "sortOrder": 20
    }
  },
  "citiesByCountry": {
    "CM": {
      "douala": {
        "code": "douala",
        "name": "Douala",
        "region": "Littoral",
        "enabled": true,
        "isMajorCity": true,
        "deliveryFee": 1200,
        "currencyCode": "XAF",
        "latitude": 4.0511,
        "longitude": 9.7679,
        "validationRadiusKm": 20,
        "sortOrder": 10
      }
    }
  },
  "currencies": {
    "XAF": {
      "code": "XAF",
      "name": "Central African CFA Franc",
      "symbol": "FCFA",
      "decimals": 0,
      "enabled": true,
      "displayPattern": "#,##0 XAF",
      "fxBaseRate": 600.0,
      "sortOrder": 10
    }
  },
  "mobileMoneyProviders": {
    "mtn_cm": {
      "id": "mtn_cm",
      "name": "MTN Mobile Money",
      "countryCode": "CM",
      "currencyCode": "XAF",
      "methodCode": "mtn_momo",
      "kind": "mobile_money",
      "enabled": true,
      "requiresMsisdn": true,
      "supportsCollections": true,
      "supportsPayouts": true,
      "displayOrder": 10,
      "brandColor": "#FFCB05",
      "logoAsset": "assets/images/operators/mtn_logo.png"
    }
  },
  "revenuePolicies": {
    "subscriptions": {
      "enabled": true,
      "mode": "full_amount_to_platform"
    },
    "purchases": {
      "enabled": false,
      "commissionBps": 0
    },
    "exchanges": {
      "enabled": false,
      "commissionBps": 0
    },
    "courierFees": {
      "enabled": false,
      "platformShareBps": 0
    }
  },
  "updatedAt": "<serverTimestamp>",
  "updatedByAdminId": "<adminUid>"
}
```

### 6.1.1 Regles de contrat

- `countries` ne contient que les pays exploitables par le produit
- `citiesByCountry[countryCode]` ne contient que les villes configurables pour ce pays
- `deliveryFee` est exprimee dans la devise locale de la ville
- `providerIds` d'un pays doivent pointer vers des providers existants
- `defaultCurrencyCode` d'un pays doit pointer vers une devise existante
- `defaultCityCode` d'un pays doit pointer vers une ville existante du meme pays

## 6.2 `platform_treasuries/{countryCode}_{currencyCode}`

Tresorerie plateforme par marche local.

```json
{
  "id": "CM_XAF",
  "countryCode": "CM",
  "currencyCode": "XAF",
  "status": "active",
  "availableBalance": 0,
  "pendingBalance": 0,
  "totalCollected": 0,
  "totalWithdrawn": 0,
  "lastPayoutAt": null,
  "updatedAt": "<serverTimestamp>",
  "updatedByAdminId": "<adminUid|null>"
}
```

### 6.2.1 Regles de contrat

- une tresorerie unique par couple `countryCode + currencyCode`
- les revenus plateforme crediteurs augmentent `availableBalance`
- un retrait admin reduit `availableBalance` et augmente `totalWithdrawn`
- `pendingBalance` est reserve pour les flux futurs de settlement si necessaire

## 6.3 `admin_payout_accounts/{autoId}`

Comptes de retrait admin, locaux par pays/devise/provider.

```json
{
  "adminUserId": "<adminUid>",
  "label": "MTN Cameroun principal",
  "countryCode": "CM",
  "currencyCode": "XAF",
  "providerId": "mtn_cm",
  "accountType": "mobile_money",
  "msisdn": "2376XXXXXXXX",
  "accountName": "Nom titulaire",
  "isDefault": true,
  "isActive": true,
  "verificationStatus": "unverified",
  "lastUsedAt": null,
  "createdAt": "<serverTimestamp>",
  "updatedAt": "<serverTimestamp>"
}
```

### 6.3.1 Regles de contrat

- un compte payout appartient a un admin
- il est lie a un seul pays, une seule devise et un seul provider
- un seul compte `isDefault = true` par tuple `adminUserId + countryCode + currencyCode`
- les comptes payout sont des donnees privees admin, jamais exposees au runtime public

## 6.4 `ledger`

Le ledger reste la source d'audit des mouvements financiers.

Nouveaux types reserves au domaine plateforme:

- `platform_subscription_revenue`
- `platform_payout_requested`
- `platform_payout_completed`
- `platform_payout_failed`

Contrat minimal de ces entrees:

```json
{
  "type": "platform_subscription_revenue",
  "treasuryId": "CM_XAF",
  "countryCode": "CM",
  "currency": "XAF",
  "amount": 25000,
  "sourceType": "subscription",
  "sourceId": "<paymentId|subscriptionId>",
  "from": "external",
  "to": "platform_treasury",
  "createdAt": "<serverTimestamp>"
}
```

## 7. Ecrans admin cibles

Le cockpit V1 est implemente dans `admin_panel`.

## 7.1 `SystemConfigScreen`

L'ecran doit evoluer vers 5 onglets:

1. Countries
2. Cities
3. Currencies
4. Mobile Money
5. Revenue and Treasury

## 7.2 Onglet Countries

Fonctions:

- lister les pays
- activer/desactiver un pays
- definir devise par defaut
- definir ville par defaut
- ordonner les pays

## 7.3 Onglet Cities

Fonctions:

- lister les villes par pays
- ajouter une ville
- modifier `deliveryFee`, `validationRadiusKm`, `enabled`
- activer/desactiver une ville

## 7.4 Onglet Currencies

Fonctions:

- lister les devises supportees
- activer/desactiver une devise
- modifier symbole, pattern, taux de base, decimals
- definir la devise primaire

## 7.5 Onglet Mobile Money

Fonctions:

- lister les providers par pays
- ajouter un provider
- activer/desactiver un provider
- definir `methodCode`, support payout, support collection
- ordonner l'affichage

## 7.6 Onglet Revenue and Treasury

Fonctions:

- voir les tresoreries par pays/devise
- voir les comptes payout admin
- definir les policies de revenu de plateforme
- voir les entrees ledger plateforme

## 8. Services cibles

## 8.1 `admin_panel/lib/services/system_config_service.dart`

Evolution attendue:

- devenir le service d'ecriture principal de `system_config/main`
- exposer des methodes fines:
  - `upsertCountry`
  - `toggleCountry`
  - `upsertCity`
  - `removeCity`
  - `upsertCurrency`
  - `toggleCurrency`
  - `upsertProvider`
  - `toggleProvider`
  - `updateRevenuePolicies`

## 8.2 Nouveau `shared/lib/services/master_data_service.dart`

Responsabilites:

- charger `system_config/main`
- exposer des getters runtime simples
- appliquer le fallback temporaire sur `country_config.dart` et `cities_config.dart`
- cacher au client la structure Firestore brute

API cible minimale:

- `Future<MasterDataSnapshot> load()`
- `List<CountryOption> getEnabledCountries()`
- `List<CityOption> getEnabledCities(String countryCode)`
- `CurrencyOption? getCurrency(String currencyCode)`
- `List<ProviderOption> getEnabledProviders(String countryCode)`
- `int? getCityDeliveryFee(String countryCode, String cityCode)`

## 8.3 Nouveau `admin_panel/lib/services/platform_treasury_service.dart`

Responsabilites:

- lire les tresoreries
- lire les comptes payout
- creer/mettre a jour les comptes payout
- creer des demandes de payout admin

## 9. Runtime app: branchements obligatoires

## 9.1 Ecrans d'inscription et selection pays/ville

Les ecrans aujourd'hui branches sur les configs statiques doivent lire `MasterDataService`.

Impact cible:

- `CountryPaymentSelectionScreen`
- ecrans de registration pharmacy/courier
- validations de ville/pays

## 9.2 Paiement / Mobile Money

Le choix des providers visibles a l'utilisateur doit venir du referentiel runtime:

- providers disponibles selon `countryCode`
- devise locale derivee du pays
- validation minimale du provider actif

## 9.3 Delivery fees

Les frais de livraison par ville doivent venir de `citiesByCountry`.

## 9.4 Subscription pricing

Les ecrans de pricing doivent s'aligner sur:

- la devise active
- les plans dynamiques existants
- la policy plateforme

## 10. Remuneration admin

## 10.1 Modele retenu V1

Le revenu plateforme V1 repose d'abord sur les abonnements.

Flux retenu:

1. la pharmacie paie un abonnement
2. le backend confirme le paiement
3. le backend credite la tresorerie `platform_treasuries/{country}_{currency}`
4. le backend ecrit une entree `ledger`
5. l'abonnement est active ou renouvelle

## 10.2 Ce qui n'est pas retenu en V1

- credit direct du compte personnel admin
- wallet admin multi-devise dans `wallets/{adminUid}`
- conversion automatique d'une devise vers une autre
- retrait auto planifie

## 10.3 Payout admin

Flux cible V1:

1. l'admin ouvre le cockpit
2. choisit une tresorerie locale
3. choisit un compte payout local
4. saisit un montant
5. cree une demande de payout
6. le backend valide et execute plus tard

Pour V1, le payout peut rester:

- manuel par operation admin
- ou marque "requested" si l'automatisation n'est pas encore branchee

## 11. Securite et droits

## 11.1 Lecture

- `system_config/main`: lecture autorisee aux apps runtime pour les champs publics
- `platform_treasuries/*`: lecture reservee admin
- `admin_payout_accounts/*`: lecture reservee a l'admin proprietaire et/ou super_admin

## 11.2 Ecriture

- `system_config/main`: ecriture reservee `super_admin`
- `platform_treasuries/*`: ecriture reservee backend ou super_admin selon use case
- `admin_payout_accounts/*`: ecriture reservee admin + backend
- `ledger`: ecriture reservee backend

## 11.3 Donnees interdites dans `system_config/main`

- token provider
- client secret
- webhook shared secret
- credentials payout

## 12. Migration

## 12.1 Etat initial

Le systeme lit aujourd'hui des referentiels statiques dans `shared/`.

## 12.2 Strategie retenue

Migration progressive en 3 phases:

### Phase A

- remplir `system_config/main`
- cockpit admin capable de lire/editer cette source

### Phase B

- introduire `MasterDataService`
- brancher les ecrans runtime sur le service avec fallback statique

### Phase C

- retirer progressivement les usages directs des configs statiques
- conserver le fallback uniquement comme garde temporaire

## 12.3 Compatibilite

Tant que la migration n'est pas complete:

- les configs statiques restent la source de secours
- aucun ecran runtime ne doit parser directement `system_config/main`
- tout passe par `MasterDataService`

## 13. Lots d'execution

## Lot 1 - Contrat de donnees et cockpit admin V1

- finaliser `system_config/main`
- etendre `SystemConfigScreen`
- ajouter les onglets Countries, Cities, Currencies, Mobile Money

## Lot 2 - Runtime master data

- creer `MasterDataService`
- brancher inscriptions et selections pays/ville/provider
- brancher delivery fees dynamiques

## Lot 3 - Treasury and revenue

- creer `platform_treasuries`
- creer `admin_payout_accounts`
- implementer credit des tresoreries pour abonnements
- ecrire le ledger plateforme associe

## Lot 4 - Admin payouts

- cockpit payout
- demande de retrait
- execution backend manuelle ou semi-manuelle

## 14. Criteres d'acceptation

Le contrat est considere implemente quand:

- un super admin peut creer/editer pays, villes, devises et providers sans release app
- le runtime affiche les pays et villes depuis Firestore
- les providers visibles varient selon le pays actif
- les frais de livraison par ville viennent du referentiel runtime
- les revenus d'abonnement crediteurs alimentent la bonne tresorerie locale
- un admin peut enregistrer au moins un compte payout local par pays/devise/provider
- aucune credenciale secrete n'apparait dans `system_config/main`

## 15. Tests de validation

Tests minimaux a executer:

- ajout d'un nouveau pays dans le cockpit
- ajout d'une nouvelle ville active pour un pays existant
- ajout d'un nouveau provider mobile money sur un pays existant
- verification qu'un ecran runtime voit la nouvelle config sans release
- paiement abonnement sur un pays donne -> credit de la bonne tresorerie
- creation d'un compte payout admin local

## 16. Decisions deja prises

Les points suivants sont figes par ce contrat:

- `system_config/main` est la source de verite runtime V1
- `MasterDataService` est obligatoire
- `platform_treasuries/{country}_{currency}` est le modele de tresorerie retenu
- les comptes payout admin sont locaux par pays/devise/provider
- pas de wallet admin multi-devise
- les secrets providers restent hors Firestore

## 17. Points ouverts hors V1

Ces sujets ne bloquent pas V1, mais restent ouverts:

- faut-il sortir plus tard `countries`, `cities`, `currencies`, `providers` en collections separees
- faut-il auditer les echanges sans paiement via un ledger stock-specifique
- faut-il ajouter des commissions plateforme sur purchase/exchange
- faut-il introduire un agrégateur de paiements multi-pays
- faut-il supporter le multi-admin avec workflows d'approbation payout

## 18. Statut

Statut du contrat:

- valide pour cadrage
- valide pour execution par lots
- toute deviation doit faire l'objet d'un avenant explicite
