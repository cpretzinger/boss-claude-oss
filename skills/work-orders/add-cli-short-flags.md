---
name: add-cli-short-flags
version: 1.0.0
description: Add short flag options (-s, -i, -w, -r) to CLI using Commander.js
category: work-order
structure:
  supervisor: code-review
  workers: [automation]
workflow: sequential
estimated_phases: 2
priority: high
---

# Add CLI Short Flags Work Order

## WORK ORDER PROCESS

This work order coordinates specialized agents:

```
CONDUCTOR spawns work order
    ↓
SUPERVISOR (code-review) - Reviews Commander.js implementation and flag choices
└── WORKER-1 (automation): Modifies bin/boss-claude.js to add short flags
```

## SCENARIO

Enhance the CLI user experience by adding short flag alternatives to commonly used commands. This allows power users to type `boss -s` instead of `boss status`, reducing keystrokes and improving efficiency. Must maintain backward compatibility with existing full command names.

## PHASES

### Phase 1: Implementation
**Worker-1 (automation):**
- Read bin/boss-claude.js to understand current Commander.js structure
- Add short flag options to existing commands:
  - `-s` as alias for `status` command
  - `-i` as alias for `init` command
  - `-w` as alias for `watch` command
  - `-r` as alias for `recall` command (with argument support)
- Ensure short flags support the same arguments as full commands
- Update command descriptions to mention short flags
- Validate Commander.js syntax and structure
- Report implementation status to supervisor

### Phase 2: Review
**Supervisor (code-review):**
- Verify all four short flags are properly registered
- Confirm short flags map to correct commands
- Check that argument passing works correctly (especially for `recall`)
- Ensure no conflicts with existing flags or options
- Validate Commander.js best practices followed
- Test that help output shows both long and short forms
- Approve merge or request specific improvements
- Report final assessment to Conductor

## SUCCESS CRITERIA

- [ ] `boss -s` executes `boss status` command
- [ ] `boss -i` executes `boss init` command
- [ ] `boss -w` executes `boss watch` command
- [ ] `boss -r "query"` executes `boss recall "query"` command
- [ ] Help text (`boss --help`) shows short flag alternatives
- [ ] Existing full command names still work
- [ ] Short flags accept same arguments/options as full commands

## ESCALATION

If blocked:
1. Worker reports to supervisor immediately with specific blocker (Commander.js API issue, flag conflict, argument parsing problem)
2. Supervisor evaluates: can be fixed with different flags, needs Commander.js upgrade, or requires architectural change
3. If major change needed, supervisor pauses work and requests Conductor input
4. Supervisor reports to Conductor with blocker details and recommended resolution path

## TESTING

After implementation:
- Run `boss -s` and verify status output
- Run `boss -i` in a test directory
- Run `boss -w` to start watch mode
- Run `boss -r "test query"` with a sample query
- Run `boss --help` to verify help output
- Run original commands (`boss status`, etc.) to ensure backward compatibility

## NOTES

- Commander.js supports short flags via `.alias()` method
- Ensure flag choices don't conflict with existing global options
- Consider future expansion: `-l` for logs, `-h` for history, `-c` for config

## Memory Hooks

### On WO Start
```bash
boss-claude wo:start add-cli-short-flags
# Creates GitHub issue with WO contents
```

### On WO Complete
```bash
boss-claude wo:done <issue#> "Summary of changes made"
# Saves completion details to memory
```
