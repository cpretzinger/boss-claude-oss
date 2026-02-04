/**
 * Boss Claude PostgreSQL Initialization
 *
 * Sets up all required PostgreSQL tables and functions according to schema.sql
 * Creates boss_claude schema, tables, indexes, and helper functions.
 *
 * Schema Structure:
 * - boss_claude.sessions - Session tracking and analytics
 * - boss_claude.achievements - User achievement records
 * - boss_claude.memory_snapshots - Point-in-time state snapshots
 * - boss_claude.stats_rollups - Aggregated statistics
 *
 * This module runs automatically during setup wizard and can be
 * re-run safely to repair/update the PostgreSQL schema.
 */

import pg from 'pg';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Execute SQL from schema.sql file
 *
 * @param {pg.Pool} pool - PostgreSQL connection pool
 * @param {string} sqlContent - SQL content to execute
 * @returns {Promise<Array>} Array of execution results
 */
async function executeSchemaSql(pool, sqlContent) {
  const results = [];

  // Split SQL into individual statements (handle multi-line comments and statements)
  const statements = sqlContent
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

  for (const statement of statements) {
    try {
      const result = await pool.query(statement);
      results.push({ success: true, statement: statement.substring(0, 100) + '...' });
    } catch (error) {
      // Some errors are acceptable (e.g., already exists)
      if (error.code === '42P07' || // relation already exists
          error.code === '42710' || // object already exists
          error.code === '42P06') { // schema already exists
        results.push({ success: true, existed: true, statement: statement.substring(0, 100) + '...' });
      } else {
        results.push({ success: false, error: error.message, statement: statement.substring(0, 100) + '...' });
        // Continue with other statements even if one fails
      }
    }
  }

  return results;
}

/**
 * Initialize PostgreSQL with all required schema objects
 *
 * @param {string} connectionString - PostgreSQL connection string
 * @param {boolean} force - Force re-initialization even if schema exists
 * @returns {Promise<Object>} Initialization results
 */
export async function initializePostgres(connectionString, force = false) {
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  const results = {
    extensions: { created: false, existed: false, count: 0 },
    schema: { created: false, existed: false },
    tables: { created: [], existed: [], failed: [] },
    indexes: { created: [], existed: [], failed: [] },
    functions: { created: [], existed: [], failed: [] },
    triggers: { created: [], existed: [], failed: [] },
    healthCheck: { passed: false }
  };

  try {
    // Test connection
    await pool.query('SELECT NOW()');

    // 1. Check if schema exists
    const schemaCheck = await pool.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'boss_claude'`
    );

    if (schemaCheck.rows.length > 0 && !force) {
      results.schema.existed = true;
    }

    // 2. Enable extensions
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      await pool.query('CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"');
      results.extensions.count = 2;
      results.extensions.created = true;
    } catch (error) {
      // Extensions might already exist or require superuser
      results.extensions.existed = true;
    }

    // 3. Create schema
    try {
      if (force) {
        // In force mode, we don't drop the schema, just ensure it exists
        await pool.query('CREATE SCHEMA IF NOT EXISTS boss_claude');
        results.schema.created = true;
      } else {
        await pool.query('CREATE SCHEMA IF NOT EXISTS boss_claude');
        results.schema.created = !results.schema.existed;
      }
    } catch (error) {
      if (error.code === '42P06') { // schema already exists
        results.schema.existed = true;
      } else {
        throw error;
      }
    }

    // 4. Create tables
    const tables = [
      {
        name: 'sessions',
        sql: `
          CREATE TABLE IF NOT EXISTS boss_claude.sessions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id VARCHAR(255) NOT NULL,
            project VARCHAR(255),
            start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            end_time TIMESTAMPTZ,
            duration_seconds INTEGER GENERATED ALWAYS AS (
              EXTRACT(EPOCH FROM (end_time - start_time))::INTEGER
            ) STORED,
            summary TEXT,
            xp_earned INTEGER DEFAULT 0,
            tokens_saved INTEGER DEFAULT 0,
            level_at_start INTEGER DEFAULT 0,
            level_at_end INTEGER,
            tasks_completed INTEGER DEFAULT 0,
            perfect_executions INTEGER DEFAULT 0,
            efficiency_multiplier NUMERIC(4,2) DEFAULT 1.0,
            context_data JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `
      },
      {
        name: 'achievements',
        sql: `
          CREATE TABLE IF NOT EXISTS boss_claude.achievements (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id VARCHAR(255) NOT NULL,
            achievement_type VARCHAR(100) NOT NULL,
            achievement_name VARCHAR(255) NOT NULL,
            description TEXT,
            xp_reward INTEGER DEFAULT 0,
            metadata JSONB,
            earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `
      },
      {
        name: 'memory_snapshots',
        sql: `
          CREATE TABLE IF NOT EXISTS boss_claude.memory_snapshots (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id VARCHAR(255) NOT NULL,
            session_id UUID REFERENCES boss_claude.sessions(id) ON DELETE CASCADE,
            snapshot_type VARCHAR(50) NOT NULL,
            snapshot_data JSONB NOT NULL,
            level INTEGER,
            token_bank INTEGER,
            total_xp INTEGER,
            efficiency NUMERIC(4,2),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `
      },
      {
        name: 'stats_rollups',
        sql: `
          CREATE TABLE IF NOT EXISTS boss_claude.stats_rollups (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id VARCHAR(255) NOT NULL,
            rollup_period VARCHAR(20) NOT NULL,
            period_start TIMESTAMPTZ NOT NULL,
            period_end TIMESTAMPTZ NOT NULL,
            total_sessions INTEGER DEFAULT 0,
            total_xp_earned INTEGER DEFAULT 0,
            total_tokens_saved INTEGER DEFAULT 0,
            total_tasks_completed INTEGER DEFAULT 0,
            avg_efficiency NUMERIC(4,2),
            top_projects TEXT[],
            achievements_earned INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(user_id, rollup_period, period_start)
          )
        `
      }
    ];

    for (const table of tables) {
      try {
        await pool.query(table.sql);

        // Check if table existed before
        const tableExists = await pool.query(
          `SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'boss_claude' AND table_name = $1`,
          [table.name]
        );

        if (tableExists.rows.length > 0) {
          results.tables.created.push(table.name);
        }
      } catch (error) {
        if (error.code === '42P07') { // table already exists
          results.tables.existed.push(table.name);
        } else {
          results.tables.failed.push({ name: table.name, error: error.message });
        }
      }
    }

    // 5. Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_sessions_user_start ON boss_claude.sessions(user_id, start_time DESC)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_project ON boss_claude.sessions(project) WHERE project IS NOT NULL',
      'CREATE INDEX IF NOT EXISTS idx_sessions_end_time ON boss_claude.sessions(end_time) WHERE end_time IS NOT NULL',
      'CREATE INDEX IF NOT EXISTS idx_sessions_xp ON boss_claude.sessions(xp_earned DESC) WHERE xp_earned > 0',
      'CREATE INDEX IF NOT EXISTS idx_achievements_user_earned ON boss_claude.achievements(user_id, earned_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_achievements_type ON boss_claude.achievements(achievement_type)',
      'CREATE INDEX IF NOT EXISTS idx_achievements_earned_at ON boss_claude.achievements(earned_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_snapshots_user_created ON boss_claude.memory_snapshots(user_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_snapshots_session ON boss_claude.memory_snapshots(session_id)',
      'CREATE INDEX IF NOT EXISTS idx_snapshots_type ON boss_claude.memory_snapshots(snapshot_type)',
      'CREATE INDEX IF NOT EXISTS idx_rollups_user_period ON boss_claude.stats_rollups(user_id, rollup_period, period_start DESC)'
    ];

    for (const indexSql of indexes) {
      try {
        await pool.query(indexSql);
        const indexName = indexSql.match(/idx_\w+/)?.[0];
        if (indexName) {
          results.indexes.created.push(indexName);
        }
      } catch (error) {
        if (error.code === '42P07') { // index already exists
          const indexName = indexSql.match(/idx_\w+/)?.[0];
          if (indexName) {
            results.indexes.existed.push(indexName);
          }
        } else {
          results.indexes.failed.push(error.message);
        }
      }
    }

    // 6. Create trigger function
    try {
      await pool.query(`
        CREATE OR REPLACE FUNCTION boss_claude.update_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
      results.functions.created.push('update_updated_at');
    } catch (error) {
      results.functions.failed.push({ name: 'update_updated_at', error: error.message });
    }

    // 7. Create helper functions
    const helperFunctions = [
      {
        name: 'fn_get_current_session',
        sql: `
          CREATE OR REPLACE FUNCTION boss_claude.fn_get_current_session(p_user_id VARCHAR)
          RETURNS TABLE(
            session_id UUID,
            start_time TIMESTAMPTZ,
            project VARCHAR,
            xp_earned INTEGER,
            level_at_start INTEGER
          ) AS $$
          BEGIN
            RETURN QUERY
            SELECT
              id,
              start_time,
              project,
              xp_earned,
              level_at_start
            FROM boss_claude.sessions
            WHERE user_id = p_user_id
              AND end_time IS NULL
            ORDER BY start_time DESC
            LIMIT 1;
          END;
          $$ LANGUAGE plpgsql
        `
      },
      {
        name: 'fn_get_user_stats',
        sql: `
          CREATE OR REPLACE FUNCTION boss_claude.fn_get_user_stats(p_user_id VARCHAR)
          RETURNS TABLE(
            total_sessions BIGINT,
            total_xp BIGINT,
            total_tokens_saved BIGINT,
            total_tasks BIGINT,
            avg_efficiency NUMERIC,
            achievements_count BIGINT,
            last_session_end TIMESTAMPTZ
          ) AS $$
          BEGIN
            RETURN QUERY
            SELECT
              COUNT(DISTINCT s.id)::BIGINT,
              COALESCE(SUM(s.xp_earned), 0)::BIGINT,
              COALESCE(SUM(s.tokens_saved), 0)::BIGINT,
              COALESCE(SUM(s.tasks_completed), 0)::BIGINT,
              ROUND(AVG(s.efficiency_multiplier), 2),
              (SELECT COUNT(*) FROM boss_claude.achievements WHERE user_id = p_user_id)::BIGINT,
              MAX(s.end_time)
            FROM boss_claude.sessions s
            WHERE s.user_id = p_user_id;
          END;
          $$ LANGUAGE plpgsql
        `
      }
    ];

    for (const func of helperFunctions) {
      try {
        await pool.query(func.sql);
        results.functions.created.push(func.name);
      } catch (error) {
        results.functions.failed.push({ name: func.name, error: error.message });
      }
    }

    // 8. Create trigger
    try {
      // Drop trigger if exists (for force mode)
      if (force) {
        await pool.query('DROP TRIGGER IF EXISTS sessions_updated_at ON boss_claude.sessions');
      }

      await pool.query(`
        CREATE TRIGGER sessions_updated_at
          BEFORE UPDATE ON boss_claude.sessions
          FOR EACH ROW
          EXECUTE FUNCTION boss_claude.update_updated_at()
      `);
      results.triggers.created.push('sessions_updated_at');
    } catch (error) {
      if (error.code === '42710') { // trigger already exists
        results.triggers.existed.push('sessions_updated_at');
      } else {
        results.triggers.failed.push({ name: 'sessions_updated_at', error: error.message });
      }
    }

    // 9. Grant permissions
    try {
      await pool.query('GRANT USAGE ON SCHEMA boss_claude TO postgres');
      await pool.query('GRANT ALL ON ALL TABLES IN SCHEMA boss_claude TO postgres');
      await pool.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA boss_claude TO postgres');
      await pool.query('GRANT ALL ON ALL FUNCTIONS IN SCHEMA boss_claude TO postgres');
    } catch (error) {
      // Permission grants might fail in some environments, but that's okay
    }

    // 10. Add comments
    try {
      await pool.query(`COMMENT ON SCHEMA boss_claude IS 'Boss Claude AI assistant tracking and analytics system'`);
      await pool.query(`COMMENT ON TABLE boss_claude.sessions IS 'Individual Boss Claude conversation sessions'`);
      await pool.query(`COMMENT ON TABLE boss_claude.achievements IS 'User achievements and milestones'`);
      await pool.query(`COMMENT ON TABLE boss_claude.memory_snapshots IS 'Point-in-time state snapshots'`);
      await pool.query(`COMMENT ON TABLE boss_claude.stats_rollups IS 'Aggregated statistics for analytics'`);
    } catch (error) {
      // Comments are nice-to-have
    }

    // 11. Health check
    const healthCheckResult = await performHealthCheck(pool);
    results.healthCheck = healthCheckResult;

    return results;

  } catch (error) {
    throw new Error(`PostgreSQL initialization failed: ${error.message}`);
  } finally {
    await pool.end();
  }
}

/**
 * Perform comprehensive health check on PostgreSQL schema
 *
 * @param {pg.Pool} pool - PostgreSQL connection pool
 * @returns {Promise<Object>} Health check results
 */
async function performHealthCheck(pool) {
  const checks = {
    passed: true,
    details: {}
  };

  try {
    // Check 1: Schema exists
    const schemaResult = await pool.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'boss_claude'`
    );

    if (schemaResult.rows.length === 0) {
      checks.passed = false;
      checks.details.schema = 'Schema boss_claude does not exist';
    } else {
      checks.details.schema = 'OK';
    }

    // Check 2: All tables exist
    const requiredTables = ['sessions', 'achievements', 'memory_snapshots', 'stats_rollups'];
    const tableResult = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'boss_claude' AND table_name = ANY($1)`,
      [requiredTables]
    );

    const foundTables = tableResult.rows.map(r => r.table_name);
    const missingTables = requiredTables.filter(t => !foundTables.includes(t));

    if (missingTables.length > 0) {
      checks.passed = false;
      checks.details.tables = `Missing tables: ${missingTables.join(', ')}`;
    } else {
      checks.details.tables = 'OK';
    }

    // Check 3: Functions exist
    const functionResult = await pool.query(
      `SELECT routine_name FROM information_schema.routines
       WHERE routine_schema = 'boss_claude'
       AND routine_name IN ('fn_get_current_session', 'fn_get_user_stats', 'update_updated_at')`
    );

    if (functionResult.rows.length < 3) {
      checks.passed = false;
      checks.details.functions = `Found ${functionResult.rows.length}/3 required functions`;
    } else {
      checks.details.functions = 'OK';
    }

    // Check 4: Test write operations
    const testUserId = `health_check_${Date.now()}`;

    try {
      // Insert test session
      const insertResult = await pool.query(
        `INSERT INTO boss_claude.sessions (user_id, project, level_at_start)
         VALUES ($1, $2, $3) RETURNING id`,
        [testUserId, 'health_check', 0]
      );

      const sessionId = insertResult.rows[0].id;

      // Read it back
      const readResult = await pool.query(
        `SELECT * FROM boss_claude.sessions WHERE id = $1`,
        [sessionId]
      );

      // Delete it
      await pool.query(
        `DELETE FROM boss_claude.sessions WHERE id = $1`,
        [sessionId]
      );

      if (readResult.rows.length === 1 && readResult.rows[0].user_id === testUserId) {
        checks.details.readWrite = 'OK';
      } else {
        checks.passed = false;
        checks.details.readWrite = 'Read/write test failed';
      }
    } catch (error) {
      checks.passed = false;
      checks.details.readWrite = `Read/write test failed: ${error.message}`;
    }

    // Check 5: Test helper function
    try {
      const statsResult = await pool.query(
        `SELECT * FROM boss_claude.fn_get_user_stats($1)`,
        ['test_user']
      );

      if (statsResult.rows.length === 1) {
        checks.details.helperFunctions = 'OK';
      } else {
        checks.passed = false;
        checks.details.helperFunctions = 'Helper function test failed';
      }
    } catch (error) {
      checks.passed = false;
      checks.details.helperFunctions = `Helper function test failed: ${error.message}`;
    }

  } catch (error) {
    checks.passed = false;
    checks.details.error = error.message;
  }

  return checks;
}

/**
 * Get current PostgreSQL statistics
 *
 * @param {string} connectionString - PostgreSQL connection string
 * @returns {Promise<Object>} PostgreSQL statistics
 */
export async function getPostgresStats(connectionString) {
  const pool = new Pool({ connectionString });

  try {
    const stats = {
      totalSessions: 0,
      activeSessions: 0,
      totalUsers: 0,
      totalAchievements: 0,
      totalSnapshots: 0,
      schemaSize: null,
      oldestSession: null,
      newestSession: null
    };

    // Count sessions
    const sessionCount = await pool.query(
      `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE end_time IS NULL) as active
       FROM boss_claude.sessions`
    );
    stats.totalSessions = parseInt(sessionCount.rows[0].total);
    stats.activeSessions = parseInt(sessionCount.rows[0].active);

    // Count unique users
    const userCount = await pool.query(
      `SELECT COUNT(DISTINCT user_id) as total FROM boss_claude.sessions`
    );
    stats.totalUsers = parseInt(userCount.rows[0].total);

    // Count achievements
    const achievementCount = await pool.query(
      `SELECT COUNT(*) as total FROM boss_claude.achievements`
    );
    stats.totalAchievements = parseInt(achievementCount.rows[0].total);

    // Count snapshots
    const snapshotCount = await pool.query(
      `SELECT COUNT(*) as total FROM boss_claude.memory_snapshots`
    );
    stats.totalSnapshots = parseInt(snapshotCount.rows[0].total);

    // Get schema size
    const sizeResult = await pool.query(
      `SELECT pg_size_pretty(pg_total_relation_size('boss_claude.sessions') +
                              pg_total_relation_size('boss_claude.achievements') +
                              pg_total_relation_size('boss_claude.memory_snapshots') +
                              pg_total_relation_size('boss_claude.stats_rollups')) as size`
    );
    stats.schemaSize = sizeResult.rows[0].size;

    // Get session date range
    const sessionRange = await pool.query(
      `SELECT MIN(start_time) as oldest, MAX(start_time) as newest
       FROM boss_claude.sessions`
    );
    stats.oldestSession = sessionRange.rows[0].oldest;
    stats.newestSession = sessionRange.rows[0].newest;

    return stats;

  } catch (error) {
    throw new Error(`Failed to get PostgreSQL stats: ${error.message}`);
  } finally {
    await pool.end();
  }
}

/**
 * Verify PostgreSQL connection and schema
 *
 * @param {string} connectionString - PostgreSQL connection string
 * @returns {Promise<Object>} Verification results
 */
export async function verifyPostgres(connectionString) {
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000
  });

  try {
    // Test connection
    const versionResult = await pool.query('SELECT version()');
    const version = versionResult.rows[0].version;

    // Check schema
    const schemaResult = await pool.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'boss_claude'`
    );

    // Check tables
    const tableResult = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'boss_claude'`
    );

    // Perform health check
    const healthCheck = await performHealthCheck(pool);

    return {
      connected: true,
      version,
      schemaExists: schemaResult.rows.length > 0,
      tables: tableResult.rows.map(r => r.table_name),
      healthCheck
    };

  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  } finally {
    await pool.end();
  }
}

/**
 * Reset PostgreSQL schema to initial state (WARNING: Destructive!)
 *
 * @param {string} connectionString - PostgreSQL connection string
 * @returns {Promise<void>}
 */
export async function resetPostgres(connectionString) {
  const pool = new Pool({ connectionString });

  try {
    // Drop schema cascade (removes all objects)
    await pool.query('DROP SCHEMA IF EXISTS boss_claude CASCADE');

    // Re-initialize
    await pool.end();
    return await initializePostgres(connectionString, true);

  } catch (error) {
    throw new Error(`Failed to reset PostgreSQL: ${error.message}`);
  } finally {
    if (pool.totalCount > 0) {
      await pool.end();
    }
  }
}

/**
 * Print formatted initialization results
 *
 * @param {Object} results - Results from initializePostgres
 */
export function printInitResults(results) {
  console.log(chalk.cyan('\n📦 PostgreSQL Initialization Results\n'));

  // Schema
  if (results.schema.created) {
    console.log(chalk.green('✓ boss_claude schema') + chalk.dim(' - Created'));
  } else if (results.schema.existed) {
    console.log(chalk.yellow('○ boss_claude schema') + chalk.dim(' - Already exists'));
  }

  // Extensions
  if (results.extensions.created) {
    console.log(chalk.green('✓ Extensions') + chalk.dim(` - Enabled ${results.extensions.count} extensions`));
  } else if (results.extensions.existed) {
    console.log(chalk.yellow('○ Extensions') + chalk.dim(' - Already enabled'));
  }

  // Tables
  console.log(chalk.cyan('\nTables:'));
  results.tables.created.forEach(table => {
    console.log(chalk.green(`  ✓ ${table}`) + chalk.dim(' - Created'));
  });
  results.tables.existed.forEach(table => {
    console.log(chalk.yellow(`  ○ ${table}`) + chalk.dim(' - Already exists'));
  });
  results.tables.failed.forEach(failure => {
    console.log(chalk.red(`  ✗ ${failure.name}`) + chalk.dim(` - ${failure.error}`));
  });

  // Indexes
  if (results.indexes.created.length > 0 || results.indexes.existed.length > 0) {
    console.log(chalk.cyan(`\nIndexes: ${results.indexes.created.length + results.indexes.existed.length} total`));
  }

  // Functions
  console.log(chalk.cyan('\nFunctions:'));
  results.functions.created.forEach(func => {
    console.log(chalk.green(`  ✓ ${func}`) + chalk.dim(' - Created'));
  });
  results.functions.failed.forEach(failure => {
    console.log(chalk.red(`  ✗ ${failure.name}`) + chalk.dim(` - ${failure.error}`));
  });

  // Triggers
  if (results.triggers.created.length > 0) {
    console.log(chalk.cyan('\nTriggers:'));
    results.triggers.created.forEach(trigger => {
      console.log(chalk.green(`  ✓ ${trigger}`) + chalk.dim(' - Created'));
    });
  }
  if (results.triggers.existed.length > 0) {
    results.triggers.existed.forEach(trigger => {
      console.log(chalk.yellow(`  ○ ${trigger}`) + chalk.dim(' - Already exists'));
    });
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
 * Called automatically after PostgreSQL connection is validated
 *
 * @param {string} connectionString - PostgreSQL connection string
 * @returns {Promise<boolean>} Success status
 */
export async function setupPostgresForWizard(connectionString) {
  try {
    console.log(chalk.cyan('\n🔧 Initializing PostgreSQL schema...\n'));

    const results = await initializePostgres(connectionString, false);
    printInitResults(results);

    if (!results.healthCheck.passed) {
      console.log(chalk.yellow('\n⚠️  Warning: Health check failed. Some features may not work correctly.'));
      console.log(chalk.dim('You can try running: boss-claude postgres:reset\n'));
      return false;
    }

    console.log(chalk.green('✓ PostgreSQL initialization complete!\n'));
    return true;

  } catch (error) {
    console.log(chalk.red(`\n✗ PostgreSQL initialization failed: ${error.message}\n`));
    return false;
  }
}
