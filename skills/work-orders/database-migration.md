---
name: database-migration
version: 1.0.0
description: Safe database schema migration with validation and rollback capability
category: work-order
structure:
  supervisor: postgres
  workers: [data-science, automation]
workflow: sequential
estimated_phases: 3
---

# Database Migration Work Order

## WORK ORDER PROCESS

This work order coordinates specialized agents:

```
CONDUCTOR spawns work order
    |
SUPERVISOR (postgres) - Reviews and approves migration
|- WORKER-1 (data-science): Analyzes data impact and validates schema changes
|- WORKER-2 (automation): Executes migration scripts and monitors rollback readiness
```

## SCENARIO

Use this work order when modifying database schema in production or staging environments. This includes adding/removing tables, altering columns, creating indexes, or changing constraints. The postgres supervisor ensures migration safety, data-science validates data integrity impacts, and automation handles execution with rollback capability. Critical for zero-downtime deployments and data preservation.

## PHASES

### Phase 1: Impact Analysis
**Worker-1 (data-science):**
- Analyze existing data structure and relationships
- Identify affected tables, columns, and dependencies
- Estimate data transformation requirements
- Calculate migration time based on table sizes
- Generate data validation queries for pre/post migration
- Report findings and risks to supervisor

### Phase 2: Migration Execution
**Worker-2 (automation):**
- Create migration scripts with transactions
- Generate rollback scripts for emergency revert
- Set up monitoring and alerting
- Execute migration in transaction blocks
- Capture execution logs and timing metrics
- Report execution status to supervisor

### Phase 3: Review
**Supervisor (postgres):**
- Review data-science impact analysis for red flags
- Validate migration scripts for syntax and logic errors
- Verify rollback procedures are tested and ready
- Check that indexes and constraints are properly handled
- Approve migration or request changes with specific feedback
- Monitor execution and validate post-migration data integrity
- Report final status to Conductor with metrics

## SUCCESS CRITERIA

- [ ] Migration scripts execute without errors in transaction
- [ ] Data integrity validation passes (row counts, constraints, relationships)
- [ ] Rollback procedure tested and confirmed functional
- [ ] Application remains functional with new schema
- [ ] Performance metrics within acceptable range (query times, index usage)
- [ ] Zero data loss confirmed through validation queries

## ESCALATION

If blocked:
1. Worker reports to supervisor immediately with error details and logs
2. Supervisor evaluates: can issue be resolved with script modification, requires rollback, or needs architectural redesign
3. If rollback needed, automation worker executes rollback immediately
4. Supervisor reports to Conductor with root cause analysis and recommended next steps

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
