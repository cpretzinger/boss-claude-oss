import chalk from 'chalk';
import ora from 'ora';

/**
 * Setup Progress Tracker
 * Visual, real-time progress display for Boss Claude setup
 */

const STEPS = {
  GITHUB: {
    name: 'GitHub Authentication',
    icon: '🔐',
    description: 'Connecting to GitHub API'
  },
  REDIS: {
    name: 'Redis Connection',
    icon: '⚡',
    description: 'Establishing Redis connection'
  },
  POSTGRES: {
    name: 'PostgreSQL Setup',
    icon: '🗄️',
    description: 'Creating database tables'
  },
  FINALIZE: {
    name: 'Finalizing Setup',
    icon: '✨',
    description: 'Completing configuration'
  }
};

const STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

class SetupProgress {
  constructor() {
    this.steps = new Map();
    this.currentSpinner = null;
    this.startTime = Date.now();

    // Initialize all steps as pending
    Object.keys(STEPS).forEach(key => {
      this.steps.set(key, {
        ...STEPS[key],
        status: STATUS.PENDING,
        startTime: null,
        endTime: null,
        error: null
      });
    });
  }

  /**
   * Display welcome banner
   */
  showWelcome() {
    console.log('\n');
    console.log(chalk.bold.cyan('╔═══════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║') + '                                                           ' + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('║') + chalk.bold.white('          🤖  BOSS CLAUDE SETUP WIZARD  🤖                 ') + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('║') + '                                                           ' + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('╚═══════════════════════════════════════════════════════════╝'));
    console.log('\n');
    console.log(chalk.gray('  Let\'s get you leveled up! This will only take a moment...\n'));
  }

  /**
   * Start a setup step
   */
  startStep(stepKey) {
    const step = this.steps.get(stepKey);
    if (!step) return;

    step.status = STATUS.IN_PROGRESS;
    step.startTime = Date.now();

    // Stop current spinner if exists
    if (this.currentSpinner) {
      this.currentSpinner.stop();
    }

    // Start new spinner
    this.currentSpinner = ora({
      text: chalk.cyan(`${step.icon}  ${step.description}...`),
      color: 'cyan'
    }).start();
  }

  /**
   * Complete a setup step
   */
  completeStep(stepKey, message = null) {
    const step = this.steps.get(stepKey);
    if (!step) return;

    step.status = STATUS.COMPLETED;
    step.endTime = Date.now();

    if (this.currentSpinner) {
      this.currentSpinner.succeed(
        chalk.green(`${step.icon}  ${step.name}`) +
        (message ? chalk.gray(` - ${message}`) : '')
      );
      this.currentSpinner = null;
    }
  }

  /**
   * Mark step as failed
   */
  failStep(stepKey, error) {
    const step = this.steps.get(stepKey);
    if (!step) return;

    step.status = STATUS.FAILED;
    step.endTime = Date.now();
    step.error = error;

    if (this.currentSpinner) {
      this.currentSpinner.fail(
        chalk.red(`${step.icon}  ${step.name}`) +
        chalk.gray(` - ${error}`)
      );
      this.currentSpinner = null;
    }
  }

  /**
   * Skip a step
   */
  skipStep(stepKey, reason = null) {
    const step = this.steps.get(stepKey);
    if (!step) return;

    step.status = STATUS.SKIPPED;
    step.endTime = Date.now();

    if (this.currentSpinner) {
      this.currentSpinner.stop();
      this.currentSpinner = null;
    }

    console.log(
      chalk.yellow(`⊘  ${step.name}`) +
      (reason ? chalk.gray(` - ${reason}`) : chalk.gray(' - skipped'))
    );
  }

  /**
   * Display current progress
   */
  displayProgress() {
    console.log('\n' + chalk.bold.white('Setup Progress:'));
    console.log(chalk.gray('━'.repeat(60)) + '\n');

    this.steps.forEach((step, key) => {
      const symbol = this.getStatusSymbol(step.status);
      const statusText = this.getStatusText(step.status);
      const duration = step.endTime ?
        chalk.gray(` (${this.formatDuration(step.endTime - step.startTime)})`) : '';

      console.log(
        `${symbol}  ${step.icon}  ${chalk.white(step.name)} ${statusText}${duration}`
      );
    });

    console.log('\n' + chalk.gray('━'.repeat(60)));
  }

  /**
   * Get status symbol
   */
  getStatusSymbol(status) {
    switch (status) {
      case STATUS.COMPLETED:
        return chalk.green('✓');
      case STATUS.IN_PROGRESS:
        return chalk.cyan('⏳');
      case STATUS.FAILED:
        return chalk.red('✗');
      case STATUS.SKIPPED:
        return chalk.yellow('⊘');
      default:
        return chalk.gray('○');
    }
  }

  /**
   * Get status text
   */
  getStatusText(status) {
    switch (status) {
      case STATUS.COMPLETED:
        return chalk.green('completed');
      case STATUS.IN_PROGRESS:
        return chalk.cyan('in progress...');
      case STATUS.FAILED:
        return chalk.red('failed');
      case STATUS.SKIPPED:
        return chalk.yellow('skipped');
      default:
        return chalk.gray('pending');
    }
  }

  /**
   * Format duration
   */
  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  /**
   * Display completion summary
   */
  showSummary(success = true) {
    const totalTime = Date.now() - this.startTime;
    const completed = Array.from(this.steps.values()).filter(s => s.status === STATUS.COMPLETED).length;
    const failed = Array.from(this.steps.values()).filter(s => s.status === STATUS.FAILED).length;
    const skipped = Array.from(this.steps.values()).filter(s => s.status === STATUS.SKIPPED).length;

    console.log('\n');
    console.log(chalk.bold.cyan('━'.repeat(60)));

    if (success) {
      console.log('\n' + chalk.bold.green('  🎉  SETUP COMPLETE!  🎉'));
      console.log('\n' + chalk.white('  Boss Claude is now ready to level up your workflow!\n'));
      console.log(chalk.gray(`  Total time: ${this.formatDuration(totalTime)}`));
      console.log(chalk.gray(`  Steps completed: ${chalk.green(completed)} | Skipped: ${chalk.yellow(skipped)}`));
      console.log('\n' + chalk.bold.white('  Next steps:'));
      console.log(chalk.cyan('    • Run') + chalk.white(' boss-claude status') + chalk.cyan(' to view your progress'));
      console.log(chalk.cyan('    • Start working and earn XP!'));
      console.log(chalk.cyan('    • Level up by completing tasks efficiently\n'));
    } else {
      console.log('\n' + chalk.bold.yellow('  ⚠️  SETUP INCOMPLETE'));
      console.log('\n' + chalk.white('  Some steps need attention:\n'));
      console.log(chalk.gray(`  Completed: ${chalk.green(completed)} | Failed: ${chalk.red(failed)} | Skipped: ${chalk.yellow(skipped)}`));

      // Show failed steps
      const failedSteps = Array.from(this.steps.entries()).filter(([_, step]) => step.status === STATUS.FAILED);
      if (failedSteps.length > 0) {
        console.log('\n' + chalk.bold.red('  Failed steps:'));
        failedSteps.forEach(([key, step]) => {
          console.log(chalk.red(`    • ${step.name}`));
          if (step.error) {
            console.log(chalk.gray(`      ${step.error}`));
          }
        });
      }

      console.log('\n' + chalk.yellow('  You can continue with limited functionality or re-run setup.\n'));
    }

    console.log(chalk.bold.cyan('━'.repeat(60)));
    console.log('\n');
  }

  /**
   * Show error with suggestions
   */
  showError(stepKey, error, suggestions = []) {
    console.log('\n');
    console.log(chalk.bold.red('━'.repeat(60)));
    console.log(chalk.bold.red('\n  ⚠️  SETUP ERROR\n'));
    console.log(chalk.white(`  Step: ${this.steps.get(stepKey)?.name || stepKey}`));
    console.log(chalk.red(`  Error: ${error}\n`));

    if (suggestions.length > 0) {
      console.log(chalk.bold.white('  Suggestions:'));
      suggestions.forEach(suggestion => {
        console.log(chalk.cyan(`    • ${suggestion}`));
      });
      console.log('');
    }

    console.log(chalk.bold.red('━'.repeat(60)));
    console.log('\n');
  }

  /**
   * Show encouraging message
   */
  showEncouragement() {
    const messages = [
      '🚀 Almost there! Just a few more steps...',
      '💪 You\'re doing great! Setup is progressing smoothly...',
      '⚡ Blazing through setup like a pro!',
      '🎯 On track for a perfect setup!',
      '✨ Boss Claude is getting excited to work with you!'
    ];

    const message = messages[Math.floor(Math.random() * messages.length)];
    console.log('\n' + chalk.gray('  ' + message) + '\n');
  }

  /**
   * Get completion percentage
   */
  getCompletionPercentage() {
    const total = this.steps.size;
    const completed = Array.from(this.steps.values()).filter(
      s => s.status === STATUS.COMPLETED || s.status === STATUS.SKIPPED
    ).length;

    return Math.round((completed / total) * 100);
  }

  /**
   * Display progress bar
   */
  showProgressBar() {
    const percentage = this.getCompletionPercentage();
    const barLength = 40;
    const filled = Math.round((percentage / 100) * barLength);
    const empty = barLength - filled;

    const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    console.log(`\n  ${bar} ${chalk.bold.white(percentage + '%')}\n`);
  }
}

/**
 * Create a new progress tracker
 */
export function createProgressTracker() {
  return new SetupProgress();
}

/**
 * Quick progress display for simple operations
 */
export function quickProgress(steps, options = {}) {
  const tracker = new SetupProgress();

  if (options.showWelcome !== false) {
    tracker.showWelcome();
  }

  return {
    start: (step) => tracker.startStep(step),
    complete: (step, message) => tracker.completeStep(step, message),
    fail: (step, error) => tracker.failStep(step, error),
    skip: (step, reason) => tracker.skipStep(step, reason),
    finish: (success = true) => tracker.showSummary(success),
    encourage: () => tracker.showEncouragement(),
    showProgress: () => tracker.displayProgress(),
    showBar: () => tracker.showProgressBar()
  };
}

export default SetupProgress;
