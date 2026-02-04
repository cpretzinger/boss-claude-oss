/**
 * CONDUCTOR MODE Banner System
 * Displays "CONDUCTOR MODE: DELEGATE ONLY" banner at conversation start and every 10 messages
 */

import chalk from 'chalk';
import { getConductorName } from './conductor-name.js';

/**
 * ASCII art banner for CONDUCTOR MODE
 */
function getConductorBanner() {
  const conductorName = getConductorName();
  return `
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║   ▄▄▄▄▄▄▄▄▄▄▄  ▄▄        ▄  ▄         ▄  ▄▄       ▄▄                         ║
║  ▐░░░░░░░░░░░▌▐░░▌      ▐░▌▐░▌       ▐░▌▐░░▌     ▐░░▌                        ║
║  ▐░█▀▀▀▀▀▀▀█░▌▐░▌░▌     ▐░▌ ▐░▌     ▐░▌ ▐░▌░▌   ▐░▐░▌                        ║
║  ▐░▌       ▐░▌▐░▌▐░▌    ▐░▌  ▐░▌   ▐░▌  ▐░▌▐░▌ ▐░▌▐░▌                        ║
║  ▐░▌       ▐░▌▐░▌ ▐░▌   ▐░▌   ▐░▌ ▐░▌   ▐░▌ ▐░▐░▌ ▐░▌                        ║
║  ▐░▌       ▐░▌▐░▌  ▐░▌  ▐░▌    ▐░▐░▌    ▐░▌  ▐░▌  ▐░▌                        ║
║  ▐░▌       ▐░▌▐░▌   ▐░▌ ▐░▌     ▐░▌     ▐░▌   ▀   ▐░▌                        ║
║  ▐░▌       ▐░▌▐░▌    ▐░▌▐░▌    ▐░▌░▌    ▐░▌       ▐░▌                        ║
║  ▐░█▄▄▄▄▄▄▄█░▌▐░▌     ▐░▐░▌   ▐░▌ ▐░▌   ▐░▌       ▐░▌                        ║
║  ▐░░░░░░░░░░░▌▐░▌      ▐░░▌  ▐░▌   ▐░▌  ▐░▌       ▐░▌                        ║
║   ▀▀▀▀▀▀▀▀▀▀▀  ▀        ▀▀    ▀     ▀    ▀         ▀                         ║
║                                                                               ║
║                     ███╗   ███╗ ██████╗ ██████╗ ███████╗                     ║
║                     ████╗ ████║██╔═══██╗██╔══██╗██╔════╝                     ║
║                     ██╔████╔██║██║   ██║██║  ██║█████╗                       ║
║                     ██║╚██╔╝██║██║   ██║██║  ██║██╔══╝                       ║
║                     ██║ ╚═╝ ██║╚██████╔╝██████╔╝███████╗                     ║
║                     ╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝                     ║
║                                                                               ║
║                   ${conductorName} MODE: DELEGATE ONLY - NO EXECUTION                     ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`;
}

/**
 * Compact version of banner for periodic display
 */
function getConductorBannerCompact() {
  const conductorName = getConductorName();
  return `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  ⬛ ${conductorName} MODE: DELEGATE ONLY ⬛  No task execution | Agent delegation only  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
`;
}

/**
 * Message counter for periodic banner display
 */
let messageCount = 0;

/**
 * Display the full CONDUCTOR MODE banner (for conversation start)
 * @param {boolean} colorize - Whether to apply color styling
 * @returns {string} Formatted banner
 */
export function displayConductorBanner(colorize = true) {
  const banner = getConductorBanner();
  if (colorize) {
    return chalk.black.bgWhite(banner);
  }
  return banner;
}

/**
 * Display the compact CONDUCTOR MODE banner (for periodic reminders)
 * @param {boolean} colorize - Whether to apply color styling
 * @returns {string} Formatted compact banner
 */
export function displayConductorBannerCompact(colorize = true) {
  const banner = getConductorBannerCompact();
  if (colorize) {
    return chalk.black.bgWhite(banner);
  }
  return banner;
}

/**
 * Check if banner should be displayed based on message count
 * Displays at start (count = 0) and every 10 messages
 * @returns {boolean} True if banner should be shown
 */
export function shouldDisplayBanner() {
  if (messageCount === 0 || messageCount % 10 === 0) {
    return true;
  }
  return false;
}

/**
 * Increment message counter
 * Call this after each user message
 */
export function incrementMessageCount() {
  messageCount++;
}

/**
 * Reset message counter
 * Call this at conversation start
 */
export function resetMessageCount() {
  messageCount = 0;
}

/**
 * Get current message count
 * @returns {number} Current message count
 */
export function getMessageCount() {
  return messageCount;
}

/**
 * Auto-display banner with message tracking
 * Call this function after each message
 * @param {boolean} isConversationStart - True if this is the first message
 * @param {boolean} colorize - Whether to apply color styling
 * @returns {string|null} Banner to display, or null if not needed
 */
export function autoDisplayBanner(isConversationStart = false, colorize = true) {
  if (isConversationStart) {
    resetMessageCount();
    return displayConductorBanner(colorize);
  }

  incrementMessageCount();

  if (shouldDisplayBanner()) {
    return displayConductorBannerCompact(colorize);
  }

  return null;
}

/**
 * Format banner for injection into CLI output
 * Returns formatted string that can be console.log'd
 * @param {boolean} isConversationStart - True if this is the first message
 * @returns {string} Formatted banner ready for output
 */
export function formatForCLI(isConversationStart = false) {
  const banner = autoDisplayBanner(isConversationStart, true);

  if (!banner) {
    return '';
  }

  return `\n${banner}\n`;
}

/**
 * Get banner with statistics
 * Displays banner plus message count info
 * @param {boolean} isConversationStart - True if this is the first message
 * @returns {string} Banner with stats
 */
export function getBannerWithStats(isConversationStart = false) {
  const banner = autoDisplayBanner(isConversationStart, true);

  if (!banner) {
    return '';
  }

  const stats = chalk.dim(`Message count: ${messageCount} | Next banner at: ${Math.ceil(messageCount / 10) * 10}`);

  return `\n${banner}\n${stats}\n`;
}

// Export banner generators for direct use
export { getConductorBanner, getConductorBannerCompact };
