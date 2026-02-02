#!/usr/bin/env node
/**
 * Exponential MCP CLI
 * Setup and configuration for the MCP server
 */

import { program } from 'commander';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import * as readline from 'readline';

const CONFIG_DIR = join(homedir(), '.config', 'exponential-mcp');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const CLAUDE_CONFIG_PATH = join(homedir(), '.claude', 'claude_desktop_config.json');

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

program
  .name('exponential-mcp')
  .description('MCP server for Exponential - connect Claude to your productivity data')
  .version('0.1.0');

program
  .command('init')
  .description('Set up Exponential MCP with your API key')
  .option('-k, --key <key>', 'API key (or will prompt)')
  .option('--base-url <url>', 'Custom Exponential URL (default: https://www.exponential.im)')
  .action(async (options) => {
    console.log('🚀 Setting up Exponential MCP...\n');

    // Get API key
    let apiKey = options.key;
    if (!apiKey) {
      console.log('Get your API key from: https://www.exponential.im/settings/api-keys\n');
      apiKey = await prompt('Paste your API key: ');
    }

    if (!apiKey) {
      console.error('❌ API key is required');
      process.exit(1);
    }

    // Create config directory
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }

    // Save config
    const config = {
      apiKey,
      baseUrl: options.baseUrl || 'https://www.exponential.im',
    };
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(`✅ Config saved to ${CONFIG_PATH}\n`);

    // Update Claude Desktop config
    await updateClaudeConfig();

    console.log('\n🎉 Setup complete!\n');
    console.log('Next steps:');
    console.log('  1. Restart Claude Desktop');
    console.log('  2. Ask Claude to "list my projects" or "create a task"\n');
  });

program
  .command('config')
  .description('Show current configuration')
  .action(() => {
    if (!existsSync(CONFIG_PATH)) {
      console.log('No config found. Run "exponential-mcp init" first.');
      return;
    }
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    console.log('Current config:');
    console.log(`  Base URL: ${config.baseUrl}`);
    console.log(`  API Key: ${config.apiKey.substring(0, 10)}...`);
  });

program
  .command('serve')
  .description('Start the MCP server (usually called by Claude Desktop)')
  .action(async () => {
    // Import and run the server
    await import('./index.js');
  });

async function updateClaudeConfig() {
  const claudeConfigDir = join(homedir(), '.claude');
  
  // Create .claude directory if it doesn't exist
  if (!existsSync(claudeConfigDir)) {
    mkdirSync(claudeConfigDir, { recursive: true });
  }

  let claudeConfig: any = { mcpServers: {} };
  
  // Read existing config if present
  if (existsSync(CLAUDE_CONFIG_PATH)) {
    try {
      claudeConfig = JSON.parse(readFileSync(CLAUDE_CONFIG_PATH, 'utf-8'));
      if (!claudeConfig.mcpServers) {
        claudeConfig.mcpServers = {};
      }
    } catch (e) {
      console.log('⚠️  Could not parse existing Claude config, creating new one');
    }
  }

  // Add exponential server
  claudeConfig.mcpServers.exponential = {
    command: 'npx',
    args: ['exponential-mcp', 'serve'],
  };

  writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(claudeConfig, null, 2));
  console.log(`✅ Claude Desktop config updated: ${CLAUDE_CONFIG_PATH}`);
}

program.parse();
