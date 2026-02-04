import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import os from 'os';
import { getRedis, ensureRedisConnected } from './redis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BOSS_KEY = 'boss:identity';

export async function loadIdentity() {
  const client = await ensureRedisConnected();
  if (!client) {
    // Return default identity if Redis is unavailable
    return {
      level: 1,
      xp: 0,
      balance: 0,
      total_sessions: 0,
      repos_managed: 0,
      created_at: new Date().toISOString()
    };
  }
  const data = await client.get(BOSS_KEY);

  if (!data) {
    // Create default Boss identity
    const identity = {
      level: 1,
      xp: 0,
      balance: 0,
      total_sessions: 0,
      repos_managed: 0,
      created_at: new Date().toISOString()
    };

    await client.set(BOSS_KEY, JSON.stringify(identity));
    return identity;
  }

  const identity = JSON.parse(data);

  // Migration logic for existing users
  let needsSave = false;

  // Migrate legacy token_bank field to balance
  if (identity.token_bank !== undefined) {
    identity.balance = (identity.balance || 0) + identity.token_bank;
    delete identity.token_bank;
    needsSave = true;
  }

  // If balance is undefined/null/zero but xp exists (>0), calculate balance from xp
  if ((identity.balance === undefined || identity.balance === null || identity.balance === 0) && identity.xp > 0) {
    identity.balance = Math.floor((identity.xp / 500) * 100);
    needsSave = true;
  }

  // Save migrated identity back to storage
  if (needsSave) {
    identity.migrated_at = new Date().toISOString();
    await client.set(BOSS_KEY, JSON.stringify(identity));
  }

  // FINAL SAFEGUARD: Ensure balance is ALWAYS a number, never undefined
  if (identity.balance === undefined || identity.balance === null || typeof identity.balance !== 'number') {
    identity.balance = 0;
  }

  return identity;
}

export async function updateIdentity(updates) {
  const client = await ensureRedisConnected();
  const identity = await loadIdentity();

  const updated = {
    ...identity,
    ...updates,
    updated_at: new Date().toISOString()
  };

  if (client) {
    await client.set(BOSS_KEY, JSON.stringify(updated));
  }
  return updated;
}

export async function addXP(amount) {
  const identity = await loadIdentity();

  let newXP = identity.xp + amount;
  let newLevel = identity.level;

  // Level up logic (100 XP per level, exponential)
  const xpForNextLevel = newLevel * 100;

  if (newXP >= xpForNextLevel) {
    newLevel++;
    newXP -= xpForNextLevel;
  }

  // Award dollars: $100 per 500 XP earned
  const dollarsEarned = (amount / 500) * 100;
  const newBalance = (identity.balance || 0) + dollarsEarned;

  return updateIdentity({
    level: newLevel,
    xp: newXP,
    balance: newBalance
  });
}

export async function addBalance(amount) {
  const identity = await loadIdentity();

  return updateIdentity({
    balance: (identity.balance || 0) + amount
  });
}

export async function deductBalance(amount) {
  const identity = await loadIdentity();
  const currentBalance = identity.balance || 0;

  // Do not allow negative balance
  if (amount > currentBalance) {
    return false;
  }

  await updateIdentity({
    balance: currentBalance - amount
  });
  return true;
}

export async function getBalance() {
  const identity = await loadIdentity();
  return identity.balance || 0;
}

export async function incrementSessions() {
  const identity = await loadIdentity();

  return updateIdentity({
    total_sessions: identity.total_sessions + 1
  });
}

export async function addRepo(repoName) {
  const client = getRedis();
  const repoKey = `boss:repo:${repoName}`;

  const exists = await client.exists(repoKey);

  if (!exists) {
    const identity = await loadIdentity();
    await updateIdentity({
      repos_managed: identity.repos_managed + 1
    });
  }
}
