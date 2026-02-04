/**
 * OUTPUT FORMATTER
 *
 * Centralized output formatting utilities to prevent message truncation
 * and ensure consistent display across all agent responses.
 */

/**
 * Format text for terminal output without truncation
 *
 * @param {string} text - Text to format
 * @param {Object} options - Formatting options
 * @param {number} options.maxWidth - Maximum width (0 = terminal width, default: 0)
 * @param {boolean} options.wordWrap - Enable word wrapping (default: true)
 * @param {string} options.indent - Indentation string (default: '')
 * @param {boolean} options.preserveNewlines - Keep existing line breaks (default: true)
 * @returns {string} Formatted text
 */
export function formatText(text, options = {}) {
  const {
    maxWidth = 0,
    wordWrap = true,
    indent = '',
    preserveNewlines = true
  } = options;

  if (!text) return '';

  // Calculate effective max width
  const effectiveMaxWidth = maxWidth === 0 ? getTerminalWidth() - indent.length : maxWidth;

  // If word wrap disabled, return as-is
  if (!wordWrap) {
    return text;
  }

  // Word wrap implementation
  const lines = preserveNewlines ? text.split('\n') : [text];
  const wrappedLines = [];

  for (const line of lines) {
    if (line.length <= effectiveMaxWidth) {
      wrappedLines.push(indent + line);
      continue;
    }

    // Split long lines at word boundaries
    const words = line.split(/(\s+)/); // Preserve whitespace
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine + word;

      if (testLine.length <= effectiveMaxWidth) {
        currentLine = testLine;
      } else {
        // If a single word is longer than max width, split it
        if (currentLine.trim() === '' && word.trim().length > effectiveMaxWidth) {
          // Hard wrap long words
          for (let i = 0; i < word.length; i += effectiveMaxWidth) {
            wrappedLines.push(indent + word.substring(i, i + effectiveMaxWidth));
          }
        } else {
          if (currentLine.trim()) {
            wrappedLines.push(indent + currentLine.trimEnd());
          }
          currentLine = word.trimStart();
        }
      }
    }

    if (currentLine.trim()) {
      wrappedLines.push(indent + currentLine.trimEnd());
    }
  }

  return wrappedLines.join('\n');
}

/**
 * Format agent response for display
 * NEVER truncates content - shows full response with intelligent wrapping
 *
 * @param {string} response - Agent response text
 * @param {Object} options - Formatting options
 * @param {string} options.prefix - Prefix for response (default: '')
 * @param {boolean} options.wordWrap - Enable word wrapping (default: true)
 * @param {number} options.maxWidth - Maximum width (0 = terminal width, default: 0)
 * @param {string} options.indent - Indentation for wrapped lines (default: '  ')
 * @returns {string} Formatted response
 */
export function formatAgentResponse(response, options = {}) {
  const {
    prefix = '',
    wordWrap = true,
    maxWidth = 0,
    indent = '  '
  } = options;

  if (!response) return '';

  const effectiveMaxWidth = maxWidth === 0 ? getTerminalWidth() - 4 : maxWidth; // Leave margin
  const formattedText = formatText(response, {
    maxWidth: effectiveMaxWidth,
    wordWrap,
    indent,
    preserveNewlines: true
  });

  return prefix ? `${prefix}\n${formattedText}` : formattedText;
}

/**
 * Format task description for display
 * NEVER truncates content - shows full task with intelligent wrapping
 *
 * @param {string} task - Task description
 * @param {Object} options - Formatting options
 * @param {string} options.prefix - Prefix for task (default: '')
 * @param {boolean} options.wordWrap - Enable word wrapping (default: true)
 * @param {number} options.maxWidth - Maximum width (0 = terminal width, default: 0)
 * @param {string} options.indent - Indentation for wrapped lines (default: '  ')
 * @returns {string} Formatted task
 */
export function formatTaskDescription(task, options = {}) {
  const {
    prefix = '',
    wordWrap = true,
    maxWidth = 0,
    indent = '  '
  } = options;

  if (!task) return '';

  const effectiveMaxWidth = maxWidth === 0 ? getTerminalWidth() - 4 : maxWidth; // Leave margin
  const formattedText = formatText(task, {
    maxWidth: effectiveMaxWidth,
    wordWrap,
    indent,
    preserveNewlines: true
  });

  return prefix ? `${prefix}\n${formattedText}` : formattedText;
}

/**
 * Format command output for display
 * Shows full command unless explicitly limited
 *
 * @param {string} command - Command string
 * @param {Object} options - Formatting options
 * @param {number} options.maxLength - Max length before truncation (0 = no limit)
 * @returns {string} Formatted command
 */
export function formatCommand(command, options = {}) {
  const { maxLength = 0 } = options;

  if (!command) return '';

  // Only truncate if maxLength explicitly set and > 0
  if (maxLength > 0 && command.length > maxLength) {
    return command.substring(0, maxLength) + '...';
  }

  return command;
}

/**
 * Format file path for display
 * Optionally shows just filename or full path
 *
 * @param {string} filePath - File path
 * @param {Object} options - Formatting options
 * @param {boolean} options.basename - Show only filename (default: false)
 * @returns {string} Formatted path
 */
export function formatFilePath(filePath, options = {}) {
  const { basename = false } = options;

  if (!filePath) return '[unknown]';

  if (basename) {
    return filePath.split('/').pop();
  }

  return filePath;
}

/**
 * Get terminal width if available
 * @returns {number} Terminal width in columns (default: 80)
 */
export function getTerminalWidth() {
  return process.stdout.columns || 80;
}

/**
 * Check if output is truncated
 * @param {string} original - Original text
 * @param {string} displayed - Displayed text
 * @returns {boolean} True if truncated
 */
export function isTruncated(original, displayed) {
  return original.length > displayed.length;
}

/**
 * Safe truncate with ellipsis
 * Only use when truncation is explicitly needed
 *
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length (including ellipsis)
 * @param {string} ellipsis - Ellipsis string (default: '...')
 * @returns {string} Truncated text
 */
export function safeTruncate(text, maxLength, ellipsis = '...') {
  if (!text || maxLength <= 0) return text;
  if (text.length <= maxLength) return text;

  const truncateAt = maxLength - ellipsis.length;
  return text.substring(0, truncateAt) + ellipsis;
}

/**
 * Format log details with intelligent line wrapping
 * Used for watch command and live logging
 *
 * @param {string} details - Details text from log
 * @param {Object} options - Formatting options
 * @param {number} options.maxWidth - Maximum width for first line (0 = terminal width, default: 0)
 * @param {string} options.continuationPrefix - Prefix for continuation lines (default: '    ')
 * @param {boolean} options.multiline - Allow multiline output (default: true)
 * @returns {string} Formatted details (may contain newlines)
 */
export function formatLogDetails(details, options = {}) {
  const {
    maxWidth = 0,
    continuationPrefix = '    ',
    multiline = true
  } = options;

  if (!details) return '';

  const terminalWidth = getTerminalWidth();
  const effectiveMaxWidth = maxWidth === 0 ? terminalWidth - 40 : maxWidth; // Leave room for timestamp/event/agent

  // Single line mode - truncate if needed
  if (!multiline) {
    if (details.length <= effectiveMaxWidth) {
      return details;
    }
    return safeTruncate(details, effectiveMaxWidth);
  }

  // Multi-line mode - wrap intelligently
  const lines = [];
  let remainingText = details;
  let isFirstLine = true;

  while (remainingText.length > 0) {
    const currentMaxWidth = isFirstLine ? effectiveMaxWidth : (terminalWidth - continuationPrefix.length - 4);

    if (remainingText.length <= currentMaxWidth) {
      lines.push(isFirstLine ? remainingText : continuationPrefix + remainingText);
      break;
    }

    // Find last space before max width
    let breakPoint = remainingText.lastIndexOf(' ', currentMaxWidth);

    // If no space found, break at max width
    if (breakPoint === -1 || breakPoint === 0) {
      breakPoint = currentMaxWidth;
    }

    const line = remainingText.substring(0, breakPoint).trimEnd();
    lines.push(isFirstLine ? line : continuationPrefix + line);

    remainingText = remainingText.substring(breakPoint).trimStart();
    isFirstLine = false;
  }

  return lines.join('\n');
}

export default {
  formatText,
  formatAgentResponse,
  formatTaskDescription,
  formatCommand,
  formatFilePath,
  formatLogDetails,
  getTerminalWidth,
  isTruncated,
  safeTruncate
};
