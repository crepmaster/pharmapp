# Pre-Commit Security Check Routine

This document defines the systematic security review routine that should be executed before any commits or pushes.

## When to Trigger Security Review

### Automatic Triggers:
1. **Before any git commit** - Especially when modifying:
   - Authentication services (`*auth*.dart`)
   - Firebase configuration files
   - Security-related code
   - Environment configurations

2. **Before git push** - Always for:
   - Production/main branch pushes
   - Security-sensitive changes
   - New feature implementations

3. **Weekly routine checks** - Regular security maintenance

### Manual Triggers:
- After adding new dependencies
- When implementing new security features
- Before production deployments
- After security alerts or incidents

## Security Review Process

### Phase 1: Pre-Review Analysis
- Check for sensitive data exposure
- Scan for new API keys or credentials
- Verify authentication changes
- Review error handling modifications

### Phase 2: Pharmapp-Reviewer Invocation
- Automatic security scan execution
- Comprehensive vulnerability assessment
- Code quality and security validation
- Production readiness verification

### Phase 3: Review Response Handling
- Address any identified issues immediately
- Block commit/push if critical issues found
- Document security improvements
- Update security status in CLAUDE.md

## Implementation Status
- [x] Security review routine defined
- [ ] Git hooks implementation (future enhancement)
- [ ] Automated security scanning integration
- [ ] CI/CD security pipeline setup