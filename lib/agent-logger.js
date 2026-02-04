import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { publishAgentActivity } from './agent-comms.js';

const BOSS_DIR = join(os.homedir(), '.boss-claude');
const LOG_FILE = join(BOSS_DIR, 'agent-activity.log');

// Ensure directory exists
try {
  mkdirSync(BOSS_DIR, { recursive: true });
} catch (err) {
  // Directory already exists
}

/**
 * Log agent activity to ~/.boss-claude/agent-activity.log and publish to Redis
 * @param {string} event - Event type (start, complete, error)
 * @param {string} agent - Agent name
 * @param {string} details - Additional details
 */
export function logAgentActivity(event, agent, details = '') {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${event.toUpperCase()}: ${agent}${details ? ' - ' + details : ''}\n`;

  // Write to log file (keep for backwards compatibility)
  try {
    appendFileSync(LOG_FILE, logLine, 'utf8');
  } catch (err) {
    // Silent fail - don't crash if logging fails
    console.error(`Failed to write agent log: ${err.message}`);
  }

  // Publish to Redis for real-time watch (async, don't await)
  publishAgentActivity(event, agent, details).catch(err => {
    // Silent fail - Redis publishing is best-effort
  });
}

/**
 * Log Task agent start
 * @param {string} taskDescription - Description of the task
 */
export function logTaskStart(taskDescription) {
  logAgentActivity('start', 'Task', taskDescription);
}

/**
 * Log Task agent completion
 * @param {string} taskDescription - Description of the task
 * @param {boolean} success - Whether task succeeded
 */
export function logTaskComplete(taskDescription, success = true) {
  const status = success ? 'SUCCESS' : 'FAILED';
  logAgentActivity('complete', 'Task', `${taskDescription} [${status}]`);
}

/**
 * Log any agent activity
 * @param {string} agentName - Name of the agent
 * @param {string} action - Action being performed
 * @param {string} details - Additional details
 */
export function logAgent(agentName, action, details = '') {
  logAgentActivity(action, agentName, details);
}

export { LOG_FILE };
