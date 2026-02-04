import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import os from 'os';
import { queryMemorySupervisor, invalidateMemoryCache, getMemoryCacheStats } from './agents/memory-supervisor.js';
import { logAgent } from './agent-logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from ~/.boss-claude/.env
const envPath = join(os.homedir(), '.boss-claude', '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

let octokit = null;

function getOctokit() {
  if (!octokit) {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN not found. Please run: boss-claude init');
    }
    octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  }
  return octokit;
}

/**
 * Close the Octokit client to allow proper cleanup.
 * This releases the HTTP agent so the process can exit cleanly.
 */
export function closeOctokit() {
  if (octokit) {
    octokit = null;
  }
}

export async function saveMemory({ repo_name, summary, content, tags = [] }) {
  const client = getOctokit();

  const owner = process.env.GITHUB_OWNER;
  if (!owner) {
    throw new Error('GITHUB_OWNER environment variable is required. Please run: boss-claude init');
  }
  const repo = process.env.GITHUB_MEMORY_REPO || 'boss-claude-memory';

  // Create issue with session data
  const issue = await client.issues.create({
    owner,
    repo,
    title: `[${repo_name}] ${summary}`,
    body: `## Session Summary\n\n${summary}\n\n## Session Data\n\n\`\`\`json\n${content}\n\`\`\``,
    labels: ['session', repo_name, ...tags]
  });

  // Invalidate all memory caches after saving new memory
  try {
    await invalidateMemoryCache();
  } catch (err) {
    console.warn('Failed to invalidate cache after save:', err.message);
  }

  // Log memory save for watch command
  const shortSummary = summary.substring(0, 60).replace(/\n/g, ' ').trim();
  logAgent('Memory', 'SAVE', `Issue #${issue.data.number}: ${shortSummary}`);

  return {
    issue_number: issue.data.number,
    url: issue.data.html_url,
    summary,
    tags
  };
}

export async function searchMemory(query, limit = 5) {
  const client = getOctokit();

  const owner = process.env.GITHUB_OWNER;
  if (!owner) {
    throw new Error('GITHUB_OWNER environment variable is required. Please run: boss-claude init');
  }
  const repo = process.env.GITHUB_MEMORY_REPO || 'boss-claude-memory';

  const { data } = await client.issues.listForRepo({
    owner,
    repo,
    labels: 'session',
    state: 'all',
    sort: 'created',
    direction: 'desc',
    per_page: 100
  });

  const queryLower = query.toLowerCase();
  const filtered = data.filter(issue => {
    const titleMatch = issue.title.toLowerCase().includes(queryLower);
    const bodyMatch = issue.body && issue.body.toLowerCase().includes(queryLower);
    const labelMatch = issue.labels.some(l => l.name.toLowerCase().includes(queryLower));
    return titleMatch || bodyMatch || labelMatch;
  }).slice(0, limit);

  return filtered.map(issue => ({
    title: issue.title,
    summary: issue.body ? issue.body.split('\n\n')[1] || '' : '',
    url: issue.html_url,
    created_at: issue.created_at,
    labels: issue.labels.map(l => l.name)
  }));
}

export async function searchMemoryAdvanced(query, options = {}) {
  return await queryMemorySupervisor(query, options);
}

export async function getMemoryByIssue(issueNumber) {
  const client = getOctokit();

  const owner = process.env.GITHUB_OWNER;
  if (!owner) {
    throw new Error('GITHUB_OWNER environment variable is required. Please run: boss-claude init');
  }
  const repo = process.env.GITHUB_MEMORY_REPO || 'boss-claude-memory';

  const { data } = await client.issues.get({
    owner,
    repo,
    issue_number: issueNumber
  });

  return {
    title: data.title,
    body: data.body,
    url: data.html_url,
    created_at: data.created_at,
    labels: data.labels.map(l => l.name)
  };
}

export const memorySupervisor = {
  query: queryMemorySupervisor,
  invalidateCache: invalidateMemoryCache,
  getCacheStats: getMemoryCacheStats
};
