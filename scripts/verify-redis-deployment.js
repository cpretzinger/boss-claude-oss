#!/usr/bin/env node

/**
 * REDIS IDENTITY LOCK SYSTEM - DEPLOYMENT VERIFICATION
 *
 * This script verifies that the Redis-based mode enforcement system
 * is properly deployed and functional.
 *
 * Run: node scripts/verify-redis-deployment.js
 */

import { getEnforcer, MODES } from '../lib/mode-enforcer.js';
import { getGate } from '../lib/orchestrator-gate.js';
import { loadIdentity } from '../lib/identity.js';
import chalk from 'chalk';

const CHECKS = {
  passed: 0,
  failed: 0,
  warnings: 0
};

function logCheck(status, message) {
  const icons = {
    pass: chalk.green('✓'),
    fail: chalk.red('✗'),
    warn: chalk.yellow('⚠')
  };

  console.log(`${icons[status]} ${message}`);

  if (status === 'pass') CHECKS.passed++;
  if (status === 'fail') CHECKS.failed++;
  if (status === 'warn') CHECKS.warnings++;
}

function logSection(title) {
  console.log(`\n${chalk.cyan.bold('═'.repeat(60))}`);
  console.log(chalk.cyan.bold(`  ${title}`));
  console.log(`${chalk.cyan.bold('═'.repeat(60))}\n`);
}

async function verify() {
  console.log(chalk.bold.white('\n╔══════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.white('║  REDIS IDENTITY LOCK SYSTEM - DEPLOYMENT VERIFICATION   ║'));
  console.log(chalk.bold.white('╚══════════════════════════════════════════════════════════╝\n'));

  try {
    // ==========================================
    // CHECK 1: Redis Connection
    // ==========================================
    logSection('1. Redis Connection');

    const enforcer = getEnforcer();
    const gate = getGate();

    try {
      await enforcer.getCurrentMode();
      logCheck('pass', 'Redis connection successful');
    } catch (error) {
      logCheck('fail', `Redis connection failed: ${error.message}`);
      console.log(chalk.red('\nREDIS_URL must be set. Check ~/.boss-claude/.env or project .env'));
      process.exit(1);
    }

    // ==========================================
    // CHECK 2: Mode Enforcement System
    // ==========================================
    logSection('2. Mode Enforcement System');

    // Test setting mode
    try {
      await enforcer.setMode(MODES.WORKER, {
        agent: 'deployment-test',
        reason: 'verification-script'
      });
      logCheck('pass', 'Mode setting works');
    } catch (error) {
      logCheck('fail', `Mode setting failed: ${error.message}`);
    }

    // Test getting mode
    try {
      const mode = await enforcer.getCurrentMode();
      if (mode === MODES.WORKER) {
        logCheck('pass', `Current mode retrieved: ${mode}`);
      } else {
        logCheck('warn', `Unexpected mode: ${mode}`);
      }
    } catch (error) {
      logCheck('fail', `Mode retrieval failed: ${error.message}`);
    }

    // Test mode metadata
    try {
      const metadata = await enforcer.getModeMetadata();
      if (metadata && metadata.setBy === 'deployment-test') {
        logCheck('pass', 'Mode metadata stored correctly');
      } else {
        logCheck('warn', 'Mode metadata incomplete');
      }
    } catch (error) {
      logCheck('fail', `Metadata retrieval failed: ${error.message}`);
    }

    // ==========================================
    // CHECK 3: Capability Enforcement
    // ==========================================
    logSection('3. Capability Enforcement');

    // Test that WORKER mode blocks delegation
    try {
      await enforcer.setMode(MODES.WORKER, {
        agent: 'test-worker',
        reason: 'capability-test'
      });

      try {
        await enforcer.checkCapability('canDelegate', 'Test delegation');
        logCheck('fail', 'Worker mode should block delegation');
      } catch (error) {
        if (error.message.includes('CAPABILITY ENFORCEMENT')) {
          logCheck('pass', 'Worker mode correctly blocks delegation');
        } else {
          logCheck('warn', `Unexpected error: ${error.message}`);
        }
      }
    } catch (error) {
      logCheck('fail', `Capability test failed: ${error.message}`);
    }

    // Test that ORCHESTRATOR mode allows delegation
    try {
      await enforcer.setMode(MODES.ORCHESTRATOR, {
        agent: 'test-orchestrator',
        reason: 'capability-test'
      });

      await enforcer.checkCapability('canDelegate', 'Test delegation');
      logCheck('pass', 'Orchestrator mode allows delegation');
    } catch (error) {
      logCheck('fail', `Orchestrator capability test failed: ${error.message}`);
    }

    // ==========================================
    // CHECK 4: Token Budget Enforcement
    // ==========================================
    logSection('4. Token Budget Enforcement');

    // Test token budget for WORKER mode (max 20k)
    try {
      await enforcer.setMode(MODES.WORKER, {
        agent: 'test-worker',
        reason: 'token-budget-test'
      });

      try {
        await enforcer.enforceTokenBudget(50000, 'Large task');
        logCheck('fail', 'Worker mode should block 50k token budget');
      } catch (error) {
        if (error.message.includes('TOKEN BUDGET ENFORCEMENT')) {
          logCheck('pass', 'Token budget enforcement works (blocks 50k for worker)');
        } else {
          logCheck('warn', `Unexpected error: ${error.message}`);
        }
      }
    } catch (error) {
      logCheck('fail', `Token budget test failed: ${error.message}`);
    }

    // Test token budget within limits
    try {
      await enforcer.enforceTokenBudget(10000, 'Small task');
      logCheck('pass', 'Token budget allows tasks within limits');
    } catch (error) {
      logCheck('fail', `Token budget within-limits test failed: ${error.message}`);
    }

    // ==========================================
    // CHECK 5: Orchestrator Gate Integration
    // ==========================================
    logSection('5. Orchestrator Gate Integration');

    // Test gate status retrieval
    try {
      const status = await gate.getStatus();
      if (status.mode && status.capabilities && status.restrictions) {
        logCheck('pass', 'Gate status retrieval works');
      } else {
        logCheck('warn', 'Gate status incomplete');
      }
    } catch (error) {
      logCheck('fail', `Gate status failed: ${error.message}`);
    }

    // Test gate beforeExecute
    try {
      await enforcer.setMode(MODES.WORKER, {
        agent: 'test-worker',
        reason: 'gate-test'
      });

      await gate.beforeExecute(
        { description: 'Test execution' },
        5000
      );
      logCheck('pass', 'Gate beforeExecute works');
    } catch (error) {
      logCheck('fail', `Gate beforeExecute failed: ${error.message}`);
    }

    // Test gate blocks delegation in worker mode
    try {
      try {
        await gate.beforeDelegate(
          'postgres-specialist',
          { description: 'Test delegation' },
          10000
        );
        logCheck('fail', 'Gate should block delegation in worker mode');
      } catch (error) {
        if (error.message.includes('GATE BLOCKED')) {
          logCheck('pass', 'Gate correctly blocks delegation in worker mode');
        } else {
          logCheck('warn', `Unexpected error: ${error.message}`);
        }
      }
    } catch (error) {
      logCheck('fail', `Gate delegation test failed: ${error.message}`);
    }

    // ==========================================
    // CHECK 6: Mode History & Audit Trail
    // ==========================================
    logSection('6. Mode History & Audit Trail');

    try {
      const history = await enforcer.getModeHistory(5);
      if (history && history.length > 0) {
        logCheck('pass', `Mode history tracked (${history.length} entries)`);
      } else {
        logCheck('warn', 'Mode history empty');
      }
    } catch (error) {
      logCheck('fail', `Mode history retrieval failed: ${error.message}`);
    }

    try {
      const blocked = await enforcer.getBlockedActions(5);
      if (blocked !== undefined) {
        logCheck('pass', `Blocked actions log available (${blocked.length} entries)`);
      } else {
        logCheck('warn', 'Blocked actions log unavailable');
      }
    } catch (error) {
      logCheck('fail', `Blocked actions retrieval failed: ${error.message}`);
    }

    try {
      const stats = await enforcer.getModeStats();
      if (stats && Object.keys(stats).length > 0) {
        logCheck('pass', 'Mode statistics tracked');
      } else {
        logCheck('warn', 'Mode statistics empty');
      }
    } catch (error) {
      logCheck('fail', `Mode stats retrieval failed: ${error.message}`);
    }

    // ==========================================
    // CHECK 7: Agent Identity Tracking
    // ==========================================
    logSection('7. Agent Identity Tracking');

    try {
      await enforcer.setAgentIdentity('test-agent', 'testing');
      const identity = await enforcer.getAgentIdentity();

      if (identity && identity.agent === 'test-agent' && identity.domain === 'testing') {
        logCheck('pass', 'Agent identity tracking works');
      } else {
        logCheck('warn', 'Agent identity incomplete');
      }
    } catch (error) {
      logCheck('fail', `Agent identity test failed: ${error.message}`);
    }

    // ==========================================
    // CHECK 8: Boss Identity Integration
    // ==========================================
    logSection('8. Boss Identity Integration');

    try {
      const bossIdentity = await loadIdentity();
      if (bossIdentity && bossIdentity.level !== undefined) {
        logCheck('pass', `Boss identity loaded (Level ${bossIdentity.level})`);
      } else {
        logCheck('warn', 'Boss identity incomplete');
      }
    } catch (error) {
      logCheck('fail', `Boss identity load failed: ${error.message}`);
    }

    // ==========================================
    // CHECK 9: Emergency Reset
    // ==========================================
    logSection('9. Emergency Reset');

    try {
      await enforcer.resetMode();
      const mode = await enforcer.getCurrentMode();

      if (mode === MODES.WORKER) {
        logCheck('pass', 'Emergency reset works (defaults to WORKER)');
      } else {
        logCheck('warn', `Emergency reset returned unexpected mode: ${mode}`);
      }
    } catch (error) {
      logCheck('fail', `Emergency reset failed: ${error.message}`);
    }

    // ==========================================
    // FINAL REPORT
    // ==========================================
    console.log(chalk.bold.white('\n╔══════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.white('║  DEPLOYMENT VERIFICATION REPORT                         ║'));
    console.log(chalk.bold.white('╚══════════════════════════════════════════════════════════╝\n'));

    console.log(`${chalk.green('Passed:')}   ${CHECKS.passed}`);
    console.log(`${chalk.red('Failed:')}   ${CHECKS.failed}`);
    console.log(`${chalk.yellow('Warnings:')} ${CHECKS.warnings}`);

    console.log('');

    if (CHECKS.failed === 0 && CHECKS.warnings === 0) {
      console.log(chalk.green.bold('✓ ALL CHECKS PASSED - System fully operational!\n'));
      process.exit(0);
    } else if (CHECKS.failed === 0) {
      console.log(chalk.yellow.bold('⚠ System operational with warnings\n'));
      process.exit(0);
    } else {
      console.log(chalk.red.bold('✗ System has failures - review errors above\n'));
      process.exit(1);
    }

  } catch (error) {
    console.error(chalk.red.bold(`\n✗ Verification failed: ${error.message}\n`));
    console.error(error.stack);
    process.exit(1);
  }
}

// Run verification
verify();
