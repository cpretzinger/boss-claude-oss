/**
 * Shared Redis Connection Utility
 *
 * Provides a shared Redis client singleton for modules that need Redis access.
 * Gracefully handles missing REDIS_URL configuration.
 */

import Redis from 'ioredis';
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Load environment variables from ~/.boss-claude/.env
const envPath = join(homedir(), '.boss-claude', '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

let redis = null;
let connectionReady = false;
/** Pending connection promise to prevent duplicate connection attempts */
let pendingConnectionPromise = null;

/**
 * Get Redis client singleton
 * Returns null if REDIS_URL is not configured (graceful degradation)
 * @returns {Redis|null} Redis client or null
 */
export function getRedis() {
  if (redis) {
    return redis;
  }

  if (!process.env.REDIS_URL) {
    // Graceful degradation - return null instead of throwing
    return null;
  }

  try {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null; // Stop retrying after 3 attempts
        return Math.min(times * 200, 1000);
      },
      enableOfflineQueue: false,
      lazyConnect: true  // Don't connect immediately, allows us to control connection timing
    });

    // Track connection state
    redis.on('ready', () => {
      connectionReady = true;
    });

    redis.on('close', () => {
      connectionReady = false;
    });

    // Handle connection errors silently for graceful degradation
    redis.on('error', (err) => {
      console.error('[redis.js] Connection error:', err.message);
      connectionReady = false;
    });

    return redis;
  } catch (err) {
    console.error('[redis.js] Failed to create client:', err.message);
    return null;
  }
}

/**
 * Check if Redis connection is ready
 * @returns {boolean} True if connected and ready
 */
export function isRedisReady() {
  return redis !== null && connectionReady;
}

/**
 * Ensure Redis is connected before performing operations
 * Returns the Redis client if connection succeeds, null otherwise
 * @param {number} [timeout=5000] - Connection timeout in milliseconds
 * @returns {Promise<Redis|null>} Redis client or null
 */
export async function ensureRedisConnected(timeout = 5000) {
  const client = getRedis();
  if (!client) {
    return null;
  }

  // Already connected
  if (client.status === 'ready') {
    connectionReady = true;
    return client;
  }

  // If connection already in progress, wait for it
  if (pendingConnectionPromise) {
    try {
      await pendingConnectionPromise;
      return connectionReady ? client : null;
    } catch {
      return null;
    }
  }

  // Start new connection attempt with shared promise
  pendingConnectionPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Redis connection timeout'));
    }, timeout);

    const onReady = () => {
      clearTimeout(timer);
      client.removeListener('error', onError);
      connectionReady = true;
      resolve(client);
    };

    const onError = (err) => {
      clearTimeout(timer);
      client.removeListener('ready', onReady);
      connectionReady = false;
      reject(err);
    };

    client.once('ready', onReady);
    client.once('error', onError);

    // Initiate connection if not already connecting
    if (client.status !== 'connecting') {
      client.connect().catch(onError);
    }
  });

  try {
    await pendingConnectionPromise;
    return connectionReady ? client : null;
  } catch (err) {
    console.error('[redis.js] Connection failed:', err.message);
    return null;
  } finally {
    pendingConnectionPromise = null;
  }
}

/**
 * Close the Redis connection
 */
export async function closeRedis() {
  if (redis) {
    try {
      await redis.quit();
      redis.disconnect();
    } catch (err) {
      // Ignore errors during cleanup
    }
    redis = null;
  }
}

// === Global Subscriber Pool (WO-002) ===
let globalSubscriber = null;
const globalSubscriptions = new Map(); // channel -> [callbacks]

export async function getSubscriberConnection() {
  if (!globalSubscriber) {
    const redis = getRedis();
    if (!redis) return null;

    globalSubscriber = redis.duplicate();
    await globalSubscriber.connect();

    globalSubscriber.on('message', (channel, message) => {
      const callbacks = globalSubscriptions.get(channel) || [];
      callbacks.forEach(cb => {
        try {
          cb(message);
        } catch (err) {
          console.error(`[redis] Subscriber callback error on ${channel}:`, err.message);
        }
      });
    });
  }
  return globalSubscriber;
}

export function subscribeToChannel(channel, callback) {
  if (!globalSubscriber) {
    console.warn('[redis] No global subscriber - call getSubscriberConnection() first');
    return { unsubscribe: () => {} };
  }

  if (!globalSubscriptions.has(channel)) {
    globalSubscriptions.set(channel, []);
    globalSubscriber.subscribe(channel).catch(err => {
      console.error(`[redis] Failed to subscribe to ${channel}:`, err.message);
    });
  }
  globalSubscriptions.get(channel).push(callback);

  return {
    unsubscribe: () => {
      const cbs = globalSubscriptions.get(channel) || [];
      const idx = cbs.indexOf(callback);
      if (idx > -1) cbs.splice(idx, 1);

      if (cbs.length === 0) {
        globalSubscriber?.unsubscribe(channel).catch(() => {});
        globalSubscriptions.delete(channel);
      }
    }
  };
}

export async function closeGlobalSubscriber() {
  if (globalSubscriber) {
    try {
      await globalSubscriber.quit();
    } catch (err) {
      // Ignore quit errors
    }
    globalSubscriber = null;
    globalSubscriptions.clear();
  }
}

export function getSubscriberCount() {
  return globalSubscriptions.size;
}

export default { getRedis, closeRedis, isRedisReady, ensureRedisConnected };
