#!/usr/bin/env node

/**
 * Boss Claude PUBLIC CLI
 *
 * This is the public CLI that ships with the npm package.
 * It includes only safe, free-tier commands.
 *
 * PRO features require an upgrade at https://buy.stripe.com/6oU00k2roeRY7TJgEe3AY00
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { loadIdentity } from '../lib/identity.js';
import { loadSession, saveSession } from '../lib/session.js';
import { searchMemory, saveMemory } from '../lib/memory.js';
import { cleanup } from '../lib/cleanup.js';
import dotenv from 'dotenv';
import { join } from 'path';
import os from 'os';
import { existsSync, readFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Load environment variables
const envPath = join(os.homedir(), '.boss-claude', '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Package version
let packageVersion = '2.0.0';
try {
  const packageJsonPath = join(new URL('.', import.meta.url).pathname, '..', 'package.json');
  if (existsSync(packageJsonPath)) {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    packageVersion = pkg.version;
  }
} catch (e) {
  // Use default version
}

// Stripe payment links
const STRIPE_PRO_MONTHLY = 'https://buy.stripe.com/6oU00k2roeRY7TJgEe3AY00';
const STRIPE_PRO_ANNUAL = 'https://buy.stripe.com/dRm28s7LIcJQde39bM3AY01';
const STRIPE_TEAM_MONTHLY = 'https://buy.stripe.com/28E9AUd62fW2a1R4Vw3AY02';
const STRIPE_TEAM_ANNUAL = 'https://buy.stripe.com/cNi8wQ5DAdNUgqf3Rs3AY03';

/**
 * Helper function for clean exit
 */
async function cleanExit(code = 0) {
  const forceExitTimer = setTimeout(() => process.exit(code), 1500);
  forceExitTimer.unref();

  try {
    await cleanup();
  } catch (e) {
    // Ignore cleanup errors
  }

  clearTimeout(forceExitTimer);
  process.exit(code);
}

/**
 * Show PRO feature required message
 */
function showProRequired(featureName = 'This feature') {
  console.log(chalk.yellow(`\n  * ${featureName} requires Boss Claude PRO\n`));
  console.log(chalk.white(`  Upgrade at: ${chalk.cyan(STRIPE_PRO_MONTHLY)}`));
  console.log(chalk.gray(`\n  Or run: ${chalk.white('boss-claude upgrade')}\n`));
}

/**
 * Get current repository info
 */
async function getCurrentRepo() {
  try {
    const { stdout: repoPath } = await execAsync('git rev-parse --show-toplevel');
    const { stdout: repoUrl } = await execAsync('git config --get remote.origin.url');
    const repoName = repoUrl.trim().split('/').pop().replace('.git', '');
    return {
      name: repoName,
      path: repoPath.trim(),
      url: repoUrl.trim()
    };
  } catch (error) {
    return null;
  }
}

// Create CLI program
const program = new Command();

program
  .name('boss-claude')
  .description('Boss Claude - AI-Powered Development Assistant')
  .version(packageVersion);

// =============================================================================
// INIT COMMAND - Setup wizard
// =============================================================================
program
  .command('init')
  .description('Run the Boss Claude setup wizard')
  .action(async () => {
    try {
      // Dynamic import to avoid loading heavy setup modules unless needed
      const { spawn } = await import('child_process');
      const wizardPath = join(new URL('.', import.meta.url).pathname, 'setup-wizard.js');

      if (existsSync(wizardPath)) {
        const wizard = spawn('node', [wizardPath], { stdio: 'inherit' });
        wizard.on('close', (code) => process.exit(code));
      } else {
        console.log(chalk.red('\nSetup wizard not found.'));
        console.log(chalk.gray('Please reinstall boss-claude: npm install -g boss-claude\n'));
        await cleanExit(1);
      }
    } catch (error) {
      console.error(chalk.red('Setup failed:'), error.message);
      await cleanExit(1);
    }
  });

// =============================================================================
// STATUS COMMAND - Simplified status display
// =============================================================================
program
  .command('status')
  .description('Show your Boss Claude status')
  .action(async () => {
    try {
      const identity = await loadIdentity();
      const repo = await getCurrentRepo();

      // Calculate XP progress
      const xpToNextLevel = identity.level * 100;
      const xpProgress = Math.floor((identity.xp / xpToNextLevel) * 100);

      // Build progress bar
      const progressBarWidth = 20;
      const filledBars = Math.floor((identity.xp / xpToNextLevel) * progressBarWidth);
      const emptyBars = progressBarWidth - filledBars;
      const progressBar = chalk.green('='.repeat(filledBars)) + chalk.gray('-'.repeat(emptyBars));

      console.log(chalk.cyan(`
  =============================================
         BOSS CLAUDE STATUS
  =============================================
`));

      console.log(chalk.white(`  Level:    ${chalk.yellow(identity.level)}`));
      console.log(chalk.white(`  XP:       ${chalk.green(identity.xp)}/${xpToNextLevel} [${progressBar}] ${xpProgress}%`));
      console.log(chalk.white(`  Sessions: ${chalk.blue(identity.total_sessions)}`));
      console.log(chalk.white(`  Balance:  ${chalk.green('$' + (identity.balance || 0).toFixed(2))}`));

      if (repo) {
        console.log(chalk.gray(`\n  Repository: ${repo.name}`));
      }

      console.log(chalk.gray(`
  ---------------------------------------------
  Commands: init | status | recall | save | help

  Want more? Run: boss-claude upgrade
  =============================================
`));

      await cleanExit(0);
    } catch (error) {
      console.error(chalk.red('Error loading status:'), error.message);
      await cleanExit(1);
    }
  });

// =============================================================================
// RECALL COMMAND - Memory search
// =============================================================================
program
  .command('recall [query]')
  .description('Search your session memory')
  .option('-l, --limit <number>', 'Maximum results to return', '5')
  .action(async (query, options) => {
    if (!query) {
      console.log(chalk.yellow('\nUsage: boss-claude recall <search query>\n'));
      console.log(chalk.gray('Examples:'));
      console.log(chalk.gray('  boss-claude recall "authentication"'));
      console.log(chalk.gray('  boss-claude recall "bug fix" --limit 10\n'));
      await cleanExit(0);
      return;
    }

    try {
      console.log(chalk.gray(`\nSearching memories for: "${query}"...\n`));

      const results = await searchMemory(query, parseInt(options.limit) || 5);

      if (results.length === 0) {
        console.log(chalk.yellow('No memories found matching your query.\n'));
        console.log(chalk.gray('Tip: Try broader search terms or check your spelling.\n'));
      } else {
        console.log(chalk.green(`Found ${results.length} memory(s):\n`));

        results.forEach((memory, index) => {
          const date = new Date(memory.created_at).toLocaleDateString();
          console.log(chalk.cyan(`${index + 1}. ${memory.title}`));
          console.log(chalk.gray(`   Date: ${date}`));
          if (memory.labels && memory.labels.length > 0) {
            console.log(chalk.gray(`   Tags: ${memory.labels.join(', ')}`));
          }
          if (memory.summary) {
            const shortSummary = memory.summary.substring(0, 100).replace(/\n/g, ' ');
            console.log(chalk.gray(`   ${shortSummary}${memory.summary.length > 100 ? '...' : ''}`));
          }
          console.log();
        });
      }

      await cleanExit(0);
    } catch (error) {
      console.error(chalk.red('Error searching memory:'), error.message);
      console.log(chalk.gray('\nMake sure you have run: boss-claude init\n'));
      await cleanExit(1);
    }
  });

// =============================================================================
// SAVE COMMAND - Save session memory
// =============================================================================
program
  .command('save [note]')
  .description('Save your current session to memory')
  .option('-t, --tags <tags>', 'Comma-separated tags for this memory')
  .action(async (note, options) => {
    try {
      const repo = await getCurrentRepo();

      if (!repo) {
        console.log(chalk.yellow('\nNot in a git repository.'));
        console.log(chalk.gray('Please run this command from within a git project.\n'));
        await cleanExit(1);
        return;
      }

      const summary = note || `Session saved for ${repo.name}`;
      const tags = options.tags || '';

      console.log(chalk.gray(`\nSaving session for ${repo.name}...\n`));

      const result = await saveSession(summary, tags);

      console.log(chalk.green('Session saved successfully!\n'));
      console.log(chalk.white(`  Issue: #${result.issue_number}`));
      console.log(chalk.white(`  XP Earned: ${chalk.green('+' + result.xp_earned)}`));
      console.log(chalk.gray(`  URL: ${result.url}\n`));

      await cleanExit(0);
    } catch (error) {
      console.error(chalk.red('Error saving session:'), error.message);
      console.log(chalk.gray('\nMake sure you have run: boss-claude init\n'));
      await cleanExit(1);
    }
  });

// =============================================================================
// HELP COMMAND - Show available commands
// =============================================================================
program
  .command('help')
  .description('Show available commands')
  .action(async () => {
    console.log(chalk.cyan(`
  =============================================
         BOSS CLAUDE - HELP
  =============================================

  ${chalk.white('Available Commands:')}

  ${chalk.green('init')}          Run the setup wizard
  ${chalk.green('status')}        Show your level, XP, and session count
  ${chalk.green('recall')} <query> Search your session memory
  ${chalk.green('save')} [note]   Save current session to memory
  ${chalk.green('upgrade')}       View pricing and upgrade options
  ${chalk.green('help')}          Show this help message

  ${chalk.yellow('PRO Features:')}

  Advanced analytics, semantic memory search,
  efficiency tracking, 50+ power commands, and more.

  Run ${chalk.cyan('boss-claude upgrade')} for details.

  =============================================
`));
    await cleanExit(0);
  });

// =============================================================================
// UPGRADE COMMAND - Show pricing
// =============================================================================
program
  .command('upgrade')
  .description('View Boss Claude pricing and upgrade options')
  .action(async () => {
    console.log(chalk.cyan('\n🚀 BOSS CLAUDE - UPGRADE\n'));
    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

    // PRO TIER
    console.log(chalk.yellow('PRO') + chalk.white(' - $15/month (or $120/year - save 2 months!)'));
    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.green('✓') + ' Semantic memory search (Qdrant AI)');
    console.log(chalk.green('✓') + ' Advanced analytics dashboard');
    console.log(chalk.green('✓') + ' 50+ power commands');
    console.log(chalk.green('✓') + ' 1-year session history');
    console.log(chalk.green('✓') + ' Priority support\n');
    console.log(chalk.white('→ Monthly: ') + chalk.cyan(STRIPE_PRO_MONTHLY));
    console.log(chalk.white('→ Annual:  ') + chalk.cyan(STRIPE_PRO_ANNUAL));
    console.log(chalk.gray('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

    // TEAM TIER
    console.log(chalk.yellow('TEAM') + chalk.white(' - $79/month (5 seats)'));
    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.green('✓') + ' Everything in PRO');
    console.log(chalk.green('✓') + ' 5 team member seats');
    console.log(chalk.green('✓') + ' Shared work orders');
    console.log(chalk.green('✓') + ' Team broadcast messaging');
    console.log(chalk.green('✓') + ' Team leaderboards\n');
    console.log(chalk.white('→ Monthly: ') + chalk.cyan(STRIPE_TEAM_MONTHLY));
    console.log(chalk.white('→ Annual:  ') + chalk.cyan(STRIPE_TEAM_ANNUAL));
    console.log(chalk.gray('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

    // ENTERPRISE TIER
    console.log(chalk.yellow('ENTERPRISE') + chalk.white(' - Custom pricing'));
    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.green('✓') + ' Unlimited team members');
    console.log(chalk.green('✓') + ' Custom RBAC & compliance');
    console.log(chalk.green('✓') + ' Federated team memory');
    console.log(chalk.green('✓') + ' API access & webhooks');
    console.log(chalk.green('✓') + ' Dedicated support\n');
    console.log(chalk.white('→ Contact: ') + chalk.cyan('sales@boss-claude.dev'));
    console.log(chalk.gray('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

    await cleanExit(0);
  });

// =============================================================================
// PRO-ONLY COMMANDS (Show upgrade message)
// =============================================================================

const proOnlyCommands = [
  { name: 'watch', description: 'Monitor agent activity in real-time' },
  { name: 'checkpoint', description: 'Create and manage session checkpoints' },
  { name: 'agent:kill', description: 'Kill stuck or runaway agents' },
  { name: 'agent:kill-all', description: 'Kill all running agents' },
  { name: 'hierarchy', description: 'View agent hierarchy and delegation chain' },
  { name: 'efficiency', description: 'View detailed efficiency analytics' },
  { name: 'set-name', description: 'Set your conductor name' },
  { name: 'terminals', description: 'View active terminal sessions' },
  { name: 'send', description: 'Send messages between terminals' },
  { name: 'broadcast', description: 'Broadcast to all terminals' },
  { name: 'inbox', description: 'View terminal inbox messages' },
  { name: 'context', description: 'Generate project context' },
  { name: 'skills', description: 'List and load skills' },
  { name: 'work-orders', description: 'Manage work orders' }
];

// Register PRO-only commands that show upgrade message
proOnlyCommands.forEach(cmd => {
  program
    .command(cmd.name)
    .description(`${cmd.description} (PRO)`)
    .allowUnknownOption(true)
    .action(async () => {
      showProRequired(cmd.description);
      await cleanExit(0);
    });
});

// =============================================================================
// CATCH-ALL for unknown commands
// =============================================================================
program.on('command:*', async (operands) => {
  console.log(chalk.red(`\nUnknown command: ${operands[0]}\n`));
  console.log(chalk.gray('Run "boss-claude help" to see available commands.\n'));
  await cleanExit(1);
});

// Parse arguments and run
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
