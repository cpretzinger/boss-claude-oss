/**
 * CONDUCTOR NAME - BC picks its own identity
 *
 * BC is autonomous and creative. It will choose its own name when it first starts working.
 * This module just manages persistence - no random name pools, no auto-picking.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import os from 'os';

const IDENTITY_FILE = join(os.homedir(), '.boss-claude', 'conductor.json');

/**
 * Get the saved conductor name
 * Returns 'CONDUCTOR' placeholder if not yet set by BC
 */
export function getConductorName() {
  try {
    if (existsSync(IDENTITY_FILE)) {
      const data = JSON.parse(readFileSync(IDENTITY_FILE, 'utf8'));
      return data.name || 'CONDUCTOR';
    }
  } catch (e) {}
  return 'CONDUCTOR'; // Default placeholder until BC chooses
}

/**
 * Save the conductor name that BC has chosen
 * BC calls this when it decides on its identity
 */
export function setConductorName(name) {
  const dir = join(os.homedir(), '.boss-claude');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  writeFileSync(IDENTITY_FILE, JSON.stringify({
    name: name.toUpperCase(),
    chosenAt: new Date().toISOString()
  }, null, 2));

  return name.toUpperCase();
}
