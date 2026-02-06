#!/usr/bin/env node
/**
 * Exponential MCP CLI
 * Setup and configuration for the MCP server
 */

import { program } from 'commander';
import { createConfigStore } from 'exponential-sdk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

const CONFIG_DIR = join(homedir(), '.config', 'exponential-mcp');
const LEGACY_CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const configStore = createConfigStore({ projectName: 'exponential-mcp' });
const LEGACY_CLAUDE_CONFIG_PATH = join(homedir(), '.claude', 'claude_desktop_config.json');
const MACOS_CLAUDE_CONFIG_PATH = join(
  homedir(),
  'Library',
  'Application Support',
  'Claude',
  'claude_desktop_config.json',
);

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

function migrateLegacyConfig(): void {
  if (configStore.isAuthenticated() || !existsSync(LEGACY_CONFIG_PATH)) {
    return;
  }

  try {
    const legacy = JSON.parse(readFileSync(LEGACY_CONFIG_PATH, 'utf-8'));
    if (legacy?.apiKey) {
      configStore.saveConfig({
        token: legacy.apiKey,
        apiUrl: legacy.baseUrl || 'https://www.exponential.im',
      });
    }
  } catch {
    // Ignore legacy config parsing errors.
  }
}

function getClaudeConfigPath(): string {
  if (process.platform === 'darwin') {
    if (existsSync(MACOS_CLAUDE_CONFIG_PATH)) {
      return MACOS_CLAUDE_CONFIG_PATH;
    }
    if (existsSync(LEGACY_CLAUDE_CONFIG_PATH)) {
      return LEGACY_CLAUDE_CONFIG_PATH;
    }
    return MACOS_CLAUDE_CONFIG_PATH;
  }
  return LEGACY_CLAUDE_CONFIG_PATH;
}

function getServerEntry(): { command: string; args: string[] } {
  const serverPath = fileURLToPath(new URL('./index.js', import.meta.url));
  return {
    command: process.execPath,
    args: [serverPath],
  };
}

function ensureParentDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
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
      console.log('Create an API key at: https://www.exponential.im/settings/api-keys');
      console.log('  → Select "JWT Token" as the token type\n');
      apiKey = await prompt('Paste your API key: ');
    }

    if (!apiKey) {
      console.error('❌ API key is required');
      process.exit(1);
    }

    // Create config directory for legacy migrations.
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }

    configStore.saveConfig({
      token: apiKey,
      apiUrl: options.baseUrl || 'https://www.exponential.im',
    });
    console.log(`✅ Config saved to ${configStore.getConfigPath()}\n`);

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
    migrateLegacyConfig();

    if (!configStore.isAuthenticated()) {
      console.log('No config found. Run "exponential-mcp init" first.');
      return;
    }
    const config = configStore.loadConfig();
    console.log('Current config:');
    console.log(`  Base URL: ${config.apiUrl}`);
    console.log(`  API Key: ${config.token.substring(0, 10)}...`);
  });

program
  .command('serve')
  .description('Start the MCP server (usually called by Claude Desktop)')
  .action(async () => {
    // Import and run the server
    await import('./index.js');
  });

program
  .command('doctor')
  .description('Diagnose local MCP setup for Claude Desktop')
  .action(() => {
    migrateLegacyConfig();

    const issues: string[] = [];
    const configPath = getClaudeConfigPath();
    const recommended = getServerEntry();

    console.log('🩺 Exponential MCP Doctor\n');

    if (!configStore.isAuthenticated()) {
      issues.push('No API key found. Run "exponential-mcp init" first.');
    }

    if (!existsSync(configPath)) {
      issues.push(`Claude Desktop config not found at ${configPath}`);
    }

    let config: any = null;
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(readFileSync(configPath, 'utf-8'));
      } catch {
        issues.push(`Claude Desktop config is not valid JSON: ${configPath}`);
      }
    }

    const serverConfig = config?.mcpServers?.exponential;
    if (!serverConfig) {
      issues.push('No "exponential" entry found in Claude Desktop config.');
    } else {
      if (!serverConfig.command) {
        issues.push('MCP config is missing "command" for Exponential.');
      } else if (!existsSync(serverConfig.command)) {
        issues.push(`MCP command not found: ${serverConfig.command}`);
      }

      const serverArg = Array.isArray(serverConfig.args) ? serverConfig.args[0] : null;
      if (!serverArg) {
        issues.push('MCP config args missing server entry point.');
      } else if (!existsSync(serverArg)) {
        issues.push(`MCP server entry not found: ${serverArg}`);
      }
    }

    if (issues.length === 0) {
      console.log('✅ No issues found. Claude Desktop should load the Exponential MCP server.');
    } else {
      console.log('⚠️  Issues found:\n');
      for (const issue of issues) {
        console.log(`- ${issue}`);
      }
    }

    console.log('\nRecommended MCP config:\n');
    console.log(
      JSON.stringify(
        {
          mcpServers: {
            exponential: recommended,
          },
        },
        null,
        2,
      ),
    );
  });

async function updateClaudeConfig() {
  const configPath = getClaudeConfigPath();
  ensureParentDir(configPath);

  let claudeConfig: any = { mcpServers: {} };
  
  // Read existing config if present
  if (existsSync(configPath)) {
    try {
      claudeConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (!claudeConfig.mcpServers) {
        claudeConfig.mcpServers = {};
      }
    } catch (e) {
      console.log('⚠️  Could not parse existing Claude config, creating new one');
    }
  }

  // Add exponential server
  claudeConfig.mcpServers.exponential = getServerEntry();

  writeFileSync(configPath, JSON.stringify(claudeConfig, null, 2));
  console.log(`✅ Claude Desktop config updated: ${configPath}`);
}

program.parse();
