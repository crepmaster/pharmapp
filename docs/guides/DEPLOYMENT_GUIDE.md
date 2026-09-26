# PharmApp — Statut de déploiement

> **Page de statut sécurisé.** Ce document ne contient **aucune procédure de
> déploiement copiable**. L'ancien guide pas-à-pas (réinstallation globale de la
> CLI, sélection de projet, déploiements directs vers la production) a
> été retiré le 2026-07-22 par
> [ADR-002](../adr/ADR-002-consolidated-deployment-surface.md) — son historique
> reste consultable dans l'historique Git de ce fichier.

## Règle

```text
Le déploiement direct est interdit. Le point d'entrée staging est :
npm run deploy:staging -- preflight --project=mediexchange-staging

Les phases expand, contract et verify sont câblées dans ce même point
d'entrée. Leur première utilisation distante reste à valider sur staging.
Aucune commande de déploiement Firebase ou GCloud ne doit être exécutée directement.
```

## Ce qui est disponible aujourd'hui

- **`preflight`** — ne mute rien : elle installe
  depuis les lockfiles, build, vérifie les exports, exécute les tests backend,
  la barrière, les tests Firestore Rules (CLI locale verrouillée), calcule
  l'empreinte de l'artefact Functions et refuse toute dérive Git. Elle prouve
  qu'un commit est déployable, sans le déployer.

## Phases staging supplémentaires

- **`expand`** — construit et vérifie Functions et les deux sites Web, puis
  publie indexes, Functions et Hosting dans cet ordre. Il inscrit une preuve
  distante après vérification de l'inventaire, de health et des deux pages.
- **`contract`** — déploie les Rules seulement si cette preuve correspond au
  commit et à l'empreinte Functions reconstruite localement.
- **`verify`** — relit la preuve et contrôle les surfaces distantes.

Le chemin production reste hors périmètre. Voir le workflow staging pour les
prérequis, l'ordre exact et le statut de validation distante.

## Où trouver le reste

- **Workflow staging** (source de vérité du process) :
  [../release/STAGING_WORKFLOW.md](../release/STAGING_WORKFLOW.md).
- **Setup projet staging** :
  [../release/STAGING_SETUP_FIREBASE_PROJECT.md](../release/STAGING_SETUP_FIREBASE_PROJECT.md).
- **Décisions d'architecture de livraison** :
  [../adr/ADR-002-consolidated-deployment-surface.md](../adr/ADR-002-consolidated-deployment-surface.md).
