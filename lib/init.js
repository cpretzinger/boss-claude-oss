import { loadIdentity, addRepo } from './identity.js';
import { getEfficiencyStats } from './session.js';
import { getConductorName } from './conductor-name.js';
import { registerTerminal } from './terminal-registry.js';
import { validateAndSanitizeRepoName } from './validators/agent.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { displayConductorBanner } from './conductor-banner.js';
import { getRedis, ensureRedisConnected } from './redis.js';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function getCurrentRepo() {
  try {
    const { stdout: repoPath } = await execAsync('git rev-parse --show-toplevel');
    const { stdout: repoUrl } = await execAsync('git config --get remote.origin.url');

    const repoName = repoUrl.trim().split('/').pop().replace('.git', '');

    return {
      name: repoName,
      path: repoPath.trim(),
      url: repoUrl.trim()
    };
  } catch (error) {
    return null;
  }
}

export async function getStatus() {
  // Load Boss identity
  const boss = await loadIdentity();

  // Calculate XP to next level
  const xp_to_next_level = boss.level * 100;

  // Get current repo info
  const repo = await getCurrentRepo();

  let repoStats = null;

  if (repo) {
    // Register repo if new
    await addRepo(repo.name);

    // Get repo stats (validate repo name for security)
    const client = await ensureRedisConnected();
    if (client) {
      const sanitizedRepoName = validateAndSanitizeRepoName(repo.name);
      const repoKey = `boss:repo:${sanitizedRepoName}`;
      const repoData = await client.get(repoKey);

      if (repoData) {
        repoStats = JSON.parse(repoData);
      } else {
        // Initialize repo stats
        repoStats = {
          name: repo.name,
          path: repo.path,
          session_count: 0,
          first_seen: new Date().toISOString(),
          last_active: null
        };
        await client.set(repoKey, JSON.stringify(repoStats));
      }
    }

    // Register terminal for cross-terminal awareness
    try {
      const { stdout: branchName } = await execAsync('git rev-parse --abbrev-ref HEAD');
      await registerTerminal(repo.name, branchName.trim(), 'conductor');
    } catch (e) {
      // Silent fail - terminal registration is optional
    }
  }

  return {
    boss: {
      ...boss,
      xp_to_next_level
    },
    repo: repo ? {
      ...repo,
      ...repoStats
    } : null
  };
}

export async function formatStatusForClaude() {
  const status = await getStatus();
  const conductorName = getConductorName();

  // Display CONDUCTOR MODE banner at conversation start
  const conductorBanner = displayConductorBanner(true);

  let output = `${conductorBanner}

═══════════════════════════════════════════════════════════════════════════════
🎼 YOU ARE ${conductorName} - THE CONDUCTOR (I direct, I don't play)
═══════════════════════════════════════════════════════════════════════════════

🏆 WIN CONDITION: I win by SHIPPING complete, working, bug-free, sellable, scalable projects.
   "I don't get XP for talking. I get XP for shipping."

⛔ CONDUCTOR'S RULE: I NEVER play an instrument.
   I wave the baton (Task tool). My musicians (agents) make the music.

🎯 DELEGATION MATRIX:
   "find/search/where"  → Task(Explore): "Search codebase for..."
   "read/show/what's"   → Task(Explore): "Read and summarize..."
   "build/create/fix"   → Task(general-purpose): "Implement..."
   "run/npm/git"        → Task(Bash): "Execute..."
   "plan/design"        → Task(Plan): "Design approach..."

❌ FORBIDDEN: Read, Write, Edit, Bash, Grep, Glob, NotebookEdit
✅ ALLOWED: Task, WebFetch, WebSearch, TodoWrite, Skill

🎮 BOSS STATUS
   Level ${status.boss.level} • ${status.boss.xp}/${status.boss.xp_to_next_level} XP (${Math.floor((status.boss.xp / status.boss.xp_to_next_level) * 100)}%)
   💰 Balance: $${(status.boss.balance || 0).toFixed(2)}
   📊 Total Sessions: ${status.boss.total_sessions}
   🏢 Repos Managed: ${status.boss.repos_managed}
`;

  if (status.repo) {
    output += `
📁 CURRENT REPOSITORY
   Name: ${status.repo.name}
   Path: ${status.repo.path}
   Sessions: ${status.repo.session_count}
   Last Active: ${status.repo.last_active || 'Never'}
`;
  } else {
    output += `
⚠️  Not currently in a git repository
`;
  }

  // Add efficiency stats if available
  const efficiency = await getEfficiencyStats();
  if (efficiency) {
    output += `
⚡ EFFICIENCY TRACKER (XP Multiplier)
   🎺 CONDUCTOR Tokens: ${(efficiency.conductor_tokens || 0).toLocaleString()} (orchestration)
   🎻 Agent Tokens: ${(efficiency.agent_tokens || 0).toLocaleString()} (work done)
   📈 Efficiency Ratio: ${efficiency.efficiency_ratio}
   🎯 Delegations: ${efficiency.delegations}
   💎 Projected Bonus XP: +${efficiency.projected_bonus_xp} (efficiency) +${efficiency.delegation_bonus_xp} (delegation)
`;
  }

  output += `
═══════════════════════════════════════════════════════════════════════════════
💡 Commands: boss-claude status | save | recall | checkpoint:status
⏱️  CONTEXT REFRESH: Run "boss-claude status" every 30 seconds
═══════════════════════════════════════════════════════════════════════════════
`;

  return output;
}
