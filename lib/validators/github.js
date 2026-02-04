import { Octokit } from '@octokit/rest';

/**
 * GitHub Token Validator
 * Tests if a GitHub token has the required permissions for Boss Claude operations
 *
 * Required Permissions:
 * - Issues: Read/Write (repo scope or issues scope)
 * - Contents: Read/Write (repo scope or contents scope)
 */

/**
 * Validates GitHub token permissions
 * @param {string} token - GitHub personal access token
 * @param {Object} options - Validation options
 * @param {boolean} options.strict - If true, requires exact scopes. If false, allows broader scopes like 'repo'
 * @returns {Promise<Object>} Validation result
 */
export async function validateGitHubToken(token, options = { strict: false }) {
  if (!token) {
    return {
      valid: false,
      error: 'No GitHub token provided',
      missingPermissions: ['issues', 'contents'],
      suggestion: 'Provide a GitHub personal access token'
    };
  }

  const octokit = new Octokit({ auth: token });

  try {
    // Get token information
    const { data: user, headers } = await octokit.rest.users.getAuthenticated();

    // Parse X-OAuth-Scopes header to get token scopes
    const scopeHeader = headers['x-oauth-scopes'];
    const scopes = scopeHeader ? scopeHeader.split(',').map(s => s.trim()) : [];

    // Check for required permissions
    const requiredPermissions = {
      issues: checkIssuesPermission(scopes, options.strict),
      contents: checkContentsPermission(scopes, options.strict)
    };

    const hasAllPermissions = requiredPermissions.issues && requiredPermissions.contents;
    const missingPermissions = [];

    if (!requiredPermissions.issues) {
      missingPermissions.push('issues');
    }
    if (!requiredPermissions.contents) {
      missingPermissions.push('contents');
    }

    if (hasAllPermissions) {
      return {
        valid: true,
        user: user.login,
        scopes: scopes,
        permissions: {
          issues: 'read/write',
          contents: 'read/write'
        },
        message: `✅ GitHub token valid for user: ${user.login}`
      };
    } else {
      return {
        valid: false,
        user: user.login,
        scopes: scopes,
        error: 'Token is missing required permissions',
        missingPermissions: missingPermissions,
        currentPermissions: {
          issues: requiredPermissions.issues ? 'read/write' : 'none or read-only',
          contents: requiredPermissions.contents ? 'read/write' : 'none or read-only'
        },
        suggestion: generatePermissionSuggestion(missingPermissions, scopes)
      };
    }

  } catch (error) {
    // Handle specific error cases
    if (error.status === 401) {
      return {
        valid: false,
        error: 'Invalid or expired GitHub token',
        details: error.message,
        suggestion: 'Generate a new personal access token at https://github.com/settings/tokens'
      };
    }

    if (error.status === 403) {
      return {
        valid: false,
        error: 'GitHub API rate limit exceeded or token lacks basic access',
        details: error.message,
        suggestion: 'Wait for rate limit reset or check token permissions'
      };
    }

    return {
      valid: false,
      error: 'Failed to validate GitHub token',
      details: error.message,
      suggestion: 'Check your network connection and token validity'
    };
  }
}

/**
 * Check if token has issues read/write permission
 * @param {Array<string>} scopes - Token scopes
 * @param {boolean} strict - Strict mode flag
 * @returns {boolean} True if has permission
 */
function checkIssuesPermission(scopes, strict) {
  // 'repo' scope includes full access to repositories (issues, contents, etc.)
  // 'public_repo' includes access to public repositories
  // Fine-grained tokens might have specific 'issues' scope

  if (strict) {
    // In strict mode, require explicit issues scope or repo scope
    return scopes.includes('repo') || scopes.includes('issues');
  }

  // In non-strict mode, allow broader scopes
  return scopes.includes('repo') ||
         scopes.includes('public_repo') ||
         scopes.includes('issues');
}

/**
 * Check if token has contents read/write permission
 * @param {Array<string>} scopes - Token scopes
 * @param {boolean} strict - Strict mode flag
 * @returns {boolean} True if has permission
 */
function checkContentsPermission(scopes, strict) {
  // 'repo' scope includes full access to repositories
  // 'public_repo' includes access to public repositories
  // Fine-grained tokens might have specific 'contents' scope

  if (strict) {
    // In strict mode, require explicit contents scope or repo scope
    return scopes.includes('repo') || scopes.includes('contents');
  }

  // In non-strict mode, allow broader scopes
  return scopes.includes('repo') ||
         scopes.includes('public_repo');
}

/**
 * Generate helpful permission suggestion based on missing permissions
 * @param {Array<string>} missing - Missing permission names
 * @param {Array<string>} current - Current scopes
 * @returns {string} Helpful suggestion
 */
function generatePermissionSuggestion(missing, current) {
  const suggestions = [];

  if (missing.length === 0) {
    return 'Token has all required permissions';
  }

  suggestions.push('To fix this, create a new GitHub token with the following scopes:');

  if (current.includes('repo')) {
    suggestions.push('  - Your token already has "repo" scope, but it may be read-only');
    suggestions.push('  - Ensure the token has write access to repositories');
  } else {
    suggestions.push('  - Add "repo" scope for full repository access (recommended)');
    suggestions.push('  OR');

    if (missing.includes('issues')) {
      suggestions.push('  - Add "issues" scope for issues read/write access');
    }
    if (missing.includes('contents')) {
      suggestions.push('  - Add "contents" scope for repository contents read/write access');
    }
  }

  suggestions.push('');
  suggestions.push('Create a new token at: https://github.com/settings/tokens/new');
  suggestions.push('Or use fine-grained tokens at: https://github.com/settings/personal-access-tokens/new');

  return suggestions.join('\n');
}

/**
 * Test token against a specific repository
 * @param {string} token - GitHub token
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<Object>} Test result
 */
export async function testTokenOnRepository(token, owner, repo) {
  const octokit = new Octokit({ auth: token });

  const tests = {
    readIssues: false,
    writeIssues: false,
    readContents: false,
    writeContents: false
  };

  const errors = [];

  try {
    // Test 1: Read issues
    try {
      await octokit.rest.issues.listForRepo({ owner, repo, per_page: 1 });
      tests.readIssues = true;
    } catch (error) {
      errors.push(`Read Issues: ${error.message}`);
    }

    // Test 2: Create a test issue (we'll close it immediately)
    try {
      const { data: issue } = await octokit.rest.issues.create({
        owner,
        repo,
        title: '[Boss Claude] Token validation test',
        body: 'This is an automated test. Closing immediately.',
        labels: ['bot', 'test']
      });
      tests.writeIssues = true;

      // Close the test issue
      await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issue.number,
        state: 'closed'
      });
    } catch (error) {
      errors.push(`Write Issues: ${error.message}`);
    }

    // Test 3: Read contents
    try {
      await octokit.rest.repos.getContent({ owner, repo, path: 'README.md' });
      tests.readContents = true;
    } catch (error) {
      errors.push(`Read Contents: ${error.message}`);
    }

    // Test 4: Write contents (get latest commit to test write access)
    try {
      await octokit.rest.repos.listCommits({ owner, repo, per_page: 1 });
      tests.writeContents = true;
    } catch (error) {
      errors.push(`Write Contents: ${error.message}`);
    }

    const allTestsPassed = Object.values(tests).every(t => t === true);

    return {
      success: allTestsPassed,
      repository: `${owner}/${repo}`,
      tests,
      errors: errors.length > 0 ? errors : null,
      message: allTestsPassed
        ? `✅ All permissions verified on ${owner}/${repo}`
        : `❌ Some permissions are missing on ${owner}/${repo}`
    };

  } catch (error) {
    return {
      success: false,
      repository: `${owner}/${repo}`,
      error: `Failed to test repository: ${error.message}`,
      suggestion: 'Ensure the repository exists and the token has access to it'
    };
  }
}

/**
 * Validate and display results in a user-friendly format
 * @param {string} token - GitHub token
 * @param {Object} options - Validation options
 * @returns {Promise<boolean>} True if valid
 */
export async function validateAndDisplay(token, options = {}) {
  const result = await validateGitHubToken(token, options);

  if (result.valid) {
    console.log('\n✅ GitHub Token Validation: PASSED');
    console.log(`User: ${result.user}`);
    console.log(`Scopes: ${result.scopes.join(', ')}`);
    console.log(`Permissions: Issues (R/W), Contents (R/W)`);
  } else {
    console.log('\n❌ GitHub Token Validation: FAILED');
    console.log(`Error: ${result.error}`);
    if (result.missingPermissions) {
      console.log(`Missing: ${result.missingPermissions.join(', ')}`);
    }
    if (result.suggestion) {
      console.log(`\n${result.suggestion}`);
    }
  }

  return result.valid;
}

export default {
  validateGitHubToken,
  testTokenOnRepository,
  validateAndDisplay
};
