#!/usr/bin/env node
/**
 * Token Parser - Extract token counts from various sources
 *
 * Parses token usage data from Claude hook outputs, usage objects,
 * and system warnings in various formats.
 */

/**
 * Parse token statistics from hook data
 * @param {Object} hookData - Data from Claude hooks (system_warning, stop_reason_data, usage, message)
 * @returns {Object|null} - { usedTokens, totalTokens } or null if not found
 */
function parseTokenStats(hookData) {
  if (!hookData) return null;

  // Try to extract from various sources
  const sources = [
    hookData?.system_warning,
    hookData?.stop_reason_data,
    hookData?.usage,
    hookData?.message,
    hookData?.metadata,
    hookData // Also check the root object itself
  ];

  for (const source of sources) {
    if (!source) continue;

    // Pattern 1: "Token usage: 50000/200000"
    if (typeof source === 'string') {
      const fullMatch = source.match(/Token usage:\s*(\d+)\/(\d+)/i);
      if (fullMatch) {
        return {
          usedTokens: parseInt(fullMatch[1], 10),
          totalTokens: parseInt(fullMatch[2], 10)
        };
      }

      // Pattern 2: "50000 tokens used"
      const usedMatch = source.match(/(\d+)\s*tokens?\s*used/i);
      if (usedMatch) {
        return {
          usedTokens: parseInt(usedMatch[1], 10),
          totalTokens: null
        };
      }

      // Pattern 3: "used 50000 of 200000 tokens"
      const ofMatch = source.match(/used\s*(\d+)\s*of\s*(\d+)\s*tokens?/i);
      if (ofMatch) {
        return {
          usedTokens: parseInt(ofMatch[1], 10),
          totalTokens: parseInt(ofMatch[2], 10)
        };
      }

      // Pattern 4: Context window percentage "85% of context used"
      const percentMatch = source.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of\s*)?context/i);
      if (percentMatch) {
        const percentage = parseFloat(percentMatch[1]);
        // Assume 200k context window as default
        const estimatedTotal = 200000;
        return {
          usedTokens: Math.round((percentage / 100) * estimatedTotal),
          totalTokens: estimatedTotal,
          isEstimate: true
        };
      }
    }

    // Usage object format (Claude API style)
    if (typeof source === 'object' && source !== null) {
      // Standard Claude API usage format
      if (source.input_tokens !== undefined || source.output_tokens !== undefined) {
        const inputTokens = source.input_tokens || 0;
        const outputTokens = source.output_tokens || 0;
        return {
          usedTokens: inputTokens + outputTokens,
          inputTokens,
          outputTokens,
          totalTokens: source.total_tokens || source.context_window || null
        };
      }

      // total_tokens directly available
      if (source.total_tokens !== undefined) {
        return {
          usedTokens: source.total_tokens,
          totalTokens: source.context_window || null
        };
      }

      // Prompt/completion format (OpenAI style)
      if (source.prompt_tokens !== undefined || source.completion_tokens !== undefined) {
        const promptTokens = source.prompt_tokens || 0;
        const completionTokens = source.completion_tokens || 0;
        return {
          usedTokens: promptTokens + completionTokens,
          inputTokens: promptTokens,
          outputTokens: completionTokens,
          totalTokens: source.total_tokens || null
        };
      }
    }
  }

  return null;
}

/**
 * Parse tokens from a raw message string
 * @param {string} message - Raw message that may contain token info
 * @returns {Object|null} - Token stats or null
 */
function parseTokensFromMessage(message) {
  if (typeof message !== 'string') return null;
  return parseTokenStats({ message });
}

/**
 * Estimate token count from text (rough approximation)
 * Uses ~4 chars per token as approximation
 * @param {string} text - Text to estimate
 * @returns {number} - Estimated token count
 */
function estimateTokens(text) {
  if (typeof text !== 'string') return 0;
  // Rough estimation: ~4 characters per token for English text
  // This is an approximation; actual tokenization varies
  return Math.ceil(text.length / 4);
}

/**
 * Calculate efficiency ratio
 * @param {number} agentTokens - Tokens used by agents
 * @param {number} conductorTokens - Tokens used by CONDUCTOR
 * @returns {number} - Efficiency ratio (higher is better)
 */
function calculateEfficiencyRatio(agentTokens, conductorTokens) {
  if (conductorTokens <= 0) return agentTokens > 0 ? Infinity : 0;
  return Math.floor(agentTokens / conductorTokens);
}

/**
 * Get efficiency rating based on ratio
 * @param {number} ratio - Efficiency ratio
 * @returns {Object} - { rating, bonus, emoji }
 */
function getEfficiencyRating(ratio) {
  if (ratio >= 50) {
    return { rating: 'Perfect Conductor', bonus: 50, emoji: '🏆' };
  } else if (ratio >= 20) {
    return { rating: 'Good Conductor', bonus: Math.min(49, ratio), emoji: '✅' };
  } else if (ratio >= 5) {
    return { rating: 'Could Delegate More', bonus: Math.min(19, ratio), emoji: '⚠️' };
  } else {
    return { rating: 'Playing, Not Conducting', bonus: Math.min(4, ratio), emoji: '❌' };
  }
}

export {
  parseTokenStats,
  parseTokensFromMessage,
  estimateTokens,
  calculateEfficiencyRatio,
  getEfficiencyRating
};

export default {
  parseTokenStats,
  parseTokensFromMessage,
  estimateTokens,
  calculateEfficiencyRatio,
  getEfficiencyRating
};
