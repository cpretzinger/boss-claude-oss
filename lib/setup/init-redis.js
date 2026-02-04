/**
 * Boss Claude Redis Initialization
 *
 * Sets up all required Redis data structures according to REDIS-ARCHITECTURE.md
 * Creates default Boss identity and initializes core data structures.
 *
 * Data Structures Initialized:
 * - boss:identity (String/JSON) - Global Boss Claude state
 * - boss:sessions:history (Sorted Set) - Temporal session index
 * - boss:leaderboard:xp (Sorted Set) - Global XP ranking
 * - boss:achievements:{user} (Set) - Achievement tracking
 *
 * This module runs automatically during setup wizard and can be
 * re-run safely to repair/reset the Redis state.
 */

import Redis from 'ioredis';
import chalk from 'chalk';

// Default identity configuration
const DEFAULT_IDENTITY = {
  level: 1,
  xp: 0,
  token_bank: 0,
  total_sessions: 0,
  repos_managed: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// Available achievements (for reference)
const ACHIEVEMENTS = [
  'first_session',      // Complete first session
  'level_5',            // Reach level 5
  'level_10',           // Reach level 10
  'token_saver',        // Save 100k tokens
  'perfect_execution',  // 10 sessions with no errors
  'speed_demon',        // Complete task in under 1 min
  'repo_master',        // Manage 10+ repos
  'consistency_king',   // 7 day streak
];

/**
 * Initialize Redis with all required data structures
 *
 * @param {string} redisUrl - Redis connection string
 * @param {string} username - GitHub username for user-specific data
 * @param {boolean} force - Force re-initialization even if data exists
 * @returns {Promise<Object>} Initialization results
 */
export async function initializeRedis(redisUrl, username = 'default', force = false) {
  const client = new Redis(redisUrl);
  const results = {
    identity: { created: false, existed: false },
    history: { created: false, existed: false },
    leaderboard: { created: false, existed: false },
    achievements: { created: false, existed: false },
    healthCheck: { passed: false }
  };

  try {
    // Test connection
    await client.ping();

    // 1. Initialize Boss Identity
    const identityExists = await client.exists('boss:identity');

    if (!identityExists || force) {
      await client.set('boss:identity', JSON.stringify(DEFAULT_IDENTITY));
      results.identity.created = true;

      if (identityExists && force) {
        results.identity.existed = true;
      }
    } else {
      results.identity.existed = true;
    }

    // 2. Initialize Session History (Sorted Set)
    // This is a sorted set, so we just verify it exists
    const historyExists = await client.exists('boss:sessions:history');

    if (!historyExists) {
      // Initialize empty sorted set by adding and removing a dummy entry
      await client.zadd('boss:sessions:history', 0, '__init__');
      await client.zrem('boss:sessions:history', '__init__');
      results.history.created = true;
    } else {
      results.history.existed = true;
    }

    // 3. Initialize Leaderboard (Sorted Set)
    const leaderboardExists = await client.exists('boss:leaderboard:xp');

    if (!leaderboardExists || force) {
      // Add initial user with 0 XP
      await client.zadd('boss:leaderboard:xp', 0, username);
      results.leaderboard.created = true;

      if (leaderboardExists && force) {
        results.leaderboard.existed = true;
      }
    } else {
      // Update existing user or add if not present
      const userExists = await client.zscore('boss:leaderboard:xp', username);
      if (!userExists) {
        await client.zadd('boss:leaderboard:xp', 0, username);
        results.leaderboard.created = true;
      } else {
        results.leaderboard.existed = true;
      }
    }

    // 4. Initialize Achievements (Set)
    const achievementsKey = `boss:achievements:${username}`;
    const achievementsExist = await client.exists(achievementsKey);

    if (!achievementsExist) {
      // Initialize empty set by adding and removing a dummy entry
      await client.sadd(achievementsKey, '__init__');
      await client.srem(achievementsKey, '__init__');
      results.achievements.created = true;
    } else {
      results.achievements.existed = true;
    }

    // 5. Health check
    const healthCheckResult = await performHealthCheck(client);
    results.healthCheck = healthCheckResult;

    return results;

  } catch (error) {
    throw new Error(`Redis initialization failed: ${error.message}`);
  } finally {
    await client.quit();
  }
}

/**
 * Perform comprehensive health check on Redis data structures
 *
 * @param {Redis} client - Connected Redis client
 * @returns {Promise<Object>} Health check results
 */
async function performHealthCheck(client) {
  const checks = {
    passed: true,
    details: {}
  };

  try {
    // Check 1: Identity exists and is valid JSON
    const identity = await client.get('boss:identity');
    if (!identity) {
      checks.passed = false;
      checks.details.identity = 'Missing boss:identity key';
    } else {
      try {
        const parsed = JSON.parse(identity);
        const requiredFields = ['level', 'xp', 'token_bank', 'total_sessions', 'repos_managed'];
        const missingFields = requiredFields.filter(field => !(field in parsed));

        if (missingFields.length > 0) {
          checks.passed = false;
          checks.details.identity = `Missing fields: ${missingFields.join(', ')}`;
        } else {
          checks.details.identity = 'OK';
        }
      } catch (e) {
        checks.passed = false;
        checks.details.identity = 'Invalid JSON format';
      }
    }

    // Check 2: Session history is a sorted set
    const historyType = await client.type('boss:sessions:history');
    if (historyType !== 'zset' && historyType !== 'none') {
      checks.passed = false;
      checks.details.history = `Wrong type: ${historyType} (expected: zset)`;
    } else {
      checks.details.history = 'OK';
    }

    // Check 3: Leaderboard is a sorted set
    const leaderboardType = await client.type('boss:leaderboard:xp');
    if (leaderboardType !== 'zset' && leaderboardType !== 'none') {
      checks.passed = false;
      checks.details.leaderboard = `Wrong type: ${leaderboardType} (expected: zset)`;
    } else {
      checks.details.leaderboard = 'OK';
    }

    // Check 4: Test read/write operations
    const testKey = 'boss:healthcheck:test';
    const testValue = Date.now().toString();

    await client.set(testKey, testValue);
    const retrieved = await client.get(testKey);
    await client.del(testKey);

    if (retrieved !== testValue) {
      checks.passed = false;
      checks.details.readWrite = 'Read/write test failed';
    } else {
      checks.details.readWrite = 'OK';
    }

    // Check 5: Test sorted set operations
    const testZSetKey = 'boss:healthcheck:zset';
    await client.zadd(testZSetKey, 100, 'test_member');
    const score = await client.zscore(testZSetKey, 'test_member');
    await client.del(testZSetKey);

    if (score !== '100') {
      checks.passed = false;
      checks.details.sortedSets = 'Sorted set test failed';
    } else {
      checks.details.sortedSets = 'OK';
    }

  } catch (error) {
    checks.passed = false;
    checks.details.error = error.message;
  }

  return checks;
}

/**
 * Get current Redis statistics
 *
 * @param {string} redisUrl - Redis connection string
 * @returns {Promise<Object>} Redis statistics
 */
export async function getRedisStats(redisUrl) {
  const client = new Redis(redisUrl);

  try {
    await client.ping();

    const stats = {
      identity: null,
      totalSessions: 0,
      totalRepos: 0,
      activeSessions: 0,
      leaderboardSize: 0,
      achievements: {},
      cacheKeys: 0
    };

    // Get identity
    const identityData = await client.get('boss:identity');
    if (identityData) {
      stats.identity = JSON.parse(identityData);
    }

    // Count sessions in history
    stats.totalSessions = await client.zcard('boss:sessions:history');

    // Count repos
    const repoKeys = await client.keys('boss:repo:*');
    stats.totalRepos = repoKeys.length;

    // Count active sessions
    const activeSessionKeys = await client.keys('boss:session:*:current');
    stats.activeSessions = activeSessionKeys.length;

    // Get leaderboard size
    stats.leaderboardSize = await client.zcard('boss:leaderboard:xp');

    // Count cache keys
    const cacheKeys = await client.keys('boss:cache:*');
    stats.cacheKeys = cacheKeys.length;

    // Get achievements for all users
    const achievementKeys = await client.keys('boss:achievements:*');
    for (const key of achievementKeys) {
      const username = key.replace('boss:achievements:', '');
      const achievements = await client.smembers(key);
      stats.achievements[username] = achievements.filter(a => a !== '__init__');
    }

    return stats;

  } catch (error) {
    throw new Error(`Failed to get Redis stats: ${error.message}`);
  } finally {
    await client.quit();
  }
}

/**
 * Reset Redis to initial state (WARNING: Destructive!)
 *
 * @param {string} redisUrl - Redis connection string
 * @param {string} username - GitHub username
 * @returns {Promise<void>}
 */
export async function resetRedis(redisUrl, username = 'default') {
  const client = new Redis(redisUrl);

  try {
    await client.ping();

    // Delete all Boss Claude keys
    const allKeys = await client.keys('boss:*');

    if (allKeys.length > 0) {
      await client.del(...allKeys);
    }

    // Re-initialize
    await client.quit();
    return await initializeRedis(redisUrl, username, true);

  } catch (error) {
    throw new Error(`Failed to reset Redis: ${error.message}`);
  } finally {
    if (client.status === 'ready') {
      await client.quit();
    }
  }
}

/**
 * Verify Redis connection and structure
 *
 * @param {string} redisUrl - Redis connection string
 * @returns {Promise<Object>} Verification results
 */
export async function verifyRedis(redisUrl) {
  const client = new Redis(redisUrl);

  try {
    // Test connection
    await client.ping();

    // Get server info
    const serverInfo = await client.info('server');
    const redisVersion = serverInfo.match(/redis_version:(.+)/)?.[1]?.trim();

    // Perform health check
    const healthCheck = await performHealthCheck(client);

    // Get key counts
    const identityExists = await client.exists('boss:identity');
    const historySize = await client.zcard('boss:sessions:history');
    const leaderboardSize = await client.zcard('boss:leaderboard:xp');

    return {
      connected: true,
      version: redisVersion,
      healthCheck,
      structures: {
        identity: identityExists === 1,
        sessionHistory: historySize,
        leaderboard: leaderboardSize
      }
    };

  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  } finally {
    await client.quit();
  }
}

/**
 * Print formatted initialization results
 *
 * @param {Object} results - Results from initializeRedis
 * @param {string} username - GitHub username
 */
export function printInitResults(results, username) {
  console.log(chalk.cyan('\n📦 Redis Initialization Results\n'));

  // Identity
  if (results.identity.created) {
    console.log(chalk.green('✓ boss:identity') + chalk.dim(' - Created default identity'));
  } else if (results.identity.existed) {
    console.log(chalk.yellow('○ boss:identity') + chalk.dim(' - Already exists (preserved)'));
  }

  // Session History
  if (results.history.created) {
    console.log(chalk.green('✓ boss:sessions:history') + chalk.dim(' - Initialized sorted set'));
  } else if (results.history.existed) {
    console.log(chalk.yellow('○ boss:sessions:history') + chalk.dim(' - Already exists'));
  }

  // Leaderboard
  if (results.leaderboard.created) {
    console.log(chalk.green(`✓ boss:leaderboard:xp`) + chalk.dim(` - Added ${username} with 0 XP`));
  } else if (results.leaderboard.existed) {
    console.log(chalk.yellow('○ boss:leaderboard:xp') + chalk.dim(' - Already exists'));
  }

  // Achievements
  if (results.achievements.created) {
    console.log(chalk.green(`✓ boss:achievements:${username}`) + chalk.dim(' - Initialized empty set'));
  } else if (results.achievements.existed) {
    console.log(chalk.yellow(`○ boss:achievements:${username}`) + chalk.dim(' - Already exists'));
  }

  // Health Check
  console.log();
  if (results.healthCheck.passed) {
    console.log(chalk.green('✓ Health Check Passed') + chalk.dim(' - All structures validated'));
  } else {
    console.log(chalk.red('✗ Health Check Failed'));
    Object.entries(results.healthCheck.details).forEach(([key, value]) => {
      if (value !== 'OK') {
        console.log(chalk.red(`  ✗ ${key}: `) + chalk.dim(value));
      }
    });
  }

  console.log();
}

/**
 * Integration point for setup wizard
 * Called automatically after Redis connection is validated
 *
 * @param {string} redisUrl - Redis connection string
 * @param {string} username - GitHub username
 * @returns {Promise<boolean>} Success status
 */
export async function setupRedisForWizard(redisUrl, username) {
  try {
    console.log(chalk.cyan('\n🔧 Initializing Redis data structures...\n'));

    const results = await initializeRedis(redisUrl, username, false);
    printInitResults(results, username);

    if (!results.healthCheck.passed) {
      console.log(chalk.yellow('\n⚠️  Warning: Health check failed. Some features may not work correctly.'));
      console.log(chalk.dim('You can try running: boss-claude redis:reset\n'));
      return false;
    }

    console.log(chalk.green('✓ Redis initialization complete!\n'));
    return true;

  } catch (error) {
    console.log(chalk.red(`\n✗ Redis initialization failed: ${error.message}\n`));
    return false;
  }
}

// Export constants for use in other modules
export { DEFAULT_IDENTITY, ACHIEVEMENTS };
