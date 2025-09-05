# Agent Briefing - PharmApp Documentation System

*Instructions for Claude Code agents working with the PharmApp project*

## 📚 **Documentation Structure Overview**

### **Main Entry Point**
- **`CLAUDE.md`** (87 lines) - Primary instruction file for agents
  - Quick project status and key commands
  - Navigation links to detailed documentation
  - Essential context for immediate development needs

### **Modular Documentation (`docs/` directory)**
```
docs/
├── AGENT_BRIEFING.md        # This file - agent instructions
├── CLAUDE_MAIN.md           # Complete documentation hub with navigation
├── CURRENT_STATUS.md        # Latest implementation status and features
├── DEVELOPMENT_COMMANDS.md  # All build, run, test commands
├── PROJECT_HISTORY.md       # Complete development timeline (to be created)
├── SECURITY_AUDIT.md        # Security reviews and fixes (to be created)
└── DEPLOYMENT_GUIDE.md      # Production deployment guide (to be created)
```

## 🤖 **Agent Reading Protocol**

### **Step 1: Start with CLAUDE.md**
```
1. Read CLAUDE.md first - gives you essential context
2. Check "PROJECT STATUS" section for current state
3. Use "Quick Start" commands for immediate development
4. Follow links to docs/ for detailed information
```

### **Step 2: Navigate to Relevant Documentation**
| Task Type | Read These Files |
|-----------|------------------|
| **Development Setup** | → `DEVELOPMENT_COMMANDS.md` |
| **Understanding Current Features** | → `CURRENT_STATUS.md` |
| **Complete Project Context** | → `CLAUDE_MAIN.md` |
| **Historical Context** | → `PROJECT_HISTORY.md` |
| **Security Information** | → `SECURITY_AUDIT.md` |
| **Deployment Tasks** | → `DEPLOYMENT_GUIDE.md` |

### **Step 3: Working with Information**
- **Always check file timestamps** - documentation reflects status at time of writing
- **Cross-reference multiple files** - each provides different perspectives
- **Verify current status** - run quick commands to confirm current state

## 📝 **Agent Updating Protocol**

### **When to Update Documentation**

#### **Update CLAUDE.md when:**
- ✅ Project status changes (production ready → deployed, etc.)
- ✅ Major new applications or features added
- ✅ Core development commands change
- ✅ Critical architecture changes

#### **Update CURRENT_STATUS.md when:**
- ✅ New features implemented
- ✅ Security scores change
- ✅ Production readiness status changes
- ✅ Business model updates
- ✅ Application functionality changes

#### **Update DEVELOPMENT_COMMANDS.md when:**
- ✅ New build/run/test commands added
- ✅ Firebase configuration changes
- ✅ Platform support changes
- ✅ Deployment procedures updated

### **How to Update Documentation**

#### **For Minor Updates (Features, Status):**
```bash
# 1. Update appropriate modular file
Edit docs/CURRENT_STATUS.md

# 2. Update timestamp in file
*Last Updated: 2025-09-05*

# 3. Optional: Update CLAUDE.md status if major change
Edit CLAUDE.md "PROJECT STATUS" section
```

#### **For Major Updates (New Apps, Architecture):**
```bash
# 1. Update CLAUDE.md with new overview
Edit CLAUDE.md

# 2. Update relevant modular documentation
Edit docs/CURRENT_STATUS.md
Edit docs/DEVELOPMENT_COMMANDS.md (if commands changed)

# 3. Consider creating new documentation if needed
Create docs/NEW_FEATURE.md (if complex new feature)
```

## 🔄 **Update Workflow Examples**

### **Example 1: New Feature Added**
```markdown
Scenario: Added barcode scanning to pharmacy app

Updates needed:
1. docs/CURRENT_STATUS.md - Add to "Pharmacy App" section
2. docs/DEVELOPMENT_COMMANDS.md - Add any new dependencies/commands
3. CLAUDE.md - Minor update if it changes development priorities
```

### **Example 2: Security Fix Applied**
```markdown
Scenario: Fixed critical vulnerability

Updates needed:
1. docs/CURRENT_STATUS.md - Update security score
2. docs/SECURITY_AUDIT.md - Document fix details
3. CLAUDE.md - Update security score in PROJECT STATUS
```

### **Example 3: New Application Added**
```markdown
Scenario: Added patient mobile app

Updates needed:
1. CLAUDE.md - Add to applications list, update overview
2. docs/CURRENT_STATUS.md - Add new app section
3. docs/DEVELOPMENT_COMMANDS.md - Add build/run commands
4. docs/CLAUDE_MAIN.md - Update navigation structure
```

## ⚠️ **Critical Guidelines**

### **DO:**
- ✅ Always update timestamps when modifying files
- ✅ Maintain consistent formatting and structure
- ✅ Cross-reference related documentation when updating
- ✅ Keep CLAUDE.md concise - detailed info goes in docs/
- ✅ Test commands before documenting them
- ✅ Preserve historical information (don't delete, archive instead)

### **DON'T:**
- ❌ Make CLAUDE.md longer than 100-150 lines
- ❌ Duplicate information across multiple files
- ❌ Delete historical information (move to PROJECT_HISTORY.md instead)
- ❌ Update documentation without testing current state
- ❌ Break existing navigation links between files

## 📊 **Quality Checklist**

Before committing documentation updates:
- [ ] CLAUDE.md remains under 150 lines
- [ ] All internal links work (test with relative paths)
- [ ] Timestamps updated in modified files
- [ ] Information is consistent across related files
- [ ] Quick start commands tested and working
- [ ] Status scores reflect current reality

## 🎯 **Best Practices**

### **Information Architecture**
- **CLAUDE.md**: Essential context only - think "executive summary"
- **CURRENT_STATUS.md**: Comprehensive current state - think "detailed status report"
- **DEVELOPMENT_COMMANDS.md**: Practical reference - think "developer cheat sheet"
- **Specialized docs/**: Deep dive information - think "technical specifications"

### **Writing Style**
- Use consistent emoji prefixes for sections
- Include measurable metrics (scores, line counts, file counts)
- Provide specific examples and code snippets
- Use tables for comparative information
- Include both high-level overview and specific details

### **Maintenance Strategy**
- Review documentation accuracy monthly
- Archive outdated information rather than deleting
- Keep documentation synchronized with code changes
- Test all documented commands before commits

---

**Remember**: The goal is maintainable, navigable, comprehensive documentation that helps agents work effectively with the PharmApp project while preserving all valuable historical context.