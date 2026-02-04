/**
 * Agent Pool / Semaphore
 * Limits concurrent agent execution to prevent OOM
 * WO-008 TEAM GAMMA
 */

// Default to 5 concurrent agents to prevent CPU/memory spikes
// Can override with MAX_CONCURRENT_AGENTS env var
const MAX_CONCURRENT_AGENTS = parseInt(process.env.MAX_CONCURRENT_AGENTS || '5', 10);

class AgentSemaphore {
  constructor(maxConcurrent = MAX_CONCURRENT_AGENTS) {
    this.maxConcurrent = maxConcurrent;
    this.activeAgents = 0;
    this.waitingQueue = [];
    this.activeAgentIds = new Set();
  }

  async acquire(agentId = null) {
    if (this.activeAgents < this.maxConcurrent) {
      this.activeAgents++;
      if (agentId) this.activeAgentIds.add(agentId);
      return { acquired: true, queued: false, position: 0 };
    }

    return new Promise((resolve) => {
      const position = this.waitingQueue.length + 1;
      this.waitingQueue.push({ resolve, agentId, enqueuedAt: Date.now() });
    });
  }

  release(agentId = null) {
    this.activeAgents = Math.max(0, this.activeAgents - 1);
    if (agentId) this.activeAgentIds.delete(agentId);

    if (this.waitingQueue.length > 0) {
      const { resolve, agentId: waitingId } = this.waitingQueue.shift();
      this.activeAgents++;
      if (waitingId) this.activeAgentIds.add(waitingId);
      resolve({ acquired: true, queued: true, position: 0 });
    }
  }

  getStats() {
    return {
      active: this.activeAgents,
      waiting: this.waitingQueue.length,
      limit: this.maxConcurrent,
      activeIds: Array.from(this.activeAgentIds),
      available: this.maxConcurrent - this.activeAgents
    };
  }

  isAtCapacity() {
    return this.activeAgents >= this.maxConcurrent;
  }
}

let instance = null;

export function getAgentSemaphore() {
  if (!instance) {
    instance = new AgentSemaphore();
  }
  return instance;
}

export function resetAgentSemaphore() {
  instance = null;
}

export { AgentSemaphore, MAX_CONCURRENT_AGENTS };
