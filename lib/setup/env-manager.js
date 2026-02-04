#!/usr/bin/env node
/**
 * Boss Claude - Environment Variable Manager
 *
 * Safely manages ~/.boss-claude/.env with:
 * - Read/write operations with validation
 * - Automatic backups before changes
 * - File permission checks (600 for security)
 * - Atomic updates to prevent corruption
 * - Key-value parsing with comments preservation
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';

const ENV_DIR = path.join(os.homedir(), '.boss-claude');
const ENV_FILE = path.join(ENV_DIR, '.env');
const BACKUP_DIR = path.join(ENV_DIR, 'backups');
const SECURE_PERMISSIONS = 0o600; // rw-------

export class EnvManager {
  constructor(envPath = ENV_FILE) {
    this.envPath = envPath;
    this.envDir = path.dirname(envPath);
    this.backupDir = BACKUP_DIR;
  }

  /**
   * Initialize environment file and directories
   */
  async init() {
    try {
      // Create .boss-claude directory if needed
      if (!existsSync(this.envDir)) {
        await fs.mkdir(this.envDir, { recursive: true, mode: 0o700 });
      }

      // Create backup directory
      if (!existsSync(this.backupDir)) {
        await fs.mkdir(this.backupDir, { recursive: true, mode: 0o700 });
      }

      // Create .env if it doesn't exist
      if (!existsSync(this.envPath)) {
        await this._createDefaultEnv();
      }

      // Validate permissions
      await this._validatePermissions();

      return { success: true, path: this.envPath };
    } catch (error) {
      throw new Error(`Failed to initialize env manager: ${error.message}`);
    }
  }

  /**
   * Read and parse .env file
   * @returns {Object} Parsed environment variables with metadata
   */
  async read() {
    try {
      await this._validatePermissions();

      const content = await fs.readFile(this.envPath, 'utf8');
      const parsed = this._parse(content);

      return {
        success: true,
        vars: parsed.vars,
        comments: parsed.comments,
        raw: content,
        path: this.envPath
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          success: true,
          vars: {},
          comments: [],
          raw: '',
          path: this.envPath
        };
      }
      throw new Error(`Failed to read env file: ${error.message}`);
    }
  }

  /**
   * Set or update an environment variable
   * @param {string} key - Variable name
   * @param {string} value - Variable value
   * @param {Object} options - Options (comment, skipBackup)
   */
  async set(key, value, options = {}) {
    try {
      this._validateKey(key);
      this._validateValue(value);

      // Create backup unless skipped
      if (!options.skipBackup) {
        await this._createBackup();
      }

      const current = await this.read();
      const lines = current.raw.split('\n');
      let updated = false;
      const newLines = [];

      // Try to update existing key
      for (const line of lines) {
        if (line.trim().startsWith('#') || line.trim() === '') {
          newLines.push(line);
          continue;
        }

        const match = line.match(/^([^=]+)=(.*)$/);
        if (match && match[1].trim() === key) {
          // Update existing key
          const formattedValue = this._formatValue(value);
          let newLine = `${key}=${formattedValue}`;

          if (options.comment) {
            newLine += ` # ${options.comment}`;
          }

          newLines.push(newLine);
          updated = true;
        } else {
          newLines.push(line);
        }
      }

      // Add new key if not found
      if (!updated) {
        if (newLines.length > 0 && newLines[newLines.length - 1] !== '') {
          newLines.push(''); // Add blank line before new entry
        }

        if (options.comment) {
          newLines.push(`# ${options.comment}`);
        }

        const formattedValue = this._formatValue(value);
        newLines.push(`${key}=${formattedValue}`);
      }

      // Write atomically
      await this._writeAtomic(newLines.join('\n'));

      return {
        success: true,
        action: updated ? 'updated' : 'added',
        key,
        value,
        path: this.envPath
      };
    } catch (error) {
      throw new Error(`Failed to set ${key}: ${error.message}`);
    }
  }

  /**
   * Remove an environment variable
   * @param {string} key - Variable name to remove
   * @param {Object} options - Options (skipBackup)
   */
  async remove(key, options = {}) {
    try {
      this._validateKey(key);

      // Create backup unless skipped
      if (!options.skipBackup) {
        await this._createBackup();
      }

      const current = await this.read();

      if (!current.vars[key]) {
        return {
          success: false,
          error: 'Key not found',
          key
        };
      }

      const lines = current.raw.split('\n');
      const newLines = [];
      let removed = false;
      let skipNextComment = false;

      // Remove key and its associated comment if it's directly above
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trim().startsWith('#')) {
          // Check if next line is the key we're removing
          const nextLine = lines[i + 1];
          if (nextLine) {
            const match = nextLine.match(/^([^=]+)=(.*)$/);
            if (match && match[1].trim() === key) {
              skipNextComment = true;
              continue;
            }
          }
          newLines.push(line);
          continue;
        }

        const match = line.match(/^([^=]+)=(.*)$/);
        if (match && match[1].trim() === key) {
          removed = true;
          continue; // Skip this line
        }

        newLines.push(line);
      }

      // Clean up multiple consecutive blank lines
      const cleaned = this._cleanBlankLines(newLines);

      await this._writeAtomic(cleaned.join('\n'));

      return {
        success: true,
        action: 'removed',
        key,
        path: this.envPath
      };
    } catch (error) {
      throw new Error(`Failed to remove ${key}: ${error.message}`);
    }
  }

  /**
   * Bulk update multiple variables
   * @param {Object} vars - Key-value pairs to set
   * @param {Object} options - Options (skipBackup)
   */
  async bulkSet(vars, options = {}) {
    try {
      // Create single backup for all operations
      if (!options.skipBackup) {
        await this._createBackup();
      }

      const results = [];

      for (const [key, value] of Object.entries(vars)) {
        const result = await this.set(key, value, { skipBackup: true });
        results.push(result);
      }

      return {
        success: true,
        results,
        count: results.length,
        path: this.envPath
      };
    } catch (error) {
      throw new Error(`Failed to bulk set: ${error.message}`);
    }
  }

  /**
   * Get a specific environment variable
   * @param {string} key - Variable name
   */
  async get(key) {
    try {
      const current = await this.read();

      if (!current.vars[key]) {
        return {
          success: false,
          error: 'Key not found',
          key
        };
      }

      return {
        success: true,
        key,
        value: current.vars[key],
        path: this.envPath
      };
    } catch (error) {
      throw new Error(`Failed to get ${key}: ${error.message}`);
    }
  }

  /**
   * List all environment variables
   */
  async list() {
    try {
      const current = await this.read();

      return {
        success: true,
        vars: current.vars,
        count: Object.keys(current.vars).length,
        path: this.envPath
      };
    } catch (error) {
      throw new Error(`Failed to list vars: ${error.message}`);
    }
  }

  /**
   * Restore from a backup
   * @param {string} backupName - Backup file name (or 'latest')
   */
  async restore(backupName = 'latest') {
    try {
      let backupPath;

      if (backupName === 'latest') {
        const backups = await this.listBackups();
        if (backups.length === 0) {
          throw new Error('No backups found');
        }
        backupPath = backups[0].path;
      } else {
        backupPath = path.join(this.backupDir, backupName);
      }

      if (!existsSync(backupPath)) {
        throw new Error(`Backup not found: ${backupName}`);
      }

      const backupContent = await fs.readFile(backupPath, 'utf8');

      // Create backup of current state before restore
      await this._createBackup('pre-restore');

      await this._writeAtomic(backupContent);

      return {
        success: true,
        action: 'restored',
        from: backupPath,
        to: this.envPath
      };
    } catch (error) {
      throw new Error(`Failed to restore: ${error.message}`);
    }
  }

  /**
   * List all backups
   */
  async listBackups() {
    try {
      if (!existsSync(this.backupDir)) {
        return [];
      }

      const files = await fs.readdir(this.backupDir);
      const backups = [];

      for (const file of files) {
        if (!file.startsWith('.env.backup-')) continue;

        const filePath = path.join(this.backupDir, file);
        const stats = await fs.stat(filePath);

        backups.push({
          name: file,
          path: filePath,
          size: stats.size,
          created: stats.mtime,
          timestamp: file.replace('.env.backup-', '').replace('.bak', '')
        });
      }

      // Sort by creation time, newest first
      backups.sort((a, b) => b.created - a.created);

      return backups;
    } catch (error) {
      throw new Error(`Failed to list backups: ${error.message}`);
    }
  }

  /**
   * Clean old backups (keep last N)
   * @param {number} keep - Number of backups to keep (default: 10)
   */
  async cleanBackups(keep = 10) {
    try {
      const backups = await this.listBackups();

      if (backups.length <= keep) {
        return {
          success: true,
          removed: 0,
          kept: backups.length
        };
      }

      const toRemove = backups.slice(keep);

      for (const backup of toRemove) {
        await fs.unlink(backup.path);
      }

      return {
        success: true,
        removed: toRemove.length,
        kept: keep
      };
    } catch (error) {
      throw new Error(`Failed to clean backups: ${error.message}`);
    }
  }

  /**
   * Validate file permissions
   */
  async validatePermissions() {
    return await this._validatePermissions();
  }

  /**
   * Fix file permissions to secure mode (600)
   */
  async fixPermissions() {
    try {
      await fs.chmod(this.envPath, SECURE_PERMISSIONS);

      return {
        success: true,
        permissions: '600',
        path: this.envPath
      };
    } catch (error) {
      throw new Error(`Failed to fix permissions: ${error.message}`);
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Create default .env file
   */
  async _createDefaultEnv() {
    const defaultContent = `# Boss Claude Environment Configuration
# This file contains sensitive configuration - keep permissions at 600
# Auto-generated on ${new Date().toISOString()}

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Database Configuration (if used)
# DATABASE_URL=

# API Keys (add as needed)
# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=

# Boss Claude Settings
BOSS_CLAUDE_DEBUG=false
`;

    await fs.writeFile(this.envPath, defaultContent, { mode: SECURE_PERMISSIONS });
  }

  /**
   * Parse .env file content
   */
  _parse(content) {
    const vars = {};
    const comments = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Capture comments
      if (trimmed.startsWith('#')) {
        comments.push(trimmed.substring(1).trim());
        continue;
      }

      // Skip empty lines
      if (trimmed === '') continue;

      // Parse key=value
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();

        // Remove inline comments
        const commentIndex = value.indexOf('#');
        if (commentIndex > 0) {
          value = value.substring(0, commentIndex).trim();
        }

        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        vars[key] = value;
      }
    }

    return { vars, comments };
  }

  /**
   * Format value for .env file (add quotes if needed)
   */
  _formatValue(value) {
    const stringValue = String(value);

    // Add quotes if value contains spaces or special characters
    if (stringValue.includes(' ') ||
        stringValue.includes('#') ||
        stringValue.includes('$') ||
        stringValue.includes('\\')) {
      return `"${stringValue.replace(/"/g, '\\"')}"`;
    }

    return stringValue;
  }

  /**
   * Validate key name
   */
  _validateKey(key) {
    if (!key || typeof key !== 'string') {
      throw new Error('Key must be a non-empty string');
    }

    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
      throw new Error('Key must contain only letters, numbers, and underscores');
    }
  }

  /**
   * Validate value
   */
  _validateValue(value) {
    if (value === undefined || value === null) {
      throw new Error('Value cannot be undefined or null');
    }
  }

  /**
   * Create backup of current .env file
   */
  async _createBackup(suffix = '') {
    try {
      if (!existsSync(this.envPath)) {
        return null; // Nothing to backup
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = suffix
        ? `.env.backup-${timestamp}-${suffix}.bak`
        : `.env.backup-${timestamp}.bak`;
      const backupPath = path.join(this.backupDir, backupName);

      const content = await fs.readFile(this.envPath, 'utf8');
      await fs.writeFile(backupPath, content, { mode: SECURE_PERMISSIONS });

      // Clean old backups (keep last 10)
      await this.cleanBackups(10);

      return backupPath;
    } catch (error) {
      console.warn(`Warning: Failed to create backup: ${error.message}`);
      return null;
    }
  }

  /**
   * Write file atomically (write to temp, then rename)
   */
  async _writeAtomic(content) {
    const tempPath = `${this.envPath}.tmp.${Date.now()}`;

    try {
      // Write to temp file
      await fs.writeFile(tempPath, content, { mode: SECURE_PERMISSIONS });

      // Atomic rename
      await fs.rename(tempPath, this.envPath);

      // Ensure permissions
      await fs.chmod(this.envPath, SECURE_PERMISSIONS);
    } catch (error) {
      // Cleanup temp file on error
      try {
        await fs.unlink(tempPath);
      } catch {}

      throw error;
    }
  }

  /**
   * Validate and fix file permissions
   */
  async _validatePermissions() {
    try {
      if (!existsSync(this.envPath)) {
        return { valid: true, permissions: null };
      }

      const stats = await fs.stat(this.envPath);
      const mode = stats.mode & 0o777;
      const expected = SECURE_PERMISSIONS;

      if (mode !== expected) {
        console.warn(`Warning: .env has insecure permissions (${mode.toString(8)}), fixing to 600`);
        await fs.chmod(this.envPath, expected);

        return {
          valid: false,
          fixed: true,
          oldPermissions: mode.toString(8),
          newPermissions: expected.toString(8)
        };
      }

      return {
        valid: true,
        permissions: mode.toString(8)
      };
    } catch (error) {
      throw new Error(`Permission validation failed: ${error.message}`);
    }
  }

  /**
   * Clean up multiple consecutive blank lines
   */
  _cleanBlankLines(lines) {
    const cleaned = [];
    let prevBlank = false;

    for (const line of lines) {
      const isBlank = line.trim() === '';

      if (isBlank && prevBlank) {
        continue; // Skip consecutive blank lines
      }

      cleaned.push(line);
      prevBlank = isBlank;
    }

    // Remove trailing blank lines
    while (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === '') {
      cleaned.pop();
    }

    return cleaned;
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

export async function runCLI() {
  const args = process.argv.slice(2);
  const command = args[0];
  const manager = new EnvManager();

  try {
    await manager.init();

    switch (command) {
      case 'get':
        if (!args[1]) {
          console.error('Usage: env-manager.js get <key>');
          process.exit(1);
        }
        const getResult = await manager.get(args[1]);
        if (getResult.success) {
          console.log(getResult.value);
        } else {
          console.error(`Error: ${getResult.error}`);
          process.exit(1);
        }
        break;

      case 'set':
        if (!args[1] || !args[2]) {
          console.error('Usage: env-manager.js set <key> <value> [comment]');
          process.exit(1);
        }
        const setResult = await manager.set(args[1], args[2], {
          comment: args[3]
        });
        console.log(`✓ ${setResult.action} ${setResult.key}`);
        break;

      case 'remove':
      case 'rm':
        if (!args[1]) {
          console.error('Usage: env-manager.js remove <key>');
          process.exit(1);
        }
        const rmResult = await manager.remove(args[1]);
        if (rmResult.success) {
          console.log(`✓ Removed ${rmResult.key}`);
        } else {
          console.error(`Error: ${rmResult.error}`);
          process.exit(1);
        }
        break;

      case 'list':
      case 'ls':
        const listResult = await manager.list();
        console.log(`Environment variables (${listResult.count}):`);
        for (const [key, value] of Object.entries(listResult.vars)) {
          const displayValue = value.length > 50
            ? value.substring(0, 47) + '...'
            : value;
          console.log(`  ${key}=${displayValue}`);
        }
        break;

      case 'backups':
        const backups = await manager.listBackups();
        console.log(`Backups (${backups.length}):`);
        backups.forEach((b, i) => {
          console.log(`  ${i + 1}. ${b.name} (${b.created.toLocaleString()})`);
        });
        break;

      case 'restore':
        const restoreResult = await manager.restore(args[1] || 'latest');
        console.log(`✓ Restored from backup`);
        break;

      case 'validate':
        const validation = await manager.validatePermissions();
        if (validation.valid) {
          console.log(`✓ Permissions are secure (${validation.permissions})`);
        } else if (validation.fixed) {
          console.log(`✓ Fixed permissions: ${validation.oldPermissions} → ${validation.newPermissions}`);
        }
        break;

      default:
        console.log(`Boss Claude Environment Manager

Usage:
  env-manager.js get <key>              Get a variable
  env-manager.js set <key> <value>      Set a variable
  env-manager.js remove <key>           Remove a variable
  env-manager.js list                   List all variables
  env-manager.js backups                List backups
  env-manager.js restore [name]         Restore from backup
  env-manager.js validate               Check permissions

Location: ${manager.envPath}
`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run CLI if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runCLI();
}
