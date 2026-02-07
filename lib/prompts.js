/**
 * BOSS CLAUDE INTERACTIVE CLI PROMPTS
 * Beautiful, reusable prompt system with validation and colors
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

// ==================== COLOR THEME ====================
export const theme = {
  primary: chalk.hex('#00D9FF'),      // Cyan
  success: chalk.hex('#00FF88'),      // Green
  warning: chalk.hex('#FFB800'),      // Orange
  error: chalk.hex('#FF3366'),        // Red
  info: chalk.hex('#A78BFA'),         // Purple
  muted: chalk.gray,
  bold: chalk.bold,
  dim: chalk.dim,

  // Gradients (simulated with multiple colors)
  gradient: (text) => {
    const colors = ['#00D9FF', '#00FF88', '#FFB800'];
    return text.split('').map((char, i) =>
      chalk.hex(colors[i % colors.length])(char)
    ).join('');
  }
};

// ==================== VALIDATORS ====================
export const validators = {
  required: (input) => {
    return input.trim() !== '' || 'This field is required';
  },

  email: (input) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(input) || 'Please enter a valid email address';
  },

  url: (input) => {
    try {
      new URL(input);
      return true;
    } catch {
      return 'Please enter a valid URL';
    }
  },

  number: (input) => {
    return !isNaN(parseFloat(input)) || 'Please enter a valid number';
  },

  integer: (input) => {
    return Number.isInteger(Number(input)) || 'Please enter a whole number';
  },

  positive: (input) => {
    return parseFloat(input) > 0 || 'Please enter a positive number';
  },

  minLength: (min) => (input) => {
    return input.length >= min || `Must be at least ${min} characters`;
  },

  maxLength: (max) => (input) => {
    return input.length <= max || `Must be no more than ${max} characters`;
  },

  pattern: (regex, message) => (input) => {
    return regex.test(input) || message;
  },

  custom: (fn, message) => (input) => {
    return fn(input) || message;
  }
};

// ==================== PROMPT FUNCTIONS ====================

/**
 * Text input prompt
 */
export async function promptText({
  message,
  defaultValue = '',
  validate = null,
  transform = null,
  placeholder = ''
}) {
  const answers = await inquirer.prompt([{
    type: 'input',
    name: 'value',
    message: theme.primary(message),
    default: defaultValue,
    validate: validate || (() => true),
    transformer: transform,
    prefix: theme.bold('?'),
    suffix: placeholder ? theme.dim(` (${placeholder})`) : ''
  }]);

  return answers.value;
}

/**
 * Password/secret input (hidden)
 */
export async function promptPassword({
  message,
  validate = null,
  mask = '*'
}) {
  const answers = await inquirer.prompt([{
    type: 'password',
    name: 'value',
    message: theme.primary(message),
    mask,
    validate: validate || validators.required,
    prefix: theme.bold('?')
  }]);

  return answers.value;
}

/**
 * Confirmation prompt (yes/no)
 */
export async function promptConfirm({
  message,
  defaultValue = false
}) {
  const answers = await inquirer.prompt([{
    type: 'confirm',
    name: 'value',
    message: theme.primary(message),
    default: defaultValue,
    prefix: theme.bold('?')
  }]);

  return answers.value;
}

/**
 * Select from list (single choice)
 */
export async function promptSelect({
  message,
  choices,
  defaultValue = null,
  loop = true
}) {
  const formattedChoices = choices.map(choice => {
    if (typeof choice === 'string') {
      return { name: choice, value: choice };
    }
    return choice;
  });

  const answers = await inquirer.prompt([{
    type: 'list',
    name: 'value',
    message: theme.primary(message),
    choices: formattedChoices,
    default: defaultValue,
    loop,
    prefix: theme.bold('?')
  }]);

  return answers.value;
}

/**
 * Multi-select from list (checkboxes)
 */
export async function promptMultiSelect({
  message,
  choices,
  defaultValues = [],
  validate = null
}) {
  const formattedChoices = choices.map(choice => {
    if (typeof choice === 'string') {
      return {
        name: choice,
        value: choice,
        checked: defaultValues.includes(choice)
      };
    }
    return {
      ...choice,
      checked: choice.checked || defaultValues.includes(choice.value)
    };
  });

  const answers = await inquirer.prompt([{
    type: 'checkbox',
    name: 'value',
    message: theme.primary(message),
    choices: formattedChoices,
    validate: validate || ((answer) => answer.length > 0 || 'Select at least one option'),
    prefix: theme.bold('?')
  }]);

  return answers.value;
}

/**
 * Number input with validation
 */
export async function promptNumber({
  message,
  defaultValue = null,
  min = null,
  max = null,
  integer = false
}) {
  const validate = (input) => {
    if (integer && !Number.isInteger(Number(input))) {
      return 'Please enter a whole number';
    }
    const num = parseFloat(input);
    if (isNaN(num)) return 'Please enter a valid number';
    if (min !== null && num < min) return `Must be at least ${min}`;
    if (max !== null && num > max) return `Must be no more than ${max}`;
    return true;
  };

  const result = await promptText({
    message,
    defaultValue: defaultValue !== null ? String(defaultValue) : '',
    validate
  });

  return integer ? parseInt(result, 10) : parseFloat(result);
}

/**
 * Editor prompt (opens text editor)
 */
export async function promptEditor({
  message,
  defaultValue = '',
  validate = null
}) {
  const answers = await inquirer.prompt([{
    type: 'editor',
    name: 'value',
    message: theme.primary(message),
    default: defaultValue,
    validate: validate || (() => true),
    prefix: theme.bold('?')
  }]);

  return answers.value;
}

/**
 * Autocomplete search prompt
 */
export async function promptSearch({
  message,
  choices,
  defaultValue = ''
}) {
  // Note: Requires inquirer-autocomplete-prompt plugin
  // For now, fallback to regular select with search
  return promptSelect({ message, choices, defaultValue });
}

// ==================== SPINNER UTILITIES ====================

/**
 * Show loading spinner
 */
export function spinner(text, type = 'dots') {
  return ora({
    text: theme.info(text),
    spinner: type,
    color: 'cyan'
  });
}

/**
 * Run async task with spinner
 */
export async function withSpinner(text, task) {
  const spin = spinner(text).start();
  try {
    const result = await task();
    spin.succeed(theme.success(text + ' ✓'));
    return result;
  } catch (error) {
    spin.fail(theme.error(text + ' ✗'));
    throw error;
  }
}

// ==================== DISPLAY UTILITIES ====================

/**
 * Print styled header
 */
export function header(text) {
  console.log('\n' + theme.bold(theme.gradient(text)));
  console.log(theme.dim('─'.repeat(text.length)) + '\n');
}

/**
 * Print success message
 */
export function success(text) {
  console.log(theme.success('✓ ') + text);
}

/**
 * Print error message
 */
export function error(text) {
  console.log(theme.error('✗ ') + text);
}

/**
 * Print warning message
 */
export function warning(text) {
  console.log(theme.warning('⚠ ') + text);
}

/**
 * Print info message
 */
export function info(text) {
  console.log(theme.info('ℹ ') + text);
}

/**
 * Print muted/dim text
 */
export function muted(text) {
  console.log(theme.muted(text));
}

/**
 * Print table
 */
export function table(data) {
  console.table(data);
}

/**
 * Print key-value pairs
 */
export function keyValue(pairs) {
  const maxKeyLength = Math.max(...Object.keys(pairs).map(k => k.length));

  Object.entries(pairs).forEach(([key, value]) => {
    const paddedKey = key.padEnd(maxKeyLength);
    console.log(theme.dim(paddedKey) + ' : ' + theme.primary(value));
  });
}

/**
 * Print divider
 */
export function divider(char = '─', length = 50) {
  console.log(theme.dim(char.repeat(length)));
}

/**
 * Clear console
 */
export function clear() {
  console.clear();
}

/**
 * Print blank line
 */
export function blank(count = 1) {
  console.log('\n'.repeat(count - 1));
}

// ==================== PRESET PROMPTS ====================

/**
 * Prompt for Redis connection
 */
export async function promptRedisConnection() {
  header('Redis Connection');

  const host = await promptText({
    message: 'Redis host',
    defaultValue: 'localhost',
    validate: validators.required
  });

  const port = await promptNumber({
    message: 'Redis port',
    defaultValue: 6379,
    min: 1,
    max: 65535,
    integer: true
  });

  const requiresAuth = await promptConfirm({
    message: 'Requires authentication?',
    defaultValue: false
  });

  let password = '';
  if (requiresAuth) {
    password = await promptPassword({
      message: 'Redis password'
    });
  }

  return { host, port, password };
}

/**
 * Prompt for API key
 */
export async function promptApiKey(serviceName) {
  header(`${serviceName} API Key`);

  const apiKey = await promptPassword({
    message: `Enter ${serviceName} API key`,
    validate: validators.required
  });

  return apiKey;
}

/**
 * Prompt for project setup
 */
export async function promptProjectSetup() {
  header('Project Setup');

  const name = await promptText({
    message: 'Project name',
    validate: validators.required,
    placeholder: 'my-awesome-project'
  });

  const description = await promptText({
    message: 'Description (optional)',
    defaultValue: ''
  });

  const type = await promptSelect({
    message: 'Project type',
    choices: [
      { name: 'Node.js Library', value: 'library' },
      { name: 'CLI Tool', value: 'cli' },
      { name: 'Web App', value: 'web' },
      { name: 'API Service', value: 'api' }
    ]
  });

  const features = await promptMultiSelect({
    message: 'Select features',
    choices: [
      'TypeScript',
      'Testing',
      'Linting',
      'CI/CD',
      'Documentation'
    ]
  });

  return { name, description, type, features };
}

/**
 * Prompt for confirmation with warning
 */
export async function promptDangerousAction(action, details = '') {
  warning(`You are about to ${action}`);
  if (details) {
    muted(details);
  }
  blank();

  return promptConfirm({
    message: 'Are you sure you want to continue?',
    defaultValue: false
  });
}

// ==================== COMPATIBILITY ALIASES ====================
// These are shorter aliases used by setup-wizard and other legacy code

/**
 * Ask for text input (alias for promptText)
 */
export async function ask(message, defaultValue = '') {
  return promptText({ message, defaultValue });
}

/**
 * Ask for secret/password input (alias for promptPassword)
 */
export async function askSecret(message) {
  return promptPassword({ message });
}

/**
 * Ask for confirmation (alias for promptConfirm)
 */
export async function confirm(message, defaultValue = false) {
  return promptConfirm({ message, defaultValue });
}

/**
 * Spinner with dual behavior for compatibility:
 * - If called with just text: returns ora spinner object
 * - If called with text + task: executes task with spinner
 */
export async function spinnerWithTask(message, task) {
  const spin = ora({
    text: theme.info(message),
    spinner: 'dots',
    color: 'cyan'
  }).start();

  try {
    const result = await task();
    spin.succeed(theme.success(message + ' ✓'));
    return { success: true, result };
  } catch (error) {
    spin.fail(theme.error(message + ' ✗'));
    return { success: false, error };
  }
}

/**
 * Display a box with title and content
 */
export function box(content, title = '') {
  const lines = content.split('\n');
  const maxLength = Math.max(...lines.map(l => l.length), title.length);
  const border = '─'.repeat(maxLength + 4);

  console.log(theme.dim('┌' + border + '┐'));

  if (title) {
    console.log(theme.dim('│ ') + theme.bold(title.padEnd(maxLength + 2)) + theme.dim(' │'));
    console.log(theme.dim('├' + border + '┤'));
  }

  lines.forEach(line => {
    console.log(theme.dim('│ ') + line.padEnd(maxLength + 2) + theme.dim(' │'));
  });

  console.log(theme.dim('└' + border + '┘'));
}

/**
 * Pause and wait for user to press Enter
 */
export async function pause(message = 'Press Enter to continue...') {
  await inquirer.prompt([{
    type: 'input',
    name: 'continue',
    message: theme.dim(message),
    prefix: ''
  }]);
}

// ==================== EXPORTS ====================

export default {
  // Core prompts
  promptText,
  promptPassword,
  promptConfirm,
  promptSelect,
  promptMultiSelect,
  promptNumber,
  promptEditor,
  promptSearch,

  // Compatibility aliases
  ask,
  askSecret,
  confirm,
  box,
  pause,

  // Spinner utilities
  spinner,
  spinnerWithTask,
  withSpinner,

  // Display utilities
  header,
  success,
  error,
  warning,
  info,
  muted,
  table,
  keyValue,
  divider,
  clear,
  blank,

  // Preset prompts
  promptRedisConnection,
  promptApiKey,
  promptProjectSetup,
  promptDangerousAction,

  // Validators
  validators,

  // Theme
  theme
};
