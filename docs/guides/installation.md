# Guide d'Installation et de Fusion

Ce dossier contient le système complet d'agents PharmApp avec base de connaissance.

## 📦 Contenu du Package

```
pharmapp-agents-system/
├── README.md                          # Documentation principale ✅
├── INSTALLATION.md                    # Ce fichier
├── docs/
│   └── agent_knowledge/               # Base de connaissance (6 fichiers) ✅
│       ├── coding_guidelines.md       # Best practices complètes
│       ├── common_mistakes.md         # Templates d'erreurs
│       ├── pharmapp_patterns.md       # Patterns validés
│       ├── review_checklist.md        # Checklist review
│       ├── test_requirements.md       # Standards de test
│       └── project_learnings.md       # Templates learnings
└── agents/
    ├── LISEZMOI-AGENTS.md            # Guide agents ✅
    ├── agent-testeur.md              # Version condensée ⚠️
    ├── agent-reviewer-COMPLET.md     # À fusionner avec votre agent ⚠️
    ├── agent-chef-projet-COMPLET.md  # Nouveau agent ✅
    └── agent-codeur-COMPLET.md       # Nouveau agent ✅
```

## 🔧 Étapes d'Installation

### Étape 1 : Copier la Base de Connaissance (Prêt à l'emploi)

```bash
# Copier tout le dossier docs/ dans votre projet
cp -r docs/ /votre-projet-pharmapp/
```

Les fichiers dans `docs/agent_knowledge/` sont **prêts à l'emploi** :
- ✅ `coding_guidelines.md` : Best practices complètes avec exemples
- ✅ `common_mistakes.md` : Structure prête, sera enrichie par le Reviewer
- ✅ `pharmapp_patterns.md` : Patterns PharmApp (webhook, wallet, exchange)
- ✅ `review_checklist.md` : Checklist complète pour review
- ✅ `test_requirements.md` : Standards de test avec preuves
- ✅ `project_learnings.md` : Templates pour documenter les cycles

### Étape 2 : Fusionner Vos Agents Existants

#### A. Agent Testeur

Vous avez déjà un agent testeur. Voici quoi ajouter :

**1. Au DÉBUT de votre fichier**, ajoutez :
```markdown
## INTÉGRATION WORKFLOW

### Fichiers à Consulter AVANT Testing
- `docs/agent_knowledge/test_requirements.md`
- `docs/agent_knowledge/common_mistakes.md`
- `code_explanation.md` (du codeur)
- `review_report.md` (du reviewer)

### Fichiers à Créer APRÈS Testing
1. `test_proof_report.md` (votre rapport existant)
2. `test_feedback.md` (NOUVEAU)

Format test_feedback.md :
[... voir le contenu dans agent-testeur.md ...]
```

**2. Dans votre processus de test**, après avoir créé `test_proof_report.md`, ajoutez :
```markdown
## Créer test_feedback.md

Après les tests, créer ce fichier pour communiquer avec les autres agents:
[... format détaillé dans agent-testeur.md ...]
```

#### B. Agent Reviewer

Vous avez déjà un agent reviewer. Voici quoi ajouter :

**1. Au DÉBUT** :
```markdown
## INTÉGRATION WORKFLOW

### Fichiers à Consulter AVANT Review (OBLIGATOIRE)
```bash
cat docs/agent_knowledge/review_checklist.md
cat docs/agent_knowledge/common_mistakes.md
cat docs/agent_knowledge/coding_guidelines.md
cat docs/agent_knowledge/pharmapp_patterns.md
```

### Fichiers à Créer APRÈS Review (OBLIGATOIRE)
1. `review_report.md` - Rapport structuré
2. `review_feedback.md` - Instructions pour Codeur
3. MAJ `docs/agent_knowledge/common_mistakes.md` si erreur récurrente
```

**2. Votre checklist existante RESTE**, mais ajoutez :
```markdown
## Après la Review

### Créer review_report.md
[... format dans agent-reviewer-COMPLET.md ...]

### Créer review_feedback.md
[... format dans agent-reviewer-COMPLET.md ...]

### Mettre à Jour common_mistakes.md
Si erreur récurrente détectée:
[... template dans agent-reviewer-COMPLET.md ...]
```

### Étape 3 : Ajouter les Nouveaux Agents

Les 2 nouveaux agents sont **prêts à l'emploi** :

```bash
# Copier les nouveaux agents
cp agents/agent-chef-projet-COMPLET.md /votre-projet/.claude/agents/agent-chef-projet.md
cp agents/agent-codeur-COMPLET.md /votre-projet/.claude/agents/agent-codeur.md
```

### Étape 4 : Configuration Claude Code

Dans votre configuration Claude Code :

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

## 🔀 Option Alternative : Tout Remplacer

Si vous préférez repartir avec les agents complets fournis :

```bash
# Remplacer tous les agents par les versions complètes
cp agents/agent-*-COMPLET.md /votre-projet/.claude/agents/

# Renommer pour enlever -COMPLET
cd /votre-projet/.claude/agents/
mv agent-reviewer-COMPLET.md agent-reviewer.md
mv agent-chef-projet-COMPLET.md agent-chef-projet.md
mv agent-codeur-COMPLET.md agent-codeur.md
```

**Mais** vous devrez alors adapter les références spécifiques à votre projet dans l'agent reviewer.

## ✅ Checklist Finale

- [ ] `docs/agent_knowledge/` copié dans votre projet
- [ ] Agent Testeur mis à jour (section workflow + test_feedback.md)
- [ ] Agent Reviewer mis à jour (section workflow + fichiers feedback)
- [ ] Agent Chef de Projet installé
- [ ] Agent Codeur installé
- [ ] Configuration Claude Code mise à jour

## 🧪 Premier Test

Testez le système avec une petite feature :

```bash
# Dans Claude Code
@chef-projet: Nouvelle tâche - Ajouter un bouton logout dans pharmacy app

# Le Chef va briefer le Codeur, orchestrer le cycle, etc.
```

## 📚 Documentation de Référence

- **README.md** : Vue d'ensemble complète du système
- **docs/agent_knowledge/** : Toute la base de connaissance
- **Workflow détaillé** : Voir section "Workflow Standard" dans README.md

## 🆘 Besoin d'Aide ?

### Les agents ne suivent pas le workflow ?
→ Vérifiez qu'ils lisent bien `docs/agent_knowledge/` AVANT d'agir

### common_mistakes.md reste vide ?
→ Le Reviewer doit explicitement le mettre à jour après chaque review

### Le Codeur répète les mêmes erreurs ?
→ Le Chef doit briefer avec les sections spécifiques de `common_mistakes.md`

---

**Bon déploiement ! 🚀**
