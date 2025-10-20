# PharmApp Agent Knowledge Base

This directory contains the shared knowledge base for all PharmApp development agents.

## 📚 Files Overview

### Core Guidelines
- **[coding_guidelines.md](coding_guidelines.md)** - Complete coding standards and best practices for PharmApp
  - Firebase patterns (Firestore, Cloud Functions)
  - Payment processing (Mobile Money webhooks, idempotency)
  - Exchange system (P2P pharmaceutical exchanges)
  - Flutter development standards
  - Security guidelines

### Error Documentation
- **[common_mistakes.md](common_mistakes.md)** - Documented recurring errors to avoid
  - Updated by Reviewer after each review
  - Categories: Security, Idempotency, Transactions, Validation, etc.
  - Includes bad vs good patterns for each error

### Validated Patterns
- **[pharmapp_patterns.md](pharmapp_patterns.md)** - Validated implementation patterns
  - Webhook patterns (MTN MoMo, Orange Money)
  - Wallet operations (credit, debit, hold, release)
  - Exchange operations (hold, capture, cancel)
  - Scheduled jobs
  - Flutter authentication and real-time data

### Review Resources
- **[review_checklist.md](review_checklist.md)** - Comprehensive review checklist
  - Security items (always verify)
  - Payment-specific checks
  - Exchange system validation
  - Architecture and code quality
  - Flutter frontend standards

### Testing Standards
- **[test_requirements.md](test_requirements.md)** - Rigorous testing standards
  - Types of tests required (unit, integration, E2E, webhooks, security)
  - Proof requirements for each test type
  - Firebase verification commands
  - Test report structure

### Project History
- **[project_learnings.md](project_learnings.md)** - Project history and learnings
  - Updated by Chef de Projet after each development cycle
  - Architectural decisions
  - Development cycle documentation
  - Emerging patterns
  - Metrics and insights

## 🔄 Workflow Integration

### For Chef de Projet
**Before Starting**: Analyze user request and create development plan
**During Cycle**: Brief Codeur with relevant sections from common_mistakes.md
**After Cycle**: Update project_learnings.md with cycle summary and metrics

### For Codeur
**Before Coding**: MUST read:
1. coding_guidelines.md (relevant sections)
2. common_mistakes.md (check for known errors in similar features)
3. pharmapp_patterns.md (find similar patterns to follow)

**After Coding**: Create code_explanation.md documenting decisions and patterns used

### For Reviewer
**Before Review**: MUST read:
1. review_checklist.md (complete checklist)
2. common_mistakes.md (verify known errors not reproduced)
3. coding_guidelines.md (verify standards followed)
4. pharmapp_patterns.md (verify patterns used correctly)

**After Review**:
1. Create review_report.md with all issues found
2. Create review_feedback.md with actionable corrections for Codeur
3. Update common_mistakes.md if recurring error found

### For Testeur
**Before Testing**: MUST read:
1. test_requirements.md (testing standards)
2. code_explanation.md (understand what to test)
3. review_report.md (focus on critical areas)

**After Testing**:
1. Create test_proof_report.md with ALL proofs
2. Create test_feedback.md with feedback for other agents

## 📊 Knowledge Base Maintenance

### common_mistakes.md
- **Updated by**: Reviewer
- **Frequency**: After each review if recurring/new error found
- **Purpose**: Build a living database of errors to avoid

### project_learnings.md
- **Updated by**: Chef de Projet
- **Frequency**: After each development cycle
- **Purpose**: Document decisions, learnings, and project evolution

### Other files
- **Updated by**: Chef de Projet or team consensus
- **Frequency**: As needed when patterns evolve or standards change

## 🎯 Usage Guidelines

### Reading Priority
1. **Always read before acting**: Agents must consult relevant docs BEFORE starting work
2. **Reference in reports**: Always reference which doc/section informed your decisions
3. **Keep it updated**: Maintaining these docs is as important as writing code

### Writing/Updating
1. **Use templates**: Each file has templates for consistency
2. **Be specific**: Include file names, line numbers, examples
3. **Date everything**: Always timestamp updates
4. **Explain why**: Document reasoning, not just what

## 🔍 Quick Reference

**Starting a webhook feature?**
→ Read: pharmapp_patterns.md (Webhook patterns), common_mistakes.md (Webhook Security, Idempotency)

**Reviewing payment code?**
→ Read: review_checklist.md (Payments section), common_mistakes.md (Idempotency)

**Testing exchange system?**
→ Read: test_requirements.md (Integration tests), pharmapp_patterns.md (Exchange patterns)

**Writing Flutter UI?**
→ Read: coding_guidelines.md (Flutter section), common_mistakes.md (Flutter UI)

## 📈 Metrics & Goals

**Target Metrics**:
- First approval rate: >80%
- Recurring errors: Trending down
- Test coverage: >80% for critical code
- Time per cycle: Optimizing

**Quality Indicators**:
- common_mistakes.md errors trending down = Learning working
- High first approval rate = Knowledge base effective
- Low bugs in production = Review + testing effective

## 🚀 Getting Started

### For New Agents
1. Read this README completely
2. Skim all 6 knowledge files to understand structure
3. Read coding_guidelines.md fully
4. Before first task, read relevant sections thoroughly

### For Updates
1. Follow the templates in each file
2. Be consistent with existing format
3. Cross-reference related sections
4. Update statistics/metrics when applicable

---

**Remember**: This knowledge base is only valuable if:
1. It's kept up to date
2. Agents actually read it before working
3. It's referenced in reports and decisions
4. It evolves with the project

**Last Updated**: 2025-10-20
