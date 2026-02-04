/**
 * BOSS CLAUDE - Setup Rollback Utility
 *
 * Safely undoes setup changes if user cancels or errors occur:
 * - Deletes created GitHub repositories
 * - Restores .env backups
 * - Cleans up Redis keys
 * - Removes temporary files
 * - Provides detailed rollback logs
 */

import { Octokit } from '@octokit/rest';
import { EnvManager } from './env-manager.js';
import chalk from 'chalk';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

const ENV_DIR = path.join(os.homedir(), '.boss-claude');
const ROLLBACK_LOG = path.join(ENV_DIR, 'rollback.log');
const STATE_FILE = path.join(ENV_DIR, 'setup-state.json');

/**
 * Setup state tracker for rollback operations
 */
export class SetupState {
  constructor() {
    this.state = {
      timestamp: new Date().toISOString(),
      actions: [],
      completed: false
    };
  }

  /**
   * Load existing state from file
   */
  async load() {
    try {
      if (existsSync(STATE_FILE)) {
        const content = await fs.readFile(STATE_FILE, 'utf8');
        this.state = JSON.parse(content);
        return this.state;
      }
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not load setup state'));
    }
    return null;
  }

  /**
   * Save current state to file
   */
  async save() {
    try {
      await fs.mkdir(ENV_DIR, { recursive: true, mode: 0o700 });
      await fs.writeFile(STATE_FILE, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not save setup state'));
    }
  }

  /**
   * Record an action for potential rollback
   */
  async recordAction(type, data) {
    this.state.actions.push({
      type,
      data,
      timestamp: new Date().toISOString()
    });
    await this.save();
  }

  /**
   * Mark setup as completed (no rollback needed)
   */
  async markCompleted() {
    this.state.completed = true;
    await this.save();
  }

  /**
   * Clear state after successful rollback
   */
  async clear() {
    try {
      if (existsSync(STATE_FILE)) {
        await fs.unlink(STATE_FILE);
      }
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not clear setup state'));
    }
  }
}

/**
 * Main rollback manager
 */
export class RollbackManager {
  constructor(options = {}) {
    this.options = {
      verbose: options.verbose || false,
      dryRun: options.dryRun || false,
      logFile: options.logFile || ROLLBACK_LOG
    };
    this.logs = [];
    this.errors = [];
    this.state = new SetupState();
  }

  /**
   * Log message to console and internal log
   */
  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${type.toUpperCase()}] ${message}`;

    this.logs.push(logEntry);

    if (this.options.verbose || type === 'error') {
      const colorMap = {
        info: chalk.blue,
        success: chalk.green,
        error: chalk.red,
        warning: chalk.yellow,
        debug: chalk.gray
      };

      const color = colorMap[type] || chalk.white;
      console.log(color(message));
    }
  }

  /**
   * Record error
   */
  logError(error, context = '') {
    const errorMsg = `${context}: ${error.message}`;
    this.errors.push(errorMsg);
    this.log(errorMsg, 'error');
  }

  /**
   * Save logs to file
   */
  async saveLogs() {
    try {
      await fs.mkdir(ENV_DIR, { recursive: true, mode: 0o700 });
      const logContent = this.logs.join('\n') + '\n';
      await fs.appendFile(this.options.logFile, logContent);
      this.log(`Logs saved to: ${this.options.logFile}`, 'debug');
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not save logs: ${error.message}`));
    }
  }

  /**
   * Rollback GitHub repository creation
   */
  async rollbackGitHub(action) {
    const { owner, repo, token, wasCreated } = action.data;

    if (!wasCreated) {
      this.log(`Skipping GitHub rollback: repository existed before setup`, 'debug');
      return { success: true, skipped: true };
    }

    if (this.options.dryRun) {
      this.log(`[DRY RUN] Would delete GitHub repository: ${owner}/${repo}`, 'info');
      return { success: true, dryRun: true };
    }

    try {
      this.log(`Deleting GitHub repository: ${owner}/${repo}`, 'info');

      const octokit = new Octokit({ auth: token });

      // Verify repository exists
      try {
        await octokit.repos.get({ owner, repo });
      } catch (error) {
        if (error.status === 404) {
          this.log(`Repository ${owner}/${repo} already deleted`, 'debug');
          return { success: true, alreadyDeleted: true };
        }
        throw error;
      }

      // Delete repository
      await octokit.repos.delete({ owner, repo });

      this.log(`Successfully deleted repository: ${owner}/${repo}`, 'success');

      return {
        success: true,
        owner,
        repo,
        deleted: true
      };

    } catch (error) {
      this.logError(error, 'GitHub rollback failed');
      return {
        success: false,
        owner,
        repo,
        error: error.message
      };
    }
  }

  /**
   * Rollback environment variable changes
   */
  async rollbackEnv(action) {
    const { keys, backupName } = action.data;

    if (this.options.dryRun) {
      this.log(`[DRY RUN] Would restore .env backup: ${backupName || 'latest'}`, 'info');
      return { success: true, dryRun: true };
    }

    try {
      const envManager = new EnvManager();
      await envManager.init();

      if (backupName) {
        // Restore from specific backup
        this.log(`Restoring .env from backup: ${backupName}`, 'info');
        const result = await envManager.restore(backupName);

        if (result.success) {
          this.log('Successfully restored .env from backup', 'success');
        }

        return result;
      } else if (keys && keys.length > 0) {
        // Remove specific keys
        this.log(`Removing ${keys.length} environment variable(s)`, 'info');
        const results = [];

        for (const key of keys) {
          try {
            const result = await envManager.remove(key, { skipBackup: true });
            results.push({ key, ...result });

            if (result.success) {
              this.log(`Removed ${key}`, 'debug');
            }
          } catch (error) {
            this.logError(error, `Failed to remove ${key}`);
            results.push({ key, success: false, error: error.message });
          }
        }

        const successCount = results.filter(r => r.success).length;
        this.log(`Removed ${successCount}/${keys.length} environment variables`, 'success');

        return {
          success: successCount > 0,
          results,
          removed: successCount,
          total: keys.length
        };
      }

      return { success: false, error: 'No rollback method specified' };

    } catch (error) {
      this.logError(error, 'Environment rollback failed');
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Rollback Redis keys
   */
  async rollbackRedis(action) {
    const { keys, pattern } = action.data;

    if (this.options.dryRun) {
      this.log(`[DRY RUN] Would delete Redis keys: ${keys?.join(', ') || pattern}`, 'info');
      return { success: true, dryRun: true };
    }

    try {
      // Try to import Redis - it's optional
      let redis;
      try {
        redis = await import('redis');
      } catch (error) {
        this.log('Redis not available (optional dependency)', 'debug');
        return { success: true, skipped: true, reason: 'Redis not installed' };
      }

      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      const client = redis.createClient({ url: redisUrl });

      await client.connect();
      this.log('Connected to Redis', 'debug');

      let deleted = 0;

      if (pattern) {
        // Delete by pattern
        this.log(`Scanning for Redis keys matching: ${pattern}`, 'info');
        const matchingKeys = [];

        for await (const key of client.scanIterator({ MATCH: pattern })) {
          matchingKeys.push(key);
        }

        if (matchingKeys.length > 0) {
          deleted = await client.del(matchingKeys);
          this.log(`Deleted ${deleted} Redis keys matching pattern: ${pattern}`, 'success');
        } else {
          this.log(`No Redis keys found matching: ${pattern}`, 'debug');
        }

      } else if (keys && keys.length > 0) {
        // Delete specific keys
        this.log(`Deleting ${keys.length} Redis keys`, 'info');

        for (const key of keys) {
          try {
            const result = await client.del(key);
            if (result > 0) deleted++;
          } catch (error) {
            this.logError(error, `Failed to delete Redis key: ${key}`);
          }
        }

        this.log(`Deleted ${deleted}/${keys.length} Redis keys`, 'success');
      }

      await client.quit();

      return {
        success: true,
        deleted,
        total: keys?.length || deleted
      };

    } catch (error) {
      this.logError(error, 'Redis rollback failed');
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Rollback file creation
   */
  async rollbackFiles(action) {
    const { files } = action.data;

    if (this.options.dryRun) {
      this.log(`[DRY RUN] Would delete ${files.length} file(s)`, 'info');
      return { success: true, dryRun: true };
    }

    try {
      this.log(`Removing ${files.length} file(s)`, 'info');
      const results = [];

      for (const filePath of files) {
        try {
          if (existsSync(filePath)) {
            await fs.unlink(filePath);
            this.log(`Deleted: ${filePath}`, 'debug');
            results.push({ file: filePath, success: true });
          } else {
            this.log(`File already removed: ${filePath}`, 'debug');
            results.push({ file: filePath, success: true, alreadyDeleted: true });
          }
        } catch (error) {
          this.logError(error, `Failed to delete file: ${filePath}`);
          results.push({ file: filePath, success: false, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      this.log(`Removed ${successCount}/${files.length} files`, 'success');

      return {
        success: successCount > 0,
        results,
        removed: successCount,
        total: files.length
      };

    } catch (error) {
      this.logError(error, 'File rollback failed');
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Rollback directory creation
   */
  async rollbackDirectories(action) {
    const { directories } = action.data;

    if (this.options.dryRun) {
      this.log(`[DRY RUN] Would delete ${directories.length} directory(ies)`, 'info');
      return { success: true, dryRun: true };
    }

    try {
      this.log(`Removing ${directories.length} directory(ies)`, 'info');
      const results = [];

      for (const dirPath of directories) {
        try {
          if (existsSync(dirPath)) {
            await fs.rm(dirPath, { recursive: true, force: true });
            this.log(`Deleted directory: ${dirPath}`, 'debug');
            results.push({ directory: dirPath, success: true });
          } else {
            this.log(`Directory already removed: ${dirPath}`, 'debug');
            results.push({ directory: dirPath, success: true, alreadyDeleted: true });
          }
        } catch (error) {
          this.logError(error, `Failed to delete directory: ${dirPath}`);
          results.push({ directory: dirPath, success: false, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      this.log(`Removed ${successCount}/${directories.length} directories`, 'success');

      return {
        success: successCount > 0,
        results,
        removed: successCount,
        total: directories.length
      };

    } catch (error) {
      this.logError(error, 'Directory rollback failed');
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute rollback for a specific action
   */
  async rollbackAction(action) {
    this.log(`Rolling back: ${action.type} (${action.timestamp})`, 'info');

    switch (action.type) {
      case 'github_repo':
        return await this.rollbackGitHub(action);

      case 'env_vars':
        return await this.rollbackEnv(action);

      case 'redis_keys':
        return await this.rollbackRedis(action);

      case 'files':
        return await this.rollbackFiles(action);

      case 'directories':
        return await this.rollbackDirectories(action);

      default:
        this.log(`Unknown action type: ${action.type}`, 'warning');
        return { success: false, error: 'Unknown action type' };
    }
  }

  /**
   * Execute full rollback from state file
   */
  async rollback(stateOrFile = null) {
    console.log(chalk.bold.yellow('\n🔄 BOSS CLAUDE ROLLBACK\n'));

    try {
      // Load state
      let state;
      if (stateOrFile && typeof stateOrFile === 'string') {
        // Load from custom file
        const content = await fs.readFile(stateOrFile, 'utf8');
        state = JSON.parse(content);
      } else if (stateOrFile && typeof stateOrFile === 'object') {
        // Use provided state
        state = stateOrFile;
      } else {
        // Load from default state file
        state = await this.state.load();
      }

      if (!state || state.actions.length === 0) {
        console.log(chalk.yellow('No setup actions to rollback'));
        return {
          success: true,
          rollbackCount: 0,
          message: 'Nothing to rollback'
        };
      }

      if (state.completed) {
        console.log(chalk.yellow('Setup was marked as completed. Rollback may not be necessary.'));
        console.log(chalk.gray('Use --force to rollback anyway\n'));

        if (!this.options.force) {
          return {
            success: false,
            error: 'Setup already completed. Use --force to rollback anyway.'
          };
        }
      }

      this.log(`Found ${state.actions.length} actions to rollback`, 'info');

      if (this.options.dryRun) {
        console.log(chalk.cyan('\n[DRY RUN MODE - No changes will be made]\n'));
      }

      const results = [];

      // Rollback in reverse order (LIFO)
      for (let i = state.actions.length - 1; i >= 0; i--) {
        const action = state.actions[i];
        const result = await this.rollbackAction(action);
        results.push({ action, result });
      }

      // Summary
      const successful = results.filter(r => r.result.success).length;
      const failed = results.filter(r => !r.result.success && !r.result.skipped).length;
      const skipped = results.filter(r => r.result.skipped).length;

      console.log(chalk.bold('\n📊 Rollback Summary:\n'));
      console.log(chalk.green(`  ✓ Successful: ${successful}`));
      if (skipped > 0) {
        console.log(chalk.blue(`  ⊘ Skipped: ${skipped}`));
      }
      if (failed > 0) {
        console.log(chalk.red(`  ✗ Failed: ${failed}`));
      }

      // Save logs
      await this.saveLogs();

      // Clear state if successful
      if (failed === 0 && !this.options.dryRun) {
        await this.state.clear();
        this.log('Setup state cleared', 'success');
      }

      if (this.errors.length > 0) {
        console.log(chalk.red.bold('\n⚠️  Errors occurred during rollback:\n'));
        this.errors.forEach(err => console.log(chalk.red(`  • ${err}`)));
      }

      console.log(chalk.gray(`\nLogs saved to: ${this.options.logFile}\n`));

      return {
        success: failed === 0,
        total: results.length,
        successful,
        failed,
        skipped,
        results,
        errors: this.errors
      };

    } catch (error) {
      this.logError(error, 'Rollback failed');
      await this.saveLogs();

      console.log(chalk.red.bold('\n✗ Rollback failed\n'));
      console.log(chalk.red(error.message));
      console.log(chalk.gray(`\nLogs saved to: ${this.options.logFile}\n`));

      return {
        success: false,
        error: error.message,
        errors: this.errors
      };
    }
  }

  /**
   * Interactive rollback with confirmation
   */
  async rollbackInteractive() {
    const state = await this.state.load();

    if (!state || state.actions.length === 0) {
      console.log(chalk.yellow('\nNo setup actions found to rollback.\n'));
      return { success: true, rollbackCount: 0 };
    }

    console.log(chalk.bold.yellow('\n🔄 SETUP ROLLBACK\n'));
    console.log(chalk.white(`Found ${state.actions.length} action(s) to rollback:\n`));

    state.actions.forEach((action, index) => {
      console.log(chalk.cyan(`  ${index + 1}. ${action.type}`));
      console.log(chalk.gray(`     ${action.timestamp}`));
    });

    console.log(chalk.yellow('\n⚠️  This will undo the following:\n'));
    console.log(chalk.white('  • Delete created GitHub repositories'));
    console.log(chalk.white('  • Restore .env backups'));
    console.log(chalk.white('  • Clean up Redis keys'));
    console.log(chalk.white('  • Remove temporary files\n'));

    // In a real implementation, you'd use a prompt library here
    // For now, we'll assume user confirmed
    console.log(chalk.gray('To rollback, run: boss-claude rollback --confirm\n'));

    return {
      success: false,
      requiresConfirmation: true,
      actionCount: state.actions.length
    };
  }
}

/**
 * Quick rollback helper for common use cases
 */
export async function quickRollback(options = {}) {
  const manager = new RollbackManager(options);
  return await manager.rollback();
}

/**
 * Create a rollback state snapshot
 */
export async function createSnapshot() {
  const state = new SetupState();
  await state.save();
  return state;
}

/**
 * Record an action for rollback
 */
export async function recordAction(type, data) {
  const state = new SetupState();
  await state.load();
  await state.recordAction(type, data);
  return state;
}

// Export classes and functions
export default {
  RollbackManager,
  SetupState,
  quickRollback,
  createSnapshot,
  recordAction
};
