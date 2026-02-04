#!/usr/bin/env node

/**
 * Verification script for GitHub repository setup
 * Tests all major functionality without creating a repository
 */

import chalk from 'chalk';
import { getGitHubToken } from './github-repo.js';
import { Octokit } from '@octokit/rest';

console.log(chalk.bold('\n🔍 Boss Claude GitHub Setup Verification\n'));

// Step 1: Check for token
console.log(chalk.blue('1. Checking for GitHub token...'));
const token = getGitHubToken();

if (token) {
  console.log(chalk.green('   ✓ Token found'));
  console.log(chalk.gray(`   → Source: ${process.env.GITHUB_TOKEN ? 'GITHUB_TOKEN env var' : 'git config'}`));
  console.log(chalk.gray(`   → Length: ${token.length} characters`));
  console.log(chalk.gray(`   → Prefix: ${token.substring(0, 7)}...`));
} else {
  console.log(chalk.red('   ✗ No token found'));
  console.log(chalk.yellow('\n   To fix, run one of these:'));
  console.log(chalk.gray('   export GITHUB_TOKEN=ghp_your_token'));
  console.log(chalk.gray('   git config --global github.token ghp_your_token'));
  process.exit(1);
}

// Step 2: Test authentication
console.log(chalk.blue('\n2. Testing GitHub authentication...'));
const octokit = new Octokit({ auth: token });

try {
  const { data: user } = await octokit.users.getAuthenticated();
  console.log(chalk.green('   ✓ Authentication successful'));
  console.log(chalk.gray(`   → Username: ${user.login}`));
  console.log(chalk.gray(`   → Name: ${user.name || 'Not set'}`));
  console.log(chalk.gray(`   → Account type: ${user.type}`));
  console.log(chalk.gray(`   → Public repos: ${user.public_repos}`));
  console.log(chalk.gray(`   → Private repos: ${user.total_private_repos || 'Unknown'}`));
} catch (error) {
  console.log(chalk.red('   ✗ Authentication failed'));
  console.log(chalk.red(`   → Error: ${error.message}`));
  console.log(chalk.yellow('\n   Your token may be invalid or expired.'));
  console.log(chalk.gray('   Create a new token at: https://github.com/settings/tokens'));
  process.exit(1);
}

// Step 3: Check token scopes
console.log(chalk.blue('\n3. Checking token permissions...'));
try {
  const { headers } = await octokit.request('HEAD /user');
  const scopes = headers['x-oauth-scopes']?.split(', ') || [];

  if (scopes.length === 0) {
    console.log(chalk.yellow('   ⚠ Warning: Could not determine token scopes'));
  } else {
    console.log(chalk.green('   ✓ Token scopes found'));
    scopes.forEach(scope => {
      const hasRepo = scope === 'repo' || scope.startsWith('repo:');
      const icon = hasRepo ? chalk.green('✓') : chalk.gray('•');
      console.log(chalk.gray(`   ${icon} ${scope}`));
    });

    const hasRepoScope = scopes.some(s => s === 'repo' || s.startsWith('repo:'));
    if (hasRepoScope) {
      console.log(chalk.green('\n   ✓ Token has required repo permissions'));
    } else {
      console.log(chalk.yellow('\n   ⚠ Warning: Token may not have repo creation permissions'));
      console.log(chalk.gray('   → Required scope: repo'));
    }
  }
} catch (error) {
  console.log(chalk.yellow('   ⚠ Could not check token permissions'));
  console.log(chalk.gray(`   → ${error.message}`));
}

// Step 4: Check rate limits
console.log(chalk.blue('\n4. Checking API rate limits...'));
try {
  const { data: rateLimit } = await octokit.rateLimit.get();
  const { core } = rateLimit.resources;

  console.log(chalk.green('   ✓ Rate limit status'));
  console.log(chalk.gray(`   → Remaining: ${core.remaining}/${core.limit}`));
  console.log(chalk.gray(`   → Resets at: ${new Date(core.reset * 1000).toLocaleTimeString()}`));

  if (core.remaining < 10) {
    console.log(chalk.yellow('\n   ⚠ Warning: Low rate limit remaining'));
  }
} catch (error) {
  console.log(chalk.yellow('   ⚠ Could not check rate limits'));
  console.log(chalk.gray(`   → ${error.message}`));
}

// Step 5: Summary
console.log(chalk.bold.green('\n✓ Verification Complete\n'));
console.log(chalk.gray('Your GitHub setup is ready for Boss Claude repository creation.'));
console.log(chalk.gray('\nTo create the repository, run:'));
console.log(chalk.cyan('  node lib/setup/test-github-setup.js\n'));
