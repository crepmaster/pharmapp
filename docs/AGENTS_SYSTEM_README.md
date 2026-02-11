# PharmApp Agents System - Documentation Complete

Système complet de 4 agents avec base de connaissance partagée et boucle de feedback.

## 📁 Structure du Projet

```
pharmapp-agents-system/
├── README.md                          # Ce fichier
├── docs/
│   └── agent_knowledge/               # Base de connaissance partagée
│       ├── coding_guidelines.md       # Best practices complètes ✅
│       ├── common_mistakes.md         # Erreurs récurrentes (vide au début) ✅
│       ├── pharmapp_patterns.md       # Patterns validés PharmApp ✅
│       ├── review_checklist.md        # Checklist pour reviewer ✅
│       ├── test_requirements.md       # Standards de test ✅
│       └── project_learnings.md       # Learnings du projet (vide au début) ✅
└── agents/
    ├── agent-testeur.md               # Votre agent testeur adapté ✅
    ├── agent-reviewer.md              # Votre agent reviewer adapté ⚠️
    ├── agent-chef-projet.md           # Nouveau - Orchestrateur 🆕
    └── agent-codeur.md                # Nouveau - Développeur 🆕
```

## 🎯 Les 4 Agents

### 1. **Agent Chef de Projet** (`agent-chef-projet.md`)
**Rôle** : Orchestrateur et gardien de la qualité
- Analyse les demandes utilisateur
- Brief les agents avec le contexte des erreurs passées
- Valide la qualité globale
- Met à jour la base de connaissance
- Maintient `common_mistakes.md` et `project_learnings.md`

### 2. **Agent Codeur** (`agent-codeur.md`)
**Rôle** : Développeur qui apprend des erreurs passées
- Consulte OBLIGATOIREMENT `common_mistakes.md` avant de coder
- Suit les patterns de `pharmapp_patterns.md`
- Crée `code_explanation.md` documentant ses choix
- Fait une auto-review avant de livrer
- Corrige selon le feedback du reviewer

### 3. **Agent Reviewer** (`agent-reviewer.md`)
**Rôle** : Expert code review avec documentation des erreurs
- Review selon `review_checklist.md`
- Crée `review_report.md` avec les problèmes trouvés
- Crée `review_feedback.md` avec corrections détaillées pour le codeur
- MET À JOUR `common_mistakes.md` avec nouvelles erreurs récurrentes
- Focus sur sécurité, paiements, transactions

### 4. **Agent Testeur** (`agent-testeur.md`)
**Rôle** : Testeur rigoureux avec preuves obligatoires
- Consulte `test_requirements.md` pour les standards
- Exécute tests avec capture de TOUTES les preuves
- Vérifie Firebase/Firestore systématiquement
- Crée `test_proof_report.md` avec toutes les preuves
- Crée `test_feedback.md` pour les autres agents

## 🔄 Workflow Standard

```
User: "Ajouter webhook Airtel Money pour Tanzanie"
    ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. CHEF DE PROJET                                           │
│ - Analyse la demande                                        │
│ - Crée un plan : Codeur → Reviewer → Testeur               │
│ - Brief le Codeur avec erreurs passées de common_mistakes  │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. CODEUR                                                   │
│ - Lit coding_guidelines.md                                  │
│ - Lit common_mistakes.md (webhooks, idempotence)           │
│ - Suit pharmapp_patterns.md (webhook MTN comme ref)        │
│ - Code avec les patterns validés                           │
│ - Crée code_explanation.md                                 │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. REVIEWER                                                 │
│ - Review selon review_checklist.md                         │
│ - Crée review_report.md (problèmes trouvés)                │
│ - Crée review_feedback.md (corrections pour codeur)        │
│ - Met à jour common_mistakes.md si nouvelle erreur         │
└────────────────────────┬────────────────────────────────────┘
                         ↓
         ┌───────────────┴──────────────┐
         │ Corrections nécessaires ?     │
         └───────┬──────────────┬────────┘
           OUI   │              │ NON
                 ↓              ↓
┌─────────────────────────┐    │
│ CODEUR corrige selon    │    │
│ review_feedback.md      │    │
│ → Retour au REVIEWER    │    │
└─────────────────────────┘    │
                               ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. TESTEUR                                                  │
│ - Lit test_requirements.md                                 │
│ - Exécute tests avec preuves (outputs, Firebase, logs)     │
│ - Crée test_proof_report.md (preuves complètes)            │
│ - Crée test_feedback.md (bugs trouvés, métriques)          │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. CHEF DE PROJET - Validation Finale                      │
│ - Vérifie tous les rapports (code + review + test)         │
│ - Met à jour common_mistakes.md (erreurs récurrentes)      │
│ - Met à jour project_learnings.md (décisions, learnings)   │
│ - Décision: ✅ VALIDÉ / ⚠️ CORRECTIONS / ❌ À REPRENDRE     │
└─────────────────────────────────────────────────────────────┘
```

## 🔑 Fichiers Clés du Workflow

### Créés par les Agents (à chaque cycle)
- `code_explanation.md` - Documentation du codeur
- `review_report.md` - Rapport de review
- `review_feedback.md` - Corrections détaillées pour le codeur
- `test_proof_report.md` - Rapport de tests avec preuves
- `test_feedback.md` - Feedback testeur pour les autres agents

### Base de Connaissance (Maintenue par Chef de Projet)
- `common_mistakes.md` - Erreurs récurrentes (mis à jour par Reviewer + Chef)
- `project_learnings.md` - Décisions et learnings (mis à jour par Chef)

## 🚀 Mise en Place

### Étape 1 : Copier les Fichiers

1. Copiez tout le dossier `pharmapp-agents-system/` dans votre projet
2. Structure recommandée :
```
votre-projet-pharmapp/
├── [votre code existant]
├── docs/
│   └── agent_knowledge/     # ← Copier ici
└── .claude/                 # Ou votre dossier d'agents
    └── agents/              # ← Copier ici
```

### Étape 2 : Configurer les Agents dans Claude Code

Dans votre configuration Claude Code (ou .mcp si applicable) :

```json
{
  "agents": [
    {
      "name": "chef-projet",
      "file": ".claude/agents/agent-chef-projet.md"
    },
    {
      "name": "codeur",
      "file": ".claude/agents/agent-codeur.md"
    },
    {
      "name": "reviewer",
      "file": ".claude/agents/agent-reviewer.md"
    },
    {
      "name": "testeur",
      "file": ".claude/agents/agent-testeur.md"
    }
  ]
}
```

### Étape 3 : Adapter à Votre Projet

**Fichiers à personnaliser** :

1. **`coding_guidelines.md`** :
   - Ajoutez vos standards spécifiques
   - Adaptez les exemples à votre stack exacte

2. **`pharmapp_patterns.md`** :
   - Ajoutez vos patterns existants validés
   - Référencez vos fichiers réels

3. **`common_mistakes.md`** :
   - Laissez vide au début
   - Sera enrichi automatiquement par le Reviewer

4. **Les 4 agents** :
   - Adaptez les chemins de fichiers si différents
   - Ajustez les ports si vous n'utilisez pas 8084/8085/etc.
   - Modifiez les test accounts

### Étape 4 : Premier Test

Testez le workflow avec une petite feature :

```
User: "Ajouter un bouton logout dans l'app pharmacie"

@chef-projet: Nouvelle tâche simple - Ajouter logout
[Le Chef brief le Codeur avec le contexte]

@codeur: [code le bouton]
[Crée code_explanation.md]

@reviewer: [review le code]
[Crée review_report.md]

@testeur: [teste le bouton]
[Crée test_proof_report.md avec preuves]

@chef-projet: [Valide et met à jour les learnings]
```

## 💡 Points Importants

### Pour Que Ça Fonctionne Bien

1. **Le Chef de Projet DOIT briefer le Codeur** avec les erreurs passées
2. **Le Codeur DOIT lire `common_mistakes.md`** avant de coder
3. **Le Reviewer DOIT mettre à jour `common_mistakes.md`** si nouvelle erreur récurrente
4. **Le Testeur DOIT fournir des preuves** (pas juste "ça marche")
5. **Le Chef DOIT mettre à jour `project_learnings.md`** après chaque cycle

### Métriques à Suivre

Le Chef de Projet suit :
- **Taux de première approbation** (objectif >80%)
- **Erreurs récurrentes** (tendance à la baisse)
- **Temps moyen par cycle** (optimisation continue)

## 🔧 Troubleshooting

### "Les agents ne suivent pas le workflow"
→ Assurez-vous que les agents lisent bien les fichiers de `docs/agent_knowledge/` AVANT d'agir

### "common_mistakes.md reste vide"
→ Le Reviewer doit explicitement mettre à jour ce fichier après chaque review

### "Le Codeur répète les mêmes erreurs"
→ Le Chef de Projet doit briefer explicitement avec les sections de `common_mistakes.md`

### "Pas de preuves dans les rapports de test"
→ Le Testeur doit exécuter les commandes ET capturer les outputs (voir `test_requirements.md`)

## 📚 Documentation

### Pour les Agents
- Lisez `coding_guidelines.md` pour les best practices
- Consultez `pharmapp_patterns.md` pour les patterns validés
- Référez-vous à `common_mistakes.md` pour éviter les erreurs connues

### Pour les Humains
- `project_learnings.md` : Historique des décisions
- Rapports de cycle : Dans `project_learnings.md`
- Métriques : Suivies dans `project_learnings.md`

## ✅ Checklist de Démarrage

- [ ] Tous les fichiers copiés dans votre projet
- [ ] Agents configurés dans Claude Code
- [ ] `coding_guidelines.md` adapté à votre projet
- [ ] `pharmapp_patterns.md` enrichi avec vos patterns
- [ ] Test du workflow avec une petite feature
- [ ] Premier cycle documenté dans `project_learnings.md`

## 🎯 Objectifs

Avec ce système, vous devriez obtenir :
- **Moins d'erreurs récurrentes** (documentées et évitées)
- **Meilleure qualité dès la première version** (codeur consulte les erreurs passées)
- **Traçabilité complète** (tous les cycles documentés)
- **Amélioration continue** (learnings capitalisés)

---

**Bonne chance avec votre système d'agents PharmApp ! 🚀**

Pour toute question, consultez les fichiers de documentation dans `docs/agent_knowledge/`.
