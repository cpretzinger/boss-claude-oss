#!/usr/bin/env node

/**
 * Boss Claude Setup Wizard
 * Interactive setup flow for first-time installation
 */

import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import os from 'os';
import Redis from 'ioredis';
import pg from 'pg';
import { Octokit } from '@octokit/rest';
import {
  header,
  ask,
  askSecret,
  confirm,
  spinnerWithTask as spinner,
  success,
  error,
  warning,
  info,
  box,
  pause,
  clear
} from '../lib/prompts.js';

const { Pool } = pg;

// Configuration
const BOSS_DIR = join(os.homedir(), '.boss-claude');
const ENV_FILE = join(BOSS_DIR, '.env');

/**
 * Main setup wizard
 */
async function runSetup() {
  clear();

  // Welcome screen
  header(
    '🎮 BOSS CLAUDE SETUP WIZARD',
    'Let\'s get you set up with your AI automation boss!'
  );

  box(
    'Boss Claude is a gamified AI assistant that tracks your\n' +
    'progress across all your projects. You earn XP, level up,\n' +
    'and build a token bank as you work with Claude.\n\n' +
    'This wizard will help you configure:\n' +
    '  • GitHub integration (for session memory)\n' +
    '  • Redis (for real-time stats)\n' +
    '  • PostgreSQL (for advanced analytics)',
    'Welcome'
  );

  const shouldContinue = await confirm('\nReady to begin setup?', true);

  if (!shouldContinue) {
    console.log(chalk.yellow('\nSetup cancelled. Run "boss-claude setup" when ready!\n'));
    process.exit(0);
  }

  // Create .boss-claude directory
  if (!existsSync(BOSS_DIR)) {
    mkdirSync(BOSS_DIR, { recursive: true });
    success(`Created ${BOSS_DIR}`);
  }

  const config = {};

  // Step 1: GitHub Token
  await setupGitHub(config);

  // Step 2: Redis
  await setupRedis(config);

  // Step 3: PostgreSQL
  await setupPostgreSQL(config);

  // Step 4: Save configuration
  await saveConfig(config);

  // Step 5: Test everything
  await testConfiguration(config);

  // Success!
  showSuccessScreen();
}

/**
 * Setup GitHub integration
 */
async function setupGitHub(config) {
  header('Step 1: GitHub Integration', 'Boss Claude uses GitHub Issues to store session memories');

  info('Why GitHub?');
  console.log(chalk.dim('  • Sessions are stored as searchable GitHub Issues'));
  console.log(chalk.dim('  • Works across all your repositories'));
  console.log(chalk.dim('  • Free and reliable long-term storage\n'));

  const hasToken = await confirm('Do you already have a GitHub Personal Access Token?', false);

  if (!hasToken) {
    box(
      'Creating a GitHub Token:\n\n' +
      '1. Go to: https://github.com/settings/tokens/new\n' +
      '2. Note: "Boss Claude Session Memory"\n' +
      '3. Scopes needed: repo (full control)\n' +
      '4. Click "Generate token"\n' +
      '5. Copy the token (it won\'t be shown again!)',
      'Instructions'
    );

    await pause();
  }

  // Get GitHub token
  const githubToken = await askSecret('\nEnter your GitHub Personal Access Token');

  if (!githubToken) {
    error('GitHub token is required');
    process.exit(1);
  }

  // Validate token
  const githubResult = await spinner('Validating GitHub token', async () => {
    const octokit = new Octokit({ auth: githubToken });
    const { data: user } = await octokit.users.getAuthenticated();
    return user;
  });

  if (!githubResult.success) {
    error('Failed to validate GitHub token', githubResult.error.message);
    process.exit(1);
  }

  success(`Authenticated as ${chalk.cyan(githubResult.result.login)}`);

  config.GITHUB_TOKEN = githubToken;
  config.GITHUB_USER = githubResult.result.login;
}

/**
 * Setup Redis connection
 */
async function setupRedis(config) {
  header('Step 2: Redis Configuration', 'Redis stores real-time stats and session data');

  info('Why Redis?');
  console.log(chalk.dim('  • Fast real-time updates'));
  console.log(chalk.dim('  • Efficient for frequently accessed data'));
  console.log(chalk.dim('  • Great for leaderboards and stats\n'));

  const hasRedis = await confirm('Do you have a Redis instance?', false);

  if (!hasRedis) {
    box(
      'Free Redis Options:\n\n' +
      '1. Railway.app - redis.new (easiest!)\n' +
      '2. Redis Cloud - redis.com/try-free\n' +
      '3. Upstash - upstash.com (serverless)\n' +
      '4. Local - brew install redis (macOS)\n\n' +
      'Connection string format:\n' +
      'redis://username:password@host:port',
      'Get Redis'
    );

    const setupLater = await confirm('\nWould you like to skip Redis for now?', false);

    if (setupLater) {
      warning('Skipping Redis. You can add it later by editing ~/.boss-claude/.env');
      return;
    }

    await pause();
  }

  // Get Redis URL
  const redisUrl = await ask('\nEnter Redis connection string', 'redis://localhost:6379');

  // Validate Redis
  const redisResult = await spinner('Testing Redis connection', async () => {
    const client = new Redis(redisUrl);
    await client.ping();
    const info = await client.info('server');
    await client.quit();
    return info;
  });

  if (!redisResult.success) {
    error('Failed to connect to Redis', redisResult.error.message);

    const skipRedis = await confirm('\nContinue without Redis?', true);
    if (!skipRedis) {
      process.exit(1);
    }
    warning('Continuing without Redis. Some features will be limited.');
    return;
  }

  success('Redis connection successful');
  config.REDIS_URL = redisUrl;

  // Initialize Redis data structures
  const { setupRedisForWizard } = await import('../lib/setup/init-redis.js');
  const initSuccess = await setupRedisForWizard(redisUrl, config.GITHUB_USER || 'default');

  if (!initSuccess) {
    const continueAnyway = await confirm('\nContinue with incomplete Redis setup?', true);
    if (!continueAnyway) {
      process.exit(1);
    }
  }
}

/**
 * Setup PostgreSQL connection
 */
async function setupPostgreSQL(config) {
  header('Step 3: PostgreSQL Database', 'PostgreSQL provides advanced analytics and insights');

  info('Why PostgreSQL?');
  console.log(chalk.dim('  • Advanced session analytics'));
  console.log(chalk.dim('  • Achievement tracking'));
  console.log(chalk.dim('  • Historical data and trends\n'));

  const hasPostgres = await confirm('Do you have a PostgreSQL database?', false);

  if (!hasPostgres) {
    box(
      'Free PostgreSQL Options:\n\n' +
      '1. Railway.app - railway.app (recommended!)\n' +
      '2. Supabase - supabase.com (includes UI)\n' +
      '3. Neon - neon.tech (serverless)\n' +
      '4. Local - brew install postgresql (macOS)\n\n' +
      'Connection string format:\n' +
      'postgresql://user:pass@host:port/database',
      'Get PostgreSQL'
    );

    const setupLater = await confirm('\nWould you like to skip PostgreSQL for now?', false);

    if (setupLater) {
      warning('Skipping PostgreSQL. Basic features will still work.');
      return;
    }

    await pause();
  }

  // Get PostgreSQL URL
  const postgresUrl = await ask('\nEnter PostgreSQL connection string');

  if (!postgresUrl) {
    warning('Skipping PostgreSQL. You can add it later.');
    return;
  }

  // Validate PostgreSQL
  const pgResult = await spinner('Testing PostgreSQL connection', async () => {
    const pool = new Pool({
      connectionString: postgresUrl,
      ssl: { rejectUnauthorized: false }
    });

    const result = await pool.query('SELECT version()');
    await pool.end();
    return result.rows[0].version;
  });

  if (!pgResult.success) {
    error('Failed to connect to PostgreSQL', pgResult.error.message);

    const skipPg = await confirm('\nContinue without PostgreSQL?', true);
    if (!skipPg) {
      process.exit(1);
    }
    warning('Continuing without PostgreSQL. Some features will be limited.');
    return;
  }

  success('PostgreSQL connection successful');
  config.BOSS_CLAUDE_PG_URL = postgresUrl;

  // Ask about schema setup
  const shouldSetupSchema = await confirm('\nWould you like to set up the database schema now?', true);

  if (shouldSetupSchema) {
    await setupDatabaseSchema(postgresUrl);
  } else {
    info('You can set up the schema later by running: boss-claude db:setup');
  }
}

/**
 * Setup database schema
 */
async function setupDatabaseSchema(postgresUrl) {
  const schemaResult = await spinner('Creating database schema', async () => {
    const pool = new Pool({
      connectionString: postgresUrl,
      ssl: { rejectUnauthorized: false }
    });

    // Create schema
    await pool.query('CREATE SCHEMA IF NOT EXISTS boss_claude');

    // Create sessions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS boss_claude.sessions (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        project TEXT NOT NULL,
        start_time TIMESTAMP DEFAULT NOW(),
        end_time TIMESTAMP,
        duration_seconds INTEGER GENERATED ALWAYS AS (
          EXTRACT(EPOCH FROM (end_time - start_time))::INTEGER
        ) STORED,
        level_at_start INTEGER DEFAULT 1,
        level_at_end INTEGER,
        xp_earned INTEGER DEFAULT 0,
        tokens_saved INTEGER DEFAULT 0,
        tasks_completed INTEGER DEFAULT 0,
        perfect_executions INTEGER DEFAULT 0,
        efficiency_multiplier DECIMAL(3,2) DEFAULT 1.0,
        summary TEXT,
        context_data JSONB
      )
    `);

    // Create achievements table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS boss_claude.achievements (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        achievement_type TEXT NOT NULL,
        achievement_name TEXT NOT NULL,
        description TEXT,
        xp_reward INTEGER DEFAULT 0,
        metadata JSONB,
        earned_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create memory_snapshots table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS boss_claude.memory_snapshots (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id INTEGER REFERENCES boss_claude.sessions(id),
        snapshot_type TEXT NOT NULL,
        snapshot_data JSONB NOT NULL,
        level INTEGER,
        token_bank INTEGER,
        total_xp INTEGER,
        efficiency DECIMAL(3,2),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON boss_claude.sessions(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_sessions_project ON boss_claude.sessions(project)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON boss_claude.achievements(user_id)');

    await pool.end();
    return true;
  });

  if (schemaResult.success) {
    success('Database schema created successfully');
  } else {
    error('Failed to create database schema', schemaResult.error.message);
  }
}

/**
 * Save configuration to .env file
 */
async function saveConfig(config) {
  header('Saving Configuration', 'Writing settings to ~/.boss-claude/.env');

  const envContent = Object.entries(config)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n';

  await spinner('Saving configuration', async () => {
    writeFileSync(ENV_FILE, envContent, 'utf-8');
    return true;
  });

  success(`Configuration saved to ${ENV_FILE}`);
}

/**
 * Test full configuration
 */
async function testConfiguration(config) {
  header('Testing Configuration', 'Verifying all connections');

  const tests = [];

  // Test GitHub
  if (config.GITHUB_TOKEN) {
    tests.push({
      name: 'GitHub Authentication',
      test: async () => {
        const octokit = new Octokit({ auth: config.GITHUB_TOKEN });
        await octokit.users.getAuthenticated();
      }
    });
  }

  // Test Redis
  if (config.REDIS_URL) {
    tests.push({
      name: 'Redis Connection',
      test: async () => {
        const client = new Redis(config.REDIS_URL);
        await client.ping();
        await client.quit();
      }
    });
  }

  // Test PostgreSQL
  if (config.BOSS_CLAUDE_PG_URL) {
    tests.push({
      name: 'PostgreSQL Connection',
      test: async () => {
        const pool = new Pool({
          connectionString: config.BOSS_CLAUDE_PG_URL,
          ssl: { rejectUnauthorized: false }
        });
        await pool.query('SELECT 1');
        await pool.end();
      }
    });
  }

  // Run all tests
  for (const test of tests) {
    const result = await spinner(test.name, test.test);
    if (!result.success) {
      error(`${test.name} failed`, result.error.message);
    }
  }
}

/**
 * Show success screen
 */
function showSuccessScreen() {
  clear();

  header('🎉 Setup Complete!', 'Boss Claude is ready to go!');

  box(
    'You\'re all set! Here\'s how to get started:\n\n' +
    '1. Run "boss-claude init" in any git repository\n' +
    '2. Use "boss-claude status" to check your stats\n' +
    '3. Use "boss-claude save" to save sessions\n' +
    '4. Use "boss-claude recall" to search memories\n\n' +
    'Boss Claude will auto-load in Claude Code and\n' +
    'track your progress across all projects.',
    'Next Steps'
  );

  success('Happy coding with Boss Claude!');

  console.log(chalk.dim('\n💡 Tip: Add this to your project\'s CLAUDE.md:'));
  box(
    '# BOSS CLAUDE AUTO-LOAD\n' +
    '```javascript\n' +
    'import { formatStatusForClaude } from \'@cpretzinger/boss-claude/lib/init.js\';\n' +
    'console.log(await formatStatusForClaude());\n' +
    '```',
    ''
  );

  console.log();
}

// Run setup
runSetup().catch((err) => {
  console.error(chalk.red('\n❌ Setup failed:'), err.message);
  console.error(chalk.dim(err.stack));
  process.exit(1);
});
