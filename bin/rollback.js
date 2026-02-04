#!/usr/bin/env node
/**
 * BOSS CLAUDE - Rollback CLI
 * Undo setup changes safely
 */

import { RollbackManager } from '../lib/setup/rollback.js';
import chalk from 'chalk';

const args = process.argv.slice(2);

// Parse command line arguments
const options = {
  verbose: args.includes('--verbose') || args.includes('-v'),
  dryRun: args.includes('--dry-run') || args.includes('-d'),
  force: args.includes('--force') || args.includes('-f'),
  confirm: args.includes('--confirm') || args.includes('-y'),
  help: args.includes('--help') || args.includes('-h')
};

// Show help
if (options.help || args.includes('help')) {
  console.log(chalk.bold.cyan('\n🔄 BOSS CLAUDE ROLLBACK\n'));
  console.log(chalk.white('Safely undo setup changes\n'));
  console.log(chalk.bold('Usage:\n'));
  console.log(chalk.white('  boss-claude rollback [options]\n'));
  console.log(chalk.bold('Options:\n'));
  console.log(chalk.white('  --confirm, -y      Confirm rollback without prompts'));
  console.log(chalk.white('  --dry-run, -d      Show what would be rolled back (no changes)'));
  console.log(chalk.white('  --force, -f        Force rollback even if setup completed'));
  console.log(chalk.white('  --verbose, -v      Show detailed progress'));
  console.log(chalk.white('  --help, -h         Show this help message\n'));
  console.log(chalk.bold('Examples:\n'));
  console.log(chalk.gray('  # Preview rollback'));
  console.log(chalk.cyan('  boss-claude rollback --dry-run\n'));
  console.log(chalk.gray('  # Execute rollback'));
  console.log(chalk.cyan('  boss-claude rollback --confirm\n'));
  console.log(chalk.gray('  # Force rollback with verbose output'));
  console.log(chalk.cyan('  boss-claude rollback --force --verbose\n'));
  process.exit(0);
}

// Execute rollback
async function main() {
  const manager = new RollbackManager(options);

  if (!options.confirm && !options.dryRun) {
    // Interactive mode
    const result = await manager.rollbackInteractive();

    if (result.requiresConfirmation) {
      console.log(chalk.yellow('Add --confirm to execute rollback\n'));
      process.exit(0);
    }

    if (result.success) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  }

  // Execute rollback
  const result = await manager.rollback();

  if (result.success) {
    console.log(chalk.green.bold('✓ Rollback completed successfully\n'));
    process.exit(0);
  } else {
    console.log(chalk.red.bold('✗ Rollback failed\n'));
    if (result.error) {
      console.log(chalk.red(result.error + '\n'));
    }
    process.exit(1);
  }
}

main().catch(error => {
  console.error(chalk.red.bold('\n✗ Rollback error\n'));
  console.error(chalk.red(error.message));
  if (options.verbose && error.stack) {
    console.error(chalk.gray('\n' + error.stack));
  }
  process.exit(1);
});
