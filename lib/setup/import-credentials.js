#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import chalk from 'chalk';

const execAsync = promisify(exec);

/**
 * Credential Import System
 * Auto-detects credentials from multiple sources and offers intelligent importing
 *
 * Sources (in priority order):
 * 1. Environment variables (current process)
 * 2. GitHub CLI (gh auth token)
 * 3. Existing .env files (project, user home, common locations)
 * 4. User input (fallback)
 */

// Common .env file locations to scan
const ENV_SEARCH_PATHS = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '.env.local'),
  path.join(os.homedir(), '.env'),
  path.join(os.homedir(), '.boss-claude', '.env'),
];

// Add local BOSS-claude repo .env for development (when running from within the repo)
// This detects if we're in the BOSS-claude repo by checking for package.json with the right name
const packageJsonPath = path.join(process.cwd(), 'package.json');
try {
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (pkg.name === '@cpretzinger/boss-claude') {
      // We're in the BOSS-claude repo itself, add local .env to search paths
      const localEnv = path.join(process.cwd(), '.env');
      if (!ENV_SEARCH_PATHS.includes(localEnv)) {
        ENV_SEARCH_PATHS.unshift(localEnv); // Add to front for highest priority
      }
    }
  }
} catch (e) {
  // Ignore errors - this is just for development convenience
}

// Credential definitions
const CREDENTIALS = {
  REDIS_URL: {
    name: 'Redis URL',
    description: 'Redis connection string for Boss identity and session storage',
    required: true,
    pattern: /^redis:\/\//,
    example: 'redis://default:password@host:port',
  },
  BOSS_CLAUDE_PG_URL: {
    name: 'PostgreSQL URL',
    description: 'PostgreSQL connection string for persistent memory storage',
    required: false,
    pattern: /^postgresql:\/\//,
    example: 'postgresql://user:password@host:port/database',
  },
  GITHUB_TOKEN: {
    name: 'GitHub Token',
    description: 'GitHub personal access token (needs repo scope)',
    required: true,
    pattern: /^(ghp_|github_pat_)[a-zA-Z0-9_]+$/,
    example: 'ghp_your_token_here',
  },
  GITHUB_OWNER: {
    name: 'GitHub Owner',
    description: 'GitHub username/organization for memory storage',
    required: false,
    pattern: /^[a-zA-Z0-9-]+$/,
    example: 'your-github-username',
  },
  GITHUB_MEMORY_REPO: {
    name: 'GitHub Memory Repository',
    description: 'Repository name for storing session memories',
    required: false,
    pattern: /^[a-zA-Z0-9-_]+$/,
    example: 'boss-claude-memory',
  },
};

/**
 * Check if GitHub CLI is installed and authenticated
 */
async function checkGitHubCLI() {
  try {
    const { stdout } = await execAsync('gh auth status 2>&1');
    if (stdout.includes('Logged in to github.com')) {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Get GitHub token from gh CLI
 */
async function getGitHubTokenFromCLI() {
  try {
    const { stdout } = await execAsync('gh auth token');
    const token = stdout.trim();
    if (token && CREDENTIALS.GITHUB_TOKEN.pattern.test(token)) {
      return token;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Get GitHub username from gh CLI
 */
async function getGitHubUserFromCLI() {
  try {
    const { stdout } = await execAsync('gh api user --jq .login');
    return stdout.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Scan environment variables for credentials
 */
function scanEnvironmentVariables() {
  const found = {};

  for (const [key, config] of Object.entries(CREDENTIALS)) {
    if (process.env[key]) {
      const value = process.env[key];
      if (config.pattern && !config.pattern.test(value)) {
        continue; // Skip invalid patterns
      }
      found[key] = {
        value,
        source: 'environment',
        confidence: 'high',
      };
    }
  }

  return found;
}

/**
 * Parse a .env file and extract credentials
 */
function parseEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = dotenv.parse(content);
    const found = {};

    for (const [key, config] of Object.entries(CREDENTIALS)) {
      if (parsed[key]) {
        const value = parsed[key];
        if (config.pattern && !config.pattern.test(value)) {
          continue; // Skip invalid patterns
        }
        found[key] = {
          value,
          source: filePath,
          confidence: 'medium',
        };
      }
    }

    return Object.keys(found).length > 0 ? found : null;
  } catch (error) {
    return null;
  }
}

/**
 * Scan all common .env file locations
 */
function scanEnvFiles() {
  const allFound = {};

  for (const envPath of ENV_SEARCH_PATHS) {
    const found = parseEnvFile(envPath);
    if (found) {
      for (const [key, data] of Object.entries(found)) {
        // Keep first found (higher priority)
        if (!allFound[key]) {
          allFound[key] = data;
        }
      }
    }
  }

  return allFound;
}

/**
 * Auto-detect credentials from all sources
 */
export async function autoDetectCredentials() {
  console.log(chalk.blue('\n🔍 Auto-detecting credentials from multiple sources...\n'));

  const detected = {};

  // 1. Check environment variables
  console.log(chalk.gray('Checking environment variables...'));
  const envVars = scanEnvironmentVariables();
  Object.assign(detected, envVars);

  // 2. Check GitHub CLI
  console.log(chalk.gray('Checking GitHub CLI (gh)...'));
  const ghAuthed = await checkGitHubCLI();
  if (ghAuthed) {
    const ghToken = await getGitHubTokenFromCLI();
    const ghUser = await getGitHubUserFromCLI();

    if (ghToken && !detected.GITHUB_TOKEN) {
      detected.GITHUB_TOKEN = {
        value: ghToken,
        source: 'gh CLI',
        confidence: 'high',
      };
    }

    if (ghUser && !detected.GITHUB_OWNER) {
      detected.GITHUB_OWNER = {
        value: ghUser,
        source: 'gh CLI',
        confidence: 'high',
      };
    }
  }

  // 3. Scan .env files
  console.log(chalk.gray('Scanning .env files in common locations...'));
  const envFiles = scanEnvFiles();
  for (const [key, data] of Object.entries(envFiles)) {
    if (!detected[key]) {
      detected[key] = data;
    }
  }

  return detected;
}

/**
 * Display detected credentials summary
 */
export function displayDetectedCredentials(detected) {
  console.log(chalk.green('\n✅ Credential Detection Complete\n'));

  const found = Object.keys(detected).length;
  const required = Object.entries(CREDENTIALS).filter(([_, c]) => c.required).length;
  const total = Object.keys(CREDENTIALS).length;

  console.log(chalk.bold(`Found ${found}/${total} credentials (${required} required)`));
  console.log(chalk.gray('━'.repeat(60)));

  for (const [key, config] of Object.entries(CREDENTIALS)) {
    const data = detected[key];
    const status = data ? chalk.green('✓') : chalk.red('✗');
    const required = config.required ? chalk.red('*') : ' ';

    console.log(`${status} ${required} ${chalk.bold(config.name)}`);

    if (data) {
      // Mask sensitive values
      const maskedValue = maskCredential(key, data.value);
      console.log(chalk.gray(`    Value: ${maskedValue}`));
      console.log(chalk.gray(`    Source: ${data.source}`));
      console.log(chalk.gray(`    Confidence: ${data.confidence}`));
    } else {
      console.log(chalk.gray(`    ${config.description}`));
      console.log(chalk.dim(`    Example: ${config.example}`));
    }
    console.log();
  }

  console.log(chalk.gray('━'.repeat(60)));
  console.log(chalk.dim('* = Required credential\n'));

  return { found, required, total };
}

/**
 * Mask credential value for display
 */
function maskCredential(key, value) {
  if (!value) return 'N/A';

  if (key === 'REDIS_URL' || key === 'BOSS_CLAUDE_PG_URL') {
    // Show protocol and host, mask password
    return value.replace(/:(.*?)@/, ':***@');
  }

  if (key === 'GITHUB_TOKEN') {
    // Show first 4 and last 4 characters
    if (value.length > 12) {
      return `${value.slice(0, 8)}...${value.slice(-4)}`;
    }
    return '***';
  }

  // Other credentials - show in full (not sensitive)
  return value;
}

/**
 * Write credentials to ~/.boss-claude/.env
 */
export function writeCredentialsFile(credentials) {
  const bossDirPath = path.join(os.homedir(), '.boss-claude');
  const envPath = path.join(bossDirPath, '.env');

  // Create directory if it doesn't exist
  if (!fs.existsSync(bossDirPath)) {
    fs.mkdirSync(bossDirPath, { recursive: true });
  }

  // Build .env content
  const lines = [
    '# Boss Claude Configuration',
    '# Auto-generated by credential import system',
    `# Created: ${new Date().toISOString()}`,
    '',
  ];

  for (const [key, config] of Object.entries(CREDENTIALS)) {
    const data = credentials[key];
    lines.push(`# ${config.description}`);
    if (data && data.value) {
      lines.push(`${key}=${data.value}`);
    } else {
      lines.push(`# ${key}=${config.example}`);
    }
    lines.push('');
  }

  fs.writeFileSync(envPath, lines.join('\n'));
  return envPath;
}

/**
 * Interactive credential import
 */
export async function importCredentials(options = {}) {
  const { autoAccept = false } = options;

  // Auto-detect credentials
  const detected = await autoDetectCredentials();

  // Display summary
  const { found, required } = displayDetectedCredentials(detected);

  // Check if we have all required credentials
  const hasAllRequired = Object.entries(CREDENTIALS)
    .filter(([_, c]) => c.required)
    .every(([key, _]) => detected[key]);

  if (hasAllRequired) {
    console.log(chalk.green('✅ All required credentials detected!\n'));
  } else {
    console.log(chalk.yellow('⚠️  Missing required credentials\n'));

    // List missing required credentials
    const missing = Object.entries(CREDENTIALS)
      .filter(([key, config]) => config.required && !detected[key])
      .map(([_, config]) => config.name);

    console.log(chalk.red('Missing required credentials:'));
    missing.forEach(name => console.log(chalk.red(`  • ${name}`)));
    console.log();
  }

  // Write credentials file
  const envPath = writeCredentialsFile(detected);
  console.log(chalk.green(`✅ Credentials written to: ${envPath}\n`));

  // Show next steps
  if (!hasAllRequired) {
    console.log(chalk.yellow('⚠️  Next steps:'));
    console.log(chalk.gray(`1. Edit ${envPath}`));
    console.log(chalk.gray('2. Fill in missing credentials'));
    console.log(chalk.gray('3. Run: boss-claude init\n'));
  } else {
    console.log(chalk.green('✅ Ready to use Boss Claude!'));
    console.log(chalk.gray('Run: boss-claude init\n'));
  }

  return {
    detected,
    envPath,
    hasAllRequired,
  };
}

/**
 * Validate existing credentials
 */
export async function validateCredentials() {
  const bossDirPath = path.join(os.homedir(), '.boss-claude');
  const envPath = path.join(bossDirPath, '.env');

  if (!fs.existsSync(envPath)) {
    return {
      valid: false,
      errors: ['Credentials file not found at ~/.boss-claude/.env'],
    };
  }

  // Load credentials
  const content = fs.readFileSync(envPath, 'utf8');
  const parsed = dotenv.parse(content);
  const errors = [];

  // Validate each credential
  for (const [key, config] of Object.entries(CREDENTIALS)) {
    const value = parsed[key];

    if (config.required && !value) {
      errors.push(`Missing required credential: ${config.name}`);
      continue;
    }

    if (value && config.pattern && !config.pattern.test(value)) {
      errors.push(`Invalid format for ${config.name}: ${value}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    credentials: parsed,
  };
}

/**
 * List all detected sources
 */
export async function listSources() {
  console.log(chalk.blue('\n🔍 Credential Sources\n'));

  // 1. Environment variables
  console.log(chalk.bold('1. Environment Variables'));
  const envVars = scanEnvironmentVariables();
  if (Object.keys(envVars).length > 0) {
    for (const [key, data] of Object.entries(envVars)) {
      console.log(chalk.gray(`   ${key}: ${maskCredential(key, data.value)}`));
    }
  } else {
    console.log(chalk.gray('   (none found)'));
  }
  console.log();

  // 2. GitHub CLI
  console.log(chalk.bold('2. GitHub CLI (gh)'));
  const ghAuthed = await checkGitHubCLI();
  if (ghAuthed) {
    const ghToken = await getGitHubTokenFromCLI();
    const ghUser = await getGitHubUserFromCLI();
    console.log(chalk.gray(`   Authenticated: Yes`));
    console.log(chalk.gray(`   Token: ${maskCredential('GITHUB_TOKEN', ghToken)}`));
    console.log(chalk.gray(`   User: ${ghUser}`));
  } else {
    console.log(chalk.gray('   Authenticated: No'));
  }
  console.log();

  // 3. .env files
  console.log(chalk.bold('3. .env Files'));
  for (const envPath of ENV_SEARCH_PATHS) {
    const found = parseEnvFile(envPath);
    if (found) {
      console.log(chalk.green(`   ✓ ${envPath}`));
      for (const [key, data] of Object.entries(found)) {
        console.log(chalk.gray(`     ${key}: ${maskCredential(key, data.value)}`));
      }
    } else {
      console.log(chalk.dim(`   ✗ ${envPath}`));
    }
  }
  console.log();
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] || 'import';

  if (command === 'import') {
    await importCredentials();
  } else if (command === 'list') {
    await listSources();
  } else if (command === 'validate') {
    const result = await validateCredentials();
    if (result.valid) {
      console.log(chalk.green('\n✅ All credentials valid\n'));
    } else {
      console.log(chalk.red('\n❌ Validation failed:\n'));
      result.errors.forEach(error => console.log(chalk.red(`  • ${error}`)));
      console.log();
      process.exit(1);
    }
  } else {
    console.log(chalk.yellow(`\nUnknown command: ${command}`));
    console.log(chalk.gray('\nAvailable commands:'));
    console.log(chalk.gray('  import   - Auto-detect and import credentials'));
    console.log(chalk.gray('  list     - List all credential sources'));
    console.log(chalk.gray('  validate - Validate existing credentials\n'));
  }
}
