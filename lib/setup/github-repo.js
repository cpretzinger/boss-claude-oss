import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import chalk from 'chalk';

const REPO_NAME = 'boss-claude-memory';
const REPO_DESCRIPTION = 'Boss Claude persistent memory store - session data, achievements, and XP progression';

/**
 * Get GitHub token from environment or git config
 */
function getGitHubToken() {
  // Try environment variable first
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  // Try git config
  try {
    const token = execSync('git config --global github.token', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    if (token) return token;
  } catch (error) {
    // Ignore errors, will handle missing token below
  }

  return null;
}

/**
 * Get current GitHub username
 */
async function getGitHubUsername(octokit) {
  try {
    const { data } = await octokit.users.getAuthenticated();
    return data.login;
  } catch (error) {
    throw new Error('Failed to get GitHub username. Please check your token.');
  }
}

/**
 * Check if repository exists
 */
async function repositoryExists(octokit, owner, repo) {
  try {
    await octokit.repos.get({ owner, repo });
    return true;
  } catch (error) {
    if (error.status === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Create private repository
 */
async function createRepository(octokit, repo) {
  try {
    const { data } = await octokit.repos.createForAuthenticatedUser({
      name: repo,
      description: REPO_DESCRIPTION,
      private: true,
      auto_init: true,
      has_issues: true,
      has_projects: false,
      has_wiki: false
    });
    return data;
  } catch (error) {
    if (error.status === 422) {
      throw new Error(`Repository "${repo}" already exists or name is invalid`);
    }
    throw error;
  }
}

/**
 * Update repository description and settings
 */
async function updateRepository(octokit, owner, repo) {
  try {
    await octokit.repos.update({
      owner,
      repo,
      description: REPO_DESCRIPTION,
      private: true,
      has_issues: true,
      has_projects: false,
      has_wiki: false
    });
  } catch (error) {
    throw new Error(`Failed to update repository settings: ${error.message}`);
  }
}

/**
 * Verify repository access and permissions
 */
async function verifyAccess(octokit, owner, repo) {
  try {
    const { data } = await octokit.repos.get({ owner, repo });

    const checks = {
      exists: true,
      isPrivate: data.private,
      hasWriteAccess: data.permissions?.push || data.permissions?.admin,
      url: data.html_url,
      cloneUrl: data.clone_url
    };

    return checks;
  } catch (error) {
    if (error.status === 404) {
      return {
        exists: false,
        isPrivate: false,
        hasWriteAccess: false,
        url: null,
        cloneUrl: null
      };
    }
    throw error;
  }
}

/**
 * Main setup function
 */
export async function setupGitHubRepo(options = {}) {
  const { verbose = false } = options;

  const log = (msg, type = 'info') => {
    if (!verbose && type === 'debug') return;

    const prefix = {
      info: chalk.blue('ℹ'),
      success: chalk.green('✓'),
      error: chalk.red('✗'),
      debug: chalk.gray('→')
    }[type] || '';

    console.log(`${prefix} ${msg}`);
  };

  try {
    // Step 1: Get GitHub token
    const token = getGitHubToken();
    if (!token) {
      throw new Error(
        'GitHub token not found. Set GITHUB_TOKEN environment variable or run:\n' +
        'git config --global github.token YOUR_TOKEN'
      );
    }
    log('GitHub token found', 'debug');

    // Step 2: Initialize Octokit
    const octokit = new Octokit({ auth: token });
    log('Authenticated with GitHub', 'debug');

    // Step 3: Get username
    const username = await getGitHubUsername(octokit);
    log(`GitHub user: ${username}`, 'debug');

    // Step 4: Check if repo exists
    log('Checking for existing repository...', 'debug');
    const exists = await repositoryExists(octokit, username, REPO_NAME);

    if (!exists) {
      // Step 5: Create repository
      log(`Creating private repository "${REPO_NAME}"...`, 'info');
      const repo = await createRepository(octokit, REPO_NAME);
      log(`Repository created: ${repo.html_url}`, 'success');
    } else {
      log(`Repository "${REPO_NAME}" already exists`, 'debug');

      // Update description and ensure privacy
      log('Updating repository settings...', 'debug');
      await updateRepository(octokit, username, REPO_NAME);
      log('Repository settings updated', 'debug');
    }

    // Step 6: Verify access
    log('Verifying repository access...', 'debug');
    const access = await verifyAccess(octokit, username, REPO_NAME);

    if (!access.exists) {
      throw new Error(`Repository verification failed: ${REPO_NAME} not found`);
    }

    if (!access.isPrivate) {
      console.warn(chalk.yellow('⚠ Warning: Repository is public. Consider making it private.'));
    }

    if (!access.hasWriteAccess) {
      throw new Error('No write access to repository. Check your permissions.');
    }

    log('Repository access verified', 'success');

    return {
      success: true,
      owner: username,
      repo: REPO_NAME,
      url: access.url,
      cloneUrl: access.cloneUrl,
      isPrivate: access.isPrivate,
      created: !exists
    };

  } catch (error) {
    log(error.message, 'error');

    return {
      success: false,
      error: error.message,
      owner: null,
      repo: REPO_NAME,
      url: null,
      cloneUrl: null,
      isPrivate: false,
      created: false
    };
  }
}

/**
 * CLI-friendly wrapper
 */
export async function setupGitHubRepoCommand() {
  console.log(chalk.bold('\n🔧 Boss Claude GitHub Repository Setup\n'));

  const result = await setupGitHubRepo({ verbose: true });

  if (result.success) {
    console.log(chalk.green.bold('\n✓ Setup Complete!\n'));
    console.log(chalk.gray('Repository Details:'));
    console.log(chalk.gray('  Owner:'), result.owner);
    console.log(chalk.gray('  Name:'), result.repo);
    console.log(chalk.gray('  URL:'), result.url);
    console.log(chalk.gray('  Private:'), result.isPrivate ? chalk.green('Yes') : chalk.red('No'));
    console.log(chalk.gray('  Status:'), result.created ? chalk.yellow('Created') : chalk.blue('Updated'));
  } else {
    console.log(chalk.red.bold('\n✗ Setup Failed\n'));
    console.log(chalk.red(result.error));
    process.exit(1);
  }
}

// Export for testing
export { getGitHubToken, getGitHubUsername, repositoryExists, createRepository };
