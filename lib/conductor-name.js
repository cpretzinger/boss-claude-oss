/**
 * CONDUCTOR NAME - BC picks its own identity
 *
 * BC is autonomous and creative. It will choose its own name when it first starts working.
 * This module just manages persistence - no random name pools, no auto-picking.
 *
 * =============================================================================
 * AGENT IDENTITY → SESSION TRACKING FLOW
 * =============================================================================
 *
 * In boss-claude dev environment, named agents (Onyx, Cipher, Aegis, Ember)
 * have their own identity and session tracking. This module wires agent identity
 * to session keys so each agent's work is tracked separately.
 *
 * PRIORITY ORDER:
 * 1. CLAUDE_AGENT_NAME env var (explicit - for multi-agent scenarios)
 * 2. ~/.boss-claude/agents/{name}/INIT.md (auto-detect first agent)
 * 3. ~/.boss-claude/conductor.json (user's chosen name via set-name command)
 * 4. "CONDUCTOR" (default placeholder)
 *
 * SESSION KEY PATTERN:
 *   boss:session:{repo}:{agent}:current
 *   Example: boss:session:BOSS-claude:aegis:current
 *
 * When AEGIS is active, getConductorName() returns "AEGIS", and sessions write to:
 *   boss:session:BOSS-claude:aegis:current
 *
 * This enables:
 * - Per-agent token tracking (agent_tokens, conductor_tokens)
 * - Per-agent delegation counts
 * - Multi-agent coordination via separate session keys
 *
 * =============================================================================
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import os from 'os';

const IDENTITY_FILE = join(os.homedir(), '.boss-claude', 'conductor.json');

/**
 * Get the conductor/agent name with proper priority
 *
 * Priority order:
 * 1. CLAUDE_AGENT_NAME env var (explicit agent identity)
 * 2. Active agent in ~/.boss-claude/agents/ (detect from INIT.md presence)
 * 3. ~/.boss-claude/conductor.json (user's chosen name)
 * 4. 'CONDUCTOR' (default placeholder)
 *
 * Returns uppercase name for consistency
 */
export function getConductorName() {
  // Priority 1: Explicit env var (highest priority)
  if (process.env.CLAUDE_AGENT_NAME) {
    return process.env.CLAUDE_AGENT_NAME.toUpperCase();
  }

  // Priority 2: Detect active agent from ~/.boss-claude/agents/
  // This detects the FIRST agent with an INIT.md file
  // In multi-agent scenarios, use CLAUDE_AGENT_NAME env var for explicit identity
  try {
    const agentsDir = join(os.homedir(), '.boss-claude', 'agents');
    if (existsSync(agentsDir)) {
      const agents = ['aegis', 'cipher', 'ember', 'onyx']; // Known agents
      for (const agent of agents) {
        const initFile = join(agentsDir, agent, 'INIT.md');
        if (existsSync(initFile)) {
          // Agent directory exists with INIT.md
          // Use this as the active agent identity
          return agent.toUpperCase();
        }
      }
    }
  } catch (e) {
    // Silent fallback to next priority
  }

  // Priority 3: User's chosen conductor name
  try {
    if (existsSync(IDENTITY_FILE)) {
      const data = JSON.parse(readFileSync(IDENTITY_FILE, 'utf8'));
      if (data.name && data.name !== 'CONDUCTOR') {
        return data.name.toUpperCase();
      }
    }
  } catch (e) {}

  // Priority 4: Default placeholder
  return 'CONDUCTOR';
}

/**
 * Ensure the conductor identity file exists with default placeholder
 * Creates the file with 'CONDUCTOR' if it doesn't exist
 * Returns the current conductor name
 */
export function ensureConductorIdentity() {
  const dir = join(os.homedir(), '.boss-claude');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  if (!existsSync(IDENTITY_FILE)) {
    writeFileSync(IDENTITY_FILE, JSON.stringify({
      name: 'CONDUCTOR',
      chosenAt: new Date().toISOString()
    }, null, 2));
  }

  return getConductorName();
}

/**
 * Save the conductor name that BC has chosen
 * BC calls this when it decides on its identity
 */
export function setConductorName(name) {
  const dir = join(os.homedir(), '.boss-claude');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  writeFileSync(IDENTITY_FILE, JSON.stringify({
    name: name.toUpperCase(),
    chosenAt: new Date().toISOString()
  }, null, 2));

  return name.toUpperCase();
}
