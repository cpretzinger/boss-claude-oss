# Changelog

## [2.0.0] - 2026-02-03

### Added
- Memory monitoring with tiered thresholds (250MB warning, 500MB critical, 1.5GB dangerous)
- Agent pool semaphore limiting concurrent agents to 5 (configurable)
- Ring buffer for execution logs (max 1000 entries)
- DOCS-INTERNAL directory for private documentation
- Real-time `watch` command using Redis pub/sub (cross-terminal visibility)
- Orchestration events: SPAWN, STATUS, RECALL, DELEGATE, COMPLETE, WO-CREATE, WO-DONE, SAVE
- Work order event publishing to watch output
- Agent activity channel: `bc:channel:agent-activity`
- Comprehensive Commands section in CONDUCTOR-RUBRIC.md
- AskUserQuestion added to Allowed Tools

### Changed
- Redis connections consolidated to singleton pattern (11 modules migrated)
- Memory cleanup threshold lowered from 500MB to 250MB
- Terminal TTL reduced from 3600s to 120s for faster cleanup
- Idle timeout added (5 minutes)
- Watch uses Redis pub/sub instead of file tailing (matches broadcast pattern)
- CONDUCTOR-RUBRIC.md updated for public release accuracy

### Fixed
- Memory leak in unbounded execution logs (tool-wrapper.js, task-agent-worker.js)
- Redis subscriber connection leaks (agent-comms.js)
- Multiple Redis client instances causing memory bloat
- Session save failures due to Redis connection timing
- Zombie process timeout mismatch (SESSION_TTL 120s → 600s, now > IDLE_TIMEOUT)
- Heartbeat self-check prevents corrupt/expired Redis keys
- Agent processes now exit cleanly after task completion (Redis cleanup + process.exit)
- Watch command truncates WO descriptions to 100 chars (prevents wall of text)
- 23 zombie processes eliminated

### Security
- Orphan branch strategy for clean public release (no history exposure)
- Private documentation isolated in DOCS-INTERNAL/
- Moltbook skills moved to private directory
- Template files sanitized
