#!/usr/bin/env node

/**
 * Redis Initialization Verification Script
 *
 * Quick script to verify Redis initialization is working correctly.
 * Run this after setup to confirm all structures are in place.
 *
 * Usage:
 *   node scripts/verify-redis-init.js
 *
 * Or from anywhere:
 *   boss-claude redis:verify
 */

import chalk from 'chalk';
import { verifyRedis, getRedisStats } from '../lib/setup/init-redis.js';
import dotenv from 'dotenv';
import { join } from 'path';
import os from 'os';
import { existsSync } from 'fs';

// Load environment variables
const envPath = join(os.homedir(), '.boss-claude', '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

async function main() {
  console.log(chalk.blue('\n🔍 Boss Claude Redis Verification\n'));

  // Check for Redis URL
  if (!process.env.REDIS_URL) {
    console.log(chalk.red('✗ REDIS_URL not configured'));
    console.log(chalk.dim('\nPlease run: boss-claude setup\n'));
    process.exit(1);
  }

  console.log(chalk.dim(`Redis URL: ${process.env.REDIS_URL.split('@')[1] || 'configured'}\n`));

  // Step 1: Verify connection and structures
  console.log(chalk.bold('Step 1: Verifying Connection & Structures'));
  console.log(chalk.dim('─'.repeat(50)));

  try {
    const verification = await verifyRedis(process.env.REDIS_URL);

    if (!verification.connected) {
      console.log(chalk.red('✗ Connection Failed'));
      console.log(chalk.dim(`  Error: ${verification.error}\n`));
      process.exit(1);
    }

    console.log(chalk.green('✓ Connection Successful'));
    console.log(chalk.dim(`  Redis Version: ${verification.version}`));

    // Check structures
    console.log();
    if (verification.structures.identity) {
      console.log(chalk.green('✓ boss:identity exists'));
    } else {
      console.log(chalk.red('✗ boss:identity missing'));
    }

    if (verification.structures.sessionHistory >= 0) {
      console.log(chalk.green(`✓ boss:sessions:history exists (${verification.structures.sessionHistory} sessions)`));
    } else {
      console.log(chalk.red('✗ boss:sessions:history missing'));
    }

    if (verification.structures.leaderboard >= 0) {
      console.log(chalk.green(`✓ boss:leaderboard:xp exists (${verification.structures.leaderboard} users)`));
    } else {
      console.log(chalk.red('✗ boss:leaderboard:xp missing'));
    }

    // Health check results
    console.log();
    if (verification.healthCheck.passed) {
      console.log(chalk.green('✓ All health checks passed'));
    } else {
      console.log(chalk.red('✗ Health check failed'));
      console.log();
      Object.entries(verification.healthCheck.details).forEach(([key, value]) => {
        const status = value === 'OK' ? chalk.green('✓') : chalk.red('✗');
        console.log(`  ${status} ${key}: ${chalk.dim(value)}`);
      });
    }

  } catch (error) {
    console.log(chalk.red(`✗ Verification failed: ${error.message}\n`));
    process.exit(1);
  }

  // Step 2: Get statistics
  console.log('\n' + chalk.bold('Step 2: Redis Statistics'));
  console.log(chalk.dim('─'.repeat(50)));

  try {
    const stats = await getRedisStats(process.env.REDIS_URL);

    if (stats.identity) {
      console.log(chalk.cyan('\nBoss Identity:'));
      console.log(`  Level: ${chalk.yellow(stats.identity.level)}`);
      console.log(`  XP: ${chalk.cyan(stats.identity.xp)}`);
      console.log(`  Token Bank: ${chalk.magenta((stats.identity.token_bank || 0).toLocaleString())}`);
      console.log(`  Total Sessions: ${chalk.blue(stats.identity.total_sessions)}`);
      console.log(`  Repos Managed: ${chalk.green(stats.identity.repos_managed)}`);
    }

    console.log(chalk.cyan('\nData Structures:'));
    console.log(`  Session History: ${chalk.cyan(stats.totalSessions)} sessions`);
    console.log(`  Tracked Repos: ${chalk.green(stats.totalRepos)} repositories`);
    console.log(`  Active Sessions: ${chalk.yellow(stats.activeSessions)}`);
    console.log(`  Leaderboard Size: ${chalk.blue(stats.leaderboardSize)} users`);
    console.log(`  Cache Keys: ${chalk.magenta(stats.cacheKeys)}`);

    if (Object.keys(stats.achievements).length > 0) {
      console.log(chalk.cyan('\nAchievements:'));
      Object.entries(stats.achievements).forEach(([user, achievements]) => {
        const achievementList = achievements.length > 0 ? achievements.join(', ') : chalk.dim('none');
        console.log(`  ${chalk.cyan(user)}: ${achievementList}`);
      });
    }

  } catch (error) {
    console.log(chalk.red(`✗ Failed to get stats: ${error.message}\n`));
    process.exit(1);
  }

  // Step 3: Recommendations
  console.log('\n' + chalk.bold('Step 3: Recommendations'));
  console.log(chalk.dim('─'.repeat(50)));

  const verification = await verifyRedis(process.env.REDIS_URL);
  const stats = await getRedisStats(process.env.REDIS_URL);

  const recommendations = [];

  // Check if identity needs initialization
  if (!verification.structures.identity) {
    recommendations.push({
      level: 'critical',
      message: 'Boss identity not found',
      action: 'Run: boss-claude redis:init'
    });
  }

  // Check if health check failed
  if (!verification.healthCheck.passed) {
    recommendations.push({
      level: 'warning',
      message: 'Health checks failed',
      action: 'Run: boss-claude redis:init --force'
    });
  }

  // Check for stale cache keys
  if (stats.cacheKeys > 100) {
    recommendations.push({
      level: 'info',
      message: `${stats.cacheKeys} cache keys (may need cleanup)`,
      action: 'Cache keys auto-expire after 1 hour'
    });
  }

  // Check for active sessions without recent activity
  if (stats.activeSessions > 5) {
    recommendations.push({
      level: 'info',
      message: `${stats.activeSessions} active sessions`,
      action: 'Consider completing or saving old sessions'
    });
  }

  if (recommendations.length === 0) {
    console.log(chalk.green('✓ Everything looks good!'));
    console.log(chalk.dim('\nNo recommendations at this time.\n'));
  } else {
    console.log();
    recommendations.forEach((rec) => {
      let icon = '●';
      let color = chalk.blue;

      if (rec.level === 'critical') {
        icon = '✗';
        color = chalk.red;
      } else if (rec.level === 'warning') {
        icon = '⚠';
        color = chalk.yellow;
      }

      console.log(color(`${icon} ${rec.message}`));
      console.log(chalk.dim(`  → ${rec.action}`));
      console.log();
    });
  }

  // Success summary
  console.log(chalk.bold('Verification Complete'));
  console.log(chalk.dim('─'.repeat(50)));

  if (verification.healthCheck.passed) {
    console.log(chalk.green('\n✓ Redis is properly initialized and healthy'));
    console.log(chalk.dim('\nYou can now use Boss Claude with confidence!\n'));
    process.exit(0);
  } else {
    console.log(chalk.yellow('\n⚠ Redis needs attention'));
    console.log(chalk.dim('\nFollow the recommendations above to fix issues.\n'));
    process.exit(1);
  }
}

// Run verification
main().catch((error) => {
  console.error(chalk.red('\n✗ Verification script failed:'), error.message);
  console.error(chalk.dim(error.stack));
  process.exit(1);
});
