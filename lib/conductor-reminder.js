import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import os from 'os';
import chalk from 'chalk';
import { getRedis } from './redis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REMINDER_KEY = 'boss:conductor:message_count';
const DEFAULT_INTERVAL = 5; // Show reminder every 5 messages

/**
 * Increment message counter and check if reminder should be displayed
 * @param {number} interval - Number of messages between reminders (default: 5)
 * @returns {Promise<{shouldShow: boolean, count: number, reminder: string|null}>}
 */
export async function checkConductorReminder(interval = DEFAULT_INTERVAL) {
  try {
    const client = getRedis();

    // Increment counter
    const count = await client.incr(REMINDER_KEY);

    // Check if we should show reminder
    const shouldShow = count % interval === 0;

    let reminder = null;
    if (shouldShow) {
      reminder = formatReminder(count);
    }

    return {
      shouldShow,
      count,
      reminder
    };
  } catch (error) {
    console.error('CONDUCTOR Reminder Error:', error.message);
    return {
      shouldShow: false,
      count: 0,
      reminder: null
    };
  }
}

/**
 * Format the CONDUCTOR reminder message
 * @param {number} count - Current message count
 * @returns {string}
 */
function formatReminder(count) {
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ CRITICAL REMINDER ⚡

${chalk.bold.red('CONDUCTOR = ORCHESTRATOR ONLY')}

${chalk.yellow('CONDUCTOR must NEVER execute tasks directly.')}
${chalk.yellow('CONDUCTOR must ALWAYS delegate to specialized engineers.')}

Message Count: ${count}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

/**
 * Reset the message counter (useful for new sessions)
 * @returns {Promise<void>}
 */
export async function resetConductorCounter() {
  try {
    const client = getRedis();
    await client.del(REMINDER_KEY);
  } catch (error) {
    console.error('Error resetting CONDUCTOR counter:', error.message);
  }
}

/**
 * Get current message count
 * @returns {Promise<number>}
 */
export async function getConductorMessageCount() {
  try {
    const client = getRedis();
    const count = await client.get(REMINDER_KEY);
    return parseInt(count || '0', 10);
  } catch (error) {
    console.error('Error getting CONDUCTOR count:', error.message);
    return 0;
  }
}

/**
 * Set custom interval for reminders
 * @param {number} interval - Number of messages between reminders
 * @returns {Promise<void>}
 */
export async function setConductorInterval(interval) {
  try {
    const client = getRedis();
    await client.set('boss:conductor:interval', interval);
  } catch (error) {
    console.error('Error setting CONDUCTOR interval:', error.message);
  }
}

/**
 * Get current reminder interval
 * @returns {Promise<number>}
 */
export async function getConductorInterval() {
  try {
    const client = getRedis();
    const interval = await client.get('boss:conductor:interval');
    return parseInt(interval || DEFAULT_INTERVAL.toString(), 10);
  } catch (error) {
    console.error('Error getting CONDUCTOR interval:', error.message);
    return DEFAULT_INTERVAL;
  }
}

/**
 * Auto-hook for Claude Code - Call this after every message
 * This is the main function to integrate into conversation flow
 * @param {number} customInterval - Optional custom interval
 * @returns {Promise<string|null>}
 */
export async function conductorAutoReminder(customInterval = null) {
  try {
    const interval = customInterval || await getConductorInterval();
    const { shouldShow, reminder } = await checkConductorReminder(interval);

    if (shouldShow && reminder) {
      console.log(reminder);
      return reminder;
    }

    return null;
  } catch (error) {
    console.error('CONDUCTOR Auto-Reminder Error:', error.message);
    return null;
  }
}

/**
 * Manual trigger - Force display the reminder
 * @returns {Promise<string>}
 */
export async function showConductorReminder() {
  const count = await getConductorMessageCount();
  const reminder = formatReminder(count);
  console.log(reminder);
  return reminder;
}

// Export for CLI usage
export default {
  checkConductorReminder,
  resetConductorCounter,
  getConductorMessageCount,
  setConductorInterval,
  getConductorInterval,
  conductorAutoReminder,
  showConductorReminder
};
