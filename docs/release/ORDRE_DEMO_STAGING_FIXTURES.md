# Données de démonstration — Ordre des pharmaciens (staging)

Cet outil prépare **deux pharmacies à Kumasi, un coursier et deux lots**, pour enchaîner une vente et un échange réciproque sur le web. La vente et l'échange sont créés ensuite par l'interface ; l'outil ne préfabrique ni proposition, ni livraison, ni historique. Les comptes et lots portent le marqueur `ordre-2026-09-28` et les noms dédiés commencent par `DEMO`.

La commande est **en lecture seule par défaut**. Elle refuse tout projet autre que `mediexchange-staging` et vérifie la configuration GH/Kumasi/GHS, les rôles, territoires et monnaies des comptes réutilisés. Elle enregistre un rapport contenant l'état *avant* des seuls documents ciblés sous `functions/.demo-backups/` (ignoré par Git). Garder ce fichier hors des canaux publics : il peut contenir des données de compte. Aucune suppression globale ni remise à zéro d'un lot existant n'est faite.

Créer un fichier JSON local, par exemple `functions/.demo-backups/accounts.json`, avec **exactement** ces trois rôles. Les deux variantes peuvent être combinées :

```json
{
  "seller": { "mode": "existing", "uid": "UID_PHARMACIE_1" },
  "buyer": { "mode": "existing", "uid": "UID_PHARMACIE_2" },
  "courier": { "mode": "existing", "uid": "UID_COURSIER" }
}
```

Pour un compte dédié, utiliser `{"mode":"create","email":"adresse-demo@example.com"}` à la place d'un UID. L'UID sera déterministe (`demo-ordre-2026-09-28-seller`, `-buyer` ou `-courier`). Les adresses doivent être uniques et serviront d'identifiants de connexion staging ; l'outil n'envoie aucun message. Les mots de passe ne figurent ni dans le JSON ni dans le rapport : fournir `PHARMAPP_DEMO_SELLER_PASSWORD`, `PHARMAPP_DEMO_BUYER_PASSWORD` et/ou `PHARMAPP_DEMO_COURIER_PASSWORD` dans l'environnement pour chaque nouveau compte, au moment de l'application (12 caractères minimum).

Depuis la racine du dépôt candidat, avec des **Application Default Credentials** disposant des droits staging :

```powershell
node functions/scripts/prepareDemoStaging.mjs --project=mediexchange-staging --spec=functions/.demo-backups/accounts.json
```

Inspecter le rapport et le plan imprimé. Si les UIDs réutilisés sont ceux validés pour la démo, appliquer avec :

```powershell
node functions/scripts/prepareDemoStaging.mjs --project=mediexchange-staging --spec=functions/.demo-backups/accounts.json --apply=ordre-2026-09-28 --patch-existing=yes
```

Omettre `--patch-existing=yes` si les trois comptes sont dédiés. Une relance conserve les quantités de lots déjà utilisées, refuse un lot de même ID non marqué et refuse tout wallet avec des fonds bloqués. Les wallets des pharmacies sont portés **au minimum** à 120 000 unités internes (= 1 200 GHS dans ce schéma) ; un solde supérieur est conservé. Le wallet du coursier commence à zéro et ses revenus proviendront du parcours. Les lots sont `paracetamol-syrup-120mg-5ml` (50 boîtes, vendeur) et `ibuprofen-400mg` (40 boîtes, acheteur), avec lots et expiration distincts. **Les deux lots sont privés au départ** : dans la démo, ouvrir l'inventaire du vendeur et publier le premier lot avec « Publish to Marketplace » avant de faire une proposition. Le lot retour acheteur peut rester privé, car le sélecteur d'échange accepte tout lot disponible. La licence `GH-0000` et sa vérification sont **fictives, staging uniquement** ; ne jamais représenter ces comptes comme de vraies pharmacies autorisées.

Risques et limites : l'application de comptes existants prolonge leur abonnement, peut rendre le coursier disponible et peut relever le solde des wallets. Leur licence doit déjà être vérifiée ; l'outil ne la modifie pas. Le rapport local permet une restauration ciblée après examen, mais l'outil ne restaure rien automatiquement. Si une écriture Firestore échoue et que l'absence de profils est confirmée, l'outil tente de supprimer les comptes Auth qu'il vient de créer. Si le commit ou la relecture sont incertains, il conserve les comptes Auth et demande une réconciliation manuelle. Un échec du nettoyage ou un arrêt brutal peut laisser un compte sans profil, qu'une relance avec la même adresse peut reprendre. Les comptes réutilisés doivent déjà être sur GH/Kumasi, en GHS, sans montant bloqué. Les mots de passe des comptes créés ne peuvent être récupérés par l'outil. Ne pas exécuter pendant qu'un des comptes réalise un échange : le contrôle de préimage refuse les changements détectés entre lecture et écriture.
