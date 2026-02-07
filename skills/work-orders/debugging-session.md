---
name: debugging-session
version: 1.0.0
description: Systematic bug investigation with root cause analysis and fix validation
category: work-order
structure:
  supervisor: code-review
  workers: [automation, data-science]
workflow: sequential
estimated_phases: 3
---

# Debugging Session Work Order

## WORK ORDER PROCESS

This work order coordinates specialized agents:

```
CONDUCTOR spawns work order
    |
SUPERVISOR (code-review) - Reviews investigation and fix quality
|- WORKER-1 (automation): Reproduces bug, implements fix, creates regression tests
|- WORKER-2 (data-science): Analyzes logs, traces execution flow, identifies patterns
```

## SCENARIO

Use this work order when investigating production bugs, unexpected behavior, or performance degradation. This includes crashes, incorrect outputs, memory leaks, or race conditions. The code-review supervisor ensures thorough investigation and proper fix validation, automation handles reproduction and testing, and data-science performs log analysis and pattern detection. Critical for maintaining system stability and preventing regressions.

## PHASES

### Phase 1: Investigation and Reproduction
**Worker-1 (automation):**
- Reproduce bug with minimal test case
- Set up debugging environment with breakpoints
- Trace execution path through relevant code sections
- Identify exact conditions that trigger the bug
- Document reproduction steps clearly
- Report findings and reproduction rate to supervisor

**Worker-2 (data-science):**
- Parse and analyze application logs for error patterns
- Identify correlated events leading to bug
- Check metrics for anomalies (memory usage, response times)
- Search for similar historical issues
- Generate timeline of events preceding failure
- Report analysis findings to supervisor

### Phase 2: Fix Implementation
**Worker-1 (automation):**
- Implement fix based on root cause analysis
- Add regression test that fails before fix, passes after
- Verify fix doesn't introduce new issues
- Test edge cases and boundary conditions
- Update error handling and logging if needed
- Report fix implementation to supervisor

### Phase 3: Review
**Supervisor (code-review):**
- Verify root cause correctly identified from both worker reports
- Review fix for completeness and side effects
- Ensure regression test adequately covers the bug scenario
- Check that fix follows coding standards and best practices
- Validate that logging provides useful debugging information
- Approve fix or request additional investigation
- Report resolution to Conductor with root cause summary

## SUCCESS CRITERIA

- [ ] Bug reliably reproduced with documented steps
- [ ] Root cause identified with clear explanation
- [ ] Fix implemented and tested successfully
- [ ] Regression test added that prevents future occurrence
- [ ] No new bugs introduced by the fix (confirmed by test suite)
- [ ] Performance impact measured and acceptable
- [ ] Documentation updated if behavior changed

## ESCALATION

If blocked:
1. Worker reports to supervisor immediately with blocker details (cannot reproduce, intermittent issue, missing information)
2. Supervisor evaluates: needs more data collection, requires environment access, or involves external dependency
3. If environment or access issue, supervisor requests Conductor assistance
4. If root cause unclear after investigation, supervisor recommends pairing session or expert consultation
5. Supervisor reports to Conductor with investigation summary and recommended next steps

## Memory Hooks

### On WO Start
```bash
boss-claude wo:start <wo-name>
# Creates GitHub issue with WO contents
```

### On WO Complete
```bash
boss-claude wo:done <issue#> "Summary of changes made"
# Saves completion details to memory
```
