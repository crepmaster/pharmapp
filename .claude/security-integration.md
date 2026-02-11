# Claude Code Security Integration

## Automatic Security Review Implementation

This document defines how Claude Code will systematically invoke the pharmapp-reviewer agent before commits and pushes.

### Security Review Decision Matrix

| Scenario | Files Changed | Action Required |
|----------|---------------|-----------------|
| **High Risk** | `*auth*.dart`, `*firebase*.dart`, `*security*.dart` | 🚨 **MANDATORY** pharmapp-reviewer scan |
| **Medium Risk** | `*service*.dart`, `*config*.dart`, `*.env*` | ⚠️ **RECOMMENDED** security review |
| **Production Push** | Any files | 🚨 **MANDATORY** comprehensive security scan |
| **Low Risk** | UI files, documentation, tests | ✅ **OPTIONAL** (can skip) |

### Implementation in Claude Code Workflow

#### Pre-Commit Security Check
```markdown
BEFORE any git commit, Claude Code will:
1. Analyze changed files for security patterns
2. If security-sensitive files detected → automatically invoke pharmapp-reviewer
3. Wait for security assessment results
4. Block commit if critical issues found
5. Document security review in commit message
```

#### Pre-Push Security Validation  
```markdown
BEFORE any git push, especially to main/production:
1. Always invoke pharmapp-reviewer for comprehensive scan
2. Validate entire codebase security posture
3. Confirm no new vulnerabilities introduced
4. Block push if any security issues found
5. Update security status documentation
```

### Security Review Integration Points

#### 1. File Change Analysis
- Monitor git diff for security-sensitive patterns
- Classify risk level based on file types
- Trigger appropriate security review level

#### 2. Pharmapp-Reviewer Invocation
- Automatic agent call with context about changes
- Comprehensive vulnerability assessment
- Specific focus on changed areas
- Production readiness validation

#### 3. Review Response Processing
- Parse security findings and recommendations
- Block operations if critical issues found
- Auto-fix minor issues where possible
- Update documentation with security status

### Security Review Templates

#### For Security-Sensitive Changes:
```
Please perform a focused security review on the following changed files:
- [list of changed security files]

Focus areas:
- API key or credential exposure
- Authentication security
- Data privacy compliance
- Input validation
- Error handling security

Provide immediate feedback on any critical issues that would block commit.
```

#### For Production Pushes:
```  
Please perform a comprehensive pre-production security scan:
- Complete vulnerability assessment
- API key exposure check
- Authentication flow validation
- Data privacy compliance
- Production readiness confirmation

This is a production deployment - please be thorough and block if any issues found.
```

### Automation Status
- [x] Security review routine documented
- [x] Decision matrix defined  
- [x] Integration points identified
- [x] Review templates created
- [ ] Automatic invocation implemented
- [ ] Git hook integration (future)
- [ ] CI/CD pipeline integration (future)