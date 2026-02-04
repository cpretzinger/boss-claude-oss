#!/usr/bin/env node
/**
 * CENTRAL EVENT BUS
 *
 * Event-driven architecture for Boss Claude.
 * All modules emit events here, Commentator subscribes and reacts in real-time.
 *
 * Events:
 * - 'tokens-updated' - Token count changed (source, amount, total)
 * - 'tokens-tracked' - Token tracking event with parsed data
 * - 'violation' - Delegation violation detected (severity, details)
 * - 'delegation' - Task delegated to agent (agentId, task)
 * - 'delegation-started' - Delegation process initiated
 * - 'delegation-completed' - Delegation process finished
 * - 'session-updated' - Session state changed (type, data)
 * - 'session-finalize' - Session ending, trigger final save
 * - 'agent-started' - Agent spawned (agentId, task)
 * - 'agent-completed' - Agent finished (agentId, success, tokens, duration)
 * - 'tool-executed' - Tool execution completed (tool, params, result)
 */

import { EventEmitter } from 'events';
import { getRedis, ensureRedisConnected, getSubscriberConnection, subscribeToChannel } from './redis.js';

class BossClaudeEventBus extends EventEmitter {
  constructor(options = {}) {
    super();
    this.setMaxListeners(50); // Allow many subscribers
    this.eventLog = [];
    this.startTime = Date.now();

    // Configurable limits
    this.maxLogSize = options.maxLogSize || 100;
    this.maxEventPayloadSize = options.maxEventPayloadSize || 10000; // bytes

    // Redis pub/sub state
    this.redisEnabled = false;
    this.redisPublisher = null;
    this.redisSubscription = null;
    this.processId = `${process.pid}-${Date.now()}`; // Unique process identifier

    // Initialize Redis connection (non-blocking)
    this.initializeRedis().catch(err => {
      console.error('[event-bus] Redis initialization failed:', err.message);
    });

    // Periodic cleanup under memory pressure
    this.cleanupInterval = setInterval(() => {
      this.performMemoryCleanup();
    }, 60000); // Every minute

    // Don't block process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Initialize Redis pub/sub for cross-process events
   */
  async initializeRedis() {
    try {
      // Try to connect to Redis
      const redis = await ensureRedisConnected(3000);
      if (!redis) {
        console.log('[event-bus] Redis not available - using local-only events');
        return;
      }

      this.redisPublisher = redis;

      // Set up subscriber
      const subscriber = await getSubscriberConnection();
      if (!subscriber) {
        console.log('[event-bus] Redis subscriber not available');
        return;
      }

      // Subscribe to boss:events channel
      this.redisSubscription = subscribeToChannel('boss:events', (message) => {
        try {
          const event = JSON.parse(message);

          // Prevent echo - don't re-emit our own events
          if (event.origin === this.processId) {
            return;
          }

          // Emit the event locally
          this.emit(event.name, event);
          this.emit('*', event);

          console.log(`[event-bus] Received Redis event: ${event.name} from ${event.origin}`);
        } catch (err) {
          console.error('[event-bus] Failed to parse Redis message:', err.message);
        }
      });

      this.redisEnabled = true;
      console.log('[event-bus] Redis pub/sub initialized successfully');
    } catch (err) {
      console.error('[event-bus] Redis initialization error:', err.message);
      this.redisEnabled = false;
    }
  }

  /**
   * Publish event to Redis channel
   */
  async publishToRedis(event) {
    if (!this.redisEnabled || !this.redisPublisher) {
      return;
    }

    try {
      // Add origin to prevent echo
      const eventWithOrigin = {
        ...event,
        origin: this.processId
      };

      await this.redisPublisher.publish('boss:events', JSON.stringify(eventWithOrigin));
      console.log(`[event-bus] Published to Redis: ${event.name}`);
    } catch (err) {
      console.error('[event-bus] Failed to publish to Redis:', err.message);
      // Graceful degradation - don't throw, just log
    }
  }

  /**
   * Truncate large payloads to prevent memory bloat
   */
  truncatePayload(data) {
    try {
      const serialized = JSON.stringify(data);
      if (serialized.length <= this.maxEventPayloadSize) {
        return data;
      }

      return {
        _truncated: true,
        _originalSize: serialized.length,
        summary: serialized.substring(0, 500) + '...'
      };
    } catch {
      return { _error: 'Could not serialize payload' };
    }
  }

  /**
   * Perform memory cleanup under pressure
   */
  performMemoryCleanup() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;

    // If heap usage > 250MB, aggressively reduce log size
    if (heapUsedMB > 250) {
      const targetSize = Math.floor(this.maxLogSize / 2);
      while (this.eventLog.length > targetSize) {
        this.eventLog.shift();
      }
    }
  }

  /**
   * Clean up resources (call on shutdown)
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clean up Redis subscription
    if (this.redisSubscription) {
      this.redisSubscription.unsubscribe();
      this.redisSubscription = null;
    }

    this.eventLog = [];
    this.removeAllListeners();
  }

  /**
   * Emit an event and log it
   * @param {string} eventName - Event name
   * @param {Object} data - Event data
   */
  emitEvent(eventName, data = {}) {
    const truncatedData = this.truncatePayload(data);

    const event = {
      name: eventName,
      timestamp: Date.now(),
      elapsed: Date.now() - this.startTime,
      data: truncatedData
    };

    // Keep last maxLogSize events in memory for debugging
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }

    // Emit the event locally
    this.emit(eventName, event);

    // Also emit a wildcard event for universal listeners
    this.emit('*', event);

    // Publish to Redis for cross-process distribution (non-blocking)
    this.publishToRedis(event).catch(err => {
      // Silent failure - already logged in publishToRedis
    });
  }

  /**
   * Emit tokens-updated event
   */
  emitTokensUpdated(source, amount, total, operationType = 'add') {
    this.emitEvent('tokens-updated', {
      source,      // 'conductor' | 'agent' | 'operation'
      amount,      // tokens added/removed
      total,       // current total
      operationType
    });
  }

  /**
   * Emit violation event
   */
  emitViolation(severity, operation, tokensUsed, threshold) {
    this.emitEvent('violation', {
      severity,    // 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
      operation,
      tokensUsed,
      threshold,
      excess: tokensUsed - threshold
    });
  }

  /**
   * Emit delegation event
   */
  emitDelegation(agentId, task, tool = 'Task') {
    this.emitEvent('delegation', {
      agentId,
      task,
      tool,
      delegatedAt: new Date().toISOString()
    });
  }

  /**
   * Emit session-updated event
   */
  emitSessionUpdated(updateType, data) {
    this.emitEvent('session-updated', {
      updateType,  // 'conductor-tokens' | 'agent-tokens' | 'delegation' | 'save'
      ...data
    });
  }

  /**
   * Emit agent-started event
   */
  emitAgentStarted(agentId, task, estimatedTokens = 0) {
    this.emitEvent('agent-started', {
      agentId,
      task,
      estimatedTokens,
      startedAt: new Date().toISOString()
    });
  }

  /**
   * Emit agent-completed event
   */
  emitAgentCompleted(agentId, success, tokens, duration, result = null) {
    this.emitEvent('agent-completed', {
      agentId,
      success,
      tokens,
      duration,
      result,
      completedAt: new Date().toISOString()
    });
  }

  /**
   * Emit tool-executed event
   */
  emitToolExecuted(tool, params, result, delegated = false, duration = 0) {
    this.emitEvent('tool-executed', {
      tool,
      params,
      result: typeof result === 'object' ? { success: result?.success } : result,
      delegated,
      duration
    });
  }

  /**
   * Emit delegation-started event
   * Called when a delegation process begins
   */
  emitDelegationStarted(delegationId, taskDescription, targetAgent = 'Task') {
    this.emitEvent('delegation-started', {
      delegationId,
      taskDescription,
      targetAgent,
      startedAt: new Date().toISOString()
    });
  }

  /**
   * Emit delegation-completed event
   * Called when a delegation process finishes
   */
  emitDelegationCompleted(delegationId, success, tokensUsed = 0, duration = 0, result = null) {
    this.emitEvent('delegation-completed', {
      delegationId,
      success,
      tokensUsed,
      duration,
      result,
      completedAt: new Date().toISOString()
    });
  }

  /**
   * Emit tokens-tracked event
   * Called when token data is parsed from any source
   */
  emitTokensTracked(source, tokenData) {
    this.emitEvent('tokens-tracked', {
      source,        // 'hook' | 'api' | 'estimate' | 'manual'
      usedTokens: tokenData.usedTokens || 0,
      totalTokens: tokenData.totalTokens || null,
      inputTokens: tokenData.inputTokens || null,
      outputTokens: tokenData.outputTokens || null,
      isEstimate: tokenData.isEstimate || false,
      trackedAt: new Date().toISOString()
    });
  }

  /**
   * Emit session-finalize event
   * Called when session is ending to trigger final save operations
   */
  emitSessionFinalize(sessionId, reason = 'user-exit') {
    this.emitEvent('session-finalize', {
      sessionId,
      reason,        // 'user-exit' | 'timeout' | 'error' | 'context-limit'
      finalizedAt: new Date().toISOString()
    });
  }

  /**
   * Get recent events for debugging
   */
  getRecentEvents(count = 20) {
    return this.eventLog.slice(-count);
  }

  /**
   * Clear event log
   */
  clearLog() {
    this.eventLog = [];
  }
}

// Singleton instance - shared across all modules
const eventBus = new BossClaudeEventBus();

export default eventBus;
export { BossClaudeEventBus };
