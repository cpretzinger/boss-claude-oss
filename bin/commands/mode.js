#!/usr/bin/env node

/**
 * BOSS CLAUDE MODE COMMAND
 *
 * Usage:
 *   boss-claude mode                    # Show current mode
 *   boss-claude mode orchestrator       # Switch to orchestrator mode
 *   boss-claude mode specialist         # Switch to specialist mode
 *   boss-claude mode worker             # Switch to worker mode
 *   boss-claude mode review             # Switch to review mode
 *   boss-claude mode learning           # Switch to learning mode
 *   boss-claude mode history            # Show mode change history
 *   boss-claude mode stats              # Show mode statistics
 *   boss-claude mode blocked            # Show blocked actions
 *   boss-claude mode reset              # Emergency reset to safe default
 */

import { getEnforcer, MODES } from '../../lib/mode-enforcer.js';
import { getGate } from '../../lib/orchestrator-gate.js';
import chalk from 'chalk';

export async function modeCommand(args) {
  const enforcer = getEnforcer();
  const gate = getGate();

  // No args - show current mode
  if (!args || args.length === 0) {
    await showCurrentMode(enforcer, gate);
    return;
  }

  const subcommand = args[0].toLowerCase();

  switch (subcommand) {
    case 'orchestrator':
    case 'specialist':
    case 'worker':
    case 'review':
    case 'learning':
      await switchMode(enforcer, subcommand, args);
      break;

    case 'history':
      await showHistory(enforcer);
      break;

    case 'stats':
      await showStats(enforcer);
      break;

    case 'blocked':
      await showBlockedActions(enforcer);
      break;

    case 'reset':
      await resetMode(enforcer);
      break;

    case 'status':
      await gate.printStatus();
      break;

    default:
      console.error(chalk.red(`Unknown mode command: ${subcommand}`));
      console.log(chalk.yellow(`\nValid modes: orchestrator, specialist, worker, review, learning`));
      console.log(chalk.yellow(`Valid commands: history, stats, blocked, reset, status`));
      process.exit(1);
  }
}

// ==========================================
// SHOW CURRENT MODE
// ==========================================
async function showCurrentMode(enforcer, gate) {
  const currentMode = await enforcer.getCurrentMode();
  const metadata = await enforcer.getModeMetadata();
  const agentIdentity = await enforcer.getAgentIdentity();

  console.log(chalk.bold.cyan(`\n╔══════════════════════════════════════════════════════════╗`));
  console.log(chalk.bold.cyan(`║          BOSS CLAUDE - CURRENT MODE                     ║`));
  console.log(chalk.bold.cyan(`╚══════════════════════════════════════════════════════════╝\n`));

  console.log(chalk.bold(`Mode: ${chalk.green(currentMode.toUpperCase())}`));

  if (metadata) {
    console.log(chalk.gray(`Set by: ${metadata.setBy}`));
    console.log(chalk.gray(`Set at: ${metadata.setAt}`));
    console.log(chalk.gray(`Reason: ${metadata.reason}`));
    if (metadata.sessionId) {
      console.log(chalk.gray(`Session: ${metadata.sessionId}`));
    }
    console.log(chalk.gray(`TTL: ${metadata.ttl} seconds`));
  }

  if (agentIdentity) {
    console.log(chalk.bold(`\nAgent: ${chalk.yellow(agentIdentity.agent)}`));
    if (agentIdentity.domain) {
      console.log(chalk.gray(`Domain: ${agentIdentity.domain}`));
    }
    console.log(chalk.gray(`Since: ${agentIdentity.setAt}`));
  }

  console.log(chalk.dim(`\nSwitch modes with: boss-claude mode [orchestrator|specialist|worker|review|learning]`));
  console.log(chalk.dim(`View capabilities: boss-claude mode status\n`));
}

// ==========================================
// SWITCH MODE
// ==========================================
async function switchMode(enforcer, mode, args) {
  const validModes = Object.values(MODES);

  if (!validModes.includes(mode)) {
    console.error(chalk.red(`Invalid mode: ${mode}`));
    console.log(chalk.yellow(`Valid modes: ${validModes.join(', ')}`));
    process.exit(1);
  }

  // Parse additional args
  const reason = args[1] || 'manual-switch';
  const agent = args[2] || 'boss-claude';

  console.log(chalk.bold.cyan(`\n[MODE SWITCH] Switching to ${mode.toUpperCase()} mode...`));

  try {
    await enforcer.setMode(mode, {
      agent,
      reason,
      sessionId: null
    });

    // Update agent identity if switching to specialist
    if (mode === MODES.SPECIALIST && args[2]) {
      const domain = args[3] || null;
      await enforcer.setAgentIdentity(args[2], domain);
      console.log(chalk.green(`✅ Agent identity set: ${args[2]} (${domain || 'no domain'})`));
    }

    console.log(chalk.bold.green(`✅ Mode switched to: ${mode.toUpperCase()}`));
    console.log(chalk.gray(`Reason: ${reason}`));

    // Show new status
    const gate = getGate();
    await gate.printStatus();

  } catch (error) {
    console.error(chalk.red(`❌ Failed to switch mode: ${error.message}`));
    process.exit(1);
  }
}

// ==========================================
// SHOW HISTORY
// ==========================================
async function showHistory(enforcer) {
  console.log(chalk.bold.cyan(`\n╔══════════════════════════════════════════════════════════╗`));
  console.log(chalk.bold.cyan(`║          MODE CHANGE HISTORY                            ║`));
  console.log(chalk.bold.cyan(`╚══════════════════════════════════════════════════════════╝\n`));

  const history = await enforcer.getModeHistory(20);

  if (history.length === 0) {
    console.log(chalk.yellow(`No mode changes recorded yet.`));
    return;
  }

  history.forEach((entry, index) => {
    const timestamp = new Date(entry.setAt).toLocaleString();
    console.log(chalk.bold(`${index + 1}. ${chalk.green(entry.mode.toUpperCase())}`));
    console.log(chalk.gray(`   Time: ${timestamp}`));
    console.log(chalk.gray(`   By: ${entry.setBy}`));
    console.log(chalk.gray(`   Reason: ${entry.reason}`));
    if (entry.sessionId) {
      console.log(chalk.gray(`   Session: ${entry.sessionId}`));
    }
    console.log('');
  });

  console.log(chalk.dim(`Showing last ${history.length} mode changes\n`));
}

// ==========================================
// SHOW STATS
// ==========================================
async function showStats(enforcer) {
  console.log(chalk.bold.cyan(`\n╔══════════════════════════════════════════════════════════╗`));
  console.log(chalk.bold.cyan(`║          MODE STATISTICS                                 ║`));
  console.log(chalk.bold.cyan(`╚══════════════════════════════════════════════════════════╝\n`));

  const stats = await enforcer.getModeStats();

  console.log(chalk.bold(`Actions per mode:\n`));

  for (const [mode, count] of Object.entries(stats)) {
    const bar = '█'.repeat(Math.min(count, 50));
    console.log(chalk.bold(`${mode.padEnd(15)}: ${chalk.green(count.toString().padStart(6))} ${chalk.gray(bar)}`));
  }

  const total = Object.values(stats).reduce((sum, count) => sum + count, 0);
  console.log(chalk.bold(`\nTotal actions: ${chalk.cyan(total)}\n`));
}

// ==========================================
// SHOW BLOCKED ACTIONS
// ==========================================
async function showBlockedActions(enforcer) {
  console.log(chalk.bold.cyan(`\n╔══════════════════════════════════════════════════════════╗`));
  console.log(chalk.bold.cyan(`║          BLOCKED ACTIONS (Security Audit)               ║`));
  console.log(chalk.bold.cyan(`╚══════════════════════════════════════════════════════════╝\n`));

  const blocked = await enforcer.getBlockedActions(20);

  if (blocked.length === 0) {
    console.log(chalk.green(`✅ No blocked actions. All operations have been compliant.\n`));
    return;
  }

  blocked.forEach((entry, index) => {
    const timestamp = new Date(entry.timestamp).toLocaleString();
    console.log(chalk.bold.red(`${index + 1}. BLOCKED ACTION`));
    console.log(chalk.gray(`   Time: ${timestamp}`));
    console.log(chalk.gray(`   Current mode: ${entry.currentMode}`));
    console.log(chalk.gray(`   Required mode: ${entry.requiredMode}`));
    console.log(chalk.yellow(`   Action: ${entry.action}`));
    console.log('');
  });

  console.log(chalk.dim(`Showing last ${blocked.length} blocked actions`));
  console.log(chalk.red(`⚠️  ${blocked.length} actions were blocked by mode enforcement\n`));
}

// ==========================================
// RESET MODE
// ==========================================
async function resetMode(enforcer) {
  console.log(chalk.bold.yellow(`\n[WARNING] Resetting mode to safe default (WORKER mode)...`));

  try {
    await enforcer.resetMode();
    console.log(chalk.bold.green(`✅ Mode reset complete`));

    const gate = getGate();
    await gate.printStatus();

  } catch (error) {
    console.error(chalk.red(`❌ Reset failed: ${error.message}`));
    process.exit(1);
  }
}
