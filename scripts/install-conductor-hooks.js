#!/usr/bin/env node
/**
 * INSTALL CONDUCTOR HOOKS - Runtime Integration Script
 *
 * Installs pre-hook system into Claude Code for CONDUCTOR agent.
 * This script patches tool execution to enforce delegation rules.
 *
 * USAGE:
 *   node scripts/install-conductor-hooks.js [--force]
 *   npm run install:conductor-hooks
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.dirname(__dirname);

// Hook installation targets
const HOOK_TARGETS = {
  // Global Claude Code config (if exists)
  claudeConfig: path.join(process.env.HOME, '.claude', 'config.json'),

  // Project-level hook config
  projectHook: path.join(projectRoot, '.claude-hooks', 'conductor-pre-hook.json'),

  // NPM package bin
  npmBin: path.join(projectRoot, 'bin', 'conductor-guard.js')
};

/**
 * Install CONDUCTOR pre-hook configuration
 */
async function installHooks(options = {}) {
  console.log(chalk.blue('\n🔧 Installing CONDUCTOR Pre-Hook System\n'));

  const spinner = ora('Checking environment...').start();

  try {
    // 1. Create hook directory
    spinner.text = 'Creating hook directory...';
    await createHookDirectory();
    spinner.succeed('Hook directory created');

    // 2. Install hook configuration
    spinner.start('Installing hook configuration...');
    await installHookConfig(options);
    spinner.succeed('Hook configuration installed');

    // 3. Make executables executable
    spinner.start('Setting executable permissions...');
    await setExecutablePermissions();
    spinner.succeed('Executable permissions set');

    // 4. Create symlinks (if needed)
    spinner.start('Creating symlinks...');
    await createSymlinks();
    spinner.succeed('Symlinks created');

    // 5. Verify installation
    spinner.start('Verifying installation...');
    const verified = await verifyInstallation();

    if (verified) {
      spinner.succeed('Installation verified');
    } else {
      spinner.warn('Installation verification failed - may need manual setup');
    }

    // Success summary
    console.log(chalk.green('\n✅ CONDUCTOR Pre-Hook System Installed Successfully\n'));

    printUsageInstructions();

  } catch (error) {
    spinner.fail('Installation failed');
    console.error(chalk.red(`\nError: ${error.message}\n`));

    if (error.stack && options.verbose) {
      console.error(chalk.dim(error.stack));
    }

    process.exit(1);
  }
}

/**
 * Create .claude-hooks directory
 */
async function createHookDirectory() {
  const hookDir = path.dirname(HOOK_TARGETS.projectHook);

  try {
    await fs.mkdir(hookDir, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Install hook configuration file
 */
async function installHookConfig(options) {
  const hookConfig = {
    name: 'CONDUCTOR Pre-Hook Tool Interceptor',
    version: '1.0.0',
    enabled: true,
    agent: 'CONDUCTOR',
    interceptor: {
      module: '@cpretzinger/boss-claude/lib/conductor-tool-interceptor.js',
      wrapper: '@cpretzinger/boss-claude/lib/conductor-wrapper.js',
      cli: 'conductor-guard'
    },
    rules: {
      forbiddenTools: [
        'Read',
        'Write',
        'Edit',
        'Bash',
        'Grep',
        'Glob',
        'NotebookEdit'
      ],
      allowedTools: [
        'Task',
        'WebFetch',
        'WebSearch',
        'TodoWrite',
        'Skill'
      ],
      delegationTarget: 'Task',
      enforceStrict: true
    },
    logging: {
      enabled: true,
      violations: true,
      delegations: true,
      overrides: true
    },
    created: new Date().toISOString(),
    installedBy: process.env.USER || 'unknown'
  };

  // Check if config already exists
  try {
    const existing = await fs.readFile(HOOK_TARGETS.projectHook, 'utf-8');
    const existingConfig = JSON.parse(existing);

    if (!options.force && existingConfig.enabled) {
      console.log(chalk.yellow('\n⚠️  Hook configuration already exists'));
      console.log(chalk.dim('Use --force to overwrite'));
      return;
    }
  } catch (error) {
    // File doesn't exist - continue with installation
  }

  // Write configuration
  await fs.writeFile(
    HOOK_TARGETS.projectHook,
    JSON.stringify(hookConfig, null, 2),
    'utf-8'
  );
}

/**
 * Set executable permissions on scripts
 */
async function setExecutablePermissions() {
  const executables = [
    path.join(projectRoot, 'bin', 'conductor-guard.sh'),
    path.join(projectRoot, 'bin', 'conductor-guard.js'),
    path.join(projectRoot, 'lib', 'conductor-tool-interceptor.js'),
    path.join(projectRoot, 'lib', 'conductor-wrapper.js')
  ];

  for (const exe of executables) {
    try {
      await fs.chmod(exe, 0o755);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

/**
 * Create symlinks for easy access
 */
async function createSymlinks() {
  // Symlink conductor-guard to project node_modules/.bin
  const binDir = path.join(projectRoot, 'node_modules', '.bin');

  try {
    await fs.mkdir(binDir, { recursive: true });

    const symlinkTarget = path.join(binDir, 'conductor-guard');
    const symlinkSource = path.join(projectRoot, 'bin', 'conductor-guard.js');

    try {
      await fs.symlink(symlinkSource, symlinkTarget);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        // Symlink already exists or can't be created - not critical
      }
    }
  } catch (error) {
    // Not critical if symlinks fail
  }
}

/**
 * Verify installation
 */
async function verifyInstallation() {
  const checks = [];

  // Check hook config exists
  try {
    await fs.access(HOOK_TARGETS.projectHook);
    checks.push({ name: 'Hook config', status: true });
  } catch (error) {
    checks.push({ name: 'Hook config', status: false });
  }

  // Check interceptor module exists
  try {
    await fs.access(path.join(projectRoot, 'lib', 'conductor-tool-interceptor.js'));
    checks.push({ name: 'Interceptor module', status: true });
  } catch (error) {
    checks.push({ name: 'Interceptor module', status: false });
  }

  // Check wrapper module exists
  try {
    await fs.access(path.join(projectRoot, 'lib', 'conductor-wrapper.js'));
    checks.push({ name: 'Wrapper module', status: true });
  } catch (error) {
    checks.push({ name: 'Wrapper module', status: false });
  }

  // Check CLI exists
  try {
    await fs.access(path.join(projectRoot, 'bin', 'conductor-guard.js'));
    checks.push({ name: 'CLI tool', status: true });
  } catch (error) {
    checks.push({ name: 'CLI tool', status: false });
  }

  const allPassed = checks.every(c => c.status);

  if (!allPassed) {
    console.log(chalk.yellow('\n⚠️  Verification Issues:'));
    checks.forEach(check => {
      const icon = check.status ? chalk.green('✓') : chalk.red('✗');
      console.log(`  ${icon} ${check.name}`);
    });
  }

  return allPassed;
}

/**
 * Print usage instructions
 */
function printUsageInstructions() {
  console.log(chalk.cyan('📚 USAGE INSTRUCTIONS:\n'));

  console.log(chalk.white('1. Programmatic Integration:'));
  console.log(chalk.dim('   import conductorWrapper from "@cpretzinger/boss-claude/lib/conductor-wrapper.js";'));
  console.log(chalk.dim('   const result = await conductorWrapper.executeTool("Read", { file_path: "..." });'));
  console.log();

  console.log(chalk.white('2. CLI Usage:'));
  console.log(chalk.dim('   npx conductor-guard check Read'));
  console.log(chalk.dim('   npx conductor-guard intercept Bash --params \'{"command":"npm install"}\''));
  console.log(chalk.dim('   npx conductor-guard report'));
  console.log();

  console.log(chalk.white('3. Shell Script:'));
  console.log(chalk.dim('   ./bin/conductor-guard.sh --tool Read --file /path/to/file.js'));
  console.log(chalk.dim('   ./bin/conductor-guard.sh --list-forbidden'));
  console.log();

  console.log(chalk.white('4. Configuration:'));
  console.log(chalk.dim(`   Edit: ${HOOK_TARGETS.projectHook}`));
  console.log();

  console.log(chalk.green('✅ Pre-hooks are now active for CONDUCTOR agent\n'));
}

/**
 * Uninstall hooks
 */
async function uninstallHooks() {
  console.log(chalk.yellow('\n🗑️  Uninstalling CONDUCTOR Pre-Hook System\n'));

  const spinner = ora('Removing hook configuration...').start();

  try {
    // Remove hook config
    try {
      await fs.unlink(HOOK_TARGETS.projectHook);
      spinner.succeed('Hook configuration removed');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      spinner.warn('Hook configuration not found');
    }

    // Remove hook directory if empty
    try {
      const hookDir = path.dirname(HOOK_TARGETS.projectHook);
      await fs.rmdir(hookDir);
    } catch (error) {
      // Directory not empty or doesn't exist - ignore
    }

    console.log(chalk.green('\n✅ CONDUCTOR Pre-Hook System Uninstalled\n'));

  } catch (error) {
    spinner.fail('Uninstallation failed');
    console.error(chalk.red(`\nError: ${error.message}\n`));
    process.exit(1);
  }
}

/**
 * Main CLI
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const options = {
    force: args.includes('--force'),
    verbose: args.includes('--verbose')
  };

  switch (command) {
    case 'uninstall':
    case 'remove':
      await uninstallHooks();
      break;

    case 'verify':
      await verifyInstallation();
      break;

    case 'install':
    default:
      await installHooks(options);
      break;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

export { installHooks, uninstallHooks, verifyInstallation };
