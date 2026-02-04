/**
 * BOSS CLAUDE - Error Recovery System
 * Detects common setup failures and provides actionable fix suggestions
 */

import chalk from 'chalk';

/**
 * Error categories with detection patterns and recovery steps
 */
export const ERROR_PATTERNS = {
  // Authentication & Token Errors
  INVALID_TOKEN: {
    patterns: [
      /invalid.*token/i,
      /authentication.*failed/i,
      /unauthorized/i,
      /401/,
      /EAUTH/,
      /token.*expired/i,
      /token.*malformed/i
    ],
    severity: 'critical',
    category: 'Authentication',
    fixes: [
      'Verify your ANTHROPIC_API_KEY is correct',
      'Check if token has expired or been revoked',
      'Ensure token starts with "sk-ant-"',
      'Visit https://console.anthropic.com to generate a new token',
      'Update .env file with: ANTHROPIC_API_KEY=your-token-here'
    ],
    documentation: 'https://docs.anthropic.com/claude/reference/getting-started-with-the-api'
  },

  MISSING_TOKEN: {
    patterns: [
      /token.*required/i,
      /api.*key.*not.*found/i,
      /ANTHROPIC_API_KEY.*undefined/i,
      /missing.*credentials/i
    ],
    severity: 'critical',
    category: 'Configuration',
    fixes: [
      'Create .env file in project root if it doesn\'t exist',
      'Add: ANTHROPIC_API_KEY=your-anthropic-api-key',
      'For global setup: boss-claude config set ANTHROPIC_API_KEY',
      'Restart your terminal after setting environment variables',
      'Ensure .env file is not in .gitignore (or use .env.local)'
    ],
    documentation: 'README.md#configuration'
  },

  // Network & Connectivity
  NETWORK_ERROR: {
    patterns: [
      /ECONNREFUSED/,
      /ETIMEDOUT/,
      /ENOTFOUND/,
      /network.*error/i,
      /connection.*timeout/i,
      /socket.*hang.*up/i,
      /ECONNRESET/
    ],
    severity: 'high',
    category: 'Network',
    fixes: [
      'Check your internet connection',
      'Verify firewall is not blocking outbound HTTPS (port 443)',
      'Try pinging api.anthropic.com',
      'If using proxy, set HTTP_PROXY and HTTPS_PROXY env vars',
      'Check if VPN is interfering with API access',
      'Wait a moment and retry - might be temporary network issue'
    ],
    documentation: null
  },

  DNS_ERROR: {
    patterns: [
      /ENOTFOUND.*api\.anthropic\.com/i,
      /getaddrinfo.*ENOTFOUND/i,
      /DNS.*resolution.*failed/i
    ],
    severity: 'high',
    category: 'Network',
    fixes: [
      'Check DNS settings: Try using 8.8.8.8 or 1.1.1.1',
      'Flush DNS cache: sudo dscacheutil -flushcache (macOS)',
      'Test DNS: nslookup api.anthropic.com',
      'Check /etc/hosts for incorrect entries',
      'Restart network interface or router'
    ],
    documentation: null
  },

  // Redis Connection Errors
  REDIS_CONNECTION: {
    patterns: [
      /ECONNREFUSED.*6379/,
      /Redis.*connection.*failed/i,
      /redis.*not.*running/i,
      /could.*not.*connect.*redis/i
    ],
    severity: 'medium',
    category: 'Redis',
    fixes: [
      'Start Redis: redis-server (or brew services start redis on macOS)',
      'Check if Redis is running: redis-cli ping',
      'Verify Redis port (default 6379) is not blocked',
      'Install Redis if missing: brew install redis (macOS) or apt-get install redis (Linux)',
      'Boss Claude will work without Redis (offline mode) but progress won\'t persist'
    ],
    documentation: 'README.md#redis-setup'
  },

  REDIS_AUTH: {
    patterns: [
      /NOAUTH.*Authentication.*required/i,
      /Redis.*authentication.*failed/i,
      /invalid.*password/i
    ],
    severity: 'medium',
    category: 'Redis',
    fixes: [
      'Check REDIS_URL in .env includes password if required',
      'Format: redis://default:password@host:port',
      'Verify Redis requirepass in redis.conf',
      'For local Redis without auth, remove password from REDIS_URL',
      'Test connection: redis-cli -a your-password ping'
    ],
    documentation: null
  },

  // File System & Permissions
  PERMISSION_DENIED: {
    patterns: [
      /EACCES/,
      /permission.*denied/i,
      /EPERM/,
      /operation.*not.*permitted/i
    ],
    severity: 'high',
    category: 'Permissions',
    fixes: [
      'Check file/directory permissions: ls -la',
      'For npm global installs: Use sudo (or fix npm permissions)',
      'Fix npm permissions: npm config set prefix ~/.npm-global',
      'Add to PATH: export PATH=~/.npm-global/bin:$PATH',
      'For config files: chmod 644 ~/.boss-claude/config.json',
      'For directories: chmod 755 ~/.boss-claude'
    ],
    documentation: 'https://docs.npmjs.com/resolving-eacces-permissions-errors'
  },

  FILE_NOT_FOUND: {
    patterns: [
      /ENOENT/,
      /no.*such.*file/i,
      /cannot.*find.*module/i,
      /module.*not.*found/i
    ],
    severity: 'medium',
    category: 'File System',
    fixes: [
      'Verify file path is correct',
      'Run: npm install (might be missing dependencies)',
      'Check if .boss-claude directory exists in home folder',
      'Create config directory: mkdir -p ~/.boss-claude',
      'Reinstall package: npm uninstall -g @cpretzinger/boss-claude && npm install -g @cpretzinger/boss-claude'
    ],
    documentation: null
  },

  // Rate Limiting & API Errors
  RATE_LIMIT: {
    patterns: [
      /rate.*limit/i,
      /429/,
      /too.*many.*requests/i,
      /quota.*exceeded/i
    ],
    severity: 'medium',
    category: 'API Limits',
    fixes: [
      'Wait 60 seconds before retrying',
      'Check your API usage at https://console.anthropic.com',
      'Verify you haven\'t exceeded your plan limits',
      'Consider upgrading your Anthropic plan if needed',
      'Implement exponential backoff in your automation'
    ],
    documentation: 'https://docs.anthropic.com/claude/reference/rate-limits'
  },

  API_ERROR: {
    patterns: [
      /500/,
      /502/,
      /503/,
      /504/,
      /internal.*server.*error/i,
      /service.*unavailable/i,
      /bad.*gateway/i
    ],
    severity: 'low',
    category: 'API',
    fixes: [
      'Anthropic API may be experiencing issues',
      'Check status: https://status.anthropic.com',
      'Wait a few minutes and retry',
      'If persistent, contact Anthropic support',
      'Your data is safe - Boss Claude will retry automatically'
    ],
    documentation: 'https://status.anthropic.com'
  },

  // Package & Dependencies
  DEPENDENCY_ERROR: {
    patterns: [
      /Cannot.*find.*package/i,
      /Module.*not.*found.*node_modules/i,
      /peer.*dependency/i,
      /incompatible.*version/i
    ],
    severity: 'high',
    category: 'Dependencies',
    fixes: [
      'Run: npm install (or npm install -g for global)',
      'Clear npm cache: npm cache clean --force',
      'Delete node_modules: rm -rf node_modules package-lock.json',
      'Reinstall: npm install',
      'Check Node.js version: node --version (requires 18+)'
    ],
    documentation: null
  },

  NODE_VERSION: {
    patterns: [
      /node.*version/i,
      /requires.*node/i,
      /engine.*node/i,
      /unsupported.*engine/i
    ],
    severity: 'critical',
    category: 'Environment',
    fixes: [
      'Boss Claude requires Node.js 18 or higher',
      'Check version: node --version',
      'Update Node.js: https://nodejs.org',
      'Use nvm: nvm install 20 && nvm use 20',
      'Or use fnm: fnm install 20 && fnm use 20'
    ],
    documentation: 'https://nodejs.org'
  },

  // JSON & Data Errors
  JSON_PARSE_ERROR: {
    patterns: [
      /unexpected.*token/i,
      /JSON\.parse/i,
      /invalid.*JSON/i,
      /malformed.*JSON/i
    ],
    severity: 'medium',
    category: 'Data',
    fixes: [
      'Config file may be corrupted',
      'Backup and remove: mv ~/.boss-claude/config.json ~/.boss-claude/config.json.bak',
      'Restart Boss Claude to regenerate config',
      'Manually fix JSON syntax if you can identify the error',
      'Validate JSON: cat config.json | python -m json.tool'
    ],
    documentation: null
  }
};

/**
 * Detect error type from error message or stack
 * @param {Error|string} error - Error object or message
 * @returns {Object|null} Matched error pattern or null
 */
export function detectErrorType(error) {
  const errorMessage = error instanceof Error ?
    `${error.message} ${error.stack || ''}` :
    String(error);

  for (const [type, config] of Object.entries(ERROR_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(errorMessage)) {
        return { type, ...config };
      }
    }
  }

  return null;
}

/**
 * Format error recovery suggestions
 * @param {Error|string} error - Error to analyze
 * @returns {string} Formatted recovery message
 */
export function formatErrorRecovery(error) {
  const detected = detectErrorType(error);

  if (!detected) {
    return formatGenericError(error);
  }

  const { type, severity, category, fixes, documentation } = detected;

  const severityColor = {
    critical: chalk.red.bold,
    high: chalk.red,
    medium: chalk.yellow,
    low: chalk.blue
  }[severity] || chalk.white;

  let output = '\n';
  output += chalk.red('═'.repeat(70)) + '\n';
  output += severityColor(`  ERROR DETECTED: ${category}`) + '\n';
  output += chalk.red('═'.repeat(70)) + '\n\n';

  output += chalk.bold('Original Error:\n');
  output += chalk.gray(error instanceof Error ? error.message : String(error)) + '\n\n';

  output += chalk.bold.cyan('🔧 Suggested Fixes:\n\n');

  fixes.forEach((fix, index) => {
    output += chalk.white(`  ${index + 1}. ${fix}\n`);
  });

  if (documentation) {
    output += '\n' + chalk.bold.blue('📚 Documentation:\n');
    output += chalk.cyan(`  ${documentation}\n`);
  }

  output += '\n' + chalk.yellow('💡 Tip: ') + chalk.white('Run "boss-claude doctor" for automated diagnosis\n');
  output += chalk.red('═'.repeat(70)) + '\n';

  return output;
}

/**
 * Format generic error (unrecognized pattern)
 * @param {Error|string} error - Error object
 * @returns {string} Formatted error message
 */
function formatGenericError(error) {
  let output = '\n';
  output += chalk.red('═'.repeat(70)) + '\n';
  output += chalk.red.bold('  UNEXPECTED ERROR') + '\n';
  output += chalk.red('═'.repeat(70)) + '\n\n';

  output += chalk.bold('Error Message:\n');
  output += chalk.gray(error instanceof Error ? error.message : String(error)) + '\n\n';

  if (error instanceof Error && error.stack) {
    output += chalk.bold('Stack Trace:\n');
    output += chalk.gray(error.stack.split('\n').slice(0, 5).join('\n')) + '\n\n';
  }

  output += chalk.bold.cyan('🔧 General Troubleshooting:\n\n');
  output += chalk.white('  1. Run: boss-claude doctor (automated diagnosis)\n');
  output += chalk.white('  2. Check logs: ~/.boss-claude/logs/\n');
  output += chalk.white('  3. Verify configuration: boss-claude config list\n');
  output += chalk.white('  4. Test connectivity: boss-claude status\n');
  output += chalk.white('  5. Report issue: https://github.com/cpretzinger/boss-claude/issues\n');

  output += '\n' + chalk.red('═'.repeat(70)) + '\n';

  return output;
}

/**
 * Run automated diagnostics
 * @returns {Promise<Object>} Diagnostic results
 */
export async function runDiagnostics() {
  const results = {
    timestamp: new Date().toISOString(),
    checks: {},
    issues: [],
    recommendations: []
  };

  // Check 1: Environment variables
  results.checks.anthropicKey = {
    status: process.env.ANTHROPIC_API_KEY ? 'pass' : 'fail',
    message: process.env.ANTHROPIC_API_KEY ?
      'ANTHROPIC_API_KEY is set' :
      'ANTHROPIC_API_KEY is missing'
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    results.issues.push({
      severity: 'critical',
      category: 'Configuration',
      message: 'Missing ANTHROPIC_API_KEY',
      fix: 'Set in .env or environment: export ANTHROPIC_API_KEY=your-key'
    });
  }

  // Check 2: Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  results.checks.nodeVersion = {
    status: majorVersion >= 18 ? 'pass' : 'fail',
    message: `Node.js ${nodeVersion} (requires 18+)`,
    version: nodeVersion
  };

  if (majorVersion < 18) {
    results.issues.push({
      severity: 'critical',
      category: 'Environment',
      message: `Node.js version ${nodeVersion} is too old`,
      fix: 'Update to Node.js 18 or higher: https://nodejs.org'
    });
  }

  // Check 3: Redis connectivity
  try {
    const { createClient } = await import('redis');
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const client = createClient({ url: redisUrl });

    await client.connect();
    await client.ping();
    await client.quit();

    results.checks.redis = {
      status: 'pass',
      message: 'Redis is connected and responsive',
      url: redisUrl.replace(/:[^:]*@/, ':****@') // Hide password
    };
  } catch (redisError) {
    results.checks.redis = {
      status: 'warn',
      message: 'Redis not available (offline mode)',
      error: redisError.message
    };
    results.recommendations.push({
      category: 'Performance',
      message: 'Install Redis for persistent progress tracking',
      fix: 'brew install redis && brew services start redis (macOS)'
    });
  }

  // Check 4: File permissions
  try {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');

    const configDir = path.join(os.homedir(), '.boss-claude');
    const configPath = path.join(configDir, 'config.json');

    // Try to access config directory
    try {
      await fs.promises.access(configDir, fs.constants.R_OK | fs.constants.W_OK);
      results.checks.permissions = {
        status: 'pass',
        message: 'Config directory is readable and writable'
      };
    } catch {
      results.checks.permissions = {
        status: 'warn',
        message: 'Config directory has permission issues'
      };
      results.issues.push({
        severity: 'medium',
        category: 'Permissions',
        message: 'Cannot access ~/.boss-claude directory',
        fix: 'chmod 755 ~/.boss-claude'
      });
    }
  } catch (err) {
    results.checks.permissions = {
      status: 'error',
      message: 'Could not check file permissions',
      error: err.message
    };
  }

  // Check 5: Network connectivity
  try {
    const https = await import('https');

    await new Promise((resolve, reject) => {
      const req = https.get('https://api.anthropic.com', { timeout: 5000 }, (res) => {
        results.checks.network = {
          status: res.statusCode === 200 || res.statusCode === 404 ? 'pass' : 'warn',
          message: `API endpoint reachable (HTTP ${res.statusCode})`
        };
        resolve();
      });

      req.on('error', (err) => {
        results.checks.network = {
          status: 'fail',
          message: 'Cannot reach Anthropic API',
          error: err.message
        };
        results.issues.push({
          severity: 'high',
          category: 'Network',
          message: 'Network connectivity issue',
          fix: 'Check internet connection and firewall settings'
        });
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        results.checks.network = {
          status: 'fail',
          message: 'API connection timeout'
        };
        reject(new Error('Timeout'));
      });
    }).catch(() => {});
  } catch (err) {
    results.checks.network = {
      status: 'error',
      message: 'Network check failed',
      error: err.message
    };
  }

  return results;
}

/**
 * Format diagnostic results for display
 * @param {Object} results - Diagnostic results
 * @returns {string} Formatted output
 */
export function formatDiagnostics(results) {
  let output = '\n';
  output += chalk.cyan('═'.repeat(70)) + '\n';
  output += chalk.cyan.bold('  BOSS CLAUDE DIAGNOSTICS') + '\n';
  output += chalk.cyan('═'.repeat(70)) + '\n\n';

  output += chalk.bold('System Checks:\n\n');

  for (const [check, result] of Object.entries(results.checks)) {
    const statusIcon = {
      pass: chalk.green('✓'),
      warn: chalk.yellow('⚠'),
      fail: chalk.red('✗'),
      error: chalk.red('✗')
    }[result.status] || '?';

    output += `  ${statusIcon} ${chalk.bold(check)}: ${result.message}\n`;

    if (result.error) {
      output += chalk.gray(`    Error: ${result.error}\n`);
    }
  }

  if (results.issues.length > 0) {
    output += '\n' + chalk.bold.red('Issues Found:\n\n');
    results.issues.forEach((issue, index) => {
      const severityColor = {
        critical: chalk.red.bold,
        high: chalk.red,
        medium: chalk.yellow
      }[issue.severity] || chalk.white;

      output += severityColor(`  ${index + 1}. [${issue.severity.toUpperCase()}] ${issue.message}\n`);
      output += chalk.white(`     Fix: ${issue.fix}\n\n`);
    });
  }

  if (results.recommendations.length > 0) {
    output += chalk.bold.blue('Recommendations:\n\n');
    results.recommendations.forEach((rec, index) => {
      output += chalk.white(`  ${index + 1}. ${rec.message}\n`);
      output += chalk.gray(`     ${rec.fix}\n\n`);
    });
  }

  if (results.issues.length === 0) {
    output += '\n' + chalk.green.bold('✓ All critical checks passed!\n');
  }

  output += chalk.cyan('═'.repeat(70)) + '\n';

  return output;
}

/**
 * Handle error with recovery suggestions
 * @param {Error} error - Error to handle
 * @param {boolean} exitOnCritical - Exit process on critical errors
 */
export function handleError(error, exitOnCritical = false) {
  console.error(formatErrorRecovery(error));

  const detected = detectErrorType(error);
  if (exitOnCritical && detected?.severity === 'critical') {
    process.exit(1);
  }
}

/**
 * Create error recovery middleware for async operations
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function with error recovery
 */
export function withErrorRecovery(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error);
      throw error;
    }
  };
}

export default {
  ERROR_PATTERNS,
  detectErrorType,
  formatErrorRecovery,
  runDiagnostics,
  formatDiagnostics,
  handleError,
  withErrorRecovery
};
