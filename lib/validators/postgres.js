/**
 * Boss Claude PostgreSQL Validator
 * Validates connection URLs, tests connectivity, checks schema existence
 * Handles SSL errors gracefully with Railway-specific optimizations
 */

import pg from 'pg';
const { Pool } = pg;

/**
 * Validates PostgreSQL connection URL format
 * @param {string} url - PostgreSQL connection URL
 * @returns {Object} Validation result with parsed components
 */
export function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    return {
      valid: false,
      error: 'PostgreSQL URL is required and must be a string',
      details: null
    };
  }

  // PostgreSQL URL format: postgresql://[user[:password]@][host][:port][/dbname][?param=value]
  const pgUrlPattern = /^postgres(?:ql)?:\/\/(?:([^:@]+)(?::([^@]+))?@)?([^:\/]+)(?::(\d+))?(?:\/([^?]+))?(?:\?(.+))?$/;
  const match = url.match(pgUrlPattern);

  if (!match) {
    return {
      valid: false,
      error: 'Invalid PostgreSQL URL format',
      details: {
        expected: 'postgresql://user:password@host:port/database',
        received: url.substring(0, 50) + (url.length > 50 ? '...' : '')
      }
    };
  }

  const [, user, password, host, port, database, params] = match;

  // Validate required components
  if (!host) {
    return {
      valid: false,
      error: 'Host is required in PostgreSQL URL',
      details: { host: null }
    };
  }

  // Parse query parameters
  const queryParams = {};
  if (params) {
    params.split('&').forEach(param => {
      const [key, value] = param.split('=');
      queryParams[key] = value;
    });
  }

  return {
    valid: true,
    components: {
      user: user || 'postgres',
      password: password ? '***' : null, // Don't expose password
      host,
      port: port ? parseInt(port, 10) : 5432,
      database: database || 'postgres',
      params: queryParams,
      isRailway: host.includes('railway.app') || host.includes('rlwy.net'),
      sslInUrl: queryParams.ssl === 'true' || queryParams.sslmode === 'require'
    }
  };
}

/**
 * Tests PostgreSQL connection with comprehensive error handling
 * @param {string} url - PostgreSQL connection URL
 * @param {Object} options - Connection options
 * @returns {Promise<Object>} Connection test result
 */
export async function testConnection(url, options = {}) {
  const {
    timeout = 5000,
    ssl = true,
    retryCount = 0,
    maxRetries = 2
  } = options;

  const validation = validateUrl(url);
  if (!validation.valid) {
    return {
      connected: false,
      error: validation.error,
      details: validation.details,
      retried: false
    };
  }

  // SSL configuration with Railway-specific handling
  const sslConfig = ssl ? {
    rejectUnauthorized: false, // Railway requires this
    ca: undefined,
    cert: undefined,
    key: undefined
  } : false;

  // Create a temporary pool for testing
  const pool = new Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: timeout,
    idleTimeoutMillis: timeout,
    ssl: sslConfig
  });

  try {
    const client = await pool.connect();

    try {
      // Test query to verify connection and get server info
      const result = await client.query(`
        SELECT
          version() as version,
          current_database() as database,
          current_user as user,
          inet_server_addr() as server_ip,
          inet_server_port() as server_port,
          pg_postmaster_start_time() as uptime,
          NOW() as current_time
      `);

      const info = result.rows[0];

      // Extract PostgreSQL version number
      const versionMatch = info.version.match(/PostgreSQL (\d+\.\d+)/);
      const majorVersion = versionMatch ? parseFloat(versionMatch[1]) : null;

      client.release();
      await pool.end();

      return {
        connected: true,
        timestamp: info.current_time,
        database: info.database,
        user: info.user,
        version: info.version,
        versionNumber: majorVersion,
        serverIp: info.server_ip,
        serverPort: info.server_port,
        uptime: info.uptime,
        sslEnabled: ssl,
        isRailway: validation.components.isRailway,
        retried: retryCount > 0,
        retryCount
      };

    } catch (queryError) {
      client.release();
      await pool.end();

      return {
        connected: false,
        error: `Query failed: ${queryError.message}`,
        code: queryError.code,
        retried: retryCount > 0,
        retryCount
      };
    }

  } catch (connectionError) {
    await pool.end();

    // Handle SSL-specific errors
    if (connectionError.message.includes('SSL') ||
        connectionError.message.includes('self signed') ||
        connectionError.code === 'EPROTO') {

      if (ssl && retryCount < maxRetries) {
        // Retry without SSL
        return testConnection(url, {
          ...options,
          ssl: false,
          retryCount: retryCount + 1,
          maxRetries
        });
      }

      return {
        connected: false,
        error: 'SSL connection failed',
        details: {
          message: connectionError.message,
          suggestion: 'Try setting ssl: false or ensure SSL certificates are valid',
          isRailway: validation.components.isRailway,
          railwayNote: validation.components.isRailway ?
            'Railway requires rejectUnauthorized: false in SSL config' : null
        },
        retried: retryCount > 0,
        retryCount
      };
    }

    // Handle timeout errors
    if (connectionError.message.includes('timeout') ||
        connectionError.code === 'ETIMEDOUT') {
      return {
        connected: false,
        error: 'Connection timeout',
        details: {
          message: connectionError.message,
          timeout,
          suggestion: 'Check network connectivity or increase timeout value'
        },
        retried: retryCount > 0,
        retryCount
      };
    }

    // Handle authentication errors
    if (connectionError.code === '28P01' ||
        connectionError.message.includes('authentication')) {
      return {
        connected: false,
        error: 'Authentication failed',
        details: {
          message: connectionError.message,
          code: connectionError.code,
          suggestion: 'Verify username and password in connection URL'
        },
        retried: retryCount > 0,
        retryCount
      };
    }

    // Handle connection refused errors
    if (connectionError.code === 'ECONNREFUSED') {
      return {
        connected: false,
        error: 'Connection refused',
        details: {
          message: connectionError.message,
          suggestion: 'Verify host and port are correct and server is running'
        },
        retried: retryCount > 0,
        retryCount
      };
    }

    // Generic connection error
    return {
      connected: false,
      error: connectionError.message,
      code: connectionError.code,
      details: {
        name: connectionError.name,
        suggestion: 'Check connection URL and network access'
      },
      retried: retryCount > 0,
      retryCount
    };
  }
}

/**
 * Checks if boss_claude schema exists and validates its structure
 * @param {string} url - PostgreSQL connection URL
 * @param {Object} options - Connection options
 * @returns {Promise<Object>} Schema check result
 */
export async function checkSchema(url, options = {}) {
  const { ssl = true } = options;

  // First test connection
  const connectionTest = await testConnection(url, options);
  if (!connectionTest.connected) {
    return {
      exists: false,
      error: 'Cannot check schema - connection failed',
      connectionError: connectionTest.error,
      details: connectionTest.details
    };
  }

  const sslConfig = ssl ? { rejectUnauthorized: false } : false;
  const pool = new Pool({
    connectionString: url,
    max: 1,
    ssl: sslConfig
  });

  try {
    const client = await pool.connect();

    try {
      // Check if schema exists
      const schemaQuery = `
        SELECT EXISTS(
          SELECT 1 FROM information_schema.schemata
          WHERE schema_name = 'boss_claude'
        ) as schema_exists
      `;
      const schemaResult = await client.query(schemaQuery);
      const schemaExists = schemaResult.rows[0].schema_exists;

      if (!schemaExists) {
        client.release();
        await pool.end();

        return {
          exists: false,
          message: 'Schema boss_claude does not exist',
          suggestion: 'Run database initialization script to create schema'
        };
      }

      // Get schema details - tables, views, functions
      const detailsQuery = `
        SELECT
          (SELECT COUNT(*) FROM information_schema.tables
           WHERE table_schema = 'boss_claude' AND table_type = 'BASE TABLE') as table_count,
          (SELECT COUNT(*) FROM information_schema.views
           WHERE table_schema = 'boss_claude') as view_count,
          (SELECT COUNT(*) FROM information_schema.routines
           WHERE routine_schema = 'boss_claude') as function_count,
          (SELECT array_agg(table_name ORDER BY table_name)
           FROM information_schema.tables
           WHERE table_schema = 'boss_claude' AND table_type = 'BASE TABLE') as tables,
          (SELECT array_agg(routine_name ORDER BY routine_name)
           FROM information_schema.routines
           WHERE routine_schema = 'boss_claude') as functions
      `;
      const details = await client.query(detailsQuery);
      const schemaInfo = details.rows[0];

      // Convert PostgreSQL arrays (returned as strings) to JavaScript arrays
      // PostgreSQL format: {item1,item2,item3}
      const parseArrayString = (str) => {
        if (!str) return [];
        if (Array.isArray(str)) return str;
        if (typeof str === 'string' && str.startsWith('{') && str.endsWith('}')) {
          return str.slice(1, -1).split(',').filter(Boolean);
        }
        return [];
      };

      const tables = parseArrayString(schemaInfo.tables);
      const functions = parseArrayString(schemaInfo.functions);

      // Expected tables for Boss Claude
      const expectedTables = ['sessions', 'achievements', 'memory_snapshots'];
      const missingTables = expectedTables.filter(
        table => !tables.includes(table)
      );

      client.release();
      await pool.end();

      return {
        exists: true,
        complete: missingTables.length === 0,
        tables,
        tableCount: parseInt(schemaInfo.table_count, 10),
        viewCount: parseInt(schemaInfo.view_count, 10),
        functionCount: parseInt(schemaInfo.function_count, 10),
        functions,
        expectedTables,
        missingTables,
        warning: missingTables.length > 0 ?
          `Missing tables: ${missingTables.join(', ')}` : null
      };

    } catch (queryError) {
      client.release();
      await pool.end();

      return {
        exists: false,
        error: `Schema query failed: ${queryError.message}`,
        code: queryError.code
      };
    }

  } catch (error) {
    await pool.end();

    return {
      exists: false,
      error: `Schema check failed: ${error.message}`,
      code: error.code
    };
  }
}

/**
 * Comprehensive validation report
 * @param {string} url - PostgreSQL connection URL
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Complete validation report
 */
export async function validate(url, options = {}) {
  const startTime = Date.now();

  // 1. URL validation
  const urlValidation = validateUrl(url);
  if (!urlValidation.valid) {
    return {
      valid: false,
      url: urlValidation,
      connection: null,
      schema: null,
      duration: Date.now() - startTime
    };
  }

  // 2. Connection test
  const connectionTest = await testConnection(url, options);
  if (!connectionTest.connected) {
    return {
      valid: false,
      url: urlValidation,
      connection: connectionTest,
      schema: null,
      duration: Date.now() - startTime
    };
  }

  // 3. Schema check
  const schemaCheck = await checkSchema(url, options);

  const duration = Date.now() - startTime;

  return {
    valid: connectionTest.connected && schemaCheck.exists,
    url: urlValidation,
    connection: connectionTest,
    schema: schemaCheck,
    duration,
    summary: {
      connectionUrl: urlValidation.components.isRailway ? 'Railway' : 'Custom',
      database: connectionTest.database,
      version: connectionTest.versionNumber,
      schemaExists: schemaCheck.exists,
      schemaComplete: schemaCheck.complete || false,
      sslEnabled: connectionTest.sslEnabled,
      testDuration: `${duration}ms`
    }
  };
}

/**
 * Pretty print validation results to console
 * @param {Object} result - Validation result from validate()
 */
export function printReport(result) {
  console.log('\n=== PostgreSQL Validation Report ===\n');

  // URL Validation
  console.log('URL Validation:');
  if (result.url.valid) {
    console.log('  ✓ Valid PostgreSQL URL');
    const c = result.url.components;
    console.log(`  Host: ${c.host}:${c.port}`);
    console.log(`  Database: ${c.database}`);
    console.log(`  User: ${c.user}`);
    if (c.isRailway) console.log('  Platform: Railway');
  } else {
    console.log(`  ✗ ${result.url.error}`);
    return;
  }

  // Connection Test
  console.log('\nConnection Test:');
  if (result.connection.connected) {
    console.log('  ✓ Connected successfully');
    console.log(`  Version: PostgreSQL ${result.connection.versionNumber}`);
    console.log(`  Uptime: ${result.connection.uptime}`);
    console.log(`  SSL: ${result.connection.sslEnabled ? 'Enabled' : 'Disabled'}`);
    if (result.connection.retried) {
      console.log(`  Note: Connection succeeded after ${result.connection.retryCount} retries`);
    }
  } else {
    console.log(`  ✗ ${result.connection.error}`);
    if (result.connection.details) {
      console.log(`  Details: ${JSON.stringify(result.connection.details, null, 2)}`);
    }
    return;
  }

  // Schema Check
  console.log('\nSchema Check:');
  if (result.schema.exists) {
    console.log('  ✓ Schema boss_claude exists');
    const tables = result.schema.tables || [];
    const tablesList = Array.isArray(tables) && tables.length > 0 ? tables.join(', ') : 'none';
    console.log(`  Tables: ${result.schema.tableCount} (${tablesList})`);
    console.log(`  Functions: ${result.schema.functionCount}`);

    if (result.schema.complete) {
      console.log('  ✓ All expected tables present');
    } else {
      const missing = result.schema.missingTables || [];
      if (Array.isArray(missing) && missing.length > 0) {
        console.log(`  ⚠ Missing tables: ${missing.join(', ')}`);
      }
    }
  } else {
    console.log(`  ✗ ${result.schema.error || result.schema.message}`);
    if (result.schema.suggestion) {
      console.log(`  Suggestion: ${result.schema.suggestion}`);
    }
  }

  // Summary
  console.log('\nSummary:');
  console.log(`  Overall Status: ${result.valid ? '✓ VALID' : '✗ INVALID'}`);
  console.log(`  Test Duration: ${result.duration}ms`);
  console.log();
}

export default {
  validateUrl,
  testConnection,
  checkSchema,
  validate,
  printReport
};
