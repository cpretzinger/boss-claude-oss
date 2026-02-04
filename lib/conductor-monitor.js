import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import os from 'os';
import { appendFileSync, mkdirSync } from 'fs';
import { getRedis } from './redis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from ~/.boss-claude/.env
const envPath = join(os.homedir(), '.boss-claude', '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const BOSS_DIR = join(os.homedir(), '.boss-claude');
const ALERT_LOG = join(BOSS_DIR, 'conductor-alerts.log');

// Ensure directory exists
try {
  mkdirSync(BOSS_DIR, { recursive: true });
} catch (err) {
  // Directory already exists
}

// Redis keys
const DELEGATION_KEY = 'boss:conductor:delegation';
const DIRECT_ACTION_KEY = 'boss:conductor:direct_actions';
const ALERT_THRESHOLD_KEY = 'boss:conductor:alert_threshold';
const LAST_ALERT_KEY = 'boss:conductor:last_alert';

// Default alert threshold: 95%
const DEFAULT_THRESHOLD = 0.95;

/**
 * Log an alert to file
 * @param {string} message - Alert message
 * @param {object} data - Additional data to log
 */
function logAlert(message, data = {}) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ALERT: ${message}\n${JSON.stringify(data, null, 2)}\n\n`;

  try {
    appendFileSync(ALERT_LOG, logLine, 'utf8');
  } catch (err) {
    console.error(`Failed to write alert log: ${err.message}`);
  }
}

/**
 * Track a task delegated to CONDUCTOR agent
 * @param {string} agentName - Name of the CONDUCTOR agent
 * @param {string} taskDescription - Description of the task
 * @param {object} metadata - Additional metadata
 * @returns {Promise<object>} Updated statistics
 */
export async function trackDelegation(agentName, taskDescription, metadata = {}) {
  const client = getRedis();
  const timestamp = new Date().toISOString();

  // Increment delegation counter
  await client.hincrby(DELEGATION_KEY, 'total', 1);
  await client.hincrby(DELEGATION_KEY, `agent:${agentName}`, 1);

  // Store delegation event
  const event = {
    type: 'delegation',
    agent: agentName,
    task: taskDescription,
    timestamp,
    metadata
  };

  await client.lpush('boss:conductor:events', JSON.stringify(event));
  await client.ltrim('boss:conductor:events', 0, 999); // Keep last 1000 events

  // Check delegation ratio and alert if needed
  const stats = await getDelegationStats();
  await checkThresholdAndAlert(stats);

  return stats;
}

/**
 * Track a direct action taken by Boss Claude (not delegated)
 * @param {string} actionType - Type of direct action
 * @param {string} description - Description of the action
 * @param {object} metadata - Additional metadata
 * @returns {Promise<object>} Updated statistics
 */
export async function trackDirectAction(actionType, description, metadata = {}) {
  const client = getRedis();
  const timestamp = new Date().toISOString();

  // Increment direct action counter
  await client.hincrby(DIRECT_ACTION_KEY, 'total', 1);
  await client.hincrby(DIRECT_ACTION_KEY, `type:${actionType}`, 1);

  // Store direct action event
  const event = {
    type: 'direct_action',
    action_type: actionType,
    description,
    timestamp,
    metadata
  };

  await client.lpush('boss:conductor:events', JSON.stringify(event));
  await client.ltrim('boss:conductor:events', 0, 999);

  // Check delegation ratio and alert if needed
  const stats = await getDelegationStats();
  await checkThresholdAndAlert(stats);

  return stats;
}

/**
 * Get current delegation statistics
 * @returns {Promise<object>} Delegation stats including ratio
 */
export async function getDelegationStats() {
  const client = getRedis();

  const delegationData = await client.hgetall(DELEGATION_KEY);
  const directActionData = await client.hgetall(DIRECT_ACTION_KEY);

  const totalDelegations = parseInt(delegationData.total || 0);
  const totalDirectActions = parseInt(directActionData.total || 0);
  const totalActions = totalDelegations + totalDirectActions;

  const delegationRatio = totalActions > 0 ? totalDelegations / totalActions : 0;

  // Get agent breakdown
  const agentStats = {};
  for (const [key, value] of Object.entries(delegationData)) {
    if (key.startsWith('agent:')) {
      const agentName = key.replace('agent:', '');
      agentStats[agentName] = parseInt(value);
    }
  }

  // Get action type breakdown
  const actionTypeStats = {};
  for (const [key, value] of Object.entries(directActionData)) {
    if (key.startsWith('type:')) {
      const actionType = key.replace('type:', '');
      actionTypeStats[actionType] = parseInt(value);
    }
  }

  const threshold = parseFloat(await client.get(ALERT_THRESHOLD_KEY) || DEFAULT_THRESHOLD);

  return {
    total_delegations: totalDelegations,
    total_direct_actions: totalDirectActions,
    total_actions: totalActions,
    delegation_ratio: delegationRatio,
    delegation_percentage: (delegationRatio * 100).toFixed(2),
    threshold: threshold,
    threshold_percentage: (threshold * 100).toFixed(0),
    meets_threshold: delegationRatio >= threshold,
    agent_breakdown: agentStats,
    direct_action_breakdown: actionTypeStats
  };
}

/**
 * Get recent events (delegations and direct actions)
 * @param {number} limit - Number of events to retrieve (default: 50)
 * @returns {Promise<Array>} Recent events
 */
export async function getRecentEvents(limit = 50) {
  const client = getRedis();
  const events = await client.lrange('boss:conductor:events', 0, limit - 1);

  return events.map(e => JSON.parse(e));
}

/**
 * Check if delegation ratio meets threshold and alert if not
 * @param {object} stats - Current delegation statistics
 * @returns {Promise<boolean>} True if alert was triggered
 */
async function checkThresholdAndAlert(stats) {
  const client = getRedis();

  // Don't alert if we don't have enough data
  if (stats.total_actions < 10) {
    return false;
  }

  if (!stats.meets_threshold) {
    // Check if we've alerted recently (throttle to once per hour)
    const lastAlert = await client.get(LAST_ALERT_KEY);
    const now = Date.now();

    if (lastAlert) {
      const lastAlertTime = parseInt(lastAlert);
      const hoursSinceLastAlert = (now - lastAlertTime) / (1000 * 60 * 60);

      if (hoursSinceLastAlert < 1) {
        return false; // Skip alert, too soon
      }
    }

    // Trigger alert
    const alertMessage = `CONDUCTOR delegation ratio dropped below ${stats.threshold_percentage}%`;
    const alertData = {
      current_ratio: stats.delegation_percentage + '%',
      threshold: stats.threshold_percentage + '%',
      total_actions: stats.total_actions,
      delegations: stats.total_delegations,
      direct_actions: stats.total_direct_actions,
      agent_breakdown: stats.agent_breakdown,
      direct_action_breakdown: stats.direct_action_breakdown
    };

    logAlert(alertMessage, alertData);
    console.warn(`\n⚠️  ${alertMessage}`);
    console.warn(`Current ratio: ${stats.delegation_percentage}% (${stats.total_delegations}/${stats.total_actions})`);
    console.warn(`View details: boss-claude conductor-status\n`);

    // Update last alert timestamp
    await client.set(LAST_ALERT_KEY, now.toString());

    return true;
  }

  return false;
}

/**
 * Set the alert threshold (0.0 to 1.0)
 * @param {number} threshold - New threshold value (e.g., 0.95 for 95%)
 * @returns {Promise<number>} The new threshold
 */
export async function setAlertThreshold(threshold) {
  if (threshold < 0 || threshold > 1) {
    throw new Error('Threshold must be between 0 and 1');
  }

  const client = getRedis();
  await client.set(ALERT_THRESHOLD_KEY, threshold.toString());

  return threshold;
}

/**
 * Get the current alert threshold
 * @returns {Promise<number>} Current threshold
 */
export async function getAlertThreshold() {
  const client = getRedis();
  return parseFloat(await client.get(ALERT_THRESHOLD_KEY) || DEFAULT_THRESHOLD);
}

/**
 * Reset all delegation tracking data
 * @returns {Promise<void>}
 */
export async function resetTracking() {
  const client = getRedis();

  await client.del(DELEGATION_KEY);
  await client.del(DIRECT_ACTION_KEY);
  await client.del('boss:conductor:events');
  await client.del(LAST_ALERT_KEY);

  console.log('CONDUCTOR delegation tracking has been reset');
}

/**
 * Generate a comprehensive delegation report
 * @param {object} options - Report options
 * @returns {Promise<object>} Detailed report
 */
export async function generateReport(options = {}) {
  const stats = await getDelegationStats();
  const recentEvents = await getRecentEvents(options.eventLimit || 50);

  // Calculate time-based metrics
  const now = new Date();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const last24h = recentEvents.filter(e => new Date(e.timestamp) > oneDayAgo);
  const last7d = recentEvents.filter(e => new Date(e.timestamp) > oneWeekAgo);

  const delegations24h = last24h.filter(e => e.type === 'delegation').length;
  const directActions24h = last24h.filter(e => e.type === 'direct_action').length;
  const total24h = delegations24h + directActions24h;
  const ratio24h = total24h > 0 ? delegations24h / total24h : 0;

  const delegations7d = last7d.filter(e => e.type === 'delegation').length;
  const directActions7d = last7d.filter(e => e.type === 'direct_action').length;
  const total7d = delegations7d + directActions7d;
  const ratio7d = total7d > 0 ? delegations7d / total7d : 0;

  return {
    overall: stats,
    time_periods: {
      last_24h: {
        delegations: delegations24h,
        direct_actions: directActions24h,
        total: total24h,
        ratio: ratio24h,
        percentage: (ratio24h * 100).toFixed(2)
      },
      last_7d: {
        delegations: delegations7d,
        direct_actions: directActions7d,
        total: total7d,
        ratio: ratio7d,
        percentage: (ratio7d * 100).toFixed(2)
      }
    },
    recent_events: recentEvents.slice(0, 10),
    generated_at: now.toISOString()
  };
}

/**
 * Get formatted status for display
 * @returns {Promise<string>} Formatted status string
 */
export async function getFormattedStatus() {
  const report = await generateReport();
  const stats = report.overall;

  const statusIcon = stats.meets_threshold ? '✅' : '⚠️';

  return `
${statusIcon} CONDUCTOR DELEGATION MONITOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OVERALL STATISTICS:
  Delegation Ratio: ${stats.delegation_percentage}% (${stats.total_delegations}/${stats.total_actions})
  Alert Threshold:  ${stats.threshold_percentage}%
  Status:           ${stats.meets_threshold ? 'PASSING ✅' : 'BELOW THRESHOLD ⚠️'}

RECENT ACTIVITY (Last 24h):
  Delegations:      ${report.time_periods.last_24h.delegations}
  Direct Actions:   ${report.time_periods.last_24h.direct_actions}
  Ratio:            ${report.time_periods.last_24h.percentage}%

AGENT BREAKDOWN:
${Object.entries(stats.agent_breakdown)
  .sort((a, b) => b[1] - a[1])
  .map(([agent, count]) => `  ${agent}: ${count} tasks`)
  .join('\n') || '  No delegations yet'}

DIRECT ACTION BREAKDOWN:
${Object.entries(stats.direct_action_breakdown)
  .sort((a, b) => b[1] - a[1])
  .map(([type, count]) => `  ${type}: ${count} actions`)
  .join('\n') || '  No direct actions yet'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Alert Log: ${ALERT_LOG}
Run 'boss-claude conductor-report' for detailed analysis
`;
}

export { ALERT_LOG };
