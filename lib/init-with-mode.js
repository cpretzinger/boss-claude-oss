/**
 * ENHANCED INIT WITH MODE ENFORCEMENT
 *
 * This module extends the standard init.js to include mode enforcement status.
 * Use this when you want full orchestrator mode visibility on startup.
 */

import { loadIdentity, addRepo } from './identity.js';
import { getEnforcer, MODES } from './mode-enforcer.js';
import { getGate, initOrchestratorMode } from './orchestrator-gate.js';
import { validateAndSanitizeRepoName } from './validators/agent.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getRedis } from './redis.js';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function getCurrentRepo() {
  try {
    const { stdout: repoPath } = await execAsync('git rev-parse --show-toplevel');
    const { stdout: repoUrl } = await execAsync('git config --get remote.origin.url');

    const repoName = repoUrl.trim().split('/').pop().replace('.git', '');

    return {
      name: repoName,
      path: repoPath.trim(),
      url: repoUrl.trim()
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get full status including mode enforcement
 */
export async function getStatusWithMode() {
  // Load Boss identity
  const boss = await loadIdentity();

  // Calculate XP to next level
  const xp_to_next_level = boss.level * 100;

  // Get current repo info
  const repo = await getCurrentRepo();

  let repoStats = null;

  if (repo) {
    // Register repo if new
    await addRepo(repo.name);

    // Get repo stats (validate repo name for security)
    const client = getRedis();
    const sanitizedRepoName = validateAndSanitizeRepoName(repo.name);
    const repoKey = `boss:repo:${sanitizedRepoName}`;
    const repoData = await client.get(repoKey);

    if (repoData) {
      repoStats = JSON.parse(repoData);
    } else {
      // Initialize repo stats
      repoStats = {
        name: repo.name,
        path: repo.path,
        session_count: 0,
        first_seen: new Date().toISOString(),
        last_active: null
      };
      await client.set(repoKey, JSON.stringify(repoStats));
    }
  }

  // Get mode enforcement status
  const enforcer = getEnforcer();
  const currentMode = await enforcer.getCurrentMode();
  const modeMetadata = await enforcer.getModeMetadata();
  const agentIdentity = await enforcer.getAgentIdentity();

  return {
    boss: {
      ...boss,
      xp_to_next_level
    },
    repo: repo ? {
      ...repo,
      ...repoStats
    } : null,
    mode: {
      current: currentMode,
      metadata: modeMetadata,
      agent: agentIdentity
    }
  };
}

/**
 * Format status for Claude with mode enforcement
 */
export async function formatStatusForClaudeWithMode() {
  const status = await getStatusWithMode();

  let output = `
🤖 BOSS CLAUDE ORCHESTRATOR MODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 BOSS IDENTITY
   Level ${status.boss.level} • ${status.boss.xp}/${status.boss.xp_to_next_level} XP (${Math.floor((status.boss.xp / status.boss.xp_to_next_level) * 100)}%)
   💰 Balance: $${(status.boss.balance || 0).toFixed(2)}
   📊 Total Sessions: ${status.boss.total_sessions}
   🏢 Repos Managed: ${status.boss.repos_managed}

🎯 MODE ENFORCEMENT
   Active Mode: ${status.mode.current.toUpperCase()}
   Set By: ${status.mode.metadata?.setBy || 'system'}
   Set At: ${status.mode.metadata?.setAt ? new Date(status.mode.metadata.setAt).toLocaleString() : 'N/A'}
   Reason: ${status.mode.metadata?.reason || 'N/A'}
`;

  if (status.mode.agent) {
    output += `   Agent: ${status.mode.agent.agent}`;
    if (status.mode.agent.domain) {
      output += ` (${status.mode.agent.domain})`;
    }
    output += `\n`;
  }

  if (status.repo) {
    output += `
📁 CURRENT REPOSITORY
   Name: ${status.repo.name}
   Path: ${status.repo.path}
   Sessions: ${status.repo.session_count}
   Last Active: ${status.repo.last_active || 'Never'}
`;
  } else {
    output += `
⚠️  Not currently in a git repository
`;
  }

  output += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Mode Commands: boss-claude mode [orchestrator|specialist|worker|review|learning]
📊 Status: boss-claude mode status
📜 History: boss-claude mode history
`;

  return output;
}

/**
 * Initialize orchestrator session with mode enforcement
 */
export async function initOrchestratorSession(sessionId = null) {
  // Generate session ID if not provided
  if (!sessionId) {
    sessionId = `session-${Date.now()}`;
  }

  // Initialize orchestrator mode
  await initOrchestratorMode(sessionId);

  // Get and display status
  const status = await formatStatusForClaudeWithMode();

  console.log(status);

  return {
    sessionId,
    mode: MODES.ORCHESTRATOR,
    ready: true
  };
}

/**
 * Pre-action hook - checks mode before every action
 *
 * Usage:
 *   await preActionHook('delegate', { agent: 'postgres-specialist', tokens: 15000 });
 */
export async function preActionHook(actionType, options = {}) {
  const gate = getGate();

  switch (actionType) {
    case 'delegate':
      await gate.beforeDelegate(
        options.agent,
        { description: options.description || 'task' },
        options.tokens || 0
      );
      break;

    case 'execute':
      await gate.beforeExecute(
        { description: options.description || 'action' },
        options.tokens || 0
      );
      break;

    case 'review':
      await gate.beforeReview(
        options.agent,
        options.code || {}
      );
      break;

    case 'learn':
      await gate.beforeLearn(
        options.type || 'general',
        options.data || {}
      );
      break;

    case 'config':
      await gate.beforeConfigChange(
        options.key,
        options.value
      );
      break;

    default:
      throw new Error(`Unknown action type: ${actionType}`);
  }

  return true;
}

/**
 * Exports
 */
export {
  getStatusWithMode,
  initOrchestratorSession,
  preActionHook
};
