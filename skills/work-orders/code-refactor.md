---
name: code-refactor
version: 1.0.0
description: Safe code refactoring with comprehensive testing and review
category: work-order
structure:
  supervisor: code-review
  workers: [automation, github]
workflow: sequential
estimated_phases: 3
---

# Code Refactor Work Order

## WORK ORDER PROCESS

This work order coordinates specialized agents:

```
CONDUCTOR spawns work order
    ↓
SUPERVISOR (code-review) - Reviews refactoring quality and safety
├── WORKER-1 (automation): Refactors code, runs tests, validates behavior unchanged
└── WORKER-2 (github): Documents changes, manages version control, creates PR
```

## SCENARIO

Use this work order when improving code structure, readability, or maintainability without changing external behavior. This includes extracting functions, renaming variables, removing duplication, simplifying logic, or reorganizing files. The code-review supervisor ensures refactoring maintains correctness, automation handles implementation and testing, and github manages documentation and change tracking. Essential for technical debt reduction and long-term codebase health.

## PHASES

### Phase 1: Refactoring Implementation
**Worker-1 (automation):**
- Analyze current code structure and identify refactoring targets
- Run full test suite to establish baseline behavior
- Perform refactoring incrementally with frequent test runs
- Ensure all tests pass after each refactoring step
- Add new tests if coverage gaps discovered
- Verify performance not degraded by changes
- Report refactoring completion and test results to supervisor

### Phase 2: Documentation and Version Control
**Worker-2 (github):**
- Document refactoring rationale and benefits in commit messages
- Create before/after code comparison summary
- Update inline comments for improved clarity
- Generate PR with detailed description of changes
- Tag related issues or technical debt items
- Ensure commit history is clean and logical
- Report PR status and documentation to supervisor

### Phase 3: Review
**Supervisor (code-review):**
- Verify behavior unchanged by comparing test results
- Review code for improved readability and maintainability
- Check that refactoring follows language idioms and best practices
- Ensure no new complexity or coupling introduced
- Validate that edge cases still handled correctly
- Confirm documentation accurately describes changes
- Approve merge or request refinements with specific feedback
- Report final assessment to Conductor with quality metrics

## SUCCESS CRITERIA

- [ ] All existing tests pass without modification
- [ ] Code complexity reduced (cyclomatic complexity, nesting depth)
- [ ] Duplication eliminated or significantly reduced
- [ ] Function and variable names more descriptive and consistent
- [ ] Code coverage maintained or improved
- [ ] Performance benchmarks unchanged or improved
- [ ] Documentation clearly explains refactoring purpose

## ESCALATION

If blocked:
1. Worker reports to supervisor immediately with issue details (test failures, unexpected behavior changes, merge conflicts)
2. Supervisor evaluates: refactoring approach needs adjustment, tests need updating, or external dependencies affected
3. If tests fail after refactoring, supervisor pauses work and requests analysis of test validity
4. If scope creeping beyond pure refactoring, supervisor escalates to Conductor for scope clarification
5. Supervisor reports to Conductor with progress summary and recommended path forward

## Memory Hooks

### On WO Start
```bash
boss-claude wo:start code-refactor
# Creates GitHub issue with WO contents
```

### On WO Complete
```bash
boss-claude wo:done <issue#> "Summary of changes made"
# Saves completion details to memory
```
