/**
 * SKILL LOADER
 *
 * On-demand skill loading for Task delegations.
 * Skills define EXPERTISE. Work orders define WORKFLOW.
 *
 * WORK ORDER PROCESS:
 * 1. Conductor receives task from user
 * 2. Conductor spawns work order (or individual skill)
 * 3. Skill loader injects expertise into agent prompt
 * 4. Work orders spawn: 2 workers + 1 supervisor
 * 5. Workers report to supervisor, supervisor reports to Conductor
 *
 * Skills save ~3000 tokens/session by loading on-demand vs preloaded.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Skill search paths (in priority order)
const SKILL_PATHS = [
  // 1. Project skills/ directory (highest priority)
  join(process.cwd(), 'skills'),
  // 2. User skills directory
  join(os.homedir(), '.boss-claude', 'skills'),
  // 3. Package skills/core/ directory
  join(dirname(__dirname), 'skills', 'core')
];

// Work order specific search paths (subdirectories under skills/)
const WORK_ORDER_PATHS = [
  // 1. Project work-orders/ subdirectory
  join(process.cwd(), 'skills', 'work-orders'),
  // 2. User work-orders directory
  join(os.homedir(), '.boss-claude', 'skills', 'work-orders'),
  // 3. Package work-orders directory
  join(dirname(__dirname), 'skills', 'work-orders')
];

/**
 * Simple YAML frontmatter parser
 * @param {string} content - File content with YAML frontmatter
 * @returns {{ metadata: object, content: string }}
 */
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { metadata: {}, content };
  }

  const [, yamlContent, markdownContent] = match;
  const metadata = {};

  // Simple YAML parser (supports key: value pairs)
  const lines = yamlContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();

    // Remove quotes if present
    metadata[key] = value.replace(/^["']|["']$/g, '');
  }

  return { metadata, content: markdownContent };
}

/**
 * Find skill file in search paths
 * @param {string} skillName - Name of the skill (without .md extension)
 * @param {boolean} includeWorkOrders - Also search work order paths
 * @returns {{ found: boolean, path?: string, error?: string }}
 */
function findSkillFile(skillName, includeWorkOrders = false) {
  const filename = skillName.endsWith('.md') ? skillName : `${skillName}.md`;

  // First search skill paths
  for (const searchPath of SKILL_PATHS) {
    if (!existsSync(searchPath)) continue;

    const skillPath = join(searchPath, filename);
    if (existsSync(skillPath)) {
      return { found: true, path: skillPath };
    }
  }

  // If requested, also search work order paths
  if (includeWorkOrders) {
    for (const searchPath of WORK_ORDER_PATHS) {
      if (!existsSync(searchPath)) continue;

      const skillPath = join(searchPath, filename);
      if (existsSync(skillPath)) {
        return { found: true, path: skillPath };
      }
    }
  }

  const allPaths = includeWorkOrders ? [...SKILL_PATHS, ...WORK_ORDER_PATHS] : SKILL_PATHS;
  return {
    found: false,
    error: `Skill "${skillName}" not found in any search path:\n${allPaths.map(p => `  - ${p}`).join('\n')}`
  };
}

/**
 * Load a skill by name
 * @param {string} skillName - Name of the skill to load
 * @returns {{ found: boolean, skill?: object, error?: string }}
 */
export function loadSkill(skillName) {
  const fileResult = findSkillFile(skillName);
  if (!fileResult.found) {
    return fileResult;
  }

  try {
    const content = readFileSync(fileResult.path, 'utf8');
    const { metadata, content: markdownContent } = parseFrontmatter(content);

    return {
      found: true,
      skill: {
        name: metadata.name || skillName,
        version: metadata.version || '1.0.0',
        description: metadata.description || '',
        category: metadata.category || 'general',
        content: markdownContent,
        path: fileResult.path,
        metadata
      }
    };
  } catch (err) {
    return {
      found: false,
      error: `Failed to load skill "${skillName}": ${err.message}`
    };
  }
}

/**
 * Parse nested YAML structure from frontmatter
 * Handles simple nested structures like:
 *   structure:
 *     supervisor: name
 *     workers: [a, b, c]
 * @param {string} yamlContent - Raw YAML frontmatter content
 * @returns {{ supervisor?: string, workers?: string[] }}
 */
function parseNestedStructure(yamlContent) {
  const result = {};
  const lines = yamlContent.split('\n');
  let inStructure = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === 'structure:') {
      inStructure = true;
      continue;
    }

    if (inStructure) {
      // End of structure block if we hit a non-indented line
      if (line && !line.startsWith(' ') && !line.startsWith('\t')) {
        break;
      }

      if (trimmed.startsWith('supervisor:')) {
        const value = trimmed.slice('supervisor:'.length).trim();
        result.supervisor = value;
      } else if (trimmed.startsWith('workers:')) {
        const value = trimmed.slice('workers:'.length).trim();
        // Parse array format: [a, b, c]
        if (value.startsWith('[') && value.includes(']')) {
          result.workers = value
            .replace(/[\[\]]/g, '')
            .split(',')
            .map(w => w.trim())
            .filter(Boolean);
        }
      }
    }
  }

  return result;
}

/**
 * Load a work order (special skill type with supervisor/worker structure)
 * @param {string} workOrderName - Name of the work order
 * @returns {{ found: boolean, workOrder?: object, error?: string }}
 */
export function loadWorkOrder(workOrderName) {
  const fileResult = findSkillFile(workOrderName, true);  // Include work order paths
  if (!fileResult.found) {
    return fileResult;
  }

  try {
    const content = readFileSync(fileResult.path, 'utf8');
    const { metadata, content: markdownContent } = parseFrontmatter(content);

    // Parse nested structure from raw YAML if present
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    let structure = {};
    if (frontmatterMatch) {
      structure = parseNestedStructure(frontmatterMatch[1]);
    }

    const workOrder = {
      name: metadata.name || workOrderName,
      description: metadata.description || '',
      supervisor: metadata.supervisor || structure.supervisor || null,
      workers: [],
      content: markdownContent,
      path: fileResult.path
    };

    // Parse workers from metadata or structure
    if (metadata.workers) {
      if (typeof metadata.workers === 'string') {
        workOrder.workers = metadata.workers
          .replace(/[\[\]]/g, '')
          .split(',')
          .map(w => w.trim())
          .filter(Boolean);
      }
    } else if (structure.workers) {
      workOrder.workers = structure.workers;
    }

    return {
      found: true,
      workOrder
    };
  } catch (err) {
    return {
      found: false,
      error: `Failed to load work order "${workOrderName}": ${err.message}`
    };
  }
}

/**
 * Generate agent prompt with injected skill expertise
 * @param {string} taskPrompt - The base task prompt
 * @param {string|string[]} skills - Skill name(s) to inject
 * @returns {{ success: boolean, prompt?: string, errors?: string[] }}
 */
export function generateAgentPrompt(taskPrompt, skills) {
  const skillList = Array.isArray(skills) ? skills : [skills];
  const loadedSkills = [];
  const errors = [];

  // Load all requested skills
  for (const skillName of skillList) {
    const result = loadSkill(skillName);
    if (result.found) {
      loadedSkills.push(result.skill);
    } else {
      errors.push(result.error);
    }
  }

  // If no skills loaded successfully, return error
  if (loadedSkills.length === 0 && skillList.length > 0) {
    return {
      success: false,
      errors
    };
  }

  // Build prompt with injected expertise
  let prompt = '';

  // Add skill expertise sections
  if (loadedSkills.length > 0) {
    prompt += '# EXPERTISE\n\n';
    prompt += 'You have been provided with the following specialized knowledge:\n\n';

    for (const skill of loadedSkills) {
      prompt += `## ${skill.name}\n\n`;
      if (skill.description) {
        prompt += `${skill.description}\n\n`;
      }
      prompt += `${skill.content}\n\n`;
      prompt += '---\n\n';
    }
  }

  // Add task prompt
  prompt += '# TASK\n\n';
  prompt += taskPrompt;

  return {
    success: true,
    prompt,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * List all available skills in search paths
 * @returns {Array<{ name: string, path: string, description?: string }>}
 */
export function listSkills() {
  const skills = [];
  const seen = new Set();

  for (const searchPath of SKILL_PATHS) {
    if (!existsSync(searchPath)) continue;

    try {
      const files = readdirSync(searchPath);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        const skillName = file.replace(/\.md$/, '');

        // Skip duplicates (first found wins due to priority order)
        if (seen.has(skillName)) continue;
        seen.add(skillName);

        const skillPath = join(searchPath, file);
        const result = loadSkill(skillName);

        skills.push({
          name: skillName,
          path: skillPath,
          description: result.found ? result.skill.description : undefined,
          category: result.found ? result.skill.category : undefined
        });
      }
    } catch (err) {
      // Skip directories that can't be read
      continue;
    }
  }

  return skills;
}

/**
 * List all available work orders in search paths
 * @returns {Array<{ name: string, supervisor: string, workers: string[], description?: string, path: string }>}
 */
export function listWorkOrders() {
  const workOrders = [];
  const seen = new Set();

  // Search work order specific paths
  for (const searchPath of WORK_ORDER_PATHS) {
    if (!existsSync(searchPath)) continue;

    try {
      const files = readdirSync(searchPath);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        const woName = file.replace(/\.md$/, '');

        // Skip duplicates (first found wins due to priority order)
        if (seen.has(woName)) continue;

        const woPath = join(searchPath, file);
        const result = loadWorkOrder(woName);

        // Only include if it's actually a work order (has supervisor/workers)
        if (result.found && result.workOrder) {
          const wo = result.workOrder;
          if (wo.supervisor || wo.workers.length > 0) {
            seen.add(woName);
            workOrders.push({
              name: wo.name,
              supervisor: wo.supervisor,
              workers: wo.workers,
              description: wo.description,
              path: wo.path
            });
          }
        }
      }
    } catch (err) {
      // Skip directories that can't be read
      continue;
    }
  }

  // Also search main skill paths for work orders (backward compatibility)
  for (const searchPath of SKILL_PATHS) {
    if (!existsSync(searchPath)) continue;

    try {
      const files = readdirSync(searchPath);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        const woName = file.replace(/\.md$/, '');

        // Skip duplicates
        if (seen.has(woName)) continue;

        const woPath = join(searchPath, file);
        const result = loadWorkOrder(woName);

        // Only include if it's actually a work order
        if (result.found && result.workOrder) {
          const wo = result.workOrder;
          if (wo.supervisor || wo.workers.length > 0) {
            seen.add(woName);
            workOrders.push({
              name: wo.name,
              supervisor: wo.supervisor,
              workers: wo.workers,
              description: wo.description,
              path: wo.path
            });
          }
        }
      }
    } catch (err) {
      // Skip directories that can't be read
      continue;
    }
  }

  return workOrders;
}

/**
 * Get skill search paths (useful for debugging)
 * @returns {string[]}
 */
export function getSkillPaths() {
  return SKILL_PATHS;
}

// Default export
export default {
  loadSkill,
  loadWorkOrder,
  generateAgentPrompt,
  listSkills,
  listWorkOrders,
  getSkillPaths
};
