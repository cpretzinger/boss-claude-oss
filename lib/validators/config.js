/**
 * Boss Claude Configuration Validator
 * Validates entire ~/.boss-claude/.env file for completeness and correctness
 *
 * Checks:
 * - All required environment variables are present
 * - URLs are properly formatted
 * - Redis URLs are valid
 * - PostgreSQL URLs are valid
 * - GitHub tokens are present (format check only, no API validation)
 * - OpenAI API keys are present and formatted correctly
 * - No obviously broken values (empty strings, placeholder text)
 */

import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { validateUrl as validatePostgresUrl } from './postgres.js';

/**
 * Required environment variables for Boss Claude
 */
const REQUIRED_VARS = [
  'REDIS_URL',
  'POSTGRES_URL',
  'GITHUB_TOKEN',
  'OPENAI_API_KEY'
];

/**
 * Optional environment variables with defaults
 */
const OPTIONAL_VARS = {
  'BOSS_LOG_LEVEL': 'info',
  'BOSS_MAX_SESSIONS': '100',
  'BOSS_TOKEN_BANK_LIMIT': '1000000',
  'BOSS_XP_MULTIPLIER': '1.0'
};

/**
 * Validates Redis URL format
 * @param {string} url - Redis URL
 * @returns {Object} Validation result
 */
export function validateRedisUrl(url) {
  if (!url || typeof url !== 'string') {
    return {
      valid: false,
      error: 'Redis URL is required and must be a string',
      field: 'REDIS_URL'
    };
  }

  // Redis URL formats:
  // redis://[[username:]password@]host[:port][/database]
  // rediss://[[username:]password@]host[:port][/database] (SSL)
  const redisUrlPattern = /^rediss?:\/\/(?:([^:@]+)(?::([^@]+))?@)?([^:\/]+)(?::(\d+))?(?:\/(\d+))?$/;
  const match = url.match(redisUrlPattern);

  if (!match) {
    return {
      valid: false,
      error: 'Invalid Redis URL format',
      field: 'REDIS_URL',
      expected: 'redis://[username:password@]host:port[/database]',
      received: url.substring(0, 50) + (url.length > 50 ? '...' : '')
    };
  }

  const [, username, password, host, port, database] = match;

  // Validate host is not empty
  if (!host || host.trim() === '') {
    return {
      valid: false,
      error: 'Redis host cannot be empty',
      field: 'REDIS_URL'
    };
  }

  // Check for placeholder values
  const placeholders = ['localhost', 'example.com', 'your-redis-url', 'REPLACE_ME'];
  if (placeholders.some(p => url.toLowerCase().includes(p))) {
    return {
      valid: false,
      error: 'Redis URL appears to be a placeholder',
      field: 'REDIS_URL',
      suggestion: 'Replace with actual Redis connection URL'
    };
  }

  return {
    valid: true,
    field: 'REDIS_URL',
    components: {
      username: username || null,
      hasPassword: !!password,
      host,
      port: port ? parseInt(port, 10) : 6379,
      database: database ? parseInt(database, 10) : 0,
      ssl: url.startsWith('rediss://'),
      isRailway: host.includes('railway.app') || host.includes('rlwy.net')
    }
  };
}

/**
 * Validates GitHub token format (basic check, no API validation)
 * @param {string} token - GitHub token
 * @returns {Object} Validation result
 */
export function validateGitHubToken(token) {
  if (!token || typeof token !== 'string') {
    return {
      valid: false,
      error: 'GitHub token is required',
      field: 'GITHUB_TOKEN',
      suggestion: 'Create a token at https://github.com/settings/tokens'
    };
  }

  // Trim whitespace
  token = token.trim();

  // Check for empty or placeholder values
  const placeholders = ['YOUR_TOKEN', 'REPLACE_ME', 'your-github-token', 'ghp_placeholder'];
  if (placeholders.some(p => token.toLowerCase().includes(p.toLowerCase()))) {
    return {
      valid: false,
      error: 'GitHub token appears to be a placeholder',
      field: 'GITHUB_TOKEN',
      suggestion: 'Replace with actual GitHub personal access token'
    };
  }

  // Check token length (GitHub tokens are typically 40+ characters)
  if (token.length < 20) {
    return {
      valid: false,
      error: 'GitHub token appears too short',
      field: 'GITHUB_TOKEN',
      details: `Token length: ${token.length} (expected: 40+)`
    };
  }

  // Check for common token prefixes
  // Classic tokens: ghp_ (personal), gho_ (OAuth), ghu_ (user), ghs_ (server)
  // Fine-grained: github_pat_
  const validPrefixes = ['ghp_', 'gho_', 'ghu_', 'ghs_', 'github_pat_'];
  const hasValidPrefix = validPrefixes.some(prefix => token.startsWith(prefix));

  if (!hasValidPrefix) {
    return {
      valid: false,
      error: 'GitHub token has unexpected format',
      field: 'GITHUB_TOKEN',
      details: `Expected prefix: ${validPrefixes.join(', ')}`,
      warning: 'Token may still be valid, but format is non-standard'
    };
  }

  return {
    valid: true,
    field: 'GITHUB_TOKEN',
    tokenType: token.startsWith('github_pat_') ? 'fine-grained' : 'classic',
    length: token.length
  };
}

/**
 * Validates OpenAI API key format
 * @param {string} apiKey - OpenAI API key
 * @returns {Object} Validation result
 */
export function validateOpenAiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return {
      valid: false,
      error: 'OpenAI API key is required',
      field: 'OPENAI_API_KEY',
      suggestion: 'Get your API key at https://platform.openai.com/api-keys'
    };
  }

  // Trim whitespace
  apiKey = apiKey.trim();

  // Check for placeholder values
  const placeholders = ['YOUR_KEY', 'REPLACE_ME', 'your-openai-key', 'sk-placeholder'];
  if (placeholders.some(p => apiKey.toLowerCase().includes(p.toLowerCase()))) {
    return {
      valid: false,
      error: 'OpenAI API key appears to be a placeholder',
      field: 'OPENAI_API_KEY',
      suggestion: 'Replace with actual OpenAI API key'
    };
  }

  // OpenAI API keys start with 'sk-' and are typically 51 characters
  // New format: sk-proj-... (longer)
  if (!apiKey.startsWith('sk-')) {
    return {
      valid: false,
      error: 'OpenAI API key has invalid format',
      field: 'OPENAI_API_KEY',
      details: 'API key must start with "sk-"'
    };
  }

  // Check minimum length
  if (apiKey.length < 40) {
    return {
      valid: false,
      error: 'OpenAI API key appears too short',
      field: 'OPENAI_API_KEY',
      details: `Key length: ${apiKey.length} (expected: 50+)`
    };
  }

  // Detect key type
  let keyType = 'legacy';
  if (apiKey.startsWith('sk-proj-')) {
    keyType = 'project';
  } else if (apiKey.startsWith('sk-org-')) {
    keyType = 'organization';
  }

  return {
    valid: true,
    field: 'OPENAI_API_KEY',
    keyType,
    length: apiKey.length
  };
}

/**
 * Validates a single environment variable
 * @param {string} key - Variable name
 * @param {string} value - Variable value
 * @returns {Object} Validation result
 */
function validateVariable(key, value) {
  // Check if value is empty or just whitespace
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    return {
      valid: false,
      error: `${key} is empty`,
      field: key,
      suggestion: 'Provide a valid value'
    };
  }

  // Route to specific validator based on key
  switch (key) {
    case 'REDIS_URL':
      return validateRedisUrl(value);

    case 'POSTGRES_URL':
      return validatePostgresUrl(value);

    case 'GITHUB_TOKEN':
      return validateGitHubToken(value);

    case 'OPENAI_API_KEY':
      return validateOpenAiKey(value);

    default:
      // For other variables, just check they're not empty
      return {
        valid: true,
        field: key,
        value: value.substring(0, 50) + (value.length > 50 ? '...' : '')
      };
  }
}

/**
 * Load and parse .env file from ~/.boss-claude/
 * @returns {Object} Parsed environment variables
 */
export function loadEnvFile() {
  const envPath = join(os.homedir(), '.boss-claude', '.env');

  if (!existsSync(envPath)) {
    return {
      exists: false,
      path: envPath,
      error: 'Configuration file not found',
      suggestion: 'Run: boss-claude init'
    };
  }

  try {
    // Read file content
    const content = readFileSync(envPath, 'utf-8');

    // Parse with dotenv
    const parsed = dotenv.parse(content);

    return {
      exists: true,
      path: envPath,
      variables: parsed,
      lineCount: content.split('\n').length,
      fileSize: content.length
    };
  } catch (error) {
    return {
      exists: true,
      path: envPath,
      error: `Failed to parse .env file: ${error.message}`,
      suggestion: 'Check file format and permissions'
    };
  }
}

/**
 * Comprehensive configuration validation
 * @param {Object} options - Validation options
 * @param {boolean} options.includeOptional - Validate optional variables
 * @param {boolean} options.testConnections - Test actual connections (slow)
 * @returns {Promise<Object>} Validation report
 */
export async function validateConfig(options = {}) {
  const {
    includeOptional = true,
    testConnections = false
  } = options;

  const startTime = Date.now();

  // Load .env file
  const envFile = loadEnvFile();
  if (!envFile.exists) {
    return {
      valid: false,
      envFile,
      variables: {},
      errors: [{
        severity: 'critical',
        message: envFile.error,
        suggestion: envFile.suggestion
      }],
      warnings: [],
      summary: {
        total: 0,
        valid: 0,
        invalid: 0,
        missing: REQUIRED_VARS.length
      },
      duration: Date.now() - startTime
    };
  }

  if (envFile.error) {
    return {
      valid: false,
      envFile,
      variables: {},
      errors: [{
        severity: 'critical',
        message: envFile.error,
        suggestion: envFile.suggestion
      }],
      warnings: [],
      summary: {
        total: 0,
        valid: 0,
        invalid: 0,
        missing: REQUIRED_VARS.length
      },
      duration: Date.now() - startTime
    };
  }

  const variables = envFile.variables || {};
  const validationResults = {};
  const errors = [];
  const warnings = [];

  // Check for missing required variables
  const missing = REQUIRED_VARS.filter(key => !(key in variables));
  if (missing.length > 0) {
    errors.push({
      severity: 'critical',
      field: 'configuration',
      message: `Missing required variables: ${missing.join(', ')}`,
      missingVars: missing,
      suggestion: 'Add missing variables to ~/.boss-claude/.env'
    });
  }

  // Validate each required variable
  for (const key of REQUIRED_VARS) {
    if (key in variables) {
      const result = validateVariable(key, variables[key]);
      validationResults[key] = result;

      if (!result.valid) {
        errors.push({
          severity: 'error',
          field: result.field,
          message: result.error,
          details: result.details,
          suggestion: result.suggestion
        });
      } else if (result.warning) {
        warnings.push({
          severity: 'warning',
          field: result.field,
          message: result.warning,
          details: result.details
        });
      }
    }
  }

  // Validate optional variables if requested
  if (includeOptional) {
    for (const [key, defaultValue] of Object.entries(OPTIONAL_VARS)) {
      if (key in variables) {
        const result = validateVariable(key, variables[key]);
        validationResults[key] = result;

        if (!result.valid) {
          warnings.push({
            severity: 'warning',
            field: result.field,
            message: result.error,
            details: `Will use default: ${defaultValue}`,
            suggestion: result.suggestion
          });
        }
      } else {
        warnings.push({
          severity: 'info',
          field: key,
          message: `Optional variable not set`,
          details: `Using default: ${defaultValue}`
        });
      }
    }
  }

  // Calculate summary
  const totalVars = Object.keys(validationResults).length;
  const validVars = Object.values(validationResults).filter(r => r.valid).length;
  const invalidVars = totalVars - validVars;

  const isValid = errors.filter(e => e.severity === 'critical' || e.severity === 'error').length === 0;

  return {
    valid: isValid,
    envFile,
    variables: validationResults,
    errors,
    warnings,
    summary: {
      total: totalVars,
      valid: validVars,
      invalid: invalidVars,
      missing: missing.length,
      configurationHealth: isValid ? 'healthy' : 'unhealthy'
    },
    duration: Date.now() - startTime
  };
}

/**
 * Pretty print configuration validation report
 * @param {Object} report - Report from validateConfig()
 */
export function printReport(report) {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║     Boss Claude Configuration Validation Report       ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Environment file status
  console.log('📄 Environment File:');
  if (report.envFile.exists) {
    console.log(`  ✓ Found: ${report.envFile.path}`);
    console.log(`  Size: ${report.envFile.fileSize} bytes (${report.envFile.lineCount} lines)`);
  } else {
    console.log(`  ✗ Not found: ${report.envFile.path}`);
    console.log(`  → ${report.envFile.suggestion}\n`);
    return;
  }

  // Variables validation
  console.log('\n🔍 Variables Validation:\n');

  // Required variables
  console.log('  Required Variables:');
  for (const key of REQUIRED_VARS) {
    const result = report.variables[key];
    if (!result) {
      console.log(`    ✗ ${key}: MISSING`);
    } else if (result.valid) {
      console.log(`    ✓ ${key}: OK`);
      // Show additional info for some variables
      if (key === 'REDIS_URL' && result.components) {
        console.log(`      - Host: ${result.components.host}:${result.components.port}`);
        console.log(`      - SSL: ${result.components.ssl ? 'Yes' : 'No'}`);
      } else if (key === 'POSTGRES_URL' && result.components) {
        console.log(`      - Host: ${result.components.host}:${result.components.port}`);
        console.log(`      - Database: ${result.components.database}`);
      } else if (key === 'GITHUB_TOKEN' && result.tokenType) {
        console.log(`      - Type: ${result.tokenType}`);
      } else if (key === 'OPENAI_API_KEY' && result.keyType) {
        console.log(`      - Type: ${result.keyType}`);
      }
    } else {
      console.log(`    ✗ ${key}: ${result.error}`);
      if (result.suggestion) {
        console.log(`      → ${result.suggestion}`);
      }
    }
  }

  // Errors
  if (report.errors.length > 0) {
    console.log('\n❌ Errors:');
    report.errors.forEach((error, i) => {
      console.log(`  ${i + 1}. [${error.severity.toUpperCase()}] ${error.message}`);
      if (error.details) {
        console.log(`     Details: ${error.details}`);
      }
      if (error.suggestion) {
        console.log(`     → ${error.suggestion}`);
      }
    });
  }

  // Warnings
  if (report.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    report.warnings.forEach((warning, i) => {
      console.log(`  ${i + 1}. [${warning.severity.toUpperCase()}] ${warning.field}: ${warning.message}`);
      if (warning.details) {
        console.log(`     Details: ${warning.details}`);
      }
    });
  }

  // Summary
  console.log('\n📊 Summary:');
  console.log(`  Total Variables: ${report.summary.total}`);
  console.log(`  Valid: ${report.summary.valid} ✓`);
  console.log(`  Invalid: ${report.summary.invalid} ✗`);
  console.log(`  Missing: ${report.summary.missing}`);
  console.log(`  Configuration Health: ${report.summary.configurationHealth.toUpperCase()}`);
  console.log(`  Validation Duration: ${report.duration}ms`);

  // Overall status
  console.log('\n' + '─'.repeat(60));
  if (report.valid) {
    console.log('  ✅ Configuration is VALID - Ready to use Boss Claude!');
  } else {
    console.log('  ❌ Configuration is INVALID - Fix errors above');
    console.log('  💡 Run: boss-claude init (to reset configuration)');
  }
  console.log('─'.repeat(60) + '\n');
}

/**
 * Quick validation check (returns boolean)
 * @returns {Promise<boolean>} True if config is valid
 */
export async function isConfigValid() {
  const report = await validateConfig({ includeOptional: false });
  return report.valid;
}

export default {
  loadEnvFile,
  validateConfig,
  printReport,
  isConfigValid,
  validateRedisUrl,
  validateGitHubToken,
  validateOpenAiKey
};
