#!/usr/bin/env node

/**
 * MEMORY SYSTEM BENCHMARK
 *
 * Compares old GitHub-based memory system vs new MemorySupervisor system
 *
 * Metrics:
 * - Response time (target: <5s vs 120s)
 * - Cache hit rate (Redis vs none)
 * - Memory usage (Node.js heap)
 * - Token savings at startup
 * - Engineer response times (parallel vs sequential)
 *
 * Usage:
 *   node scripts/benchmark-memory.js
 *   node scripts/benchmark-memory.js --verbose
 *   node scripts/benchmark-memory.js --runs 10
 */

import { searchMemory } from '../lib/memory.js';
import { queryMemorySupervisor, invalidateMemoryCache, getMemoryCacheStats, closeConnections } from '../lib/agents/memory-supervisor.js';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse CLI args
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const runsArg = args.find(arg => arg.startsWith('--runs='));
const numberOfRuns = runsArg ? parseInt(runsArg.split('=')[1]) : 3;

// Test queries (varied complexity)
const TEST_QUERIES = [
  'postgres database schema',
  'redis cache optimization',
  'n8n workflow automation',
  'github repository setup',
  'session management',
  'memory system architecture',
  'authentication implementation',
  'api endpoint design'
];

/**
 * Get memory usage in MB
 */
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
    rss: Math.round(usage.rss / 1024 / 1024),
    external: Math.round(usage.external / 1024 / 1024)
  };
}

/**
 * Benchmark OLD system (direct GitHub API)
 */
async function benchmarkOldSystem(query, limit = 5) {
  const startTime = performance.now();
  const startMemory = getMemoryUsage();

  let result = null;
  let error = null;

  try {
    result = await searchMemory(query, limit);
  } catch (err) {
    error = err.message;
  }

  const endTime = performance.now();
  const endMemory = getMemoryUsage();
  const duration = endTime - startTime;

  return {
    system: 'old',
    query,
    duration_ms: Math.round(duration),
    duration_s: (duration / 1000).toFixed(2),
    result_count: result ? result.length : 0,
    error,
    cache_hit: false,
    memory_delta_mb: endMemory.heapUsed - startMemory.heapUsed,
    memory_used_mb: endMemory.heapUsed,
    engineers_queried: 0,
    source: 'github-api-direct'
  };
}

/**
 * Benchmark NEW system (MemorySupervisor with 4 engineers)
 */
async function benchmarkNewSystem(query, limit = 5, useCache = true) {
  const startTime = performance.now();
  const startMemory = getMemoryUsage();

  let result = null;
  let error = null;

  try {
    result = await queryMemorySupervisor(query, {
      useCache,
      timeout: 5000,
      cacheTtl: 300,
      limit
    });
  } catch (err) {
    error = err.message;
  }

  const endTime = performance.now();
  const endMemory = getMemoryUsage();
  const duration = endTime - startTime;

  return {
    system: 'new',
    query,
    duration_ms: Math.round(duration),
    duration_s: (duration / 1000).toFixed(2),
    result_count: result ? result.total_results : 0,
    error,
    cache_hit: result ? result.cache_hit : false,
    memory_delta_mb: endMemory.heapUsed - startMemory.heapUsed,
    memory_used_mb: endMemory.heapUsed,
    engineers_queried: result ? result.engineers_queried.length : 0,
    engineer_details: result ? result.engineers_queried : [],
    source: result && result.cache_hit ? 'redis-cache' : 'parallel-engineers',
    query_time_from_response: result ? result.query_time_ms : null
  };
}

/**
 * Run benchmark comparison
 */
async function runBenchmark(query, runNumber, totalRuns) {
  if (verbose) {
    console.log(`\n[${'='.repeat(60)}]`);
    console.log(`  Run ${runNumber}/${totalRuns}: "${query}"`);
    console.log(`[${'='.repeat(60)}]`);
  } else {
    console.log(`\n🔄 Run ${runNumber}/${totalRuns}: "${query}"`);
  }

  // Benchmark OLD system
  if (verbose) console.log('\n[OLD SYSTEM] Running...');
  const oldResult = await benchmarkOldSystem(query);
  if (verbose) {
    console.log(`  Duration: ${oldResult.duration_ms}ms`);
    console.log(`  Results: ${oldResult.result_count}`);
    console.log(`  Memory: ${oldResult.memory_used_mb}MB`);
    console.log(`  Source: ${oldResult.source}`);
  }

  // Wait 500ms between tests
  await new Promise(resolve => setTimeout(resolve, 500));

  // Benchmark NEW system (cache miss first)
  if (verbose) console.log('\n[NEW SYSTEM] Running (cache MISS)...');
  const newResultNoCache = await benchmarkNewSystem(query, 5, false);
  if (verbose) {
    console.log(`  Duration: ${newResultNoCache.duration_ms}ms`);
    console.log(`  Results: ${newResultNoCache.result_count}`);
    console.log(`  Memory: ${newResultNoCache.memory_used_mb}MB`);
    console.log(`  Engineers: ${newResultNoCache.engineers_queried}`);
    console.log(`  Source: ${newResultNoCache.source}`);
  }

  // Wait 500ms
  await new Promise(resolve => setTimeout(resolve, 500));

  // Benchmark NEW system (cache HIT)
  if (verbose) console.log('\n[NEW SYSTEM] Running (cache HIT)...');
  const newResultWithCache = await benchmarkNewSystem(query, 5, true);
  if (verbose) {
    console.log(`  Duration: ${newResultWithCache.duration_ms}ms`);
    console.log(`  Results: ${newResultWithCache.result_count}`);
    console.log(`  Memory: ${newResultWithCache.memory_used_mb}MB`);
    console.log(`  Cache Hit: ${newResultWithCache.cache_hit ? 'YES ✅' : 'NO ❌'}`);
    console.log(`  Source: ${newResultWithCache.source}`);
  }

  return {
    query,
    old: oldResult,
    new_no_cache: newResultNoCache,
    new_with_cache: newResultWithCache
  };
}

/**
 * Calculate aggregate statistics
 */
function calculateStats(results) {
  const oldTimes = results.map(r => r.old.duration_ms);
  const newNoCache = results.map(r => r.new_no_cache.duration_ms);
  const newWithCache = results.map(r => r.new_with_cache.duration_ms);

  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const min = arr => Math.min(...arr);
  const max = arr => Math.max(...arr);
  const median = arr => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  return {
    old_system: {
      avg_ms: Math.round(avg(oldTimes)),
      min_ms: min(oldTimes),
      max_ms: max(oldTimes),
      median_ms: Math.round(median(oldTimes)),
      avg_s: (avg(oldTimes) / 1000).toFixed(2)
    },
    new_system_no_cache: {
      avg_ms: Math.round(avg(newNoCache)),
      min_ms: min(newNoCache),
      max_ms: max(newNoCache),
      median_ms: Math.round(median(newNoCache)),
      avg_s: (avg(newNoCache) / 1000).toFixed(2),
      improvement_vs_old_pct: Math.round(((avg(oldTimes) - avg(newNoCache)) / avg(oldTimes)) * 100)
    },
    new_system_with_cache: {
      avg_ms: Math.round(avg(newWithCache)),
      min_ms: min(newWithCache),
      max_ms: max(newWithCache),
      median_ms: Math.round(median(newWithCache)),
      avg_s: (avg(newWithCache) / 1000).toFixed(2),
      improvement_vs_old_pct: Math.round(((avg(oldTimes) - avg(newWithCache)) / avg(oldTimes)) * 100),
      improvement_vs_no_cache_pct: Math.round(((avg(newNoCache) - avg(newWithCache)) / avg(newNoCache)) * 100)
    },
    cache_hit_speedup: (avg(newNoCache) / avg(newWithCache)).toFixed(2) + 'x'
  };
}

/**
 * Estimate token savings
 */
function estimateTokenSavings(stats, assumedStartupCalls = 3) {
  // Old system: every call hits GitHub API (~120s per call)
  const oldStartupTime = stats.old_system.avg_ms * assumedStartupCalls;

  // New system: first call misses cache, subsequent calls hit cache
  const newStartupTime = stats.new_system_no_cache.avg_ms +
                         (stats.new_system_with_cache.avg_ms * (assumedStartupCalls - 1));

  const timeSaved = oldStartupTime - newStartupTime;
  const pctFaster = Math.round((timeSaved / oldStartupTime) * 100);

  // Estimate token savings (rough heuristic: 1 second = ~50 tokens at startup)
  const tokensSavedEstimate = Math.round((timeSaved / 1000) * 50);

  return {
    old_startup_time_ms: Math.round(oldStartupTime),
    new_startup_time_ms: Math.round(newStartupTime),
    time_saved_ms: Math.round(timeSaved),
    percent_faster: pctFaster,
    estimated_tokens_saved: tokensSavedEstimate,
    assumed_startup_calls: assumedStartupCalls
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         BOSS CLAUDE - MEMORY SYSTEM BENCHMARK                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('\nComparing:');
  console.log('  OLD: Direct GitHub API calls (lib/memory.js)');
  console.log('  NEW: MemorySupervisor with 4 parallel engineers + Redis cache');
  console.log(`\nTest Configuration:`);
  console.log(`  Queries: ${TEST_QUERIES.length}`);
  console.log(`  Runs per query: ${numberOfRuns}`);
  console.log(`  Total tests: ${TEST_QUERIES.length * numberOfRuns * 3} (${TEST_QUERIES.length * numberOfRuns} per system)`);
  console.log(`  Verbose: ${verbose ? 'ON' : 'OFF'}`);

  // Clear cache before starting
  console.log('\n🔄 Clearing Redis cache...');
  await invalidateMemoryCache();

  const allResults = [];
  let testNumber = 0;
  const totalTests = TEST_QUERIES.length * numberOfRuns;

  for (let run = 1; run <= numberOfRuns; run++) {
    for (const query of TEST_QUERIES) {
      testNumber++;
      const result = await runBenchmark(query, testNumber, totalTests);
      allResults.push(result);
    }
  }

  // Calculate statistics
  const stats = calculateStats(allResults);
  const tokenSavings = estimateTokenSavings(stats);

  // Get cache statistics
  const cacheStats = await getMemoryCacheStats();

  // Calculate cache hit rate
  const totalNewSystemCalls = allResults.length * 2; // no-cache + with-cache
  const cacheHits = allResults.filter(r => r.new_with_cache.cache_hit).length;
  const cacheHitRate = Math.round((cacheHits / totalNewSystemCalls) * 100);

  // Print results
  console.log('\n\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    BENCHMARK RESULTS                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  console.log('\n📊 RESPONSE TIME COMPARISON');
  console.log('─'.repeat(64));
  console.log(`\nOLD SYSTEM (Direct GitHub API):`);
  console.log(`  Average: ${stats.old_system.avg_ms}ms (${stats.old_system.avg_s}s)`);
  console.log(`  Median:  ${stats.old_system.median_ms}ms`);
  console.log(`  Range:   ${stats.old_system.min_ms}ms - ${stats.old_system.max_ms}ms`);

  console.log(`\nNEW SYSTEM (MemorySupervisor - Cache MISS):`);
  console.log(`  Average: ${stats.new_system_no_cache.avg_ms}ms (${stats.new_system_no_cache.avg_s}s)`);
  console.log(`  Median:  ${stats.new_system_no_cache.median_ms}ms`);
  console.log(`  Range:   ${stats.new_system_no_cache.min_ms}ms - ${stats.new_system_no_cache.max_ms}ms`);
  console.log(`  Improvement: ${stats.new_system_no_cache.improvement_vs_old_pct}% faster than old`);

  console.log(`\nNEW SYSTEM (MemorySupervisor - Cache HIT):`);
  console.log(`  Average: ${stats.new_system_with_cache.avg_ms}ms (${stats.new_system_with_cache.avg_s}s)`);
  console.log(`  Median:  ${stats.new_system_with_cache.median_ms}ms`);
  console.log(`  Range:   ${stats.new_system_with_cache.min_ms}ms - ${stats.new_system_with_cache.max_ms}ms`);
  console.log(`  Improvement: ${stats.new_system_with_cache.improvement_vs_old_pct}% faster than old`);
  console.log(`  Improvement: ${stats.new_system_with_cache.improvement_vs_no_cache_pct}% faster than cache miss`);
  console.log(`  Cache Speedup: ${stats.cache_hit_speedup}`);

  console.log('\n\n💾 CACHE PERFORMANCE');
  console.log('─'.repeat(64));
  console.log(`  Cache Hit Rate: ${cacheHitRate}%`);
  console.log(`  Cache Hits: ${cacheHits}/${totalNewSystemCalls} calls`);
  console.log(`  Cached Queries: ${cacheStats.total_cached_queries}`);
  console.log(`  Cache Strategy: Redis with 5-minute TTL`);

  console.log('\n\n🚀 STARTUP TIME IMPACT');
  console.log('─'.repeat(64));
  console.log(`  Assumed startup calls: ${tokenSavings.assumed_startup_calls}`);
  console.log(`  OLD system startup: ${tokenSavings.old_startup_time_ms}ms`);
  console.log(`  NEW system startup: ${tokenSavings.new_startup_time_ms}ms`);
  console.log(`  Time saved: ${tokenSavings.time_saved_ms}ms (${tokenSavings.percent_faster}% faster)`);
  console.log(`  Estimated token savings: ~${tokenSavings.estimated_tokens_saved} tokens`);

  console.log('\n\n🔧 ARCHITECTURE IMPROVEMENTS');
  console.log('─'.repeat(64));
  console.log(`  OLD: Sequential GitHub API calls`);
  console.log(`  NEW: 4 parallel engineer agents + Redis cache`);
  console.log(`  Engineers: postgres-n8n-specialist, redis-architect,`);
  console.log(`             n8n-workflow-architect, github-expert`);
  console.log(`  Timeout: 5 seconds per engineer (parallel execution)`);
  console.log(`  Cache Layer: Redis with automatic invalidation`);

  console.log('\n\n📈 TARGET METRICS');
  console.log('─'.repeat(64));
  console.log(`  Target: <5s response (cache miss)`);
  console.log(`  Actual: ${stats.new_system_no_cache.avg_s}s`);
  console.log(`  Status: ${stats.new_system_no_cache.avg_ms < 5000 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`\n  Target: <1s response (cache hit)`);
  console.log(`  Actual: ${stats.new_system_with_cache.avg_s}s`);
  console.log(`  Status: ${stats.new_system_with_cache.avg_ms < 1000 ? '✅ PASS' : '⚠️  NEEDS OPTIMIZATION'}`);

  // JSON output for programmatic consumption
  const jsonOutput = {
    benchmark: 'memory-system-comparison',
    timestamp: new Date().toISOString(),
    config: {
      queries: TEST_QUERIES.length,
      runs_per_query: numberOfRuns,
      total_tests: totalTests
    },
    results: {
      old_system: stats.old_system,
      new_system_no_cache: stats.new_system_no_cache,
      new_system_with_cache: stats.new_system_with_cache,
      cache_performance: {
        hit_rate_pct: cacheHitRate,
        total_queries_cached: cacheStats.total_cached_queries,
        cache_speedup: stats.cache_hit_speedup
      },
      startup_impact: tokenSavings,
      target_metrics: {
        cache_miss_target_ms: 5000,
        cache_miss_actual_ms: stats.new_system_no_cache.avg_ms,
        cache_miss_pass: stats.new_system_no_cache.avg_ms < 5000,
        cache_hit_target_ms: 1000,
        cache_hit_actual_ms: stats.new_system_with_cache.avg_ms,
        cache_hit_pass: stats.new_system_with_cache.avg_ms < 1000
      }
    },
    raw_results: verbose ? allResults : null
  };

  console.log('\n\n📄 JSON OUTPUT');
  console.log('─'.repeat(64));
  console.log(JSON.stringify(jsonOutput, null, 2));

  console.log('\n\n✅ Benchmark complete!\n');

  // Close connections gracefully
  console.log('\n🔌 Closing connections...');
  await closeConnections();

  // Give a moment for cleanup to finish
  await new Promise(resolve => setTimeout(resolve, 200));

  console.log('✅ All connections closed\n');
  process.exit(0);
}

// Run benchmark
main().catch(async (err) => {
  console.error('\n❌ Benchmark failed:', err);
  console.error(err.stack);

  // Attempt cleanup even on error
  try {
    await closeConnections();
  } catch (cleanupErr) {
    console.warn('Cleanup error:', cleanupErr.message);
  }

  process.exit(1);
});
