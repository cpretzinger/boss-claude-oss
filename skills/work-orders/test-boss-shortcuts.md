---
name: test-boss-shortcuts
version: 1.0.0
description: Comprehensive testing of 'boss' alias and short flag functionality
category: work-order
structure:
  supervisor: automation
  workers: [code-review]
workflow: sequential
estimated_phases: 2
priority: medium
---

# Test Boss Shortcuts Work Order

## WORK ORDER PROCESS

This work order coordinates specialized agents:

```
CONDUCTOR spawns work order
    ↓
SUPERVISOR (automation) - Executes tests and validates functionality
└── WORKER-1 (code-review): Reviews test results and identifies issues
```

## SCENARIO

Validate that both the "boss" bin alias and CLI short flags work correctly across all supported scenarios. This includes testing command execution, argument passing, error handling, and backward compatibility. Essential for ensuring the shortcut feature works reliably before release.

## PHASES

### Phase 1: Test Execution
**Supervisor (automation):**
- Set up test environment (ensure package is linked)
- Run bin alias tests:
  - Execute `boss --version` and verify output
  - Execute `boss --help` and verify output
  - Compare output with `boss-claude --version` and `boss-claude --help`
- Run short flag tests:
  - Execute `boss -s` and verify status output
  - Execute `boss -i` in a safe test directory
  - Execute `boss -w` and verify watch mode starts (kill after 2 seconds)
  - Execute `boss -r "test query"` and verify recall works
- Test backward compatibility:
  - Execute `boss status`, `boss init`, `boss watch`, `boss recall "test"`
  - Verify all full commands still work identically
- Test error handling:
  - Execute `boss -x` (invalid flag) and verify error message
  - Execute `boss -r` (missing argument) and verify error message
- Report test results to worker

### Phase 2: Review and Validation
**Worker-1 (code-review):**
- Analyze test results for any failures or unexpected behavior
- Verify error messages are helpful and accurate
- Check that help text clearly shows short flag options
- Confirm output consistency between aliases
- Identify any edge cases not covered by tests
- Document any issues found with reproduction steps
- Report final assessment to supervisor

## SUCCESS CRITERIA

- [ ] `boss --version` produces same output as `boss-claude --version`
- [ ] `boss --help` shows both short and long command forms
- [ ] `boss -s` successfully displays status information
- [ ] `boss -i` successfully initializes (in test environment)
- [ ] `boss -w` starts watch mode without errors
- [ ] `boss -r "query"` successfully executes recall with query
- [ ] All full command names (`boss status`, etc.) still work
- [ ] Invalid flags produce helpful error messages
- [ ] Missing arguments produce helpful error messages

## ESCALATION

If blocked:
1. Supervisor reports to worker immediately with specific test failure
2. Worker analyzes failure: bug in implementation, test environment issue, or expected behavior
3. If bug found, worker documents reproduction steps and severity
4. Supervisor reports to Conductor with failure details and recommended fix

## TEST CASES

### Bin Alias Tests
```bash
# Version check
boss --version
boss-claude --version
# Should produce identical output

# Help check
boss --help
boss-claude --help
# Should show same commands with short flags documented
```

### Short Flag Tests
```bash
# Status
boss -s
boss status
# Should produce identical output

# Init (in test directory)
mkdir /tmp/boss-test && cd /tmp/boss-test
boss -i
rm -rf /tmp/boss-test

# Watch
boss -w &
sleep 2
kill %1

# Recall
boss -r "recent work"
boss recall "recent work"
# Should produce identical output
```

### Error Handling Tests
```bash
# Invalid flag
boss -x
# Should show: Unknown option '-x'

# Missing recall argument
boss -r
# Should show: Missing required argument for -r/recall
```

## NOTES

- Tests should be non-destructive (use test directories)
- Watch mode test should kill process after verification
- Consider adding these tests to automated test suite
- Document any platform-specific behavior (macOS, Linux, Windows)

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
