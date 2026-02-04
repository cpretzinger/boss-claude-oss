import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { saveMemory } from './memory.js';
import { addXP, addBalance, incrementSessions } from './identity.js';
import eventBus from './event-bus.js';
import { registerTerminal, unregisterTerminal, getTerminalsForRepo } from './terminal-registry.js';
import { getRedis, ensureRedisConnected } from './redis.js';
import { logAgent } from './agent-logger.js';

const execAsync = promisify(exec);

/** Maximum number of messages to keep in session */
const MAX_SESSION_MESSAGES = 100;

/** Session TTL in seconds (24 hours) */
const SESSION_TTL_SECONDS = 86400;

// Track current terminal ID for this session
let currentTerminalId = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Trim session data to stay within bounds
 * @param {Object} session - Session object to trim
 * @returns {Object} Trimmed session
 */
function trimSessionData(session) {
  if (!session) return session;

  if (session.messages && session.messages.length > MAX_SESSION_MESSAGES) {
    // Keep most recent messages
    session.messages = session.messages.slice(-MAX_SESSION_MESSAGES);
  }

  return session;
}

// Subscribe to delegation events from hooks
eventBus.on('delegation-started', async (data) => {
  // Extract rich, human-readable description from the task prompt
  const rawDescription = data.description || 'Task delegation started';

  // Parse work order ID if present
  const woMatch = rawDescription.match(/WORK ORDER #(WO-\d{8}-\d{6}-[a-f0-9]{4})/i);
  const workOrderId = woMatch ? woMatch[1] : null;

  // Extract the actual task from the description (after work order header)
  let taskDescription = rawDescription;
  if (workOrderId) {
    // Find the TASK: section in the work order
    const taskMatch = rawDescription.match(/TASK:\s*[─└]+\s*\n+([\s\S]+)/);
    if (taskMatch) {
      taskDescription = taskMatch[1].trim();
    }
  }

  // Truncate to first 100 chars for cleaner logging
  const shortDesc = taskDescription.substring(0, 100).replace(/\n/g, ' ').trim();

  // Try to infer agent types from the task description
  const agentTypes = [];
  if (/search|find|locate|grep|look for/i.test(shortDesc)) {
    agentTypes.push('Explorer');
  }
  if (/implement|create|build|add|update/i.test(shortDesc)) {
    agentTypes.push('Builder');
  }
  if (/fix|debug|error|bug/i.test(shortDesc)) {
    agentTypes.push('Debugger');
  }
  if (/test|verify|check/i.test(shortDesc)) {
    agentTypes.push('Tester');
  }
  if (/run|execute|command|bash|npm|git/i.test(shortDesc)) {
    agentTypes.push('Executor');
  }

  // Build human-readable log message
  let logMessage = shortDesc;
  if (workOrderId) {
    logMessage = `${workOrderId}: ${shortDesc}`;
  }
  if (agentTypes.length > 0) {
    logMessage = `Spawned ${agentTypes.join(' + ')} for: ${shortDesc}`;
  }

  logAgent('Task', 'START', logMessage);
  await recordDelegation();
  if (data.estimatedInputTokens > 0) {
    await trackAgentTokens(data.estimatedInputTokens);
  }
});

eventBus.on('delegation-completed', async (data) => {
  // Build human-readable completion message
  const workOrderId = data.workOrderId || '';
  const taskId = data.taskId || 'Task';
  const status = data.success ? 'COMPLETE' : 'ERROR';

  let logMessage = taskId;
  if (workOrderId) {
    logMessage = `${workOrderId}: ${data.success ? 'Completed successfully' : 'Failed'}`;
  }

  logAgent('Task', status, logMessage);
  if (data.estimatedOutputTokens > 0) {
    await trackAgentTokens(data.estimatedOutputTokens);
  }
});

eventBus.on('tokens-tracked', async (data) => {
  if (data.source === 'conductor') {
    await trackConductorTokens(data.amount);
  } else if (data.source === 'agent') {
    await trackAgentTokens(data.amount);
  }
});

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

export async function loadSession() {
  const repo = await getCurrentRepo();

  if (!repo) {
    return null;
  }

  const client = await ensureRedisConnected();
  if (!client) {
    return null;
  }
  const sessionKey = `boss:session:${repo.name}:current`;

  const data = await client.get(sessionKey);

  if (!data) {
    return {
      repo,
      started_at: new Date().toISOString(),
      messages: [],
      tokens_used: 0,
      // Track conductor vs agent tokens for efficiency bonus
      conductor_tokens: 0,    // Tokens used by CONDUCTOR (orchestration overhead)
      agent_tokens: 0,   // Tokens used by spawned agents (actual work)
      delegations: 0     // Number of Task tool delegations
    };
  }

  return {
    ...JSON.parse(data),
    repo
  };
}

export async function saveSession(summary, tags) {
  const repo = await getCurrentRepo();

  if (!repo) {
    throw new Error('Not in a git repository');
  }

  const client = await ensureRedisConnected();
  if (!client) {
    throw new Error('Failed to connect to Redis');
  }
  const sessionKey = `boss:session:${repo.name}:current`;

  const sessionData = await client.get(sessionKey);
  const session = sessionData ? JSON.parse(sessionData) : {
    started_at: new Date().toISOString(),
    messages: [],
    tokens_used: 0,
    conductor_tokens: 0,
    agent_tokens: 0,
    delegations: 0
  };

  // Save to GitHub Issues
  const memory = await saveMemory({
    repo_name: repo.name,
    summary: summary || 'Session saved',
    content: JSON.stringify(session, null, 2),
    tags: tags ? tags.split(',').map(t => t.trim()) : []
  });

  // Calculate rewards with EFFICIENCY MULTIPLIER
  // Formula: agent_tokens / conductor_tokens = efficiency ratio
  // The more work agents do vs CONDUCTOR overhead, the higher the bonus
  const baseXP = 50;
  const conductorTokens = session.conductor_tokens || 1000; // Minimum 1000 to avoid division issues
  const agentTokens = session.agent_tokens || 0;
  const delegations = session.delegations || 0;

  // Efficiency bonus: floor(agent_tokens / conductor_tokens), capped at 100
  // Example: 600k agent / 20k conductor = 30x efficiency = 30 bonus XP
  let efficiencyBonus = 0;
  if (agentTokens > 0 && conductorTokens > 0) {
    efficiencyBonus = Math.min(100, Math.floor(agentTokens / conductorTokens));
  }

  // Delegation bonus: +2 XP per successful delegation (up to 20 bonus)
  const delegationBonus = Math.min(20, delegations * 2);

  const xpEarned = baseXP + efficiencyBonus + delegationBonus;
  const tokensEarned = session.tokens_used || 0;

  await addXP(xpEarned);
  await addBalance(tokensEarned);
  await incrementSessions();

  // Log XP and dollars earned (dollars = (xpEarned/500)*100)
  const dollarsEarned = (xpEarned / 500) * 100;
  console.log(`\n💰 Session Rewards: ${xpEarned} XP = $${dollarsEarned.toFixed(2)} dollars`);

  // Update repo stats
  const repoKey = `boss:repo:${repo.name}`;
  const repoData = await client.get(repoKey);
  const repoStats = repoData ? JSON.parse(repoData) : {
    name: repo.name,
    path: repo.path,
    session_count: 0,
    first_seen: new Date().toISOString()
  };

  repoStats.session_count++;
  repoStats.last_active = new Date().toISOString();

  await client.set(repoKey, JSON.stringify(repoStats));

  // Clear current session
  await client.del(sessionKey);

  // Unregister terminal from the terminal registry
  try {
    if (currentTerminalId) {
      await unregisterTerminal(currentTerminalId);
      currentTerminalId = null;
    }
  } catch (error) {
    // Silently continue if terminal unregistration fails
    console.error('Warning: Failed to unregister terminal:', error.message);
  }

  return {
    ...memory,
    repo_name: repo.name,
    xp_earned: xpEarned,
    tokens_earned: tokensEarned,
    // Efficiency metrics
    efficiency: {
      conductor_tokens: conductorTokens,
      agent_tokens: agentTokens,
      ratio: agentTokens > 0 ? (agentTokens / conductorTokens).toFixed(1) + 'x' : '0x',
      efficiency_bonus: efficiencyBonus,
      delegation_bonus: delegationBonus,
      delegations: delegations
    }
  };
}

export async function updateSessionTokens(tokens) {
  const repo = await getCurrentRepo();

  if (!repo) {
    return;
  }

  const client = await ensureRedisConnected();
  if (!client) {
    return;
  }
  const sessionKey = `boss:session:${repo.name}:current`;

  const data = await client.get(sessionKey);
  const session = data ? JSON.parse(data) : {
    started_at: new Date().toISOString(),
    messages: [],
    tokens_used: 0,
    conductor_tokens: 0,
    agent_tokens: 0,
    delegations: 0
  };

  session.tokens_used = (session.tokens_used || 0) + tokens;

  const trimmedSession = trimSessionData(session);
  await client.setex(sessionKey, SESSION_TTL_SECONDS, JSON.stringify(trimmedSession));
}

/**
 * Track tokens used by CONDUCTOR (orchestration overhead)
 * Lower is better - CONDUCTOR should delegate, not do work
 */
export async function trackConductorTokens(tokens) {
  const repo = await getCurrentRepo();
  if (!repo) return;

  const client = await ensureRedisConnected();
  if (!client) return;
  const sessionKey = `boss:session:${repo.name}:current`;

  const data = await client.get(sessionKey);
  const session = data ? JSON.parse(data) : {
    started_at: new Date().toISOString(),
    messages: [],
    tokens_used: 0,
    conductor_tokens: 0,
    agent_tokens: 0,
    delegations: 0
  };

  session.conductor_tokens = (session.conductor_tokens || 0) + tokens;
  session.tokens_used = (session.tokens_used || 0) + tokens;

  const trimmedSession = trimSessionData(session);
  await client.setex(sessionKey, SESSION_TTL_SECONDS, JSON.stringify(trimmedSession));

  // EMIT EVENT: CONDUCTOR tokens updated
  eventBus.emitSessionUpdated('conductor-tokens', {
    tokens,
    totalConductor: session.conductor_tokens,
    totalTokens: session.tokens_used
  });
}

/**
 * Track tokens used by spawned agents (actual work)
 * Higher is better - agents should do the heavy lifting
 */
export async function trackAgentTokens(tokens) {
  const repo = await getCurrentRepo();
  if (!repo) return;

  const client = await ensureRedisConnected();
  if (!client) return;
  const sessionKey = `boss:session:${repo.name}:current`;

  const data = await client.get(sessionKey);
  const session = data ? JSON.parse(data) : {
    started_at: new Date().toISOString(),
    messages: [],
    tokens_used: 0,
    conductor_tokens: 0,
    agent_tokens: 0,
    delegations: 0
  };

  session.agent_tokens = (session.agent_tokens || 0) + tokens;
  session.tokens_used = (session.tokens_used || 0) + tokens;

  const trimmedSession = trimSessionData(session);
  await client.setex(sessionKey, SESSION_TTL_SECONDS, JSON.stringify(trimmedSession));

  // EMIT EVENT: Agent tokens updated
  eventBus.emitSessionUpdated('agent-tokens', {
    tokens,
    totalAgent: session.agent_tokens,
    totalTokens: session.tokens_used
  });
}

/**
 * Record a delegation via Task tool
 * More delegations = following the conductor protocol
 */
export async function recordDelegation() {
  const repo = await getCurrentRepo();
  if (!repo) return;

  const client = await ensureRedisConnected();
  if (!client) return;
  const sessionKey = `boss:session:${repo.name}:current`;

  const data = await client.get(sessionKey);
  const session = data ? JSON.parse(data) : {
    started_at: new Date().toISOString(),
    messages: [],
    tokens_used: 0,
    conductor_tokens: 0,
    agent_tokens: 0,
    delegations: 0
  };

  session.delegations = (session.delegations || 0) + 1;

  const trimmedSession = trimSessionData(session);
  await client.setex(sessionKey, SESSION_TTL_SECONDS, JSON.stringify(trimmedSession));

  // EMIT EVENT: Delegation recorded
  eventBus.emitSessionUpdated('delegation', {
    delegations: session.delegations
  });
}

/**
 * Initialize a new session in Redis
 * Creates the session key with initial values so commentator can track from the start
 */
export async function initializeSession() {
  const repo = await getCurrentRepo();
  if (!repo) return null;

  const client = await ensureRedisConnected();
  if (!client) return null;
  const sessionKey = `boss:session:${repo.name}:current`;

  // Register this terminal in the terminal registry
  try {
    const { stdout: branchName } = await execAsync('git rev-parse --abbrev-ref HEAD');
    currentTerminalId = await registerTerminal(repo.name, branchName.trim(), 'conductor');
  } catch (error) {
    // Silently continue if terminal registration fails
    console.error('Warning: Failed to register terminal:', error.message);
  }

  // Check if session already exists
  const existingData = await client.get(sessionKey);
  if (existingData) {
    // Session already exists, return existing data with terminal ID
    const session = JSON.parse(existingData);
    session.terminalId = currentTerminalId;
    return session;
  }

  // Create new session with initial values
  const session = {
    started_at: new Date().toISOString(),
    messages: [],
    tokens_used: 0,
    conductor_tokens: 0,
    agent_tokens: 0,
    delegations: 0,
    terminalId: currentTerminalId
  };

  const trimmedSession = trimSessionData(session);
  await client.setex(sessionKey, SESSION_TTL_SECONDS, JSON.stringify(trimmedSession));

  return session;
}

/**
 * Update session tokens in real-time (for live tracking)
 * @param {number} conductorTokens - Tokens used by CONDUCTOR orchestrator
 * @param {number} agentTokens - Tokens used by spawned agents
 */
export async function updateSessionTokensRealtime(conductorTokens = 0, agentTokens = 0) {
  const repo = await getCurrentRepo();
  if (!repo) return;

  const client = await ensureRedisConnected();
  if (!client) return;
  const sessionKey = `boss:session:${repo.name}:current`;

  const data = await client.get(sessionKey);
  const session = data ? JSON.parse(data) : {
    started_at: new Date().toISOString(),
    messages: [],
    tokens_used: 0,
    conductor_tokens: 0,
    agent_tokens: 0,
    delegations: 0
  };

  // Update token counts
  session.conductor_tokens = (session.conductor_tokens || 0) + conductorTokens;
  session.agent_tokens = (session.agent_tokens || 0) + agentTokens;
  session.tokens_used = (session.tokens_used || 0) + conductorTokens + agentTokens;
  session.last_updated = new Date().toISOString();

  const trimmedSession = trimSessionData(session);
  await client.setex(sessionKey, SESSION_TTL_SECONDS, JSON.stringify(trimmedSession));

  return session;
}

/**
 * Get current efficiency stats for display
 * Returns initialized data even if session is new (never returns null for valid repo)
 */
export async function getEfficiencyStats() {
  const repo = await getCurrentRepo();
  if (!repo) return null;

  const client = await ensureRedisConnected();
  if (!client) return null;
  const sessionKey = `boss:session:${repo.name}:current`;

  let data = await client.get(sessionKey);

  // If no session exists, initialize one so we always have data
  if (!data) {
    const newSession = await initializeSession();
    if (!newSession) return null;
    data = JSON.stringify(newSession);
  }

  const session = JSON.parse(data);
  const conductorTokens = session.conductor_tokens || 0;
  const agentTokens = session.agent_tokens || 0;

  const ratio = conductorTokens > 0 ? agentTokens / conductorTokens : 0;
  const projectedBonus = Math.min(100, Math.floor(ratio));

  return {
    conductor_tokens: conductorTokens,
    agent_tokens: agentTokens,
    total_tokens: session.tokens_used || 0,
    delegations: session.delegations || 0,
    efficiency_ratio: ratio.toFixed(1) + 'x',
    projected_bonus_xp: projectedBonus,
    delegation_bonus_xp: Math.min(20, (session.delegations || 0) * 2),
    started_at: session.started_at,
    last_updated: session.last_updated || session.started_at
  };
}

/**
 * Reconcile session tokens with actual usage at session end
 * Used as fallback when hooks fail to capture accurate counts
 */
export async function reconcileTokens(actualStats) {
  const repo = await getCurrentRepo();
  if (!repo) return;

  const client = await ensureRedisConnected();
  if (!client) return;
  const sessionKey = `boss:session:${repo.name}:current`;
  const sessionData = await client.get(sessionKey);

  if (!sessionData) return;

  const session = JSON.parse(sessionData);

  if (actualStats?.usedTokens && session.tokens_used === 0) {
    // Fallback: if nothing tracked, estimate 90/10 agent/conductor split
    session.agent_tokens = Math.floor(actualStats.usedTokens * 0.9);
    session.conductor_tokens = Math.floor(actualStats.usedTokens * 0.1);
    session.tokens_used = actualStats.usedTokens;

    const trimmedSession = trimSessionData(session);
    await client.setex(sessionKey, SESSION_TTL_SECONDS, JSON.stringify(trimmedSession));
  }
}

/**
 * Check if other terminals are working on this repo
 * @param {string} repo - Repository name to check
 * @returns {Promise<Array>} Array of other active terminals on same repo
 */
export async function getParallelSessions(repo) {
  const terminals = await getTerminalsForRepo(repo);
  // Filter out current terminal
  return terminals.filter(t => t.terminalId !== currentTerminalId);
}

/**
 * Get the current terminal ID for this session
 * @returns {string|null} Current terminal ID or null if not registered
 */
export function getCurrentTerminalId() {
  return currentTerminalId;
}

/**
 * Add TTL to legacy sessions that don't have one
 * @returns {Promise<Object>} Cleanup stats
 */
export async function cleanupLegacySessions() {
  const client = await ensureRedisConnected();
  if (!client) return { error: 'No Redis connection' };

  const keys = await client.keys('boss:session:*:current');
  let updated = 0;

  for (const key of keys) {
    const ttl = await client.ttl(key);
    if (ttl === -1) { // No TTL set
      await client.expire(key, SESSION_TTL_SECONDS);
      updated++;
    }
  }

  return { keysChecked: keys.length, ttlsAdded: updated };
}
