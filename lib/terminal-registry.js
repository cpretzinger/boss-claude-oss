/**
 * Terminal Registry - Cross-terminal awareness for Boss Claude
 *
 * Tracks active terminals working on repos so agents can coordinate.
 * Uses Redis for distributed state management across multiple terminal sessions.
 *
 * Redis Schema:
 * - boss:terminals                    # Sorted set by last_heartbeat timestamp
 * - boss:terminal:{terminal_id}       # Hash with pid, tty, repo, branch, context_type, etc.
 * - boss:repo_lock:{repo}:{branch}    # String with terminal_id, TTL 60s
 */

import os from 'os';
import crypto from 'crypto';
import { getRedis, closeRedis, ensureRedisConnected } from './redis.js';
import { logAgent } from './agent-logger.js';

/** Heartbeat interval in milliseconds (30 seconds) */
const HEARTBEAT_INTERVAL = 30000;

/** Session TTL in seconds (10 minutes) - terminals expire after this time without heartbeat - must be > IDLE_TIMEOUT */
const SESSION_TTL = 600;

/** Repo lock TTL in seconds (60 seconds) - locks auto-expire for safety */
const LOCK_TTL = 60;

/** Idle timeout in seconds (300 seconds / 5 minutes) - terminals unregister after this time without activity (WO-003) */
const IDLE_TIMEOUT = 300;

/** Redis key prefix for terminal registry */
const KEY_PREFIX = 'boss';

/** Sorted set key for all terminals */
const TERMINALS_KEY = `${KEY_PREFIX}:terminals`;

/** Current terminal's heartbeat timer */
let heartbeatTimer = null;

/** Current terminal ID (set on registration) */
let currentTerminalId = null;

/** Current terminal's repo (for cleanup) */
let currentRepo = null;

/** Current terminal's branch (for cleanup) */
let currentBranch = null;

/** Flag to prevent duplicate cleanup handler registration */
let cleanupHandlersRegistered = false;

/**
 * Generate unique terminal ID
 *
 * Creates a deterministic ID based on environment-specific identifiers:
 * - VSCode terminals: Uses VSCODE_NONCE which is stable across all commands
 * - macOS Terminal.app: Uses TERM_SESSION_ID
 * - iTerm2: Uses ITERM_SESSION_ID
 * - Fallback: Uses TTY path and PPID
 *
 * @returns {string} Unique terminal identifier
 */
function generateTerminalId() {
  const hostname = os.hostname();

  // For VSCode terminals, use VSCODE_NONCE which is stable across all commands
  if (process.env.VSCODE_NONCE) {
    const hash = crypto.createHash('md5')
      .update(process.env.VSCODE_NONCE)
      .digest('hex').slice(0, 8);
    return `${hostname}:vscode:${hash}`;
  }

  // For regular terminals, try TERM_SESSION_ID (macOS Terminal.app)
  if (process.env.TERM_SESSION_ID) {
    const hash = crypto.createHash('md5')
      .update(process.env.TERM_SESSION_ID)
      .digest('hex').slice(0, 8);
    return `${hostname}:term:${hash}`;
  }

  // For iTerm2
  if (process.env.ITERM_SESSION_ID) {
    const hash = crypto.createHash('md5')
      .update(process.env.ITERM_SESSION_ID)
      .digest('hex').slice(0, 8);
    return `${hostname}:iterm:${hash}`;
  }

  // Fallback: use TTY path if available
  const tty = process.env.TTY || (process.stdout.isTTY ? 'tty' : 'notty');
  const ppid = process.ppid || process.pid;
  return `${hostname}:${ppid}:${tty}`;
}

/**
 * Get the Redis key for a terminal's hash
 *
 * @param {string} terminalId - Terminal identifier
 * @returns {string} Redis key for terminal hash
 */
function getTerminalKey(terminalId) {
  return `${KEY_PREFIX}:terminal:${terminalId}`;
}

/**
 * Get the Redis key for a repo lock
 *
 * @param {string} repo - Repository path or identifier
 * @param {string} branch - Branch name
 * @returns {string} Redis key for repo lock
 */
function getRepoLockKey(repo, branch) {
  // Sanitize repo path for Redis key (replace slashes and special chars)
  const sanitizedRepo = repo.replace(/[^a-zA-Z0-9_-]/g, '_');
  const sanitizedBranch = branch.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${KEY_PREFIX}:repo_lock:${sanitizedRepo}:${sanitizedBranch}`;
}

/**
 * Register this terminal in Redis
 *
 * Creates terminal metadata hash and adds to sorted set.
 * Starts automatic heartbeat to maintain presence.
 *
 * @param {string|Object} repoOrOptions - Repository path OR options object { repo, branch, contextType, currentTask }
 * @param {string} [branch] - Git branch name (if using positional params)
 * @param {string} [contextType='conductor'] - Type of context (conductor, worker, etc.)
 * @returns {Promise<string|null>} Terminal ID if registered, null on failure
 */
async function registerTerminal(repoOrOptions, branch, contextType = 'conductor') {
  // Handle both calling conventions:
  // 1. registerTerminal({ repo, branch, contextType, currentTask })
  // 2. registerTerminal(repo, branch, contextType)
  let repo;
  let currentTask = null;

  if (typeof repoOrOptions === 'object' && repoOrOptions !== null) {
    // Destructure options object
    ({ repo, branch, contextType = 'conductor', currentTask = null } = repoOrOptions);
  } else {
    // Positional parameters
    repo = repoOrOptions;
  }
  // Ensure Redis is connected before proceeding
  const redis = await ensureRedisConnected();
  if (!redis) {
    console.error('[terminal-registry] Redis not available - cannot register terminal');
    return null;
  }

  try {
    // Generate terminal ID
    currentTerminalId = generateTerminalId();
    currentRepo = repo;
    currentBranch = branch;

    const now = Date.now();
    const terminalKey = getTerminalKey(currentTerminalId);

    // Create terminal hash with metadata
    const terminalData = {
      terminal_id: currentTerminalId,
      pid: process.pid.toString(),
      ppid: (process.ppid || process.pid).toString(),
      hostname: os.hostname(),
      user: os.userInfo().username,
      repo: repo,
      branch: branch,
      context_type: contextType,
      started_at: now.toString(),
      last_heartbeat: now.toString(),
      last_activity: now.toString(),
      cwd: process.cwd(),
      node_version: process.version,
      platform: process.platform,
      ...(currentTask && { current_task: currentTask })
    };

    // Use pipeline for atomic operations
    const pipeline = redis.pipeline();

    // Set terminal hash with TTL
    pipeline.hset(terminalKey, terminalData);
    pipeline.expire(terminalKey, SESSION_TTL);

    // Add to sorted set with timestamp score
    pipeline.zadd(TERMINALS_KEY, now, currentTerminalId);

    await pipeline.exec();

    // Start heartbeat interval
    startHeartbeat();

    // Register cleanup handlers
    setupCleanupHandlers();

    // Log terminal registration for watch command
    const repoName = repo.split('/').pop();
    logAgent('Terminal', 'SPAWN', `${currentTerminalId.split(':').pop()} on ${repoName}/${branch} (${contextType})`);

    console.log(`[terminal-registry] Registered terminal: ${currentTerminalId}`);
    return currentTerminalId;
  } catch (err) {
    console.error('[terminal-registry] Failed to register terminal:', err.message);
    return null;
  }
}

/**
 * Start the heartbeat interval
 * @private
 */
function startHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  heartbeatTimer = setInterval(async () => {
    await heartbeat();
  }, HEARTBEAT_INTERVAL);

  // Don't let heartbeat prevent process exit
  if (heartbeatTimer.unref) {
    heartbeatTimer.unref();
  }
}

/**
 * Update heartbeat timestamp
 *
 * Refreshes the terminal's presence in Redis to prevent expiration.
 * Called automatically by the heartbeat interval.
 *
 * @returns {Promise<boolean>} True if heartbeat succeeded, false otherwise
 */
async function heartbeat() {
  if (!currentTerminalId) {
    return false;
  }

  const redis = getRedis();
  if (!redis) {
    return false;
  }

  try {
    const now = Date.now();
    const terminalKey = getTerminalKey(currentTerminalId);

    // Self-check: verify key still exists before updating
    const keyExists = await redis.exists(terminalKey);
    if (!keyExists) {
      console.warn('[terminal-registry] Key expired - unregistering');
      clearInterval(heartbeatTimer);
      await unregisterTerminal();
      return false;
    }

    // Use pipeline for atomic operations
    const pipeline = redis.pipeline();

    // Update timestamp in hash
    pipeline.hset(terminalKey, 'last_heartbeat', now.toString());

    // Refresh TTL on hash
    pipeline.expire(terminalKey, SESSION_TTL);

    // Update score in sorted set
    pipeline.zadd(TERMINALS_KEY, now, currentTerminalId);

    await pipeline.exec();

    // WO-003: Check for idle timeout
    const lastActivity = parseInt(await redis.hget(terminalKey, 'last_activity'), 10);
    if (!isNaN(lastActivity) && (now - lastActivity > IDLE_TIMEOUT * 1000)) {
      console.log(`[terminal-registry] Idle timeout reached (${IDLE_TIMEOUT}s), unregistering`);
      await unregisterTerminal();
      return false;
    }

    return true;
  } catch (err) {
    console.error('[terminal-registry] Heartbeat failed:', err.message);
    return false;
  }
}

/**
 * Unregister terminal (cleanup)
 *
 * Removes terminal from Redis and releases any held locks.
 * Called automatically on process exit.
 *
 * @returns {Promise<boolean>} True if cleanup succeeded
 */
async function unregisterTerminal() {
  // Stop heartbeat timer first
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (!currentTerminalId) {
    return true;
  }

  const redis = getRedis();
  if (!redis) {
    currentTerminalId = null;
    return true;
  }

  try {
    const terminalKey = getTerminalKey(currentTerminalId);

    // Use pipeline for atomic cleanup
    const pipeline = redis.pipeline();

    // Remove from sorted set
    pipeline.zrem(TERMINALS_KEY, currentTerminalId);

    // Delete terminal hash
    pipeline.del(terminalKey);

    // Release any repo locks we hold
    if (currentRepo && currentBranch) {
      const lockKey = getRepoLockKey(currentRepo, currentBranch);
      // Only delete if we own the lock (using Lua script for atomicity)
      pipeline.eval(
        `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
        1,
        lockKey,
        currentTerminalId
      );
    }

    await pipeline.exec();

    console.log(`[terminal-registry] Unregistered terminal: ${currentTerminalId}`);
    currentTerminalId = null;
    currentRepo = null;
    currentBranch = null;

    return true;
  } catch (err) {
    console.error('[terminal-registry] Failed to unregister terminal:', err.message);
    currentTerminalId = null;
    return false;
  }
}

/**
 * Setup process cleanup handlers
 * @private
 */
function setupCleanupHandlers() {
  // Guard against duplicate registration
  if (cleanupHandlersRegistered) {
    return;
  }
  cleanupHandlersRegistered = true;

  const cleanup = async () => {
    await unregisterTerminal();
    await closeRedis();
  };

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(0);
  });

  // Handle unexpected exit
  process.on('exit', () => {
    // Sync cleanup - can't await in exit handler
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
  });

  // Handle uncaught errors
  process.on('uncaughtException', async (err) => {
    console.error('[terminal-registry] Uncaught exception:', err);
    await cleanup();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason) => {
    console.error('[terminal-registry] Unhandled rejection:', reason);
    await cleanup();
    process.exit(1);
  });
}

/**
 * List all active terminals
 *
 * Returns terminals that have had a heartbeat within SESSION_TTL.
 * Also triggers cleanup of stale terminals.
 *
 * @returns {Promise<Array<Object>>} Array of terminal info objects
 */
async function listActiveTerminals() {
  // Ensure Redis is connected before proceeding
  const redis = await ensureRedisConnected();
  if (!redis) {
    return [];
  }

  try {
    // First, cleanup stale terminals
    await cleanupStaleTerminals();

    // Get all terminal IDs from sorted set
    const terminalIds = await redis.zrange(TERMINALS_KEY, 0, -1);

    if (!terminalIds || terminalIds.length === 0) {
      return [];
    }

    // Fetch details for each terminal
    const terminals = [];
    for (const terminalId of terminalIds) {
      const terminalKey = getTerminalKey(terminalId);
      const data = await redis.hgetall(terminalKey);

      if (data && Object.keys(data).length > 0) {
        // Parse numeric fields
        terminals.push({
          terminal_id: data.terminal_id,
          pid: parseInt(data.pid, 10),
          hostname: data.hostname,
          user: data.user,
          repo: data.repo,
          branch: data.branch,
          context_type: data.context_type,
          started_at: parseInt(data.started_at, 10),
          last_heartbeat: parseInt(data.last_heartbeat, 10),
          cwd: data.cwd,
          node_version: data.node_version,
          platform: data.platform,
          is_current: terminalId === currentTerminalId
        });
      }
    }

    // Sort by last heartbeat (most recent first)
    terminals.sort((a, b) => b.last_heartbeat - a.last_heartbeat);

    return terminals;
  } catch (err) {
    console.error('[terminal-registry] Failed to list terminals:', err.message);
    return [];
  }
}

/**
 * Get terminals working on a specific repo
 *
 * @param {string} repo - Repository path to filter by
 * @returns {Promise<Array<Object>>} Array of terminal info objects for the repo
 */
async function getTerminalsForRepo(repo) {
  try {
    const terminals = await listActiveTerminals();
    return terminals.filter((t) => t.repo === repo);
  } catch (err) {
    console.error('[terminal-registry] Failed to get terminals for repo:', err.message);
    return [];
  }
}

/**
 * Acquire repo lock (for exclusive work)
 *
 * Attempts to acquire an exclusive lock on a repo+branch combination.
 * Lock expires automatically after LOCK_TTL seconds.
 *
 * @param {string} repo - Repository path
 * @param {string} branch - Branch name
 * @returns {Promise<boolean>} True if lock acquired, false if already locked
 */
async function acquireRepoLock(repo, branch) {
  if (!currentTerminalId) {
    console.error('[terminal-registry] Cannot acquire lock - terminal not registered');
    return false;
  }

  // Ensure Redis is connected before proceeding
  const redis = await ensureRedisConnected();
  if (!redis) {
    return false;
  }

  try {
    const lockKey = getRepoLockKey(repo, branch);

    // SET NX EX - only set if not exists, with expiration
    const result = await redis.set(lockKey, currentTerminalId, 'EX', LOCK_TTL, 'NX');

    if (result === 'OK') {
      console.log(`[terminal-registry] Acquired lock on ${repo}:${branch}`);
      return true;
    } else {
      // Check who owns the lock
      const owner = await redis.get(lockKey);
      console.log(`[terminal-registry] Lock on ${repo}:${branch} held by ${owner}`);
      return false;
    }
  } catch (err) {
    console.error('[terminal-registry] Failed to acquire lock:', err.message);
    return false;
  }
}

/**
 * Release repo lock
 *
 * Releases a lock only if we are the owner.
 *
 * @param {string} repo - Repository path
 * @param {string} branch - Branch name
 * @returns {Promise<boolean>} True if lock released or not held, false on error
 */
async function releaseRepoLock(repo, branch) {
  if (!currentTerminalId) {
    return true;
  }

  const redis = getRedis();
  if (!redis) {
    return true;
  }

  try {
    const lockKey = getRepoLockKey(repo, branch);

    // Only delete if we own the lock (Lua script for atomicity)
    const result = await redis.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
      1,
      lockKey,
      currentTerminalId
    );

    if (result === 1) {
      console.log(`[terminal-registry] Released lock on ${repo}:${branch}`);
    }

    return true;
  } catch (err) {
    console.error('[terminal-registry] Failed to release lock:', err.message);
    return false;
  }
}

/**
 * Check if repo is locked by another terminal
 *
 * @param {string} repo - Repository path
 * @param {string} branch - Branch name
 * @returns {Promise<Object>} Object with { locked: boolean, owner: string|null, isOurs: boolean }
 */
async function isRepoLocked(repo, branch) {
  const redis = getRedis();
  if (!redis) {
    return { locked: false, owner: null, isOurs: false };
  }

  try {
    const lockKey = getRepoLockKey(repo, branch);
    const owner = await redis.get(lockKey);

    if (!owner) {
      return { locked: false, owner: null, isOurs: false };
    }

    return {
      locked: true,
      owner: owner,
      isOurs: owner === currentTerminalId
    };
  } catch (err) {
    console.error('[terminal-registry] Failed to check lock status:', err.message);
    return { locked: false, owner: null, isOurs: false };
  }
}

/**
 * Refresh/extend a repo lock we already hold
 *
 * @param {string} repo - Repository path
 * @param {string} branch - Branch name
 * @returns {Promise<boolean>} True if lock extended, false if we don't own it
 */
async function refreshRepoLock(repo, branch) {
  if (!currentTerminalId) {
    return false;
  }

  const redis = getRedis();
  if (!redis) {
    return false;
  }

  try {
    const lockKey = getRepoLockKey(repo, branch);

    // Only extend if we own the lock (Lua script for atomicity)
    const result = await redis.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("expire", KEYS[1], ARGV[2]) else return 0 end`,
      1,
      lockKey,
      currentTerminalId,
      LOCK_TTL
    );

    return result === 1;
  } catch (err) {
    console.error('[terminal-registry] Failed to refresh lock:', err.message);
    return false;
  }
}

/**
 * Cleanup stale terminals (call periodically)
 *
 * Removes terminals that haven't sent a heartbeat within SESSION_TTL.
 *
 * @returns {Promise<number>} Number of stale terminals cleaned up
 */
async function cleanupStaleTerminals() {
  // Ensure Redis is connected before proceeding
  const redis = await ensureRedisConnected();
  if (!redis) {
    return 0;
  }

  try {
    const cutoff = Date.now() - SESSION_TTL * 1000;

    // Get stale terminal IDs (score less than cutoff)
    const staleIds = await redis.zrangebyscore(TERMINALS_KEY, '-inf', cutoff);

    if (!staleIds || staleIds.length === 0) {
      return 0;
    }

    // Delete each stale terminal's hash and remove from set
    const pipeline = redis.pipeline();

    for (const terminalId of staleIds) {
      const terminalKey = getTerminalKey(terminalId);
      pipeline.del(terminalKey);
    }

    // Remove all stale entries from sorted set
    pipeline.zremrangebyscore(TERMINALS_KEY, '-inf', cutoff);

    await pipeline.exec();

    console.log(`[terminal-registry] Cleaned up ${staleIds.length} stale terminals`);
    return staleIds.length;
  } catch (err) {
    console.error('[terminal-registry] Failed to cleanup stale terminals:', err.message);
    return 0;
  }
}

/**
 * Get the current terminal's ID
 *
 * @returns {string|null} Current terminal ID or null if not registered
 */
function getCurrentTerminalId() {
  return currentTerminalId;
}

/**
 * Check if this terminal is registered
 *
 * @returns {boolean} True if registered
 */
function isRegistered() {
  return currentTerminalId !== null;
}

/**
 * Update terminal metadata
 *
 * Allows updating specific fields in the terminal's metadata hash.
 *
 * @param {Object} updates - Key-value pairs to update
 * @returns {Promise<boolean>} True if update succeeded
 */
async function updateTerminalMetadata(updates) {
  if (!currentTerminalId) {
    return false;
  }

  const redis = getRedis();
  if (!redis) {
    return false;
  }

  try {
    const terminalKey = getTerminalKey(currentTerminalId);

    // Convert all values to strings for Redis
    const stringUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      stringUpdates[key] = String(value);
    }

    await redis.hset(terminalKey, stringUpdates);
    return true;
  } catch (err) {
    console.error('[terminal-registry] Failed to update metadata:', err.message);
    return false;
  }
}

/**
 * Touch terminal activity timestamp (WO-003)
 *
 * Updates the last_activity timestamp to indicate CLI command usage.
 * Prevents idle timeout during active use.
 *
 * @returns {Promise<void>}
 */
export async function touchTerminal() {
  if (!currentTerminalId) return;
  const redis = getRedis();
  if (!redis) return;

  const now = Date.now();
  try {
    await redis.hset(getTerminalKey(currentTerminalId), 'last_activity', now.toString());
  } catch (err) {
    // Silently ignore - non-critical
  }
}

/**
 * Reset cleanup handlers flag (for testing purposes)
 * @private
 */
export function resetCleanupHandlers() {
  cleanupHandlersRegistered = false;
}

// Export all functions
export {
  generateTerminalId,
  registerTerminal,
  unregisterTerminal,
  heartbeat,
  listActiveTerminals,
  getTerminalsForRepo,
  acquireRepoLock,
  releaseRepoLock,
  isRepoLocked,
  refreshRepoLock,
  cleanupStaleTerminals,
  getCurrentTerminalId,
  isRegistered,
  updateTerminalMetadata,
  HEARTBEAT_INTERVAL,
  SESSION_TTL,
  LOCK_TTL,
  IDLE_TIMEOUT
};

export default {
  generateTerminalId,
  registerTerminal,
  unregisterTerminal,
  heartbeat,
  listActiveTerminals,
  getTerminalsForRepo,
  acquireRepoLock,
  releaseRepoLock,
  isRepoLocked,
  refreshRepoLock,
  cleanupStaleTerminals,
  getCurrentTerminalId,
  isRegistered,
  updateTerminalMetadata,
  HEARTBEAT_INTERVAL,
  SESSION_TTL,
  LOCK_TTL,
  IDLE_TIMEOUT
};
