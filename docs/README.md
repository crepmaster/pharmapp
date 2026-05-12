# PharmApp Mobile — Documentation

> **Doc hygiene policy** : seuls les fichiers référencés dans **[`ACTIVE_DOCS.md`](ACTIVE_DOCS.md)** sont considérés comme source de vérité opérationnelle. Tout ce qui est historique vit dans **[`archive/`](archive/)** et **ne doit pas piloter les chantiers en cours**.

---

## Source de vérité unique

- **[`../CLAUDE.md`](../CLAUDE.md)** — état du projet, décisions produit verrouillées, sprint backlog, commands, architecture, testing. C'est le seul fichier qui décrit ce que fait le projet aujourd'hui.
- **[`../CLAUDE-ARCHIVE.md`](../CLAUDE-ARCHIVE.md)** — snapshot historique (read-only, disclaimers explicites en tête).

## Index des docs actives

- **[`ACTIVE_DOCS.md`](ACTIVE_DOCS.md)** — index court de tous les docs encore opérationnels (ADR, specs actives, runbooks admin, agent knowledge, sprint pack orchestrator, guides setup, testing actif).

## Archive

- **[`archive/`](archive/)** — anciens reports, sessions briefings, drafts CLAUDE, analyses pre-unified-app, anciens guides setup. Préservé pour traçabilité git, jamais source de vérité.

---

## Pour les contributeurs

- Avant de modifier le code, lire **[`../CLAUDE.md`](../CLAUDE.md)**.
- Pour les commandes dev/deploy, voir **[`../CLAUDE.md`](../CLAUDE.md#-dev-commands)** (pas `DEVELOPMENT_COMMANDS.md` qui n'est plus qu'un stub).
- Pour les ADR (Architectural Decision Records), voir **[`adr/`](adr/)**.
- Pour exécuter un sprint, voir **[`orchestrator_sprints/`](orchestrator_sprints/)**.

## Pour les agents AI

- Knowledge base : **[`agent_knowledge/`](agent_knowledge/)** (review checklist, test requirements, project learnings).
- Sprint pack orchestrator : **[`orchestrator_sprints/`](orchestrator_sprints/)**.

---

**Dernière refonte index** : 2026-05-12 (Sprint 0 — Doc Freeze).
