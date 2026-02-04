#!/usr/bin/env node

import chalk from 'chalk';
import boxen from 'boxen';

/**
 * Display step-by-step instructions for creating a GitHub Personal Access Token
 * with the correct scopes for BOSS Claude automation
 */
export function displayGitHubPATInstructions() {
  console.log('\n');
  console.log(boxen(
    chalk.bold.cyan('GitHub Personal Access Token Setup Guide'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'double',
      borderColor: 'cyan'
    }
  ));

  console.log(chalk.yellow('\n📋 WHY YOU NEED THIS:'));
  console.log('BOSS Claude needs GitHub API access to automate:');
  console.log('  • Creating commits with co-author attribution');
  console.log('  • Managing pull requests and reviews');
  console.log('  • Reading repository information');
  console.log('  • Creating and managing issues');
  console.log('  • Analyzing code and commit history\n');

  // Step 1
  console.log(chalk.bold.green('STEP 1: Navigate to GitHub Token Settings'));
  console.log(chalk.gray('─'.repeat(70)));
  console.log('\n📍 Go to: ' + chalk.blue.underline('https://github.com/settings/tokens'));
  console.log('\nAlternatively:');
  console.log('  1. Click your profile picture (top-right corner)');
  console.log('  2. Click ' + chalk.bold('"Settings"'));
  console.log('  3. Scroll down to ' + chalk.bold('"Developer settings"') + ' (bottom of left sidebar)');
  console.log('  4. Click ' + chalk.bold('"Personal access tokens"'));
  console.log('  5. Click ' + chalk.bold('"Tokens (classic)"'));
  console.log('\n' + chalk.dim('Screenshot: You\'ll see a page with "Generate new token" button\n'));

  // Step 2
  console.log(chalk.bold.green('STEP 2: Generate New Token'));
  console.log(chalk.gray('─'.repeat(70)));
  console.log('\n1. Click the ' + chalk.bold('"Generate new token"') + ' dropdown');
  console.log('2. Select ' + chalk.bold('"Generate new token (classic)"'));
  console.log('\n' + chalk.yellow('⚠️  IMPORTANT:') + ' Use "classic" tokens, not fine-grained tokens\n');

  // Step 3
  console.log(chalk.bold.green('STEP 3: Configure Token Details'));
  console.log(chalk.gray('─'.repeat(70)));
  console.log('\n' + chalk.bold('Note:') + ' Give your token a descriptive name');
  console.log('  Example: ' + chalk.cyan('"BOSS Claude Automation"'));
  console.log('\n' + chalk.bold('Expiration:') + ' Choose based on your preference');
  console.log('  • ' + chalk.cyan('30 days') + ' - More secure (recommended for testing)');
  console.log('  • ' + chalk.cyan('90 days') + ' - Balanced');
  console.log('  • ' + chalk.cyan('No expiration') + ' - Convenient but less secure\n');

  // Step 4
  console.log(chalk.bold.green('STEP 4: Select Scopes (CHECK THESE BOXES)'));
  console.log(chalk.gray('─'.repeat(70)));
  console.log('\n' + chalk.bold.yellow('⚡ REQUIRED SCOPES - Check these checkboxes:\n'));

  const requiredScopes = [
    {
      name: 'repo',
      description: 'Full control of private repositories',
      details: [
        'repo:status - Access commit status',
        'repo_deployment - Access deployment status',
        'public_repo - Access public repositories',
        'repo:invite - Access repository invitations',
        'security_events - Read/write security events'
      ],
      note: 'This automatically checks all sub-scopes'
    },
    {
      name: 'workflow',
      description: 'Update GitHub Action workflows',
      details: [
        'Allows BOSS Claude to create/modify GitHub Actions',
        'Required for CI/CD automation'
      ],
      note: 'Separate checkbox, not under repo'
    },
    {
      name: 'write:packages',
      description: 'Upload packages to GitHub Package Registry',
      details: [
        'Needed if publishing NPM packages via GitHub',
        'Includes read:packages scope'
      ],
      note: 'Optional - only if using GitHub Packages'
    },
    {
      name: 'read:org',
      description: 'Read org and team membership, read org projects',
      details: [
        'Required for accessing organization repositories',
        'Needed if BOSS Claude works with org repos'
      ],
      note: 'Optional - only if using organization repos'
    }
  ];

  requiredScopes.forEach((scope, index) => {
    console.log(chalk.bold.cyan(`☑  ${scope.name}`) + chalk.gray(` - ${scope.description}`));
    scope.details.forEach(detail => {
      console.log('    ' + chalk.dim(detail));
    });
    if (scope.note) {
      console.log('    ' + chalk.yellow(`💡 ${scope.note}`));
    }
    console.log('');
  });

  console.log(chalk.bold.yellow('📝 MINIMUM REQUIRED FOR BASIC OPERATION:'));
  console.log('  ☑  ' + chalk.bold('repo') + ' (with all sub-scopes)');
  console.log('  ☑  ' + chalk.bold('workflow') + ' (if using GitHub Actions)\n');

  // Step 5
  console.log(chalk.bold.green('STEP 5: Visual Checklist'));
  console.log(chalk.gray('─'.repeat(70)));
  console.log('\nYour GitHub page should look like this:\n');
  console.log(chalk.dim('┌─────────────────────────────────────────┐'));
  console.log(chalk.dim('│') + '  Select scopes                        ' + chalk.dim('│'));
  console.log(chalk.dim('│                                         │'));
  console.log(chalk.dim('│') + '  ' + chalk.green('☑') + ' repo                              ' + chalk.dim('│'));
  console.log(chalk.dim('│') + '    ' + chalk.green('☑') + ' repo:status                    ' + chalk.dim('│'));
  console.log(chalk.dim('│') + '    ' + chalk.green('☑') + ' repo_deployment                ' + chalk.dim('│'));
  console.log(chalk.dim('│') + '    ' + chalk.green('☑') + ' public_repo                    ' + chalk.dim('│'));
  console.log(chalk.dim('│') + '    ' + chalk.green('☑') + ' repo:invite                    ' + chalk.dim('│'));
  console.log(chalk.dim('│') + '    ' + chalk.green('☑') + ' security_events                ' + chalk.dim('│'));
  console.log(chalk.dim('│                                         │'));
  console.log(chalk.dim('│') + '  ' + chalk.green('☑') + ' workflow                          ' + chalk.dim('│'));
  console.log(chalk.dim('│                                         │'));
  console.log(chalk.dim('│') + '  ☐ write:packages                    ' + chalk.dim('│'));
  console.log(chalk.dim('│') + '  ☐ read:org                          ' + chalk.dim('│'));
  console.log(chalk.dim('└─────────────────────────────────────────┘'));
  console.log('');

  // Step 6
  console.log(chalk.bold.green('STEP 6: Generate and Copy Token'));
  console.log(chalk.gray('─'.repeat(70)));
  console.log('\n1. Scroll to the bottom of the page');
  console.log('2. Click the ' + chalk.bold.green('"Generate token"') + ' button');
  console.log('3. GitHub will display your new token ' + chalk.bold('ONLY ONCE'));
  console.log('4. Click the ' + chalk.cyan('📋 copy icon') + ' to copy the token');
  console.log('\n' + chalk.bold.red('⚠️  CRITICAL:') + ' Save this token immediately!');
  console.log('   You will ' + chalk.bold('NEVER') + ' be able to see it again.\n');

  // Step 7
  console.log(chalk.bold.green('STEP 7: Add Token to BOSS Claude'));
  console.log(chalk.gray('─'.repeat(70)));
  console.log('\nRun this command and paste your token when prompted:\n');
  console.log('  ' + chalk.cyan('boss-claude github auth'));
  console.log('\nOr manually add to your environment:\n');
  console.log('  ' + chalk.gray('# Add to ~/.bashrc or ~/.zshrc'));
  console.log('  ' + chalk.cyan('export GITHUB_TOKEN=') + chalk.yellow('ghp_your_token_here'));
  console.log('\n');

  // Security Tips
  console.log(boxen(
    chalk.bold.red('🔒 SECURITY TIPS\n\n') +
    '• Treat this token like a password - never commit it to git\n' +
    '• Store it in environment variables or secure credential managers\n' +
    '• Rotate tokens every 90 days for better security\n' +
    '• If token is compromised, revoke immediately at:\n' +
    '  ' + chalk.blue.underline('https://github.com/settings/tokens') + '\n' +
    '• Use different tokens for different projects/purposes',
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'red'
    }
  ));

  // Troubleshooting
  console.log('\n' + chalk.bold.yellow('🔧 TROUBLESHOOTING\n'));
  console.log(chalk.bold('Token not working?'));
  console.log('  1. Verify scopes are correct (run: ' + chalk.cyan('boss-claude github check-scopes') + ')');
  console.log('  2. Check token hasn\'t expired');
  console.log('  3. Ensure token is properly set in environment');
  console.log('  4. Try regenerating with same scopes\n');

  console.log(chalk.bold('Need different scopes?'));
  console.log('  • You can edit token scopes at: ' + chalk.blue.underline('https://github.com/settings/tokens'));
  console.log('  • Click on token name → Update scopes → Save\n');

  // Quick Links
  console.log(chalk.bold.cyan('📚 QUICK LINKS\n'));
  console.log('  Create Token:    ' + chalk.blue.underline('https://github.com/settings/tokens/new'));
  console.log('  Manage Tokens:   ' + chalk.blue.underline('https://github.com/settings/tokens'));
  console.log('  GitHub Docs:     ' + chalk.blue.underline('https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens'));
  console.log('  BOSS Claude:     ' + chalk.blue.underline('https://github.com/cpretzinger/boss-claude'));
  console.log('\n');

  console.log(chalk.green('✅ Once you have your token, run: ') + chalk.bold.cyan('boss-claude github auth'));
  console.log('\n');
}

/**
 * Display scope verification instructions
 */
export function displayScopeVerification() {
  console.log('\n');
  console.log(boxen(
    chalk.bold.yellow('GitHub Token Scope Verification'),
    {
      padding: 1,
      borderStyle: 'round',
      borderColor: 'yellow'
    }
  ));

  console.log('\n' + chalk.bold('How to verify your token has the correct scopes:\n'));
  console.log('1. Go to: ' + chalk.blue.underline('https://github.com/settings/tokens'));
  console.log('2. Find your "BOSS Claude Automation" token');
  console.log('3. Check the scopes listed under the token name\n');

  console.log(chalk.bold('Expected scopes:'));
  console.log('  • ' + chalk.cyan('repo'));
  console.log('  • ' + chalk.cyan('workflow'));
  console.log('  • ' + chalk.gray('write:packages (optional)'));
  console.log('  • ' + chalk.gray('read:org (optional)'));
  console.log('\n');
}

/**
 * Display common errors and solutions
 */
export function displayCommonErrors() {
  console.log('\n');
  console.log(boxen(
    chalk.bold.red('Common GitHub Token Errors & Solutions'),
    {
      padding: 1,
      borderStyle: 'round',
      borderColor: 'red'
    }
  ));

  const errors = [
    {
      error: '401 Unauthorized',
      causes: [
        'Token is invalid or expired',
        'Token not properly set in environment'
      ],
      solutions: [
        'Regenerate token',
        'Check GITHUB_TOKEN environment variable',
        'Verify no extra spaces when copying token'
      ]
    },
    {
      error: '403 Forbidden',
      causes: [
        'Missing required scopes',
        'Repository access denied',
        'Rate limit exceeded'
      ],
      solutions: [
        'Add required scopes to token',
        'Check repository permissions',
        'Wait for rate limit reset (check headers)'
      ]
    },
    {
      error: '404 Not Found',
      causes: [
        'Repository doesn\'t exist',
        'No read access to private repo'
      ],
      solutions: [
        'Verify repository name',
        'Add repo scope to token',
        'Check organization permissions'
      ]
    },
    {
      error: 'Resource not accessible by personal access token',
      causes: [
        'Missing workflow scope',
        'Trying to access organization resource without org scope'
      ],
      solutions: [
        'Add workflow scope for Actions',
        'Add read:org scope for organization repos'
      ]
    }
  ];

  errors.forEach((item, index) => {
    console.log('\n' + chalk.bold.red(`ERROR ${index + 1}: ${item.error}`));
    console.log(chalk.yellow('  Possible causes:'));
    item.causes.forEach(cause => console.log('    • ' + cause));
    console.log(chalk.green('  Solutions:'));
    item.solutions.forEach(solution => console.log('    ✓ ' + solution));
  });

  console.log('\n');
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  switch (command) {
    case 'verify':
      displayScopeVerification();
      break;
    case 'errors':
      displayCommonErrors();
      break;
    case 'help':
      console.log('\nUsage:');
      console.log('  node github-instructions.js          Show full setup guide');
      console.log('  node github-instructions.js verify   Show scope verification');
      console.log('  node github-instructions.js errors   Show common errors');
      console.log('  node github-instructions.js help     Show this help\n');
      break;
    default:
      displayGitHubPATInstructions();
  }
}

export default {
  displayGitHubPATInstructions,
  displayScopeVerification,
  displayCommonErrors
};
