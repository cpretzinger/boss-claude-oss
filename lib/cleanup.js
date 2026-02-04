/**
 * Centralized Cleanup Utility for Boss Claude
 *
 * This module provides a single cleanup() function that closes all database
 * connections to ensure commands exit cleanly without hanging.
 *
 * The cleanup is idempotent - safe to call multiple times.
 */

import { closeConnections as closeMemorySupervisor } from './agents/memory-supervisor.js';
import { closeOctokit } from './memory.js';
import postgres from './postgres.js';
import { closeGlobalSubscriber } from './redis.js';
// Note: closeRedisEngineer is imported dynamically to avoid triggering singleton creation

// Track module-level Redis instances that need cleanup
let redisInstances = [];

/**
 * Register a Redis instance for cleanup
 * Call this after creating a Redis connection
 */
export function registerRedis(redis) {
  if (redis && !redisInstances.includes(redis)) {
    redisInstances.push(redis);
  }
}

/**
 * Close all registered Redis instances
 * Uses quit() which gracefully closes connections, followed by disconnect() as backup
 */
async function closeAllRedis() {
  const closePromises = redisInstances.map(async (redis) => {
    try {
      if (redis && redis.status !== 'end') {
        // quit() sends QUIT command and waits for response - graceful
        await redis.quit().catch(() => {});
        // disconnect() as backup if quit didn't fully close
        redis.disconnect();
      }
    } catch (err) {
      // Ignore errors during cleanup - connection might already be closed
    }
  });
  await Promise.all(closePromises);
  redisInstances = [];
}

/**
 * Close PostgreSQL connection pool
 */
async function closePostgres() {
  try {
    await postgres.utils.close();
  } catch (err) {
    // Ignore errors during cleanup - pool might not exist or already closed
  }
}

/**
 * Close memory supervisor connections
 */
async function closeMemory() {
  try {
    await closeMemorySupervisor();
  } catch (err) {
    // Ignore errors during cleanup
  }
}

/**
 * Unref all active handles so they don't keep the process alive
 * This is a fallback that allows the process to exit even if some connections linger
 */
function unrefAllHandles() {
  try {
    const handles = process._getActiveHandles();
    for (const handle of handles) {
      // Unref the handle so it doesn't keep the process alive
      if (handle && typeof handle.unref === 'function') {
        handle.unref();
      }
      // Also destroy sockets if possible
      if (handle && handle.constructor && handle.constructor.name === 'Socket') {
        if (!handle.destroyed) {
          handle.destroy();
        }
      }
    }
  } catch (err) {
    // Ignore errors - best effort cleanup
  }
}

/**
 * Main cleanup function - closes all database connections
 *
 * This function is idempotent and safe to call multiple times.
 * It should be called before process.exit() in all CLI commands.
 *
 * @returns {Promise<void>}
 */
export async function cleanup() {
  try {
    // Close Octokit first (synchronous, quick)
    closeOctokit();

    // Close the module-level Redis client from redis-memory-engineer (dynamic import to avoid singleton trigger)
    try {
      const { closeRedisEngineer } = await import('./agents/memory-engineers/redis-memory-engineer.js');
      await closeRedisEngineer();
    } catch (err) {
      // Module may not be loaded - ignore
    }

    // Run all cleanup operations in parallel for speed
    await Promise.all([
      closeAllRedis(),
      closePostgres(),
      closeMemory(),
      closeGlobalSubscriber()
    ]);

    // Unref all remaining handles so process can exit
    // This catches connections that weren't registered properly
    unrefAllHandles();
  } catch (err) {
    // Don't throw during cleanup - we want to exit cleanly
  }
}

export default cleanup;
