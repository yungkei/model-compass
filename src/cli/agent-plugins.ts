import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { resolveAgentEnv } from '../agents/resolve';

export interface PluginConfig {
  name: string;
  type: string;
  description: string;
  model?: string;
  envVars?: Record<string, string>;
  configFiles?: Array<{
    path: string;
    template: object;
  }>;
}

const AGENT_PLUGINS: Record<string, PluginConfig> = {
  claude: {
    name: 'Claude Code',
    type: 'claude-code',
    description: 'Claude Code adapter plugin - auto-config via MC proxy',
    model: 'mc',
    configFiles: [
      {
        path: '~/.claude/settings.json',
        template: {
          env: {
            ANTHROPIC_BASE_URL: '{env:MC_BASE_URL}',
            ANTHROPIC_API_KEY: '{env:MC_API_KEY}',
            MC_MODEL: 'mc'
          }
        }
      }
    ]
  },
  opencode: {
    name: 'OpenCode',
    type: 'opencode',
    description: 'OpenCode adapter plugin - auto-generate provider config',
    configFiles: [
      {
        path: '~/.config/opencode/opencode.json',
        template: {
          $schema: 'https://opencode.ai/config.json',
          provider: {
            'model-compass': {
              npm: '@ai-sdk/openai-compatible',
              name: 'Model Compass Router',
              options: {
                baseURL: '{env:MC_BASE_URL}',
                apiKey: '{env:MC_API_KEY}'
              },
              models: {
                'mc': {
                  name: 'Model Compass Router'
                }
              }
            }
          }
        }
      }
    ]
  },
  cursor: {
    name: 'Cursor',
    type: 'cursor',
    description: 'Cursor adapter plugin - configure MCP routing server',
    configFiles: [
      {
        path: '~/.cursor/mcp.json',
        template: {
          'model-compass': {
            command: 'node',
            args: ['/path/to/mc/router-mcp.js'],
            env: {
              MC_BASE_URL: '{env:MC_BASE_URL}'
            }
          }
        }
      }
    ]
  },
  windsurf: {
    name: 'Windsurf',
    type: 'windsurf',
    description: 'Windsurf adapter plugin - configure MCP routing server',
    configFiles: [
      {
        path: '~/.codeium/windsurf/mcp_config.json',
        template: {
          'model-compass': {
            command: 'node',
            args: ['/path/to/mc/router-mcp.js'],
            env: {
              MC_BASE_URL: '{env:MC_BASE_URL}'
            }
          }
        }
      }
    ]
  }
};

function getPluginPath(): string {
  const basePath = process.env.MC_HOME || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.model-compass');
  return path.join(basePath, 'plugins.json');
}

function loadPlugins(): Record<string, boolean> {
  const pluginPath = getPluginPath();
  try {
    if (fs.existsSync(pluginPath)) {
      return JSON.parse(fs.readFileSync(pluginPath, 'utf-8'));
    }
  } catch {}
  return {};
}

function savePlugins(plugins: Record<string, boolean>): void {
  const pluginPath = getPluginPath();
  const dir = path.dirname(pluginPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(pluginPath, JSON.stringify(plugins, null, 2));
}

function expandPath(filePath: string): string {
  if (filePath.startsWith('~/') || filePath.startsWith('~\\')) {
    const home = process.env.HOME || process.env.USERPROFILE || '.';
    return path.join(home, filePath.slice(2));
  }
  return filePath;
}

function installPlugin(agentName: string): void {
  const plugin = AGENT_PLUGINS[agentName];
  if (!plugin) {
    console.error(`Unknown agent: ${agentName}`);
    console.log(`Available plugins: ${Object.keys(AGENT_PLUGINS).join(', ')}`);
    return;
  }

  const installed = loadPlugins();

  if (installed[agentName]) {
    console.log(`${plugin.name} plugin already installed`);
    return;
  }

  console.log(`Installing ${plugin.name} plugin...\n`);

  const resolved = resolveAgentEnv(plugin.model);

  if (plugin.configFiles) {
    for (const cf of plugin.configFiles) {
      const fullPath = expandPath(cf.path);
      const dir = path.dirname(fullPath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let content = JSON.stringify(cf.template, null, 2);
      content = content.replace(/\{env:MC_BASE_URL\}/g, resolved.ANTHROPIC_BASE_URL);
      content = content.replace(/\{env:MC_API_KEY\}/g, resolved.ANTHROPIC_API_KEY);

      if (fs.existsSync(fullPath)) {
        try {
          const existing = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
          const merged = { ...existing, ...cf.template };
          content = JSON.stringify(merged, null, 2);
          console.log(`  + Merged config: ${fullPath}`);
        } catch {
          console.log(`  - Skipped (JSON parse failed): ${fullPath}`);
          continue;
        }
      } else {
        console.log(`  + Created config: ${fullPath}`);
      }

      fs.writeFileSync(fullPath, content);
    }
  }

  installed[agentName] = true;
  savePlugins(installed);

  console.log(`\n${plugin.name} plugin installed!`);
  console.log(`   Description: ${plugin.description}`);
}

function uninstallPlugin(agentName: string): void {
  const plugin = AGENT_PLUGINS[agentName];
  if (!plugin) {
    console.error(`Unknown agent: ${agentName}`);
    return;
  }

  const installed = loadPlugins();

  if (!installed[agentName]) {
    console.log(`${plugin.name} plugin not installed`);
    return;
  }

  if (plugin.configFiles) {
    for (const cf of plugin.configFiles) {
      const fullPath = expandPath(cf.path);
      if (fs.existsSync(fullPath)) {
        try {
          const existing = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
          for (const key of Object.keys(cf.template)) {
            delete existing[key];
          }
          fs.writeFileSync(fullPath, JSON.stringify(existing, null, 2));
          console.log(`  - Removed config: ${fullPath}`);
        } catch {
          console.log(`  - Skipped: ${fullPath}`);
        }
      }
    }
  }

  delete installed[agentName];
  savePlugins(installed);

  console.log(`${plugin.name} plugin uninstalled`);
}

function listPlugins(): void {
  const installed = loadPlugins();

  console.log('\nAgent Adapter Plugins:\n');

  for (const [key, plugin] of Object.entries(AGENT_PLUGINS)) {
    const isInstalled = installed[key];
    console.log(`  ${isInstalled ? '*' : 'o'} ${key.padEnd(10)} - ${plugin.name}`);
    console.log(`      ${plugin.description}`);
  }
  console.log('');
}

export function addPluginCommands(): void {
  const pluginCmd = program
    .command('plugin')
    .description('Manage Agent adapter plugins');

  pluginCmd
    .command('install <agent>')
    .description('Install agent plugin (claude, opencode, cursor, windsurf)')
    .action((agent) => {
      installPlugin(agent);
    });

  pluginCmd
    .command('uninstall <agent>')
    .description('Uninstall agent plugin')
    .action((agent) => {
      uninstallPlugin(agent);
    });

  pluginCmd
    .command('list')
    .description('List all available plugins')
    .action(() => {
      listPlugins();
    });

  pluginCmd
    .command('status')
    .description('Show plugin installation status')
    .action(() => {
      const installed = loadPlugins();
      console.log('\nInstalled plugins:\n');
      if (Object.keys(installed).length === 0) {
        console.log('  None');
      } else {
        for (const name of Object.keys(installed)) {
          console.log(`  ● ${name}`);
        }
      }
      console.log('');
    });
}