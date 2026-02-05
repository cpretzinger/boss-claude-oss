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
import { validateAndSanitizeAgentName } from './validators/agent.js';

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

  // Determine agent name for tracking
  const agentName = agentTypes.length > 0 ? agentTypes.join('+') : 'worker';

  logAgent('Task', 'START', logMessage);
  await recordDelegation(agentName);
  if (data.estimatedInputTokens > 0) {
    await trackAgentTokens(data.estimatedInputTokens, agentName);
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

  // Use agent name from data if available, default to 'worker'
  const agentName = data.agentName || 'worker';

  logAgent('Task', status, logMessage);
  if (data.estimatedOutputTokens > 0) {
    await trackAgentTokens(data.estimatedOutputTokens, agentName);
  }
});

eventBus.on('tokens-tracked', async (data) => {
  const agentName = data.agentName || (data.source === 'conductor' ? 'conductor' : 'worker');
  if (data.source === 'conductor') {
    await trackConductorTokens(data.amount, agentName);
  } else if (data.source === 'agent') {
    await trackAgentTokens(data.amount, agentName);
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

/**
 * Build a session key with validated agent name
 * @param {string} repoName - Repository name
 * @param {string} agentName - Agent name (defaults to 'conductor')
 * @returns {string} Session key for Redis
 */
function buildSessionKey(repoName, agentName = 'conductor') {
  const sanitizedAgentName = validateAndSanitizeAgentName(agentName);
  return `boss:session:${repoName}:${sanitizedAgentName}:current`;
}

export async function loadSession(agentName = 'conductor') {
  const repo = await getCurrentRepo();

  if (!repo) {
    return null;
  }

  const client = await ensureRedisConnected();
  if (!client) {
    return null;
  }
  const sessionKey = buildSessionKey(repo.name, agentName);

  const data = await client.hgetall(sessionKey);

  if (!data || Object.keys(data).length === 0) {
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

  // Convert hash data back to session object
  return {
    repo,
    started_at: data.started_at,
    last_updated: data.last_updated,
    terminalId: data.terminalId,
    messages: data.messages ? JSON.parse(data.messages) : [],
    tokens_used: parseInt(data.tokens_used || 0),
    conductor_tokens: parseInt(data.conductor_tokens || 0),
    agent_tokens: parseInt(data.agent_tokens || 0),
    delegations: parseInt(data.delegations || 0)
  };
}

export async function saveSession(summary, tags, agentName = 'conductor') {
  const repo = await getCurrentRepo();

  if (!repo) {
    throw new Error('Not in a git repository');
  }

  const client = await ensureRedisConnected();
  if (!client) {
    throw new Error('Failed to connect to Redis');
  }
  const sessionKey = buildSessionKey(repo.name, agentName);

  const sessionData = await client.hgetall(sessionKey);
  const session = (sessionData && Object.keys(sessionData).length > 0) ? {
    started_at: sessionData.started_at,
    last_updated: sessionData.last_updated,
    messages: sessionData.messages ? JSON.parse(sessionData.messages) : [],
    tokens_used: parseInt(sessionData.tokens_used || 0),
    conductor_tokens: parseInt(sessionData.conductor_tokens || 0),
    agent_tokens: parseInt(sessionData.agent_tokens || 0),
    delegations: parseInt(sessionData.delegations || 0)
  } : {
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

export async function updateSessionTokens(tokens, agentName = 'conductor') {
  const repo = await getCurrentRepo();

  if (!repo) {
    return;
  }

  const client = await ensureRedisConnected();
  if (!client) {
    return;
  }
  const sessionKey = buildSessionKey(repo.name, agentName);

  // Use HINCRBY for atomic token increment
  await client.hincrby(sessionKey, 'tokens_used', tokens);
  await client.hset(sessionKey, 'last_updated', new Date().toISOString());
  await client.expire(sessionKey, SESSION_TTL_SECONDS);
}

/**
 * Track tokens used by CONDUCTOR (orchestration overhead)
 * Lower is better - CONDUCTOR should delegate, not do work
 * @param {number} tokens - Number of tokens used
 * @param {string} agentName - Name of the agent (default: 'conductor')
 */
export async function trackConductorTokens(tokens, agentName = 'conductor') {
  const repo = await getCurrentRepo();
  if (!repo) return;

  const client = await ensureRedisConnected();
  if (!client) return;
  const sessionKey = buildSessionKey(repo.name, agentName);

  // Use HINCRBY for atomic token increments
  await client.hincrby(sessionKey, 'conductor_tokens', tokens);
  await client.hincrby(sessionKey, 'tokens_used', tokens);
  await client.hset(sessionKey, 'last_updated', new Date().toISOString());
  await client.expire(sessionKey, SESSION_TTL_SECONDS);

  // Get current totals for event emission
  const sessionData = await client.hgetall(sessionKey);

  // Log conductor token usage with agent name
  logAgent(agentName, 'TOKENS', `Used ${tokens} tokens (conductor overhead)`);

  // EMIT EVENT: CONDUCTOR tokens updated
  eventBus.emitSessionUpdated('conductor-tokens', {
    tokens,
    agentName,
    totalConductor: parseInt(sessionData.conductor_tokens || 0),
    totalTokens: parseInt(sessionData.tokens_used || 0)
  });
}

/**
 * Track tokens used by spawned agents (actual work)
 * Higher is better - agents should do the heavy lifting
 * @param {number} tokens - Number of tokens used
 * @param {string} agentName - Name of the agent (default: 'worker')
 */
export async function trackAgentTokens(tokens, agentName = 'worker') {
  const repo = await getCurrentRepo();
  if (!repo) return;

  const client = await ensureRedisConnected();
  if (!client) return;
  const sessionKey = buildSessionKey(repo.name, agentName);

  // Use HINCRBY for atomic token increments
  await client.hincrby(sessionKey, 'agent_tokens', tokens);
  await client.hincrby(sessionKey, 'tokens_used', tokens);
  await client.hset(sessionKey, 'last_updated', new Date().toISOString());
  await client.expire(sessionKey, SESSION_TTL_SECONDS);

  // Get current totals for event emission
  const sessionData = await client.hgetall(sessionKey);

  // Log agent token usage with agent name
  logAgent(agentName, 'TOKENS', `Used ${tokens} tokens`);

  // EMIT EVENT: Agent tokens updated
  eventBus.emitSessionUpdated('agent-tokens', {
    tokens,
    agentName,
    totalAgent: parseInt(sessionData.agent_tokens || 0),
    totalTokens: parseInt(sessionData.tokens_used || 0)
  });
}

/**
 * Record a delegation via Task tool
 * More delegations = following the conductor protocol
 * @param {string} agentName - Name of the agent being delegated to (default: 'worker')
 */
export async function recordDelegation(agentName = 'conductor') {
  const repo = await getCurrentRepo();
  if (!repo) return;

  const client = await ensureRedisConnected();
  if (!client) return;
  const sessionKey = buildSessionKey(repo.name, agentName);

  // Use HINCRBY for atomic delegation increment
  await client.hincrby(sessionKey, 'delegations', 1);
  await client.hset(sessionKey, 'last_updated', new Date().toISOString());
  await client.expire(sessionKey, SESSION_TTL_SECONDS);

  // Get current delegations for event emission
  const sessionData = await client.hgetall(sessionKey);

  // Log delegation with agent name
  logAgent(agentName, 'DELEGATE', `Delegation recorded`);

  // EMIT EVENT: Delegation recorded
  eventBus.emitSessionUpdated('delegation', {
    delegations: parseInt(sessionData.delegations || 0)
  });
}

/**
 * Initialize a new session in Redis
 * Creates the session key with initial values so commentator can track from the start
 */
export async function initializeSession(agentName = 'conductor') {
  const repo = await getCurrentRepo();
  if (!repo) return null;

  const client = await ensureRedisConnected();
  if (!client) return null;
  const sessionKey = buildSessionKey(repo.name, agentName);

  // Register this terminal in the terminal registry
  try {
    const { stdout: branchName } = await execAsync('git rev-parse --abbrev-ref HEAD');
    currentTerminalId = await registerTerminal(repo.name, branchName.trim(), agentName);
  } catch (error) {
    // Silently continue if terminal registration fails
    console.error('Warning: Failed to register terminal:', error.message);
  }

  // Check if session already exists
  const existingData = await client.hgetall(sessionKey);
  if (existingData && Object.keys(existingData).length > 0) {
    // Session already exists, update terminal ID and return existing data
    await client.hset(sessionKey, 'terminalId', currentTerminalId);
    return {
      started_at: existingData.started_at,
      last_updated: existingData.last_updated,
      messages: existingData.messages ? JSON.parse(existingData.messages) : [],
      tokens_used: parseInt(existingData.tokens_used || 0),
      conductor_tokens: parseInt(existingData.conductor_tokens || 0),
      agent_tokens: parseInt(existingData.agent_tokens || 0),
      delegations: parseInt(existingData.delegations || 0),
      terminalId: currentTerminalId
    };
  }

  // Create new session with initial values using HSET
  const now = new Date().toISOString();
  await client.hset(sessionKey, 'started_at', now);
  await client.hset(sessionKey, 'last_updated', now);
  await client.hset(sessionKey, 'messages', JSON.stringify([]));
  await client.hset(sessionKey, 'tokens_used', '0');
  await client.hset(sessionKey, 'conductor_tokens', '0');
  await client.hset(sessionKey, 'agent_tokens', '0');
  await client.hset(sessionKey, 'delegations', '0');
  await client.hset(sessionKey, 'terminalId', currentTerminalId);
  await client.expire(sessionKey, SESSION_TTL_SECONDS);

  return {
    started_at: now,
    last_updated: now,
    messages: [],
    tokens_used: 0,
    conductor_tokens: 0,
    agent_tokens: 0,
    delegations: 0,
    terminalId: currentTerminalId
  };
}

/**
 * Update session tokens in real-time (for live tracking)
 * @param {number} conductorTokens - Tokens used by CONDUCTOR orchestrator
 * @param {number} agentTokens - Tokens used by spawned agents
 */
export async function updateSessionTokensRealtime(conductorTokens = 0, agentTokens = 0, agentName = 'conductor') {
  const repo = await getCurrentRepo();
  if (!repo) return;

  const client = await ensureRedisConnected();
  if (!client) return;
  const sessionKey = buildSessionKey(repo.name, agentName);

  // Use HINCRBY for atomic token increments
  if (conductorTokens > 0) {
    await client.hincrby(sessionKey, 'conductor_tokens', conductorTokens);
    await client.hincrby(sessionKey, 'tokens_used', conductorTokens);
  }
  if (agentTokens > 0) {
    await client.hincrby(sessionKey, 'agent_tokens', agentTokens);
    await client.hincrby(sessionKey, 'tokens_used', agentTokens);
  }
  await client.hset(sessionKey, 'last_updated', new Date().toISOString());
  await client.expire(sessionKey, SESSION_TTL_SECONDS);

  // Return current session data
  const sessionData = await client.hgetall(sessionKey);
  return {
    started_at: sessionData.started_at,
    last_updated: sessionData.last_updated,
    messages: sessionData.messages ? JSON.parse(sessionData.messages) : [],
    tokens_used: parseInt(sessionData.tokens_used || 0),
    conductor_tokens: parseInt(sessionData.conductor_tokens || 0),
    agent_tokens: parseInt(sessionData.agent_tokens || 0),
    delegations: parseInt(sessionData.delegations || 0)
  };
}

/**
 * Get current efficiency stats for display
 * Returns initialized data even if session is new (never returns null for valid repo)
 */
export async function getEfficiencyStats(agentName = 'conductor') {
  const repo = await getCurrentRepo();
  if (!repo) return null;

  const client = await ensureRedisConnected();
  if (!client) return null;
  const sessionKey = buildSessionKey(repo.name, agentName);

  let data = await client.hgetall(sessionKey);

  // If no session exists, initialize one so we always have data
  if (!data || Object.keys(data).length === 0) {
    const newSession = await initializeSession(agentName);
    if (!newSession) return null;
    data = {
      started_at: newSession.started_at,
      last_updated: newSession.last_updated,
      tokens_used: newSession.tokens_used.toString(),
      conductor_tokens: newSession.conductor_tokens.toString(),
      agent_tokens: newSession.agent_tokens.toString(),
      delegations: newSession.delegations.toString()
    };
  }

  const conductorTokens = parseInt(data.conductor_tokens || 0);
  const agentTokens = parseInt(data.agent_tokens || 0);

  const ratio = conductorTokens > 0 ? agentTokens / conductorTokens : (agentTokens > 0 ? 999 : 0);
  const projectedBonus = Math.min(100, Math.floor(ratio));

  return {
    conductor_tokens: conductorTokens,
    agent_tokens: agentTokens,
    total_tokens: parseInt(data.tokens_used || 0),
    delegations: parseInt(data.delegations || 0),
    efficiency_ratio: ratio.toFixed(1) + 'x',
    projected_bonus_xp: projectedBonus,
    delegation_bonus_xp: Math.min(20, parseInt(data.delegations || 0) * 2),
    started_at: data.started_at,
    last_updated: data.last_updated || data.started_at
  };
}

/**
 * Reconcile session tokens with actual usage at session end
 * Used as fallback when hooks fail to capture accurate counts
 */
export async function reconcileTokens(actualStats, agentName = 'conductor') {
  const repo = await getCurrentRepo();
  if (!repo) return;

  const client = await ensureRedisConnected();
  if (!client) return;
  const sessionKey = buildSessionKey(repo.name, agentName);
  const sessionData = await client.hgetall(sessionKey);

  if (!sessionData || Object.keys(sessionData).length === 0) return;

  const tokensUsed = parseInt(sessionData.tokens_used || 0);

  if (actualStats?.usedTokens && tokensUsed === 0) {
    // Fallback: if nothing tracked, estimate 90/10 agent/conductor split
    const agentTokens = Math.floor(actualStats.usedTokens * 0.9);
    const conductorTokens = Math.floor(actualStats.usedTokens * 0.1);

    await client.hset(sessionKey, 'agent_tokens', agentTokens.toString());
    await client.hset(sessionKey, 'conductor_tokens', conductorTokens.toString());
    await client.hset(sessionKey, 'tokens_used', actualStats.usedTokens.toString());
    await client.hset(sessionKey, 'last_updated', new Date().toISOString());
    await client.expire(sessionKey, SESSION_TTL_SECONDS);
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
