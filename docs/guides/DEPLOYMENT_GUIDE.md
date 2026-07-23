# PharmApp — Statut de déploiement

> **Page de statut sécurisé.** Ce document ne contient **aucune procédure de
> déploiement copiable**. L'ancien guide pas-à-pas (réinstallation globale de la
> CLI, sélection de projet, déploiements directs vers la production) a
> été retiré le 2026-07-22 par
> [ADR-002](../adr/ADR-002-consolidated-deployment-surface.md) — son historique
> reste consultable dans l'historique Git de ce fichier.

## Règle

```text
Le déploiement direct est interdit. Seul le preflight local est disponible :
npm run deploy:staging -- preflight --project=mediexchange-staging

Les phases expand, contract et verify ne sont pas implémentées.
Aucune commande de déploiement Firebase ou GCloud ne doit être exécutée directement.
```

## Ce qui est disponible aujourd'hui

- **`preflight`** — l'unique phase implémentée. Ne mute rien : elle installe
  depuis les lockfiles, build, vérifie les exports, exécute les tests backend,
  la barrière, les tests Firestore Rules (CLI locale verrouillée), calcule
  l'empreinte de l'artefact Functions et refuse toute dérive Git. Elle prouve
  qu'un commit est déployable, sans le déployer.

## Ce qui n'est PAS disponible

- **`expand` / `contract` / `verify`** — non implémentées. Tant qu'elles ne le
  sont pas, il n'existe **aucun** chemin de déploiement supporté vers staging ou
  production. Ne pas contourner par une commande Firebase directe : c'est
  exactement l'incident du 2026-07-21 (règles en avance sur leur callable) que
  cette barrière existe pour empêcher.

## Où trouver le reste

- **Workflow staging** (source de vérité du process) :
  [../release/STAGING_WORKFLOW.md](../release/STAGING_WORKFLOW.md) — décrit
  l'état-cible des phases mutantes, lui aussi non exécutable.
- **Setup projet staging** :
  [../release/STAGING_SETUP_FIREBASE_PROJECT.md](../release/STAGING_SETUP_FIREBASE_PROJECT.md).
- **Décisions d'architecture de livraison** :
  [../adr/ADR-002-consolidated-deployment-surface.md](../adr/ADR-002-consolidated-deployment-surface.md).
