# Agent System Updates - 2025-10-21

## Updates Completed

### 1. Chef de Projet Agent Updated ✅

**File**: [.claude/agents/agent-chef-projet.md](.claude/agents/agent-chef-projet.md)

**Changes Made**:
- Added new **Section 0: "TOUJOURS Vérifier le Test Plan"** (PRIORITY #1)
- Chef de Projet will now ALWAYS read `docs/testing/NEXT_SESSION_TEST_PLAN.md` when asked about planning
- Automatic checking of completed vs pending tests
- Only proposes new features/deployment when ALL tests are completed

**Key Addition** (lines 19-37):
```markdown
### 0. TOUJOURS Vérifier le Test Plan (PRIORITÉ #1)
⚠️ IMPORTANT: Quand on te demande le planning ou les prochaines étapes:

1. LIRE OBLIGATOIREMENT: docs/testing/NEXT_SESSION_TEST_PLAN.md
2. VÉRIFIER: Quels tests sont déjà complétés (✅)
3. PROPOSER: Le prochain test non complété

SI tous les tests sont complétés (✅):
  → ALORS proposer les prochaines étapes (nouvelles features, déploiement, etc.)
SINON:
  → ALORS suivre le test plan et déléguer au @Testeur
```

---

### 2. Testeur Agent Updated ✅

**File**: [.claude/agents/agent-testeur.md](.claude/agents/agent-testeur.md)

**Changes Made**:
- Added **mandatory file location rules** for all test outputs
- All test reports MUST be created in `docs/testing/` directory
- All evidence files MUST be stored in `docs/testing/evidence/` directory
- Added comprehensive file structure guidelines

**Key Changes**:

#### Updated File Creation Rules (line 30-35):
```markdown
### Fichiers à Créer APRÈS Testing
**OBLIGATOIRE** - **TOUJOURS dans docs/testing/**:
1. docs/testing/test_proof_report.md - Rapport complet avec TOUTES les preuves
2. docs/testing/test_feedback.md - Feedback pour les autres agents
3. docs/testing/SESSION_[DATE]_RESULTS.md - Résultats de session

**IMPORTANT**: TOUS les rapports de test doivent être créés dans docs/testing/, JAMAIS à la racine du projet.
```

#### Updated Evidence Storage Rules (multiple sections):
- Unit test outputs: `docs/testing/evidence/unit_test_output.txt`
- Webhook tests: `docs/testing/evidence/wallet_before.json`, etc.
- E2E tests: `docs/testing/evidence/screenshots/01_registration.png`, etc.
- All proof files: `docs/testing/evidence/[test_run_id]/`

#### New File Management Section (lines 437-477):
```markdown
## 📁 RÈGLES DE GESTION DES FICHIERS (CRITIQUE)

### Emplacement des Fichiers - OBLIGATOIRE

**TOUJOURS créer dans docs/testing/**:
- ✅ docs/testing/test_proof_report.md - Rapport principal
- ✅ docs/testing/test_feedback.md - Feedback pour agents
- ✅ docs/testing/SESSION_[DATE]_RESULTS.md - Résultats de session
- ✅ docs/testing/evidence/ - Tous les fichiers de preuve
- ✅ docs/testing/evidence/screenshots/ - Captures d'écran

**JAMAIS créer à la racine du projet**:
- ❌ test_proof_report.md (racine)
- ❌ test_feedback.md (racine)
- ❌ test_proofs/ (racine)
- ❌ test_evidence/ (racine)
```

#### Recommended Directory Structure:
```
docs/testing/
├── test_proof_report.md          # Rapport actuel
├── test_feedback.md              # Feedback actuel
├── SESSION_2025-10-21_RESULTS.md # Résultats de session
├── NEXT_SESSION_TEST_PLAN.md     # Plan de test
├── evidence/                     # Tous les fichiers de preuve
│   ├── 2025-10-21_scenario1/     # Session actuelle
│   │   ├── app_launch.log
│   │   ├── wallet_before.json
│   │   ├── wallet_after.json
│   │   └── screenshots/
│   │       ├── 01_registration.png
│   │       ├── 02_firebase_auth.png
│   │       └── ...
│   └── 2025-10-20_previous/      # Sessions précédentes
└── archive/                      # Tests archivés
```

---

### 3. Directory Structure Created ✅

**Created Directories**:
- `docs/testing/evidence/` - Main evidence storage
- `docs/testing/evidence/screenshots/` - Screenshot storage

**Verification**:
```bash
$ find docs/testing -type d -maxdepth 2
docs/testing
docs/testing/evidence
docs/testing/evidence/screenshots
```

---

## Impact of Changes

### For Chef de Projet Agent:
✅ Will now systematically check test plan before proposing next steps
✅ Ensures test-driven development approach
✅ Prevents feature work when tests are pending
✅ Provides clear priority guidance

### For Testeur Agent:
✅ All test files will be properly organized in docs/testing/
✅ Evidence files will be centralized in docs/testing/evidence/
✅ No more scattered test files in project root
✅ Clear file naming and organization standards
✅ Easier to find and review test results

### For Development Team:
✅ Consistent test documentation location
✅ Better test evidence organization
✅ Clear test execution workflow
✅ Easier test result review and archiving

---

## Current Test Plan Status

**Location**: [docs/testing/NEXT_SESSION_TEST_PLAN.md](docs/testing/NEXT_SESSION_TEST_PLAN.md)

**5 Test Scenarios**:
1. ❌ Scenario 1: Create Complete Pharmacy Profile (NOT COMPLETED)
2. ❌ Scenario 2: Create Complete Courier Profile (NOT COMPLETED)
3. ❌ Scenario 3: Wallet Functionality Testing (NOT COMPLETED)
4. ❌ Scenario 4: Payment Preferences Verification (NOT COMPLETED)
5. ❌ Scenario 5: Firebase Integration Testing (NOT COMPLETED)

**Next Action**: Execute Scenario 1 following updated agent specifications

---

## Testing Agent Status

**Current Status**: Testing Agent is running Scenario 1 execution
- Build phase: pharmacy_app building on emulator
- Test preparation: Complete
- Evidence collection: Ready
- Report templates: Prepared

**Expected Outputs** (will be in correct locations):
- `docs/testing/test_proof_report.md` - Updated with Scenario 1 results
- `docs/testing/test_feedback.md` - Updated with findings
- `docs/testing/evidence/[session_id]/` - All evidence files

---

## Verification Checklist

- [x] Chef de Projet agent updated with test plan priority
- [x] Testeur agent updated with file location rules
- [x] Evidence directory structure created
- [x] File management section added to agent spec
- [x] Documentation updated with changes
- [ ] Scenario 1 test execution (in progress)
- [ ] Test files created in correct locations (pending)

---

## Notes

**Implementation Date**: 2025-10-21
**Updated By**: Claude (Main Agent)
**Triggered By**: User request to standardize test file locations
**Impact**: All future test executions will follow standardized file organization

**Key Principle**:
> "TOUS les rapports de test doivent être créés dans docs/testing/, JAMAIS à la racine du projet"

---

## Next Steps

1. **Monitor Test Execution**: Verify Scenario 1 creates files in correct locations
2. **Validate File Structure**: Check that evidence files go to docs/testing/evidence/
3. **Review Test Results**: Verify test_proof_report.md is created properly
4. **Continue Test Plan**: Execute remaining scenarios (2-5)
5. **Archive Results**: Move completed test sessions to archive/ subdirectory

---

**Document Status**: Complete
**Last Updated**: 2025-10-21
**Version**: 1.0
