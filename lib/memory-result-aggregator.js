/**
 * Memory Result Aggregator
 *
 * Consolidates results from 4 memory engineers:
 * - Redis (session cache)
 * - GitHub (long-term memory)
 * - PostgreSQL (structured data)
 * - Qdrant (vector search)
 *
 * Features:
 * - Deduplicates by session ID / unique identifier
 * - Scores by relevance (source weight + recency + similarity)
 * - Ranks results highest to lowest
 * - Returns top N results
 */

// Source weights for scoring (higher = more authoritative)
const SOURCE_WEIGHTS = {
  qdrant: 1.0,      // Vector similarity is most relevant
  redis: 0.9,       // Recent session data is highly relevant
  postgres: 0.8,    // Structured data is authoritative
  github: 0.7       // Long-term memory is valuable but older
};

// Recency decay - older memories get lower scores
const RECENCY_HALF_LIFE_DAYS = 30; // Score halves every 30 days

/**
 * Calculate recency score based on age
 * @param {Date|string} timestamp - When the memory was created
 * @returns {number} Score from 0-1 (1 = just created, 0.5 = 30 days old)
 */
function calculateRecencyScore(timestamp) {
  if (!timestamp) return 0.5; // Default to mid-range if no timestamp

  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;

  // FIX: Validate date to prevent Invalid Date propagation
  if (isNaN(date.getTime())) {
    console.warn('[Aggregator] Invalid timestamp, using default score:', timestamp);
    return 0.5;
  }

  const ageMs = Date.now() - date.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Exponential decay: score = 2^(-age/half_life)
  return Math.pow(2, -ageDays / RECENCY_HALF_LIFE_DAYS);
}

/**
 * Extract unique identifier from memory object
 * @param {Object} memory - Memory object from any source
 * @returns {string} Unique identifier
 */
function extractIdentifier(memory) {
  // Try various ID fields across different sources
  const directId = memory.session_id
    || memory.id
    || memory.issue_number
    || memory.uuid
    || memory.point_id
    || memory.url;

  if (directId) return directId;

  // FIX: Prevent DoS from circular references in JSON.stringify
  // Use a simple hash of primitive fields instead
  try {
    const hashableFields = {
      type: memory.type,
      created: memory.created_at || memory.timestamp,
      // Include first 500 chars of content (increased from 100) for better deduplication
      content: typeof memory.content === 'string' ? memory.content.substring(0, 500) : memory.content
    };
    return JSON.stringify(hashableFields);
  } catch (error) {
    // If even this fails, return a timestamp-based ID
    console.warn('[Aggregator] Failed to generate identifier, using timestamp');
    return `fallback-${Date.now()}-${Math.random()}`;
  }
}

/**
 * Extract timestamp from memory object
 * @param {Object} memory - Memory object from any source
 * @returns {Date|string|null} Timestamp
 */
function extractTimestamp(memory) {
  return memory.created_at
    || memory.timestamp
    || memory.updated_at
    || memory.date
    || null;
}

/**
 * Extract similarity score from memory object (if available)
 * @param {Object} memory - Memory object from any source
 * @returns {number} Similarity score 0-1
 */
function extractSimilarity(memory) {
  // Qdrant and vector sources typically provide a score
  if (memory.score !== undefined) return memory.score;
  if (memory.similarity !== undefined) return memory.similarity;
  if (memory._distance !== undefined) return 1 - memory._distance; // Convert distance to similarity
  return 0.5; // Default mid-range if no similarity provided
}

/**
 * Calculate composite relevance score
 * @param {Object} memory - Memory object
 * @param {string} source - Source identifier (redis, github, postgres, qdrant)
 * @returns {number} Composite score
 */
function calculateRelevanceScore(memory, source) {
  const sourceWeight = SOURCE_WEIGHTS[source] || 0.5;
  const recencyScore = calculateRecencyScore(extractTimestamp(memory));
  const similarityScore = extractSimilarity(memory);

  // Weighted average: 40% source, 30% recency, 30% similarity
  return (sourceWeight * 0.4) + (recencyScore * 0.3) + (similarityScore * 0.3);
}

/**
 * Deduplicate memories by unique identifier
 * @param {Array} memories - Array of memory objects with metadata
 * @returns {Array} Deduplicated memories (keeps highest scoring duplicate)
 */
function deduplicate(memories) {
  const seen = new Map();

  for (const item of memories) {
    const id = extractIdentifier(item.memory);

    if (!seen.has(id)) {
      seen.set(id, item);
    } else {
      // Keep the one with higher score
      const existing = seen.get(id);
      if (item.score > existing.score) {
        seen.set(id, item);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Aggregate and rank results from multiple memory sources
 * @param {Object} results - Object containing results from each source
 * @param {Array} results.redis - Results from Redis cache
 * @param {Array} results.github - Results from GitHub issues
 * @param {Array} results.postgres - Results from PostgreSQL
 * @param {Array} results.qdrant - Results from Qdrant vector DB
 * @param {number} topN - Number of top results to return (default: 10)
 * @returns {Array} Ranked and scored results
 */
export function aggregateMemoryResults(results = {}, topN = 10) {
  const {
    redis = [],
    github = [],
    postgres = [],
    qdrant = []
  } = results;

  // Tag each memory with its source and calculate relevance score
  const scoredMemories = [
    ...redis.map(m => ({
      memory: m,
      source: 'redis',
      score: calculateRelevanceScore(m, 'redis')
    })),
    ...github.map(m => ({
      memory: m,
      source: 'github',
      score: calculateRelevanceScore(m, 'github')
    })),
    ...postgres.map(m => ({
      memory: m,
      source: 'postgres',
      score: calculateRelevanceScore(m, 'postgres')
    })),
    ...qdrant.map(m => ({
      memory: m,
      source: 'qdrant',
      score: calculateRelevanceScore(m, 'qdrant')
    }))
  ];

  // Deduplicate by identifier (keeps highest scoring duplicate)
  const deduplicated = deduplicate(scoredMemories);

  // Sort by score descending (highest first)
  deduplicated.sort((a, b) => b.score - a.score);

  // Return top N results
  return deduplicated.slice(0, topN);
}

/**
 * Format aggregated results for display
 * @param {Array} aggregatedResults - Results from aggregateMemoryResults
 * @returns {Array} Formatted results with readable metadata
 */
export function formatResults(aggregatedResults) {
  return aggregatedResults.map((item, index) => ({
    rank: index + 1,
    score: item.score.toFixed(3),
    source: item.source,
    id: extractIdentifier(item.memory),
    timestamp: extractTimestamp(item.memory),
    similarity: extractSimilarity(item.memory).toFixed(3),
    memory: item.memory
  }));
}

/**
 * Get statistics about aggregated results
 * @param {Array} aggregatedResults - Results from aggregateMemoryResults
 * @returns {Object} Statistics summary
 */
export function getAggregationStats(aggregatedResults) {
  const sources = aggregatedResults.reduce((acc, item) => {
    acc[item.source] = (acc[item.source] || 0) + 1;
    return acc;
  }, {});

  const scores = aggregatedResults.map(r => r.score);
  const avgScore = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;

  return {
    total: aggregatedResults.length,
    sources,
    averageScore: avgScore.toFixed(3),
    topScore: scores.length > 0 ? Math.max(...scores).toFixed(3) : 0,
    bottomScore: scores.length > 0 ? Math.min(...scores).toFixed(3) : 0
  };
}

export default {
  aggregateMemoryResults,
  formatResults,
  getAggregationStats,
  calculateRelevanceScore,
  extractIdentifier,
  extractTimestamp,
  extractSimilarity
};
