/**
 * Boss Claude Setup Summary
 *
 * Beautiful success summary that makes users feel accomplished after setup.
 * Displays what was configured, next steps, and helpful commands to try.
 */

import chalk from 'chalk';
import prompts from '../prompts.js';

const {
  success,
  info,
  muted,
  blank,
  divider,
  keyValue,
  theme
} = prompts;

/**
 * Display a beautiful setup success summary
 *
 * @param {Object} config - Setup configuration results
 * @param {Object} config.user - User information (name, email, username)
 * @param {Object} config.github - GitHub setup results (enabled, repo, token)
 * @param {Object} config.redis - Redis setup results (enabled, url, stats)
 * @param {Object} config.postgres - PostgreSQL setup results (enabled, url, stats)
 * @param {Object} config.env - Environment file information (path, created)
 * @param {number} config.duration - Setup duration in milliseconds
 */
export function displaySetupSummary(config) {
  blank();
  divider();
  blank();

  // Success header with celebration
  console.log(chalk.bold.green('  ✨ SETUP COMPLETE! ✨'));
  blank();

  const emoji = getRandomSuccessEmoji();
  console.log(chalk.dim(`  ${emoji} Boss Claude is ready to revolutionize your workflow ${emoji}`));
  blank();
  divider();
  blank();

  // Configuration summary
  console.log(chalk.bold('  📋 WHAT WAS CONFIGURED'));
  blank();

  // User info
  if (config.user) {
    keyValue('Your Name', config.user.name || 'Not provided');
    if (config.user.email) {
      keyValue('Email', config.user.email);
    }
    if (config.user.username) {
      keyValue('GitHub Username', `@${config.user.username}`);
    }
    blank();
  }

  // GitHub integration
  if (config.github?.enabled) {
    keyValue('GitHub Integration', chalk.green('✓ Enabled'));
    if (config.github.repo) {
      keyValue('  Repository', config.github.repo);
    }
    keyValue('  Authentication', chalk.green('✓ Configured'));
    blank();
  } else {
    keyValue('GitHub Integration', chalk.yellow('○ Skipped (manual mode)'));
    blank();
  }

  // Redis
  if (config.redis?.enabled) {
    keyValue('Redis (Session Storage)', chalk.green('✓ Connected'));
    if (config.redis.stats) {
      keyValue('  Identity Created', chalk.green('✓ Level 1 Boss'));
      keyValue('  Data Structures', chalk.green(`✓ ${config.redis.stats.dataStructures || 'Initialized'}`));
    }
    blank();
  } else {
    keyValue('Redis', chalk.yellow('○ Skipped (sessions not persisted)'));
    blank();
  }

  // PostgreSQL
  if (config.postgres?.enabled) {
    keyValue('PostgreSQL (Analytics)', chalk.green('✓ Connected'));
    if (config.postgres.stats) {
      keyValue('  Schema Version', config.postgres.stats.schemaVersion || 'v1');
      keyValue('  Tables Created', chalk.green(`✓ ${config.postgres.stats.tablesCreated || 'All ready'}`));
    }
    blank();
  } else {
    keyValue('PostgreSQL', chalk.yellow('○ Skipped (analytics disabled)'));
    blank();
  }

  // Environment file
  if (config.env?.created) {
    keyValue('Environment File', chalk.green('✓ Created'));
    keyValue('  Location', config.env.path || '~/.boss-claude/.env');
    blank();
  }

  // Setup duration
  if (config.duration) {
    const seconds = (config.duration / 1000).toFixed(1);
    keyValue('Setup Time', `${seconds}s ${getSpeedComment(seconds)}`);
    blank();
  }

  divider();
  blank();

  // Next steps
  console.log(chalk.bold('  🚀 NEXT STEPS'));
  blank();

  const steps = [
    'Check your status anytime with:',
    chalk.cyan('  $ boss-claude status'),
    '',
    'Start a new session:',
    chalk.cyan('  $ boss-claude start "Working on awesome feature"'),
    '',
    'Save your progress:',
    chalk.cyan('  $ boss-claude save "Completed authentication system"'),
    '',
    'View your achievements:',
    chalk.cyan('  $ boss-claude achievements')
  ];

  steps.forEach(step => console.log(chalk.dim(`  ${step}`)));
  blank();

  divider();
  blank();

  // Helpful tips
  console.log(chalk.bold('  💡 PRO TIPS'));
  blank();

  const tips = [
    chalk.dim('• Boss Claude tracks XP, tokens, and achievements automatically'),
    chalk.dim('• Your identity persists across ALL your repositories'),
    chalk.dim('• Use ') + chalk.cyan('boss-claude --help') + chalk.dim(' to see all commands'),
    chalk.dim('• Check ') + chalk.cyan('~/.boss-claude/') + chalk.dim(' for configs and logs')
  ];

  tips.forEach(tip => console.log(`  ${tip}`));
  blank();

  divider();
  blank();

  // Final motivation
  const motivation = getRandomMotivation();
  console.log(chalk.bold.green(`  ${motivation}`));
  blank();

  // Documentation link
  console.log(chalk.dim('  📚 Docs: https://github.com/cpretzinger/boss-claude#readme'));
  blank();
  divider();
  blank();
}

/**
 * Display a compact summary (for quick setups)
 *
 * @param {Object} config - Simplified config object
 */
export function displayQuickSummary(config) {
  blank();
  success('Setup complete!');
  blank();

  if (config.redis?.enabled) {
    info(`Redis connected: ${config.redis.url?.split('@')[1]?.split('/')[0] || 'localhost'}`);
  }

  if (config.postgres?.enabled) {
    info(`PostgreSQL connected: ${config.postgres.url?.split('@')[1]?.split('/')[0] || 'localhost'}`);
  }

  if (config.github?.enabled) {
    info(`GitHub repo: ${config.github.repo}`);
  }

  blank();
  console.log(chalk.dim('  Try: ') + chalk.cyan('boss-claude status'));
  blank();
}

/**
 * Display a summary for partial/failed setup
 *
 * @param {Object} config - Config with success/failure info
 * @param {Array<string>} errors - List of errors encountered
 */
export function displayPartialSummary(config, errors = []) {
  blank();
  divider();
  blank();

  console.log(chalk.bold.yellow('  ⚠️  SETUP PARTIALLY COMPLETE'));
  blank();

  // Show what worked
  const successes = [];
  if (config.redis?.enabled) successes.push('Redis');
  if (config.postgres?.enabled) successes.push('PostgreSQL');
  if (config.github?.enabled) successes.push('GitHub');

  if (successes.length > 0) {
    keyValue('Configured', chalk.green(successes.join(', ')));
    blank();
  }

  // Show what failed
  if (errors.length > 0) {
    console.log(chalk.bold.red('  ❌ ISSUES ENCOUNTERED'));
    blank();
    errors.forEach(err => {
      console.log(chalk.dim(`  • ${err}`));
    });
    blank();
  }

  divider();
  blank();

  console.log(chalk.dim('  You can re-run setup anytime with: ') + chalk.cyan('boss-claude setup'));
  blank();
}

/**
 * Display rollback summary
 *
 * @param {Object} rollback - Rollback information
 */
export function displayRollbackSummary(rollback) {
  blank();
  divider();
  blank();

  console.log(chalk.bold.yellow('  ↩️  SETUP ROLLED BACK'));
  blank();

  if (rollback.reason) {
    keyValue('Reason', rollback.reason);
    blank();
  }

  if (rollback.actionsReverted?.length > 0) {
    console.log(chalk.dim('  Actions reverted:'));
    rollback.actionsReverted.forEach(action => {
      console.log(chalk.dim(`  • ${action}`));
    });
    blank();
  }

  divider();
  blank();

  console.log(chalk.dim('  Your system is back to its original state.'));
  console.log(chalk.dim('  Run ') + chalk.cyan('boss-claude setup') + chalk.dim(' to try again.'));
  blank();
}

/**
 * Display validation results
 *
 * @param {Object} validation - Validation test results
 */
export function displayValidationSummary(validation) {
  blank();
  divider();
  blank();

  console.log(chalk.bold('  🔍 VALIDATION RESULTS'));
  blank();

  const tests = validation.tests || {};
  let passed = 0;
  let failed = 0;

  Object.entries(tests).forEach(([name, result]) => {
    if (result.success) {
      console.log(chalk.green(`  ✓ ${name}`));
      passed++;
    } else {
      console.log(chalk.red(`  ✗ ${name}`));
      if (result.error) {
        console.log(chalk.dim(`    ${result.error}`));
      }
      failed++;
    }
  });

  blank();
  divider();
  blank();

  if (failed === 0) {
    success(`All ${passed} tests passed!`);
  } else {
    console.log(chalk.yellow(`  ${passed} passed, ${failed} failed`));
  }

  blank();
}

/**
 * Get a random success emoji
 * @returns {string}
 */
function getRandomSuccessEmoji() {
  const emojis = ['🎉', '🎊', '🌟', '⭐', '🚀', '💪', '🔥', '✨'];
  return emojis[Math.floor(Math.random() * emojis.length)];
}

/**
 * Get a comment about setup speed
 * @param {number} seconds - Duration in seconds
 * @returns {string}
 */
function getSpeedComment(seconds) {
  if (seconds < 5) return '⚡ Lightning fast!';
  if (seconds < 15) return '🚀 Quick setup!';
  if (seconds < 30) return '✓ Not bad!';
  return '✓ Done!';
}

/**
 * Get a random motivational message
 * @returns {string}
 */
function getRandomMotivation() {
  const messages = [
    'You\'re all set! Time to build something amazing.',
    'Configuration complete. Let\'s get to work!',
    'Ready to level up your productivity!',
    'Everything is configured. Go make magic happen!',
    'Setup successful. Your AI assistant awaits!',
    'You\'re ready to rock! Let\'s do this.',
    'Configuration locked in. Time to shine!',
    'All systems go! Let\'s build the future.'
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Create a configuration summary object from setup results
 *
 * @param {Object} results - Raw setup results from wizard
 * @returns {Object} Formatted config for summary
 */
export function createSummaryConfig(results) {
  return {
    user: {
      name: results.userName || results.user?.name,
      email: results.userEmail || results.user?.email,
      username: results.githubUsername || results.github?.username
    },
    github: {
      enabled: results.githubEnabled || results.github?.enabled || false,
      repo: results.githubRepo || results.github?.repo,
      token: results.githubToken ? '✓ Set' : null
    },
    redis: {
      enabled: results.redisEnabled || results.redis?.enabled || false,
      url: results.redisUrl || results.redis?.url,
      stats: results.redisStats || results.redis?.stats
    },
    postgres: {
      enabled: results.postgresEnabled || results.postgres?.enabled || false,
      url: results.postgresUrl || results.postgres?.url,
      stats: results.postgresStats || results.postgres?.stats
    },
    env: {
      created: results.envCreated || results.env?.created || false,
      path: results.envPath || results.env?.path
    },
    duration: results.duration || results.setupDuration
  };
}

export default {
  displaySetupSummary,
  displayQuickSummary,
  displayPartialSummary,
  displayRollbackSummary,
  displayValidationSummary,
  createSummaryConfig
};
