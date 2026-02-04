/**
 * BOSS CLAUDE - GitHub Permission Explanations
 *
 * This module provides clear, trust-building explanations for why
 * each GitHub permission is needed. Transparency builds confidence.
 */

import chalk from 'chalk';

/**
 * Permission categories with detailed explanations
 */
export const PERMISSION_CATEGORIES = {
  core: {
    title: '🎯 Core Functionality (Required)',
    permissions: {
      'repo (Issues)': {
        why: 'Store your Boss Claude progress, XP, and session history',
        whatWeStore: [
          'Session summaries and achievements',
          'XP progression and level-ups',
          'Task completion history',
          'Efficiency metrics and token savings'
        ],
        whatWeNeverTouch: [
          'Your actual code',
          'Repository settings',
          'Collaborator access',
          'Branch protection rules'
        ],
        technical: 'Uses GitHub Issues API as a free, version-controlled database',
        privacy: 'All data stays in YOUR private repo. We never access other repos.'
      }
    }
  },

  optional: {
    title: '🔧 Optional Features (Enhance Experience)',
    permissions: {
      'repo (Contents - Read)': {
        why: 'Enable AI coding assistants to read your project context',
        whatWeUse: [
          'Read file structure for better context',
          'Analyze dependencies and configs',
          'Provide smarter code suggestions',
          'Understand your project architecture'
        ],
        whatWeNeverDo: [
          'Modify your code without explicit commands',
          'Push changes automatically',
          'Share your code externally',
          'Access private data'
        ],
        technical: 'Read-only access for AI context enhancement',
        canSkip: true,
        skipImpact: 'AI assistants will have less context about your project'
      },

      'workflow': {
        why: 'Automate GitHub Actions for CI/CD integration',
        whatWeEnable: [
          'Auto-update Boss Claude stats after CI runs',
          'Track deployment success metrics',
          'Integration with GitHub Actions workflows',
          'Automated progress tracking'
        ],
        whatWeNeverDo: [
          'Create workflows without your approval',
          'Modify existing workflows',
          'Run actions on your behalf',
          'Access workflow secrets'
        ],
        technical: 'Trigger workflow_dispatch events for automation',
        canSkip: true,
        skipImpact: 'Manual progress updates only, no CI/CD integration'
      }
    }
  },

  security: {
    title: '🔒 Security & Privacy Guarantees',
    promises: [
      {
        icon: '🛡️',
        title: 'Data Ownership',
        description: 'All your data stays in YOUR GitHub repo. We never store it elsewhere.'
      },
      {
        icon: '🔐',
        title: 'Token Security',
        description: 'OAuth token stored locally (~/.boss-claude/config.json). Never transmitted to third parties.'
      },
      {
        icon: '👁️',
        title: 'Transparency',
        description: 'Open source code. Audit exactly what we do with permissions.'
      },
      {
        icon: '🚫',
        title: 'No Third-Party Sharing',
        description: 'Your data never leaves the GitHub ecosystem. Period.'
      },
      {
        icon: '♻️',
        title: 'Revocable Anytime',
        description: 'Revoke access at github.com/settings/tokens. Instant effect.'
      },
      {
        icon: '📖',
        title: 'Audit Trail',
        description: 'Every API call is traceable via GitHub Issues. See exactly what we store.'
      }
    ]
  }
};

/**
 * Display detailed permission explanations
 */
export function explainPermissions(options = {}) {
  const { minimal = false, category = null } = options;

  console.log('\n' + chalk.bold.cyan('═'.repeat(70)));
  console.log(chalk.bold.cyan('  BOSS CLAUDE - GitHub Permission Transparency'));
  console.log(chalk.bold.cyan('═'.repeat(70)) + '\n');

  // Core permissions
  if (!category || category === 'core') {
    displayCategory(PERMISSION_CATEGORIES.core);
  }

  // Optional permissions
  if (!category || category === 'optional') {
    displayCategory(PERMISSION_CATEGORIES.optional);
  }

  // Security guarantees
  if (!category || category === 'security') {
    displaySecurityGuarantees();
  }

  if (!minimal) {
    displayQuickFAQ();
  }

  console.log(chalk.dim('\n' + '─'.repeat(70)));
  console.log(chalk.bold.green('  Building trust through transparency.'));
  console.log(chalk.dim('─'.repeat(70) + '\n'));
}

/**
 * Display a permission category
 */
function displayCategory(category) {
  console.log(chalk.bold.white(category.title));
  console.log(chalk.dim('─'.repeat(70)) + '\n');

  for (const [permName, details] of Object.entries(category.permissions)) {
    console.log(chalk.bold.yellow(`  ${permName}`));
    console.log(chalk.white(`  Why: ${details.why}\n`));

    if (details.whatWeStore) {
      console.log(chalk.green('  ✅ What we store:'));
      details.whatWeStore.forEach(item => {
        console.log(chalk.dim(`     • ${item}`));
      });
      console.log();
    }

    if (details.whatWeUse) {
      console.log(chalk.green('  ✅ What we use it for:'));
      details.whatWeUse.forEach(item => {
        console.log(chalk.dim(`     • ${item}`));
      });
      console.log();
    }

    if (details.whatWeNeverTouch) {
      console.log(chalk.red('  ❌ What we NEVER touch:'));
      details.whatWeNeverTouch.forEach(item => {
        console.log(chalk.dim(`     • ${item}`));
      });
      console.log();
    }

    if (details.whatWeNeverDo) {
      console.log(chalk.red('  ❌ What we NEVER do:'));
      details.whatWeNeverDo.forEach(item => {
        console.log(chalk.dim(`     • ${item}`));
      });
      console.log();
    }

    console.log(chalk.cyan(`  🔧 Technical: ${details.technical}`));

    if (details.privacy) {
      console.log(chalk.magenta(`  🔒 Privacy: ${details.privacy}`));
    }

    if (details.canSkip) {
      console.log(chalk.yellow(`  ⚠️  Optional: ${details.skipImpact}`));
    }

    console.log();
  }
}

/**
 * Display security guarantees
 */
function displaySecurityGuarantees() {
  console.log(chalk.bold.white(PERMISSION_CATEGORIES.security.title));
  console.log(chalk.dim('─'.repeat(70)) + '\n');

  PERMISSION_CATEGORIES.security.promises.forEach(promise => {
    console.log(chalk.bold(`  ${promise.icon} ${promise.title}`));
    console.log(chalk.dim(`     ${promise.description}\n`));
  });
}

/**
 * Display quick FAQ
 */
function displayQuickFAQ() {
  console.log(chalk.bold.white('❓ Quick FAQ'));
  console.log(chalk.dim('─'.repeat(70)) + '\n');

  const faqs = [
    {
      q: 'Can Boss Claude access my private repositories?',
      a: 'Only the ONE repo you choose for Boss Claude storage. Never others.'
    },
    {
      q: 'Can Boss Claude modify my code?',
      a: 'No. We only write to GitHub Issues (for stats). Code is read-only and optional.'
    },
    {
      q: 'Where is my OAuth token stored?',
      a: '~/.boss-claude/config.json on your machine. Never sent to external servers.'
    },
    {
      q: 'What if I revoke access?',
      a: 'Boss Claude switches to offline mode. Your local data remains intact.'
    },
    {
      q: 'Can I audit what data is stored?',
      a: 'Yes! Check your repo Issues. Every stat is visible and version-controlled.'
    },
    {
      q: 'Do you sell my data?',
      a: 'No. We never collect it in the first place. It stays in YOUR GitHub.'
    }
  ];

  faqs.forEach(faq => {
    console.log(chalk.bold.cyan(`  Q: ${faq.q}`));
    console.log(chalk.white(`  A: ${faq.a}\n`));
  });
}

/**
 * Get permission scope explanation for specific scope
 */
export function explainScope(scope) {
  const scopeMap = {
    'repo': 'Full repository access (needed for Issues API to store progress)',
    'repo:status': 'Commit status access (not used by Boss Claude)',
    'public_repo': 'Public repository access only (insufficient - we need private repo for security)',
    'user:email': 'Access to user email (for identification only)',
    'workflow': 'GitHub Actions workflow management (optional, for CI/CD integration)',
    'read:org': 'Organization read access (not used by Boss Claude)'
  };

  return scopeMap[scope] || 'Unknown scope';
}

/**
 * Interactive permission selection
 */
export function promptPermissionChoices() {
  console.log(chalk.bold.cyan('\n🔐 Choose Your Permission Level:\n'));

  console.log(chalk.bold.green('1. Core Only (Recommended for first-time users)'));
  console.log(chalk.dim('   ✅ Session tracking & progress'));
  console.log(chalk.dim('   ✅ XP system & achievements'));
  console.log(chalk.dim('   ❌ No code reading'));
  console.log(chalk.dim('   ❌ No CI/CD integration\n'));

  console.log(chalk.bold.yellow('2. Enhanced (Better AI context)'));
  console.log(chalk.dim('   ✅ Everything in Core'));
  console.log(chalk.dim('   ✅ Read code for better suggestions'));
  console.log(chalk.dim('   ✅ Project structure awareness'));
  console.log(chalk.dim('   ❌ No CI/CD integration\n'));

  console.log(chalk.bold.magenta('3. Full (Maximum automation)'));
  console.log(chalk.dim('   ✅ Everything in Enhanced'));
  console.log(chalk.dim('   ✅ GitHub Actions integration'));
  console.log(chalk.dim('   ✅ Automated progress tracking'));
  console.log(chalk.dim('   ✅ CI/CD workflow triggers\n'));

  console.log(chalk.dim('You can always change this later in ~/.boss-claude/config.json\n'));
}

/**
 * Get scopes for permission level
 */
export function getScopesForLevel(level) {
  const scopeLevels = {
    'core': ['repo'], // Issues API needs full repo scope (GitHub limitation)
    'enhanced': ['repo'], // Same as core (read-only enforced in code)
    'full': ['repo', 'workflow']
  };

  return scopeLevels[level] || scopeLevels.core;
}

/**
 * Display what changed after permission update
 */
export function explainPermissionChange(oldLevel, newLevel) {
  console.log(chalk.bold.cyan('\n📝 Permission Level Changed\n'));
  console.log(chalk.dim(`  Old: ${oldLevel} → New: ${newLevel}\n`));

  const changes = {
    'core→enhanced': {
      added: ['Read code for AI context', 'Project structure analysis'],
      removed: []
    },
    'enhanced→full': {
      added: ['GitHub Actions integration', 'Automated CI/CD tracking'],
      removed: []
    },
    'full→enhanced': {
      added: [],
      removed: ['GitHub Actions integration', 'Automated CI/CD tracking']
    },
    'enhanced→core': {
      added: [],
      removed: ['Code reading', 'Project structure analysis']
    },
    'full→core': {
      added: [],
      removed: ['Code reading', 'Project analysis', 'GitHub Actions', 'CI/CD automation']
    }
  };

  const changeKey = `${oldLevel}→${newLevel}`;
  const change = changes[changeKey];

  if (change) {
    if (change.added.length > 0) {
      console.log(chalk.bold.green('  ✅ Now enabled:'));
      change.added.forEach(item => console.log(chalk.dim(`     • ${item}`)));
      console.log();
    }

    if (change.removed.length > 0) {
      console.log(chalk.bold.red('  ❌ Now disabled:'));
      change.removed.forEach(item => console.log(chalk.dim(`     • ${item}`)));
      console.log();
    }
  }

  console.log(chalk.dim('  Update takes effect immediately.\n'));
}

/**
 * Show minimal trust statement (for setup flow)
 */
export function showTrustStatement() {
  console.log(chalk.bold.cyan('\n🛡️  Trust & Transparency\n'));
  console.log(chalk.white('  Boss Claude stores progress in YOUR GitHub repo.'));
  console.log(chalk.white('  Your data never leaves GitHub. Open source. Auditable.'));
  console.log(chalk.dim('\n  Run "boss-claude explain-permissions" for full details.\n'));
}

export default {
  explainPermissions,
  explainScope,
  promptPermissionChoices,
  getScopesForLevel,
  explainPermissionChange,
  showTrustStatement,
  PERMISSION_CATEGORIES
};
