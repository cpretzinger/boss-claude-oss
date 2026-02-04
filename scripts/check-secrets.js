#!/usr/bin/env node

/**
 * check-secrets.js - Scan for leaked secrets before npm publish
 *
 * Checks for:
 * - Hardcoded paths containing "/Users/"
 * - API keys or tokens
 * - Personal email addresses
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Patterns to detect secrets
const SECRET_PATTERNS = [
  {
    name: 'Hardcoded user paths',
    pattern: /\/Users\/[a-zA-Z0-9_-]+/g,
    description: 'Found hardcoded macOS user path'
  },
  {
    name: 'Windows user paths',
    pattern: /C:\\Users\\[a-zA-Z0-9_-]+/gi,
    description: 'Found hardcoded Windows user path'
  },
  {
    name: 'GitHub Personal Access Token',
    pattern: /ghp_[a-zA-Z0-9]{36}/g,
    description: 'Found GitHub Personal Access Token'
  },
  {
    name: 'GitHub Fine-grained Token',
    pattern: /github_pat_[a-zA-Z0-9_]{22,}/g,
    description: 'Found GitHub Fine-grained Personal Access Token'
  },
  {
    name: 'OpenAI API Key',
    pattern: /sk-[a-zA-Z0-9]{20,}/g,
    description: 'Found OpenAI API key'
  },
  {
    name: 'Generic API Key',
    pattern: /['"]?api[_-]?key['"]?\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi,
    description: 'Found potential API key assignment'
  },
  {
    name: 'Generic Secret/Token',
    pattern: /['"]?(?:secret|token|password)['"]?\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    description: 'Found potential secret/token/password'
  },
  {
    name: 'Personal Email',
    pattern: /[a-zA-Z0-9._%+-]+@(?!example\.com|test\.com|localhost)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    description: 'Found personal email address'
  },
  {
    name: 'Redis Connection with Password',
    pattern: /redis:\/\/[^:]+:[^@]+@[^/\s]+/gi,
    description: 'Found Redis connection string with credentials'
  },
  {
    name: 'PostgreSQL Connection with Password',
    pattern: /postgresql:\/\/[^:]+:[^@]+@[^/\s]+/gi,
    description: 'Found PostgreSQL connection string with credentials'
  },
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    description: 'Found AWS Access Key ID'
  },
  {
    name: 'Private Key',
    pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
    description: 'Found private key'
  }
];

// Files/patterns to exclude from scanning
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /check-secrets\.js$/,
  /check-secrets\.sh$/,
  /\.test\.js$/,
  /\.spec\.js$/,
  /\.md$/,
  /\.example$/,
  /\.env\.example$/,
  /scripts\/redis-setup\.js$/,  // Local dev script, not published
  /scripts\/redis-monitor\.js$/,  // Local dev script, not published
  /scripts\/verify-redis-deployment\.js$/,  // Local dev script, not published
  /scripts\/verify-redis-init\.js$/,  // Local dev script, not published
];

// Content patterns to exclude (safe examples, comments, etc.)
const SAFE_CONTENT_PATTERNS = [
  /example\.com/i,
  /test\.com/i,
  /localhost/i,
  /password@host/i,
  /user:pass@host/i,
  /username:password@host/i,
  /\[username:password@\]/i,  // Documentation format examples
  /your[_-]?api[_-]?key/i,
  /your[_-]?secret/i,
  /placeholder/i,
  /REPLACE_WITH/i,
  /TODO:/i,
  /FIXME:/i,
  /chalk\.(yellow|blue|green|red|cyan|magenta|white|gray|underline)/i,  // Chalk formatting strings
  /console\.(log|error|warn|info)/i,  // Console output examples
  /process\.env\./i,  // Environment variable references
  /TOKEN[=:]\s*['"]\)/i,  // Incomplete token placeholders
  /Format:/i,  // Format documentation
  /expected:/i,  // Test expectations
];

function shouldExcludeFile(filePath) {
  return EXCLUDE_PATTERNS.some(pattern => pattern.test(filePath));
}

function isSafeContent(line) {
  return SAFE_CONTENT_PATTERNS.some(pattern => pattern.test(line));
}

function getAllFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (shouldExcludeFile(fullPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      getAllFiles(fullPath, files);
    } else if (entry.isFile() && /\.(js|json|ts|tsx|jsx|mjs|cjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function scanFile(filePath) {
  const issues = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Skip if line contains safe content patterns
    if (isSafeContent(line)) {
      return;
    }

    // Skip comments
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('/*')) {
      return;
    }

    for (const { name, pattern, description } of SECRET_PATTERNS) {
      const matches = line.match(pattern);
      if (matches) {
        // Double-check it's not a safe pattern
        const isSafe = matches.every(match =>
          SAFE_CONTENT_PATTERNS.some(safePattern => safePattern.test(match))
        );

        if (!isSafe) {
          issues.push({
            file: filePath,
            line: index + 1,
            type: name,
            description,
            match: matches[0].substring(0, 50) + (matches[0].length > 50 ? '...' : '')
          });
        }
      }
    }
  });

  return issues;
}

function main() {
  console.log('Scanning for secrets before publish...\n');

  const dirsToScan = ['lib', 'bin', 'config', 'scripts'].map(d => path.join(projectRoot, d));
  const filesToScan = [path.join(projectRoot, 'package.json')];

  // Gather all files to scan
  for (const dir of dirsToScan) {
    if (fs.existsSync(dir)) {
      getAllFiles(dir, filesToScan);
    }
  }

  console.log(`Scanning ${filesToScan.length} files...\n`);

  const allIssues = [];

  for (const file of filesToScan) {
    const issues = scanFile(file);
    allIssues.push(...issues);
  }

  if (allIssues.length > 0) {
    console.log('SECRETS DETECTED - PUBLISH BLOCKED\n');
    console.log('=' .repeat(60));

    for (const issue of allIssues) {
      const relativePath = path.relative(projectRoot, issue.file);
      console.log(`\nFile: ${relativePath}`);
      console.log(`Line: ${issue.line}`);
      console.log(`Type: ${issue.type}`);
      console.log(`Description: ${issue.description}`);
      console.log(`Match: ${issue.match}`);
    }

    console.log('\n' + '=' .repeat(60));
    console.log(`\nFound ${allIssues.length} potential secret(s). Please remove them before publishing.`);
    process.exit(1);
  }

  console.log('No secrets detected. Safe to publish!');
  process.exit(0);
}

main();
