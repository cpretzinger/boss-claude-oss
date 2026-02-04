/**
 * Memory Monitor with Tiered Thresholds
 * WO-008 TEAM DELTA
 */
import { EventEmitter } from 'events';

const MEMORY_THRESHOLDS = {
  WARNING: 250 * 1024 * 1024,
  CRITICAL: 500 * 1024 * 1024,
  DANGEROUS: 1500 * 1024 * 1024
};

class MemoryMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.checkInterval = options.checkInterval || 30000;
    this.lastLevel = 'HEALTHY';
    this.intervalId = null;
  }

  getMemoryLevel() {
    const used = process.memoryUsage().heapUsed;
    if (used > MEMORY_THRESHOLDS.DANGEROUS) return 'DANGEROUS';
    if (used > MEMORY_THRESHOLDS.CRITICAL) return 'CRITICAL';
    if (used > MEMORY_THRESHOLDS.WARNING) return 'WARNING';
    return 'HEALTHY';
  }

  getMetrics() {
    const mem = process.memoryUsage();
    return {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      externalMB: Math.round(mem.external / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
      level: this.getMemoryLevel(),
      timestamp: new Date().toISOString()
    };
  }

  start() {
    if (this.intervalId) return this;
    this.intervalId = setInterval(() => {
      const level = this.getMemoryLevel();
      const metrics = this.getMetrics();
      if (level !== this.lastLevel) {
        this.emit('level-change', { from: this.lastLevel, to: level, metrics });
      }
      if (level !== 'HEALTHY') {
        this.emit('memory-pressure', { level, metrics });
      }
      this.lastLevel = level;
    }, this.checkInterval);
    if (this.intervalId.unref) this.intervalId.unref();
    return this;
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    return this;
  }
}

let instance = null;

export function getMemoryMonitor() {
  if (!instance) {
    instance = new MemoryMonitor();
  }
  return instance;
}

export { MemoryMonitor, MEMORY_THRESHOLDS };
