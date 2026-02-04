#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { importCredentials } from '../lib/setup/import-credentials.js';
import { generateClaudeMdBlock, getClaudeMdMarkers } from '../lib/claude-md-template.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log(chalk.blue.bold('\n🎮 Installing Boss Claude...\n'));

try {
  // Create ~/.boss-claude directory
  const bossDirPath = join(os.homedir(), '.boss-claude');

  if (!fs.existsSync(bossDirPath)) {
    fs.mkdirSync(bossDirPath, { recursive: true });
    console.log(chalk.green('✅ Created ~/.boss-claude directory'));
  }

  // Use credential import system instead of copying template
  const envDestPath = join(bossDirPath, '.env');

  if (!fs.existsSync(envDestPath)) {
    console.log(chalk.blue('\n🔐 Setting up credentials...\n'));

    // Auto-detect and import credentials
    await importCredentials();
  } else {
    console.log(chalk.blue('ℹ️  ~/.boss-claude/.env already exists (skipping credential import)'));
    console.log(chalk.gray('   Run "boss-claude setup" to re-import credentials'));
  }

  // Update ~/.claude/CLAUDE.md to auto-load Boss
  const claudeDirPath = join(os.homedir(), '.claude');
  const claudeMdPath = join(claudeDirPath, 'CLAUDE.md');
  const markers = getClaudeMdMarkers();
  const bossAutoLoadBlock = generateClaudeMdBlock('CONDUCTOR');

  if (!fs.existsSync(claudeDirPath)) {
    fs.mkdirSync(claudeDirPath, { recursive: true });
  }

  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, 'utf8');

    if (!content.includes(markers.start)) {
      fs.appendFileSync(claudeMdPath, '\n' + bossAutoLoadBlock);
      console.log(chalk.green('✅ Added Boss Claude auto-load to ~/.claude/CLAUDE.md'));
    } else {
      console.log(chalk.blue('ℹ️  Boss Claude auto-load already in ~/.claude/CLAUDE.md'));
    }
  } else {
    fs.writeFileSync(claudeMdPath, bossAutoLoadBlock);
    console.log(chalk.green('✅ Created ~/.claude/CLAUDE.md with Boss Claude auto-load'));
  }

  console.log(chalk.green.bold('\n✨ Boss Claude installed successfully!\n'));
  console.log(chalk.bold('Next steps:'));
  console.log(chalk.gray('1. Edit ~/.boss-claude/.env with your credentials'));
  console.log(chalk.gray('2. Run: boss-claude init'));
  console.log(chalk.gray('3. Start using Boss Claude in any repository!\n'));

} catch (error) {
  console.error(chalk.red('\n❌ Installation failed:'), error.message);
  process.exit(1);
}
