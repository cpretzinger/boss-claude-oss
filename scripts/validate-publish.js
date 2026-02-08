#!/usr/bin/env node

/**
 * Validate Publish Script
 *
 * Runs before npm publish to ensure NO private files are included in the package.
 * This is a critical security check to prevent internal/private code from being published.
 *
 * Exit codes:
 * - 0: All clear, no private files detected
 * - 1: Private files detected OR script error
 */

import { execSync } from 'child_process';
import path from 'path';

// PRIVATE FILE PATTERNS - These should NEVER be published
const PRIVATE_PATTERNS = [
  // Private directories (these are NOT in package.json files array)
  /^DOCS-INTERNAL\//,
  /^scripts-internal\//,
  /^\.github\/workflows\/private/,

  // Environment files (except examples)
  /^\.env$/,
  /^\.env\.local$/,
  /^\.env\.production$/,
  /^\.env\..*$/,

  // Stripe/payment related files
  /^docs\/STRIPE-PRODUCTS\.md$/,

  // Test credentials or keys
  /private[-_]key/i,
  /secret[-_]key/i,
];

// ALLOWED FILES - These are safe even if they match a pattern above
const ALLOWED_FILES = [
  'lib/setup/import-credentials.js',  // Utility for importing credentials, contains no actual credentials
];

/**
 * Check if a file path matches any private pattern
 */
function isPrivateFile(filePath) {
  // Check if file is explicitly allowed
  if (ALLOWED_FILES.includes(filePath)) {
    return false;
  }

  return PRIVATE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Get list of files that would be included in npm package
 */
function getPackageFiles() {
  try {
    console.log('🔍 Running npm pack --dry-run to get package file list...\n');

    // Run npm pack in dry-run mode with JSON output
    const output = execSync('npm pack --dry-run --json', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Parse the JSON output
    const packResult = JSON.parse(output);

    // Extract file list from the first element (npm pack returns array)
    if (!packResult || !packResult[0] || !packResult[0].files) {
      throw new Error('Unexpected npm pack output format');
    }

    // Return array of file paths
    return packResult[0].files.map(file => file.path);
  } catch (error) {
    console.error('❌ Error running npm pack:');
    console.error(error.message);

    if (error.stderr) {
      console.error('\nStderr:', error.stderr.toString());
    }

    process.exit(1);
  }
}

/**
 * Main validation function
 */
function validatePublish() {
  console.log('🛡️  BOSS-CLAUDE PUBLISH VALIDATION\n');
  console.log('Checking for private files in package...\n');

  // Get all files that would be published
  const packageFiles = getPackageFiles();

  console.log(`📦 Found ${packageFiles.length} files in package\n`);

  // Check each file against private patterns
  const privateFiles = [];

  for (const file of packageFiles) {
    if (isPrivateFile(file)) {
      privateFiles.push(file);
    }
  }

  // Report results
  if (privateFiles.length > 0) {
    console.error('❌ VALIDATION FAILED: Private files detected in package!\n');
    console.error('The following private files would be published:\n');

    privateFiles.forEach(file => {
      console.error(`  - ${file}`);
    });

    console.error('\n🚨 PUBLISH BLOCKED 🚨\n');
    console.error('These files should NOT be public. Please check your .npmignore file.\n');

    process.exit(1);
  }

  // Success
  console.log('✅ VALIDATION PASSED\n');
  console.log('No private files detected in package.');
  console.log('Safe to publish!\n');

  process.exit(0);
}

// Run validation
validatePublish();
