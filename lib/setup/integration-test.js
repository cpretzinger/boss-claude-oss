#!/usr/bin/env node
/**
 * Boss Claude - Integration Test
 *
 * Validates entire system end-to-end:
 * 1. Redis connectivity and operations
 * 2. PostgreSQL connectivity and queries
 * 3. GitHub API integration
 * 4. Environment configuration
 *
 * Usage: node lib/setup/integration-test.js
 * Or: boss-claude test
 */

import chalk from 'chalk';
import ora from 'ora';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { Octokit } from '@octokit/rest';
import postgres from '../postgres.js';

// Load environment
const envPath = join(os.homedir(), '.boss-claude', '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Test results tracker
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

// Helper functions
function success(message) {
  console.log(chalk.green('✓'), message);
  results.passed++;
}

function fail(message, error) {
  console.log(chalk.red('✗'), message);
  if (error) {
    console.log(chalk.red('  Error:'), error.message);
  }
  results.failed++;
}

function warning(message) {
  console.log(chalk.yellow('⚠'), message);
  results.warnings++;
}

function info(message) {
  console.log(chalk.blue('ℹ'), message);
}

function section(title) {
  console.log('\n' + chalk.bold.cyan(`━━━ ${title} ━━━`));
}

function subsection(title) {
  console.log(chalk.bold.white(`\n${title}:`));
}

// Test implementations
async function testEnvironmentVariables() {
  section('Environment Configuration');

  const requiredVars = [
    { key: 'REDIS_URL', description: 'Redis connection string' },
    { key: 'BOSS_CLAUDE_PG_URL', description: 'PostgreSQL connection string' },
    { key: 'GITHUB_TOKEN', description: 'GitHub API token' }
  ];

  const optionalVars = [
    { key: 'GITHUB_OWNER', description: 'GitHub username' },
    { key: 'GITHUB_MEMORY_REPO', description: 'Memory repository name' }
  ];

  subsection('Required Variables');
  for (const { key, description } of requiredVars) {
    if (process.env[key]) {
      const maskedValue = key.includes('TOKEN') || key.includes('PASSWORD') || key.includes('URL')
        ? '***' + process.env[key].slice(-4)
        : process.env[key];
      success(`${key} (${description}): ${maskedValue}`);
    } else {
      fail(`${key} (${description}): NOT SET`);
    }
  }

  subsection('Optional Variables');
  for (const { key, description } of optionalVars) {
    if (process.env[key]) {
      success(`${key} (${description}): ${process.env[key]}`);
    } else {
      warning(`${key} (${description}): Not set (using defaults)`);
    }
  }

  // Check .env file location
  if (existsSync(envPath)) {
    success(`Config file: ${envPath}`);
  } else {
    fail(`Config file not found: ${envPath}`);
  }
}

async function testRedisConnection() {
  section('Redis Connection & Operations');

  let redis = null;
  const testKey = `boss:test:${Date.now()}`;
  const testValue = JSON.stringify({ test: true, timestamp: Date.now() });

  try {
    subsection('Connection Test');
    const spinner = ora('Connecting to Redis...').start();

    redis = new Redis(process.env.REDIS_URL);

    // Wait for connection with timeout
    await Promise.race([
      new Promise((resolve) => redis.once('ready', resolve)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
    ]);

    spinner.succeed('Connected to Redis');
    success('Redis connection established');

    // Get server info
    const info = await redis.info('server');
    const versionMatch = info.match(/redis_version:([^\r\n]+)/);
    if (versionMatch) {
      success(`Redis version: ${versionMatch[1]}`);
    }

    subsection('Write Operations');

    // Test SET
    const setResult = await redis.set(testKey, testValue);
    if (setResult === 'OK') {
      success('SET operation successful');
    } else {
      fail('SET operation failed', new Error(`Unexpected result: ${setResult}`));
    }

    // Test TTL
    const ttlResult = await redis.expire(testKey, 60);
    if (ttlResult === 1) {
      success('TTL set successfully (60 seconds)');
    } else {
      fail('TTL operation failed');
    }

    subsection('Read Operations');

    // Test GET
    const getValue = await redis.get(testKey);
    if (getValue === testValue) {
      success('GET operation successful');
    } else {
      fail('GET operation failed', new Error('Value mismatch'));
    }

    // Test EXISTS
    const existsResult = await redis.exists(testKey);
    if (existsResult === 1) {
      success('EXISTS operation successful');
    } else {
      fail('EXISTS operation failed');
    }

    subsection('Boss Claude Identity Test');

    // Test Boss identity operations
    const identityKey = 'boss:identity:test';
    const identityData = {
      level: 1,
      xp: 50,
      token_bank: 1000,
      total_sessions: 5,
      repos_managed: 3,
      created_at: new Date().toISOString()
    };

    await redis.set(identityKey, JSON.stringify(identityData));
    const retrievedIdentity = await redis.get(identityKey);
    const parsedIdentity = JSON.parse(retrievedIdentity);

    if (parsedIdentity.level === 1 && parsedIdentity.xp === 50) {
      success('Identity data serialization working correctly');
    } else {
      fail('Identity data mismatch');
    }

    subsection('Cleanup');

    // Clean up test keys
    await redis.del(testKey, identityKey);
    success('Test keys cleaned up');

  } catch (error) {
    fail('Redis test failed', error);
  } finally {
    if (redis) {
      await redis.quit();
      info('Redis connection closed');
    }
  }
}

async function testPostgreSQLConnection() {
  section('PostgreSQL Connection & Operations');

  try {
    subsection('Connection Test');
    const spinner = ora('Testing PostgreSQL connection...').start();

    const connectionTest = await postgres.utils.testConnection();

    if (connectionTest.connected) {
      spinner.succeed('Connected to PostgreSQL');
      success('PostgreSQL connection established');

      const versionParts = connectionTest.version.split(' ');
      success(`PostgreSQL version: ${versionParts[1]}`);
      success(`Server time: ${connectionTest.timestamp.toISOString()}`);
    } else {
      spinner.fail('PostgreSQL connection failed');
      fail('PostgreSQL connection failed', new Error(connectionTest.error));
      return; // Skip remaining tests
    }

    subsection('Schema Validation');

    // Test schema existence
    const schemaQuery = `
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name = 'boss_claude'
    `;
    const schemaResult = await postgres.pool.query(schemaQuery);

    if (schemaResult.rows.length > 0) {
      success('boss_claude schema exists');
    } else {
      fail('boss_claude schema not found');
      warning('Run database setup: boss-claude setup-db');
      return; // Skip table tests
    }

    subsection('Table Validation');

    const tables = ['sessions', 'achievements', 'memory_snapshots'];

    for (const table of tables) {
      const tableQuery = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'boss_claude'
        AND table_name = $1
      `;
      const tableResult = await postgres.pool.query(tableQuery, [table]);

      if (tableResult.rows.length > 0) {
        success(`Table boss_claude.${table} exists`);
      } else {
        fail(`Table boss_claude.${table} not found`);
      }
    }

    subsection('Function Validation');

    const functions = [
      'fn_get_current_session',
      'fn_get_user_stats'
    ];

    for (const func of functions) {
      const funcQuery = `
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_schema = 'boss_claude'
        AND routine_name = $1
      `;
      const funcResult = await postgres.pool.query(funcQuery, [func]);

      if (funcResult.rows.length > 0) {
        success(`Function boss_claude.${func} exists`);
      } else {
        warning(`Function boss_claude.${func} not found`);
      }
    }

    subsection('Test Session Operations');

    const testUserId = `test-user-${Date.now()}`;
    const testProject = 'integration-test';

    try {
      // Create test session
      const session = await postgres.sessions.start(
        testUserId,
        testProject,
        1,
        { test: true, timestamp: Date.now() }
      );

      if (session && session.id) {
        success(`Created test session: ${session.id}`);

        // Update session
        const updated = await postgres.sessions.updateProgress(session.id, {
          xpEarned: 100,
          tokensSaved: 500,
          tasksCompleted: 5,
          perfectExecutions: 2,
          efficiency: 1.5
        });

        if (updated.xp_earned === 100 && updated.tokens_saved === 500) {
          success('Session progress update successful');
        } else {
          fail('Session progress update failed');
        }

        // End session
        const ended = await postgres.sessions.end(
          session.id,
          2,
          'Integration test completed successfully'
        );

        if (ended.end_time) {
          success('Session ended successfully');
        } else {
          fail('Session end failed');
        }

        // Cleanup: Delete test session
        await postgres.pool.query(
          'DELETE FROM boss_claude.sessions WHERE user_id = $1',
          [testUserId]
        );
        success('Test session cleaned up');

      } else {
        fail('Failed to create test session');
      }
    } catch (error) {
      fail('Session operations failed', error);
    }

  } catch (error) {
    fail('PostgreSQL test failed', error);
  }
}

async function testGitHubIntegration() {
  section('GitHub API Integration');

  try {
    if (!process.env.GITHUB_TOKEN) {
      fail('GITHUB_TOKEN not set - skipping GitHub tests');
      return;
    }

    subsection('Authentication Test');
    const spinner = ora('Testing GitHub authentication...').start();

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    // Test authentication by fetching user info
    const { data: user } = await octokit.users.getAuthenticated();

    spinner.succeed('GitHub authentication successful');
    success(`Authenticated as: ${user.login}`);
    success(`Account type: ${user.type}`);

    subsection('Repository Access');

    const owner = process.env.GITHUB_OWNER || user.login;
    const repo = process.env.GITHUB_MEMORY_REPO || 'boss-claude-memory';

    try {
      // Check if memory repo exists
      const { data: repoData } = await octokit.repos.get({ owner, repo });

      success(`Memory repository accessible: ${owner}/${repo}`);
      success(`Repository visibility: ${repoData.private ? 'Private' : 'Public'}`);

      // Check permissions
      const permissions = repoData.permissions || {};
      const hasIssues = repoData.has_issues;

      if (permissions.push || permissions.admin) {
        success('Write permissions: YES');
      } else {
        warning('Write permissions: NO - may not be able to create issues');
      }

      if (hasIssues) {
        success('Issues enabled: YES');
      } else {
        fail('Issues not enabled - required for memory storage');
      }

      subsection('Issue Operations Test');

      // Create a test issue
      const testIssue = await octokit.issues.create({
        owner,
        repo,
        title: `[integration-test] Test Issue ${Date.now()}`,
        body: '## Test Issue\n\nThis is an automated test issue created by Boss Claude integration tests.\n\n**Status:** Will be automatically closed.',
        labels: ['test', 'automated']
      });

      if (testIssue.data.number) {
        success(`Created test issue #${testIssue.data.number}`);

        // Close the test issue
        await octokit.issues.update({
          owner,
          repo,
          issue_number: testIssue.data.number,
          state: 'closed'
        });

        success(`Closed test issue #${testIssue.data.number}`);
      } else {
        fail('Failed to create test issue');
      }

    } catch (error) {
      if (error.status === 404) {
        warning(`Memory repository not found: ${owner}/${repo}`);
        info(`Create it with: boss-claude setup`);
      } else {
        fail('Repository access test failed', error);
      }
    }

    subsection('API Rate Limits');

    const { data: rateLimit } = await octokit.rateLimit.get();
    const { core } = rateLimit.resources;

    const remaining = core.remaining;
    const limit = core.limit;
    const resetTime = new Date(core.reset * 1000);

    success(`Rate limit: ${remaining}/${limit} requests remaining`);
    info(`Resets at: ${resetTime.toLocaleTimeString()}`);

    if (remaining < 100) {
      warning('Low API rate limit remaining');
    }

  } catch (error) {
    fail('GitHub integration test failed', error);
  }
}

async function testSystemIntegration() {
  section('Full System Integration');

  subsection('End-to-End Workflow Test');

  const testData = {
    userId: `test-user-${Date.now()}`,
    project: 'integration-test-e2e',
    repo: 'test-repo'
  };

  let redis = null;
  let sessionId = null;

  try {
    // Step 1: Redis - Store identity
    info('Step 1: Creating identity in Redis...');
    redis = new Redis(process.env.REDIS_URL);

    const identityKey = `boss:identity:${testData.userId}`;
    const identity = {
      level: 1,
      xp: 0,
      token_bank: 0,
      total_sessions: 0,
      repos_managed: 1,
      created_at: new Date().toISOString()
    };

    await redis.set(identityKey, JSON.stringify(identity));
    success('Identity stored in Redis');

    // Step 2: PostgreSQL - Create session
    info('Step 2: Creating session in PostgreSQL...');
    const session = await postgres.sessions.start(
      testData.userId,
      testData.project,
      identity.level,
      { test: true, workflow: 'e2e' }
    );

    sessionId = session.id;
    success(`Session created: ${sessionId}`);

    // Step 3: Update session with progress
    info('Step 3: Recording session progress...');
    await postgres.sessions.updateProgress(sessionId, {
      xpEarned: 150,
      tokensSaved: 1000,
      tasksCompleted: 3,
      perfectExecutions: 2
    });
    success('Session progress recorded');

    // Step 4: Update identity in Redis
    info('Step 4: Updating identity in Redis...');
    identity.xp += 150;
    identity.token_bank += 1000;
    identity.total_sessions += 1;

    await redis.set(identityKey, JSON.stringify(identity));
    success('Identity updated in Redis');

    // Step 5: End session
    info('Step 5: Ending session...');
    await postgres.sessions.end(
      sessionId,
      identity.level,
      'Integration test completed - all systems operational'
    );
    success('Session ended successfully');

    // Step 6: Verify data consistency
    info('Step 6: Verifying data consistency...');

    const storedIdentity = JSON.parse(await redis.get(identityKey));
    const sessionRecord = await postgres.pool.query(
      'SELECT * FROM boss_claude.sessions WHERE id = $1',
      [sessionId]
    );

    if (storedIdentity.xp === 150 && sessionRecord.rows[0].xp_earned === 150) {
      success('Data consistency verified across Redis and PostgreSQL');
    } else {
      fail('Data inconsistency detected');
    }

    // Cleanup
    info('Cleaning up test data...');
    await redis.del(identityKey);
    await postgres.pool.query(
      'DELETE FROM boss_claude.sessions WHERE user_id = $1',
      [testData.userId]
    );
    success('Test data cleaned up');

    subsection('Integration Test Summary');
    success('Full end-to-end workflow completed successfully');
    success('All systems are properly integrated and operational');

  } catch (error) {
    fail('System integration test failed', error);
  } finally {
    if (redis) {
      await redis.quit();
    }
  }
}

function printSummary() {
  console.log('\n' + chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold.white('INTEGRATION TEST SUMMARY'));
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

  console.log(chalk.green('Passed:  '), results.passed);
  console.log(chalk.red('Failed:  '), results.failed);
  console.log(chalk.yellow('Warnings:'), results.warnings);
  console.log(chalk.white('Total:   '), results.passed + results.failed);

  const passRate = Math.round((results.passed / (results.passed + results.failed)) * 100);

  console.log('\n' + chalk.bold.white('Pass Rate:'),
    passRate >= 90 ? chalk.green(`${passRate}%`) :
    passRate >= 70 ? chalk.yellow(`${passRate}%`) :
    chalk.red(`${passRate}%`)
  );

  if (results.failed === 0) {
    console.log('\n' + chalk.bold.green('✓ ALL TESTS PASSED - System is fully operational!'));
  } else if (results.failed < 5) {
    console.log('\n' + chalk.bold.yellow('⚠ Some tests failed - System partially operational'));
  } else {
    console.log('\n' + chalk.bold.red('✗ Multiple failures detected - System needs attention'));
  }

  console.log('\n' + chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Main execution
async function runIntegrationTests() {
  console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║  BOSS CLAUDE - INTEGRATION TEST SUITE      ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════╝\n'));

  info('Testing complete system integration...');
  info(`Environment: ${envPath}\n`);

  try {
    // Run all test suites
    await testEnvironmentVariables();
    await testRedisConnection();
    await testPostgreSQLConnection();
    await testGitHubIntegration();
    await testSystemIntegration();

    // Print final summary
    printSummary();

  } catch (error) {
    console.error(chalk.red('\n✗ Fatal error during integration tests:'));
    console.error(chalk.red(error.message));
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runIntegrationTests();
}

export {
  runIntegrationTests,
  testEnvironmentVariables,
  testRedisConnection,
  testPostgreSQLConnection,
  testGitHubIntegration,
  testSystemIntegration
};
