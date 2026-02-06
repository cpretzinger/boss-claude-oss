/**
 * Agent Name Validator
 *
 * Security validation for agent names to prevent path traversal attacks
 * and other security vulnerabilities in the agent:start command.
 *
 * Addresses vulnerabilities:
 * - PATH_TRAVERSAL_CRITICAL
 * - ARBITRARY_FILE_READ
 * - INFO_DISCLOSURE
 */

const MAX_AGENT_NAME_LENGTH = 32;
const VALID_AGENT_NAME_PATTERN = /^[a-z0-9_+\-]+$/;
const VALID_REPO_NAME_PATTERN = /^[a-zA-Z0-9._\-]+$/;

/**
 * Validates an agent name for security and format compliance
 *
 * @param {string} agentName - The agent name to validate
 * @returns {{valid: boolean, error?: string, sanitized?: string}} Validation result
 */
export function validateAgentName(agentName) {
  // Check if name is provided
  if (!agentName || typeof agentName !== 'string') {
    return {
      valid: false,
      error: 'Agent name is required and must be a string'
    };
  }

  // Trim whitespace
  const trimmed = agentName.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      error: 'Agent name cannot be empty'
    };
  }

  // Check maximum length
  if (trimmed.length > MAX_AGENT_NAME_LENGTH) {
    return {
      valid: false,
      error: `Agent name cannot exceed ${MAX_AGENT_NAME_LENGTH} characters`
    };
  }

  // Convert to lowercase for consistency
  const normalized = trimmed.toLowerCase();

  // Check for path traversal attempts
  if (normalized.includes('..') || normalized.includes('./') || normalized.includes('.\\')) {
    return {
      valid: false,
      error: 'Agent name cannot contain path traversal sequences (../, ./, .\\)'
    };
  }

  // Check for absolute path indicators
  if (normalized.startsWith('/') || normalized.startsWith('\\') || /^[a-z]:/i.test(normalized)) {
    return {
      valid: false,
      error: 'Agent name cannot be an absolute path'
    };
  }

  // Check for null bytes (can bypass file system checks)
  if (normalized.includes('\0') || normalized.includes('%00')) {
    return {
      valid: false,
      error: 'Agent name cannot contain null bytes'
    };
  }

  // Check for valid characters (alphanumeric, hyphens, underscores, plus signs only)
  if (!VALID_AGENT_NAME_PATTERN.test(normalized)) {
    return {
      valid: false,
      error: 'Agent name can only contain lowercase letters, numbers, hyphens, underscores, and plus signs'
    };
  }

  // Check for reserved names
  const reservedNames = ['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'com5',
                        'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4',
                        'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'];
  if (reservedNames.includes(normalized)) {
    return {
      valid: false,
      error: `Agent name '${normalized}' is reserved and cannot be used`
    };
  }

  // All checks passed
  return {
    valid: true,
    sanitized: normalized
  };
}

/**
 * Validates and sanitizes an agent name, throwing an error if invalid
 *
 * @param {string} agentName - The agent name to validate
 * @returns {string} The sanitized agent name
 * @throws {Error} If the agent name is invalid
 */
export function validateAndSanitizeAgentName(agentName) {
  const result = validateAgentName(agentName);

  if (!result.valid) {
    throw new Error(`Invalid agent name: ${result.error}`);
  }

  return result.sanitized;
}

/**
 * Validates a repository name for security and format compliance
 *
 * Prevents:
 * - Path traversal attacks (../, ./, .\)
 * - Absolute paths (/, \, C:)
 * - Null byte injection (\0, %00)
 * - Special characters that could enable injection attacks
 *
 * @param {string} repoName - The repository name to validate
 * @returns {{valid: boolean, error?: string, sanitized?: string}} Validation result
 */
export function validateRepoName(repoName) {
  // Check if name is provided
  if (!repoName || typeof repoName !== 'string') {
    return {
      valid: false,
      error: 'Repository name is required and must be a string'
    };
  }

  // Trim whitespace
  const trimmed = repoName.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      error: 'Repository name cannot be empty'
    };
  }

  // Check maximum length (reasonable limit for repo names)
  if (trimmed.length > 255) {
    return {
      valid: false,
      error: 'Repository name cannot exceed 255 characters'
    };
  }

  // SECURITY: Character whitelist check FIRST (positive validation)
  // This blocks shell metacharacters like ;, $(), `, |, &, etc.
  // and provides defense-in-depth before more specific checks
  if (!VALID_REPO_NAME_PATTERN.test(trimmed)) {
    return {
      valid: false,
      error: 'Repository name can only contain letters, numbers, dots, hyphens, and underscores'
    };
  }

  // Check for path traversal attempts
  if (trimmed.includes('..') || trimmed.includes('./') || trimmed.includes('.\\')) {
    return {
      valid: false,
      error: 'Repository name cannot contain path traversal sequences (../, ./, .\\)'
    };
  }

  // Check for absolute path indicators
  if (trimmed.startsWith('/') || trimmed.startsWith('\\') || /^[a-z]:/i.test(trimmed)) {
    return {
      valid: false,
      error: 'Repository name cannot be an absolute path'
    };
  }

  // Check for path separators in the middle (allow hyphens and underscores)
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    return {
      valid: false,
      error: 'Repository name cannot contain path separators'
    };
  }

  // Check for null bytes (can bypass file system checks)
  if (trimmed.includes('\0') || trimmed.includes('%00')) {
    return {
      valid: false,
      error: 'Repository name cannot contain null bytes'
    };
  }

  // All checks passed
  return {
    valid: true,
    sanitized: trimmed
  };
}

/**
 * Validates and sanitizes a repository name, throwing an error if invalid
 *
 * @param {string} repoName - The repository name to validate
 * @returns {string} The sanitized repository name
 * @throws {Error} If the repository name is invalid
 */
export function validateAndSanitizeRepoName(repoName) {
  const result = validateRepoName(repoName);

  if (!result.valid) {
    throw new Error(`Invalid repository name: ${result.error}`);
  }

  return result.sanitized;
}
