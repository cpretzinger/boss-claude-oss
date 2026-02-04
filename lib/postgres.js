/**
 * Boss Claude PostgreSQL Integration
 * Railway Instance: your-postgres-host.example.com:5432
 * Database: railway
 * Schema: boss_claude
 */

import pg from 'pg';
const { Pool } = pg;

// Warn if SSL verification is explicitly disabled
if (process.env.BOSS_CLAUDE_DISABLE_SSL === 'true') {
  console.warn('⚠️  PostgreSQL SSL verification disabled - not recommended for production');
}

// Connection pool for optimal performance
// BOSS_CLAUDE_PG_URL must be set in environment variables
const pool = new Pool({
  connectionString: process.env.BOSS_CLAUDE_PG_URL,
  max: 10,                    // Maximum connections
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 2000,
  // SSL configuration - environment-aware for security
  ssl: process.env.NODE_ENV === 'development' || process.env.BOSS_CLAUDE_DISABLE_SSL === 'true'
    ? { rejectUnauthorized: false }
    : { rejectUnauthorized: true }
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

/**
 * Session Management
 */
export const sessions = {
  /**
   * Start a new Boss Claude session
   */
  async start(userId, project, levelAtStart, contextData = {}) {
    const query = `
      INSERT INTO boss_claude.sessions (
        user_id, project, level_at_start, context_data
      ) VALUES ($1, $2, $3, $4)
      RETURNING id, user_id, project, start_time, level_at_start
    `;

    const result = await pool.query(query, [
      userId,
      project,
      levelAtStart,
      JSON.stringify(contextData)
    ]);

    return result.rows[0];
  },

  /**
   * Get current active session for user
   */
  async getCurrent(userId) {
    const query = `
      SELECT * FROM boss_claude.fn_get_current_session($1)
    `;
    const result = await pool.query(query, [userId]);
    return result.rows[0] || null;
  },

  /**
   * Update session progress
   */
  async updateProgress(sessionId, updates) {
    const {
      xpEarned = 0,
      tokensSaved = 0,
      tasksCompleted = 0,
      perfectExecutions = 0,
      efficiency = null,
      contextData = null
    } = updates;

    let query = `
      UPDATE boss_claude.sessions
      SET
        xp_earned = xp_earned + $2,
        tokens_saved = tokens_saved + $3,
        tasks_completed = tasks_completed + $4,
        perfect_executions = perfect_executions + $5
    `;

    const params = [sessionId, xpEarned, tokensSaved, tasksCompleted, perfectExecutions];
    let paramCount = 5;

    if (efficiency !== null) {
      paramCount++;
      query += `, efficiency_multiplier = $${paramCount}`;
      params.push(efficiency);
    }

    if (contextData !== null) {
      paramCount++;
      query += `, context_data = $${paramCount}`;
      params.push(JSON.stringify(contextData));
    }

    query += `
      WHERE id = $1
      RETURNING id, xp_earned, tokens_saved, tasks_completed, perfect_executions, efficiency_multiplier
    `;

    const result = await pool.query(query, params);
    return result.rows[0];
  },

  /**
   * End a session
   */
  async end(sessionId, levelAtEnd, summary) {
    const query = `
      UPDATE boss_claude.sessions
      SET
        end_time = NOW(),
        level_at_end = $2,
        summary = $3
      WHERE id = $1
      RETURNING id, start_time, end_time, duration_seconds, xp_earned, tokens_saved
    `;

    const result = await pool.query(query, [sessionId, levelAtEnd, summary]);
    return result.rows[0];
  },

  /**
   * Get recent sessions
   */
  async getRecent(userId, limit = 10) {
    const query = `
      SELECT
        id,
        project,
        start_time,
        end_time,
        duration_seconds,
        xp_earned,
        tokens_saved,
        tasks_completed,
        efficiency_multiplier,
        summary
      FROM boss_claude.sessions
      WHERE user_id = $1
      ORDER BY start_time DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [userId, limit]);
    return result.rows;
  }
};

/**
 * Achievement Management
 */
export const achievements = {
  /**
   * Award an achievement
   */
  async award(userId, type, name, description, xpReward, metadata = {}) {
    const query = `
      INSERT INTO boss_claude.achievements (
        user_id, achievement_type, achievement_name, description, xp_reward, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, achievement_name, xp_reward, earned_at
    `;

    const result = await pool.query(query, [
      userId,
      type,
      name,
      description,
      xpReward,
      JSON.stringify(metadata)
    ]);

    return result.rows[0];
  },

  /**
   * Get user achievements
   */
  async getAll(userId, limit = 50) {
    const query = `
      SELECT
        id,
        achievement_type,
        achievement_name,
        description,
        xp_reward,
        metadata,
        earned_at
      FROM boss_claude.achievements
      WHERE user_id = $1
      ORDER BY earned_at DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [userId, limit]);
    return result.rows;
  },

  /**
   * Check if user has specific achievement
   */
  async has(userId, achievementType) {
    const query = `
      SELECT EXISTS(
        SELECT 1 FROM boss_claude.achievements
        WHERE user_id = $1 AND achievement_type = $2
      ) as has_achievement
    `;

    const result = await pool.query(query, [userId, achievementType]);
    return result.rows[0].has_achievement;
  }
};

/**
 * Memory Snapshot Management
 */
export const snapshots = {
  /**
   * Create a memory snapshot
   */
  async create(userId, sessionId, type, data) {
    const { level, tokenBank, totalXp, efficiency, snapshotData } = data;

    const query = `
      INSERT INTO boss_claude.memory_snapshots (
        user_id, session_id, snapshot_type, snapshot_data,
        level, token_bank, total_xp, efficiency
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, snapshot_type, created_at
    `;

    const result = await pool.query(query, [
      userId,
      sessionId,
      type,
      JSON.stringify(snapshotData),
      level,
      tokenBank,
      totalXp,
      efficiency
    ]);

    return result.rows[0];
  },

  /**
   * Get latest snapshot
   */
  async getLatest(userId) {
    const query = `
      SELECT
        id,
        snapshot_type,
        snapshot_data,
        level,
        token_bank,
        total_xp,
        efficiency,
        created_at
      FROM boss_claude.memory_snapshots
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await pool.query(query, [userId]);
    return result.rows[0] || null;
  }
};

/**
 * Stats and Analytics
 */
export const stats = {
  /**
   * Get user statistics summary
   */
  async getSummary(userId) {
    const query = `SELECT * FROM boss_claude.fn_get_user_stats($1)`;
    const result = await pool.query(query, [userId]);
    return result.rows[0];
  },

  /**
   * Get session activity over time
   */
  async getActivity(userId, days = 30) {
    const query = `
      SELECT
        DATE(start_time) as date,
        COUNT(*) as sessions,
        SUM(xp_earned) as total_xp,
        SUM(tokens_saved) as total_tokens,
        ROUND(AVG(efficiency_multiplier), 2) as avg_efficiency
      FROM boss_claude.sessions
      WHERE user_id = $1
        AND start_time >= NOW() - INTERVAL '1 day' * $2
      GROUP BY DATE(start_time)
      ORDER BY date DESC
    `;

    const result = await pool.query(query, [userId, days]);
    return result.rows;
  },

  /**
   * Get top performing sessions
   */
  async getTopSessions(userId, limit = 5) {
    const query = `
      SELECT
        project,
        start_time,
        xp_earned,
        tokens_saved,
        efficiency_multiplier,
        tasks_completed,
        summary
      FROM boss_claude.sessions
      WHERE user_id = $1
        AND end_time IS NOT NULL
      ORDER BY xp_earned DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [userId, limit]);
    return result.rows;
  }
};

/**
 * Utility functions
 */

// Track if pool has been closed to make close() idempotent
let poolClosed = false;

export const utils = {
  /**
   * Test database connection
   */
  async testConnection() {
    try {
      const result = await pool.query('SELECT NOW() as current_time, version()');
      return {
        connected: true,
        timestamp: result.rows[0].current_time,
        version: result.rows[0].version
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  },

  /**
   * Get database stats
   */
  async getDatabaseStats() {
    const query = `
      SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
        (SELECT COUNT(*) FROM boss_claude.sessions WHERE tablename = 'sessions') as sessions_count,
        (SELECT COUNT(*) FROM boss_claude.achievements WHERE tablename = 'achievements') as achievements_count,
        (SELECT COUNT(*) FROM boss_claude.memory_snapshots WHERE tablename = 'memory_snapshots') as snapshots_count
      FROM pg_tables
      WHERE schemaname = 'boss_claude'
      ORDER BY tablename
    `;

    const result = await pool.query(query);
    return result.rows;
  },

  /**
   * Close connection pool (for graceful shutdown)
   * Idempotent - safe to call multiple times
   */
  async close() {
    if (!poolClosed) {
      poolClosed = true;
      try {
        await pool.end();
      } catch (err) {
        // Ignore errors if pool is already closed
        if (!err.message.includes('pool') && !err.message.includes('ended')) {
          throw err;
        }
      }
    }
  }
};

export default {
  sessions,
  achievements,
  snapshots,
  stats,
  utils,
  pool
};
