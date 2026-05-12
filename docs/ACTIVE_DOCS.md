# Active Documentation Index

This file lists operational, up-to-date documentation. For deprecated or historical docs, see **[`docs/archive/`](archive/)**.

> Policy: only documents listed here (and [`../CLAUDE.md`](../CLAUDE.md)) are considered source of truth for current engineering. Anything in `docs/archive/` is preserved for traceability but **must not pilot ongoing work**.

---

## 🎯 Top-level source of truth

- **[../CLAUDE.md](../CLAUDE.md)** — Canonical state of the project, locked product decisions, sprint backlog, dev commands, architecture, testing procedures.
- **[../CLAUDE-ARCHIVE.md](../CLAUDE-ARCHIVE.md)** — Historical sessions snapshot (read-only, contains stale claims explicitly disclaimed in its header).

---

## 📋 Documentation index (`docs/`)

### Operational meta-docs (top-level)

- [README.md](README.md) — Doc-hygiene policy and index pointer.
- [ACTIVE_DOCS.md](ACTIVE_DOCS.md) — This file. Lists active docs.
- [DEVELOPMENT_COMMANDS.md](DEVELOPMENT_COMMANDS.md) — Stub. Redirects to `CLAUDE.md`.
- [FILE_STRUCTURE_ACTIVE_VS_OBSOLETE.md](FILE_STRUCTURE_ACTIVE_VS_OBSOLETE.md) — Stub. Historical pointer to `CLAUDE.md`.
- [AGENTS_SYSTEM_README.md](AGENTS_SYSTEM_README.md) — Agents system overview.
- [INDEX.md](INDEX.md) — Legacy index (review for deprecation in a future sprint).

### Architectural Decision Records (`docs/adr/`)

- [adr/ADR-001-topup-architecture-multi-country.md](adr/ADR-001-topup-architecture-multi-country.md) — Multi-country top-up + canonical `amountMinor` decision.
- [adr/audits/ADR-001-monetary-audit.md](adr/audits/ADR-001-monetary-audit.md) — Companion monetary audit.

### Active specs (`docs/specs/`)

- [specs/CONTRACT_ADMIN_MASTER_DATA_AND_TREASURY_V1.md](specs/CONTRACT_ADMIN_MASTER_DATA_AND_TREASURY_V1.md) — Admin master data & treasury contract V1 (closed, kept for reference of the contract scope).

### Admin runbooks (`docs/admin/`)

- [admin/CLEAN-FIREBASE-DATABASE.md](admin/CLEAN-FIREBASE-DATABASE.md) — Database cleanup procedure.

### Agent knowledge base (`docs/agent_knowledge/`)

- [agent_knowledge/README.md](agent_knowledge/README.md) — Knowledge base guide.
- [agent_knowledge/project_learnings.md](agent_knowledge/project_learnings.md) — Cross-sprint project learnings.
- [agent_knowledge/review_checklist.md](agent_knowledge/review_checklist.md) — Code review checklist.
- [agent_knowledge/test_requirements.md](agent_knowledge/test_requirements.md) — Testing standards.

### Setup (`docs/setup/`)

- [setup/AGENT_SYSTEM_SETUP.md](setup/AGENT_SYSTEM_SETUP.md) — Agent system setup.

### Guides (`docs/guides/`)

- [guides/installation.md](guides/installation.md) — Project installation.
- [guides/DEPLOYMENT_GUIDE.md](guides/DEPLOYMENT_GUIDE.md) — Deployment instructions.
- [guides/agents-readme-fr.md](guides/agents-readme-fr.md) — Agents README (FR).
- [guides/download-guide-fr.md](guides/download-guide-fr.md) — Download guide (FR).

### Orchestrator sprint pack (`docs/orchestrator_sprints/`)

- [orchestrator_sprints/README.md](orchestrator_sprints/README.md) — Sprint pack index.
- [orchestrator_sprints/GLOBAL_EXECUTION_CONTRACT.md](orchestrator_sprints/GLOBAL_EXECUTION_CONTRACT.md) — Cross-sprint locked decisions and rules.
- [orchestrator_sprints/CLAUDE_RUNNER_PROMPT.md](orchestrator_sprints/CLAUDE_RUNNER_PROMPT.md) — Master prompt for Claude to drive sprints via the orchestrator.
- [orchestrator_sprints/SPRINT_0_DOC_FREEZE_TASK.md](orchestrator_sprints/SPRINT_0_DOC_FREEZE_TASK.md) — Sprint 0 contract (doc freeze).
- [orchestrator_sprints/SPRINT_1_MSISDN_HARDENING_TASK.md](orchestrator_sprints/SPRINT_1_MSISDN_HARDENING_TASK.md) — Sprint 1 (MSISDN hardening).
- [orchestrator_sprints/SPRINT_2_F_LICENSE_TASK.md](orchestrator_sprints/SPRINT_2_F_LICENSE_TASK.md) — Sprint 2 (license enforcement).
- [orchestrator_sprints/SPRINT_3_TRIAL_SUBSCRIPTION_TASK.md](orchestrator_sprints/SPRINT_3_TRIAL_SUBSCRIPTION_TASK.md) — Sprint 3 (trial subscription).
- [orchestrator_sprints/SPRINT_4_MEDICINE_REQUESTS_EXCHANGE_TASK.md](orchestrator_sprints/SPRINT_4_MEDICINE_REQUESTS_EXCHANGE_TASK.md) — Sprint 4 (Bloc 2 P2 exchange mode).
- [orchestrator_sprints/SPRINT_5_E2E_CLOSURE_TASK.md](orchestrator_sprints/SPRINT_5_E2E_CLOSURE_TASK.md) — Sprint 5 (E2E closure).

### Active testing docs (`docs/testing/`)

- [testing/KENYA-MANUAL-TEST-CHECKLIST.md](testing/KENYA-MANUAL-TEST-CHECKLIST.md) — Kenya manual QA checklist.
- [testing/NEXT_SESSION_EXCHANGE_TESTING.md](testing/NEXT_SESSION_EXCHANGE_TESTING.md) — Exchange E2E test plan (active).
- [testing/TESTING-STATUS-2025-09-18.md](testing/TESTING-STATUS-2025-09-18.md) — Reference status snapshot.
- [testing/TEST-003-INDEX.md](testing/TEST-003-INDEX.md) — Test 003 index.
- [testing/CODE_REVIEW_REQUEST_2025-10-21.md](testing/CODE_REVIEW_REQUEST_2025-10-21.md) — Review request (active reference).
- [testing/PILOT_TASK_EXCHANGE_E2E_V1.md](testing/PILOT_TASK_EXCHANGE_E2E_V1.md) — Pilot E2E task contract.
- [testing/PILOT_EXECUTION_PLAN_V1.md](testing/PILOT_EXECUTION_PLAN_V1.md) — Pilot execution plan.
- [testing/PILOT_RUNTIME_PREPARATION_V1.md](testing/PILOT_RUNTIME_PREPARATION_V1.md) — Pilot runtime preparation.
- [testing/PILOT_PRE_IMPLEMENTATION_ANALYSIS_V1.md](testing/PILOT_PRE_IMPLEMENTATION_ANALYSIS_V1.md) — Pilot pre-impl analysis.
- [testing/PILOT_EXECUTION_REPORT_V1.md](testing/PILOT_EXECUTION_REPORT_V1.md) — Pilot execution report (some historical claims now invalidated by 2026-04-22 audit — see `CLAUDE.md`).

---

## ⚠️ What is NOT here

If you're looking for one of these and don't find it, it's in [`docs/archive/`](archive/):

- Session briefings (`NEXT_SESSION_BRIEFING_*`, `SESSION_SUMMARY_*`)
- Scenario test reports (`SCENARIO_1_*`, `SCENARIO_2_*`)
- Pre-cleanup CLAUDE drafts (`CLAUDE_MAIN.md`, `CLAUDE_NEW.md`, `CLAUDE-BACKUP-*.md`)
- Pre-unified app analyses (`UNIFIED_APP_STRATEGY_ANALYSIS.md`, `AUTHENTICATION_MODULE_REFACTORING_ANALYSIS.md`, `PHARMAPP_UNIFIED_AUTH_MODULE_ANALYSIS.md`)
- 2025 reports and changes (`reports/`, `CHANGES_2025-*`, `AGENT_UPDATE_2025-10-21.md`)
- Old setup docs that pointed to deleted `pharmacy_app/courier_app` (`SETUP_FIREBASE`, `SETUP_FIXES`, `firebase-emulator-setup`)
- Old coding-guideline patterns scoped to the deleted apps (`coding_guidelines.md`, `common_mistakes.md`, `pharmapp_patterns.md`)
- Old admin docs scoped to the deleted apps (`CODE_REVIEW_ERRORS.md`, `SECURITY_RESTRICTIONS.md`)
- Feature specs that referenced deleted apps (`FEATURE_SPEC_COUNTRY_CITY_MANAGEMENT.md`)
