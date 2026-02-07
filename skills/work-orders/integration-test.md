---
name: integration-test
version: 1.0.0
description: End-to-end integration test creation with environment setup and validation
category: work-order
structure:
  supervisor: automation
  workers: [code-review, data-science]
workflow: sequential
estimated_phases: 3
---

# Integration Test Work Order

## WORK ORDER PROCESS

This work order coordinates specialized agents:

```
CONDUCTOR spawns work order
    |
SUPERVISOR (automation) - Reviews test coverage and execution
|- WORKER-1 (code-review): Designs test scenarios and validates test quality
|- WORKER-2 (data-science): Analyzes test data requirements and generates fixtures
```

## SCENARIO

Use this work order when creating comprehensive integration tests that validate system behavior across multiple components. This includes API integration tests, database transaction tests, third-party service mocks, or full user workflow simulations. The automation supervisor ensures tests are reliable and maintainable, code-review designs realistic scenarios, and data-science generates appropriate test data. Critical for confidence in system-wide functionality and deployment safety.

## PHASES

### Phase 1: Test Design
**Worker-1 (code-review):**
- Identify critical user workflows and system interactions
- Design test scenarios covering happy paths and error cases
- Define expected outcomes and assertion criteria
- Map dependencies and required service mocks
- Create test structure with setup, execution, and teardown
- Report test design and coverage plan to supervisor

### Phase 2: Test Data Generation
**Worker-2 (data-science):**
- Analyze data requirements for each test scenario
- Generate realistic test fixtures and seed data
- Create edge case datasets (empty, maximum, invalid)
- Set up test database or mock data sources
- Ensure data privacy and no production data used
- Report test data readiness to supervisor

### Phase 3: Review
**Supervisor (automation):**
- Review test scenarios for completeness and realism
- Verify tests are deterministic and repeatable
- Check that setup and teardown properly isolate tests
- Ensure tests run within acceptable time limits
- Validate error messages are helpful for debugging
- Confirm tests integrate with CI/CD pipeline
- Approve test suite or request improvements with specific gaps
- Report final test coverage to Conductor with execution metrics

## SUCCESS CRITERIA

- [ ] Tests cover all critical user workflows end-to-end
- [ ] Tests execute reliably without flakiness
- [ ] Setup and teardown properly clean test environment
- [ ] Test data represents realistic production scenarios
- [ ] Error cases handled and produce clear failure messages
- [ ] Tests complete within reasonable time (< 5 min for full suite)
- [ ] Integration with CI/CD pipeline successful
- [ ] Test documentation explains purpose and expected behavior

## ESCALATION

If blocked:
1. Worker reports to supervisor immediately with blocker (environment setup failure, service unavailable, data generation issue)
2. Supervisor evaluates: configuration problem, infrastructure limitation, or design issue
3. If infrastructure limitation, supervisor requests Conductor assistance for resource allocation
4. If tests consistently flaky, supervisor pauses and requests investigation of timing or state issues
5. Supervisor reports to Conductor with test status, coverage achieved, and blockers encountered

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
