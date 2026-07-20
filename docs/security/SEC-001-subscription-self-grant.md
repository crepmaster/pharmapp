# SEC-001 — Auto-octroi d'abonnement par écriture client

**Sévérité : HAUTE** · **Statut : CONFIRMÉ, non corrigé** · **Découvert : 2026-07-20**
**Correction planifiée : sprint sécurité post-démo (commit C2)**

> ⚠️ Ce document décrit une vulnérabilité **non corrigée** au moment de sa
> rédaction. Il est volontairement détaillé pour que la correction n'ait pas
> à refaire l'analyse. Ne pas le diffuser hors équipe.

---

## Résumé

Une pharmacie authentifiée peut s'octroyer un abonnement actif en écrivant
directement sur son propre document `pharmacies/{uid}`. Le contournement
défait **les deux couches** de contrôle : les Firestore Rules et la
validation backend, parce qu'elles lisent le même champ contrôlé par le
client.

## Preuve d'exploitation

Exécutée dans le Firestore Emulator (`demo-pharmapp-rules`), jamais sur
staging ni production. Seed : pharmacie valide en
`hasActiveSubscription: false, subscriptionStatus: "expired"`.

| # | Écriture tentée par le propriétaire | Résultat |
|---|---|---|
| 1 | `hasActiveSubscription: true` | **ALLOWED** |
| 2 | `subscriptionStatus: "active"` | **ALLOWED** |
| 3 | `subscriptionEndDate: 2099-01-01` | **ALLOWED** |
| 4 | `subscriptionPlan: "enterprise"` | **ALLOWED** |
| 5 | les quatre ensemble | **ALLOWED** |
| 6 | contrôle négatif : autre uid sur le même doc | DENIED (attendu) |
| 7 | contrôle positif : `address` | ALLOWED (attendu) |

Les contrôles 6 et 7 rendent le résultat concluant : les règles fonctionnent
et le chemin d'update n'est pas cassé — les 5 ALLOWED sont bien une
permission accordée.

## Cause

`firestore.rules` autorise le propriétaire à mettre à jour son document :

```
allow update: if isOwner(userId) && isValidPharmacyData(...) && [9 champs licence protégés]
```

`isValidPharmacyData` ne valide que des **types**, jamais des valeurs :

```
(!data.keys().hasAny(['hasActiveSubscription']) || data.hasActiveSubscription is bool) &&
(!data.keys().hasAny(['subscriptionStatus'])    || data.subscriptionStatus is string)
```

`subscriptionEndDate`, `subscriptionPlan` et `subscriptionStartDate` ne sont
même pas mentionnés. Les champs licence ont été protégés au Sprint 2A.1 ;
les champs abonnement ne l'ont jamais été.

**Origine probable** : le « B2 fix » faisait écrire ces champs par le client
à l'inscription. Les règles ont été ouvertes pour ce flux légitime, et
l'ouverture est restée après que `createPharmacyRegistration` (Sprint 2A.3)
a repris la main côté serveur.

## Impact

`hasActiveSubscription()` est consommé à **8 sites** dans les règles, dont
des `allow create` sur les collections métier.

Côté backend, `getValidSubscription()`
([subscriptionValidators.ts:33-54](../../functions/src/subscriptionValidators.ts))
lit exactement les mêmes champs. **La validation serveur n'apporte donc
aucune protection ici** : elle interroge une donnée que le client contrôle.

**Vecteur secondaire** : `subscriptionStartDate` sert de trace à l'invariant
architecte « ONE trial per pharmacy, ever »
([startTrialForPharmacy.ts:92](../../functions/src/lib/startTrialForPharmacy.ts)).
Effacer ce champ permet de réclamer un nouveau trial. Exploitation indirecte
(nécessite un cycle `adminVerifyPharmacyLicense`), mais l'invariant tombe.

## Champs concernés

| Champ | Lecteurs faisant autorité |
|---|---|
| `subscriptionStatus` | règles, `getValidSubscription`, `shouldStartTrial` |
| `subscriptionEndDate` | règles, `getValidSubscription` |
| `hasActiveSubscription` | règles — condition d'entrée |
| `subscriptionPlan` | `getSubscriptionPlan()` → quotas d'inventaire |
| `subscriptionStartDate` | `shouldStartTrial()` — invariant trial unique |

## Producteurs légitimes — tous Admin SDK

`createPharmacyRegistration`, `startTrialForPharmacy`,
`adminVerifyPharmacyLicense`, `sandboxSubscriptionSuccess`,
`devSubscription`, `subscriptionValidators`. Tous contournent les règles.

**Aucun producteur client légitime.** Vérifié : aucun `.set()` / `.update()`
sur ces champs dans les services Flutter. Le bloc client-write de
[unified_auth_service.dart:284-289](../../shared/lib/services/unified_auth_service.dart)
est **inatteignable pour les pharmacies** — le chemin `UserType.pharmacy`
fait `return credential` en amont (ligne 216) depuis le Sprint 2A.3.

→ Verrouiller ces champs côté client ne casse aucun flux du dépôt actuel.

## Correction proposée (commit C2)

Symétrique du dispositif licence déjà éprouvé :

```ts
PROTECTED_SUBSCRIPTION_FIELDS = [
  'hasActiveSubscription', 'subscriptionStatus', 'subscriptionEndDate',
  'subscriptionPlan', 'subscriptionStartDate',
]
```

- `allow create` : champs absents obligatoires
- `allow update` : champs inchangés obligatoires
- constante exportée d'un module TS, avec drift-guard sur `firestore.rules`

## Checklist avant déploiement production

- [ ] Patch des 5 champs + tests `assertFails` (le probe local devient la suite)
- [ ] **Vérifier les règles réellement déployées en prod** — la prod est en
      retard sur `main` (audit drift 2026-05-20), elles peuvent différer du
      fichier local
- [ ] Compatibilité des clients déployés anciens : un binaire antérieur au
      Sprint 2A.3 pourrait encore emprunter le chemin client-write et serait
      cassé par le verrou
- [ ] Recette staging
- [ ] Déploiement production dans un commit/déploiement **séparé** du sprint
      currency
- [ ] Audit des données : pharmacies dont l'abonnement ne correspond à aucun
      paiement (détection d'exploitation passée)

## Décision du 2026-07-20

Isolé du sprint currency et différé après la démo. La correction est simple
côté code, mais son déploiement production exige l'analyse des anciens
clients — risque non justifié la veille d'une démo. Le sprint currency
(commit C1) durcit uniquement `couriers.countryCode` et `users.role`.

## Probe

Test d'exploitation conservé localement, non committé
(`functions/src/__tests__/firestore-rules-subscription-probe.test.ts`). À
transformer en suite `assertFails` et à committer **avec** le patch — pas
avant, pour ne pas pousser une suite rouge.
