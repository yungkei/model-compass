import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { PluginManager } from '../plugins/plugin-manager';
import { AgentAdapter, createAdapterContext } from './types';
import { adapterManager } from './manager';

export interface MarketPlugin {
  id: string;
  name: string;
  type: string;
  description: string;
  version: string;
  author: string | { name: string; email?: string };
  repository?: string;
  homepage?: string;
  tags: string[];
  license?: string;

  npm?: string;
  config?: Record<string, unknown>;

  builtin?: boolean;

  adapter?: {
    entry: string;
    type: 'builtin' | 'npm' | 'file';
  };

  envVars?: Record<string, string>;

  configFiles?: Array<{
    path: string;
    template: object;
    merge?: boolean;
  }>;

  dependencies?: string[];

  hooks?: {
    preInstall?: string;
    postInstall?: string;
    preUninstall?: string;
    postUninstall?: string;
  };
}

export interface MarketplaceRegistry {
  name: string;
  description: string;
  version: string;
  plugins: MarketPlugin[];
}

const DEFAULT_MARKETPLACE_URL = 'https://raw.githubusercontent.com/yungkei/model-compass-plugins/main/registry.json';

interface MarketplaceConfig {
  name: string;
  description: string;
  url?: string;
  registry?: MarketplaceRegistry;
}

const OFFICIAL_MARKETPLACE: MarketplaceConfig = {
  name: 'Model Compass Official',
  description: 'Official plugin marketplace - all officially supported adapters',
  url: DEFAULT_MARKETPLACE_URL,
  registry: {
    name: 'Model Compass Official',
    description: 'Officially maintained agent adapters',
    version: '1.0.0',
    plugins: [
      {
        id: 'claude',
        name: 'Claude Code',
        type: 'claude-code',
        description: 'Anthropic Claude Code adapter - auto-configures ANTHROPIC_BASE_URL and API Key',
        version: '1.0.0',
        author: 'Model Compass Team',
        tags: ['claude', 'anthropic', 'official'],
        license: 'MIT',
        builtin: true,
        envVars: {
          ANTHROPIC_BASE_URL: 'http://localhost:8765/v1',
          ANTHROPIC_API_KEY: 'sk-dummy'
        },
        configFiles: [
          {
            path: '~/.claude/settings.json',
            template: {
              env: {
                ANTHROPIC_BASE_URL: '{env:ANTHROPIC_BASE_URL}',
                ANTHROPIC_API_KEY: '{env:ANTHROPIC_API_KEY}'
              }
            }
          }
        ]
      },
      {
        id: 'opencode',
        name: 'OpenCode',
        type: 'opencode',
        description: 'OpenCode adapter - auto-generates Provider configuration',
        version: '1.0.0',
        author: 'Model Compass Team',
        tags: ['opencode', 'official'],
        license: 'MIT',
        builtin: true,
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
                    baseURL: 'http://localhost:8765/v1',
                    apiKey: '{env:ANTHROPIC_API_KEY}'
                  }
                }
              }
            }
          }
        ]
      },
      {
        id: 'cursor',
        name: 'Cursor',
        type: 'cursor',
        description: 'Cursor IDE adapter - configures MCP routing server',
        version: '1.0.0',
        author: 'Model Compass Team',
        tags: ['cursor', 'mcp', 'official'],
        license: 'MIT',
        builtin: true,
        configFiles: [
          {
            path: '~/.cursor/mcp.json',
            template: {
              'model-compass': {
                command: 'node',
                args: ['$MC_PATH/router-mcp.js'],
                env: {
                  MC_BASE_URL: 'http://localhost:8765/v1'
                }
              }
            }
          }
        ]
      },
      {
        id: 'windsurf',
        name: 'Windsurf',
        type: 'windsurf',
        description: 'Windsurf (Codeium) adapter - configures MCP routing server',
        version: '1.0.0',
        author: 'Model Compass Team',
        tags: ['windsurf', 'codeium', 'mcp', 'official'],
        license: 'MIT',
        configFiles: [
          {
            path: '~/.codeium/windsurf/mcp_config.json',
            template: {
              'model-compass': {
                command: 'node',
                args: ['$MC_PATH/router-mcp.js'],
                env: {
                  MC_BASE_URL: 'http://localhost:8765/v1'
                }
              }
            }
          }
        ]
      },
      {
        id: 'jan',
        name: 'Jan',
        type: 'local',
        description: 'Jan AI adapter - local LLM runtime framework',
        version: '1.0.0',
        author: 'Model Compass Team',
        tags: ['jan', 'local', 'ollama'],
        license: 'MIT',
        configFiles: [
          {
            path: '~/.jan/settings.json',
            template: {
              api: {
                baseUrl: 'http://localhost:8765/v1',
                key: 'sk-dummy'
              }
            },
            merge: true
          }
        ]
      },
      {
        id: 'lmstudio',
        name: 'LM Studio',
        type: 'local',
        description: 'LM Studio adapter - local LLM management tool',
        version: '1.0.0',
        author: 'Model Compass Team',
        tags: ['lmstudio', 'local', 'ollama'],
        license: 'MIT',
        configFiles: [
          {
            path: '~/.cache/lm-studio/config.json',
            template: {
              api: {
                baseUrl: 'http://localhost:8765/v1',
                key: 'sk-dummy'
              }
            },
            merge: true
          }
        ]
      },
      {
        id: 'continue',
        name: 'Continue',
        type: 'vscode',
        description: 'Continue (VSCode extension) adapter - AI coding assistant',
        version: '1.0.0',
        author: 'Model Compass Team',
        tags: ['continue', 'vscode', 'openai'],
        license: 'MIT',
        configFiles: [
          {
            path: '~/.continue/config.json',
            template: {
              models: [
                {
                  model: 'claude-3.5-sonnet',
                  provider: 'openai',
                  apiBase: 'http://localhost:8765/v1',
                  apiKey: 'sk-dummy'
                }
              ]
            },
            merge: true
          }
        ]
      },
      {
        id: 'zed',
        name: 'Zed AI',
        type: 'zed',
        description: 'Zed editor AI adapter',
        version: '1.0.0',
        author: 'Model Compass Team',
        tags: ['zed', 'editor', 'openai'],
        license: 'MIT',
        configFiles: [
          {
            path: '~/.config/zed/settings.json',
            template: {
              agent: {
                model: 'claude-sonnet-4-5',
                provider: 'openai',
                apiUrl: 'http://localhost:8765/v1'
              }
            },
            merge: true
          }
        ]
      }
    ]
  }
};

function getMarketplacePath(): string {
  const home = process.env.MC_HOME || process.env.HOME || process.env.USERPROFILE || '.';
  return path.join(home, '.model-compass', 'marketplace.json');
}

function loadMarketplaceConfig(): MarketplaceConfig[] {
  const configPath = getMarketplacePath();
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return data.markets || [OFFICIAL_MARKETPLACE];
    }
  } catch {}
  return [OFFICIAL_MARKETPLACE];
}

function saveMarketplaceConfig(configs: MarketplaceConfig[]): void {
  const configPath = getMarketplacePath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify({ markets: configs }, null, 2));
}

function normalizePluginEntry(entry: any): MarketPlugin {
  const plugin: MarketPlugin = {
    id: entry.id,
    name: entry.name,
    type: entry.type || 'agent',
    description: entry.description,
    version: entry.version,
    author: entry.author,
    tags: entry.tags || [],
    license: entry.license,
    repository: entry.repository,
    homepage: entry.homepage,
  };
  if (entry.npm) plugin.npm = entry.npm;
  if (entry.config) plugin.config = entry.config;
  if (entry.envVars) plugin.envVars = entry.envVars;
  if (entry.configFiles) plugin.configFiles = entry.configFiles;
  if (entry.dependencies) plugin.dependencies = entry.dependencies;
  return plugin;
}

async function fetchRemoteRegistry(url: string): Promise<MarketplaceRegistry | null> {
  try {
    console.log(`📡 Fetching remote plugin registry: ${url}`);
    const response = await axios.get(url, { timeout: 10000 });
    const data = response.data;
    // Support model-compass-plugins format: { registry: [{ name, plugins }] }
    if (data.registry && Array.isArray(data.registry)) {
      const allPlugins: MarketPlugin[] = [];
      for (const category of data.registry) {
        if (category.plugins) {
          for (const entry of category.plugins) {
            allPlugins.push(normalizePluginEntry(entry));
          }
        }
      }
      return { name: data.name, description: data.description, version: data.version, plugins: allPlugins };
    }
    // Support flat format: { plugins: [...] }
    if (data.plugins && Array.isArray(data.plugins)) {
      return { ...data, plugins: data.plugins.map(normalizePluginEntry) };
    }
    return data as MarketplaceRegistry;
  } catch (err: any) {
    console.log(`⚠️  Failed to fetch remote registry: ${err.message}`);
    return null;
  }
}

export function getAllPlugins(): MarketPlugin[] {
  const configs = loadMarketplaceConfig();
  const plugins: MarketPlugin[] = [];
  
  for (const config of configs) {
    if (config.registry) {
      plugins.push(...config.registry.plugins);
    }
  }
  
  return plugins;
}

export function getAuthorName(author: string | { name: string; email?: string } | undefined): string {
  if (!author) return 'Unknown';
  return typeof author === 'string' ? author : author.name;
}

export function getTypeLabel(type: string): string {
  const labels: Record<string, string> = { provider: 'Provider', agent: 'Agent', router: 'Router' };
  return labels[type] || 'Adapter';
}

function pluginToAdapter(plugin: MarketPlugin): AgentAdapter {
  return {
    id: plugin.id,
    name: plugin.name,
    type: plugin.type,
    description: plugin.description,
    version: plugin.version,
    envVars: plugin.envVars,
    configFiles: plugin.configFiles
  };
}

export function listPlugins(query?: string): void {
  const plugins = getAllPlugins();
  const installed = adapterManager.getInstalled();

  console.log('\n📦 Plugin Marketplace\n');

  const configs = loadMarketplaceConfig();
  for (const config of configs) {
    const pluginsInMarket = config.registry?.plugins || [];
    const filteredPlugins = pluginsInMarket.filter(p => 
      !query || 
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.id.toLowerCase().includes(query.toLowerCase()) ||
      p.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
    );

    if (filteredPlugins.length === 0 && query) continue;

    console.log(`━ ${config.name}`);
    console.log(`  ${config.description}\n`);

    for (const plugin of filteredPlugins) {
      const isInstalled = installed.includes(plugin.id);
      const typeLabel = getTypeLabel(plugin.type);
      const authorName = getAuthorName(plugin.author);
      console.log(`  ${isInstalled ? '●' : '○'} [${typeLabel}] ${plugin.id.padEnd(16)} ${plugin.name}`);
      console.log(`      ${plugin.description}`);
      console.log(`      v${plugin.version} | ${authorName} | [${plugin.tags.join(', ')}]`);
    }
    console.log('');
  }
}

export function searchPlugins(keyword: string): void {
  const plugins = getAllPlugins();
  const installed = adapterManager.getInstalled();
  
  const results = plugins.filter(plugin => 
    plugin.name.toLowerCase().includes(keyword.toLowerCase()) ||
    plugin.id.toLowerCase().includes(keyword.toLowerCase()) ||
    plugin.description.toLowerCase().includes(keyword.toLowerCase()) ||
    plugin.tags.some(t => t.toLowerCase().includes(keyword.toLowerCase()))
  );

  if (results.length === 0) {
    console.log(`\nNo plugins found matching "${keyword}"\n`);
    return;
  }

  console.log(`\n🔍 Search results: "${keyword}"\n`);
  
  for (const plugin of results) {
    const isInstalled = installed.includes(plugin.id);
    const typeLabel = getTypeLabel(plugin.type);
    console.log(`  ${isInstalled ? '●' : '○'} [${typeLabel}] ${plugin.id.padEnd(16)} ${plugin.name}`);
    console.log(`      ${plugin.description}`);
    console.log(`      v${plugin.version} | ${plugin.tags.join(', ')}\n`);
  }
}

export function getMarketPluginManager(): PluginManager {
  const configPath = path.join(
    process.env.MC_HOME || process.env.HOME || process.env.USERPROFILE || '.',
    '.model-compass'
  );
  const pluginDir = path.join(configPath, 'plugins');
  return new PluginManager(pluginDir);
}

export async function installFromMarket(id: string): Promise<void> {
  const plugins = getAllPlugins();
  const plugin = plugins.find(p => p.id === id);

  if (!plugin) {
    console.error(`❌ Plugin not found in marketplace: ${id}`);
    console.log('\nAvailable plugins:');
    for (const p of plugins) {
      console.log(`  - ${p.id} (${p.name})`);
    }
    return;
  }

  const authorName = getAuthorName(plugin.author);

  console.log(`📦 Installing ${plugin.name}...\n`);
  console.log(`   ${plugin.description}\n`);
  console.log(`   Type: ${getTypeLabel(plugin.type)}`);
  console.log(`   Version: ${plugin.version}`);
  console.log(`   Author: ${authorName}`);
  console.log(`   Tags: ${plugin.tags.join(', ')}`);

  if (plugin.dependencies && plugin.dependencies.length > 0) {
    console.log(`\n   Dependencies: ${plugin.dependencies.join(', ')}`);
  }

  // Provider and Router plugins: install via npm
  if ((plugin.type === 'provider' || plugin.type === 'router') && plugin.npm) {
    if (adapterManager.isInstalled(id)) {
      console.log(`⚠️  ${plugin.name} is already installed`);
      return;
    }

    const pm = getMarketPluginManager();
    const result = await pm.installFromNpm(plugin.npm);
    if (result.success) {
      console.log(`\n✅ ${plugin.name} installed!`);
    }
    return;
  }

  // Agent/Adapter plugins: install via adapter manager
  if (adapterManager.isInstalled(id)) {
    console.log(`⚠️  ${plugin.name} is already installed`);
    return;
  }

  const adapter = pluginToAdapter(plugin);
  await adapterManager.install(id, adapter);

  console.log(`\n✅ ${plugin.name} installed!`);
}

export async function addMarketplace(url: string): Promise<void> {
  console.log(`\n📡 Adding marketplace: ${url}\n`);

  const registry = await fetchRemoteRegistry(url);
  
  if (!registry) {
    console.log('❌ Could not fetch remote registry');
    return;
  }

  console.log(`📦 Fetched ${registry.name} - ${registry.plugins.length} plugins\n`);

  const configs = loadMarketplaceConfig();
  configs.push({
    name: registry.name,
    description: registry.description,
    url,
    registry
  });
  saveMarketplaceConfig(configs);

  console.log(`✅ Marketplace added: ${registry.name}`);
  console.log('   Use "mc market list" to view plugins');
}

export async function refreshMarketplace(): Promise<void> {
  const configs = loadMarketplaceConfig();
  
  for (const config of configs) {
    if (config.url && config.url !== DEFAULT_MARKETPLACE_URL) {
      console.log(`\n🔄 Refreshing marketplace: ${config.name}`);
      const registry = await fetchRemoteRegistry(config.url);
      if (registry) {
        config.registry = registry;
        console.log(`   Fetched ${registry.plugins.length} plugins`);
      }
    }
  }
  
  saveMarketplaceConfig(configs);
  console.log('\n✅ Marketplace refresh complete');
}

export function removeMarketplace(name: string): void {
  const configs = loadMarketplaceConfig();
  const filtered = configs.filter(c => c.name !== name && c.url !== DEFAULT_MARKETPLACE_URL);
  
  if (filtered.length === configs.length) {
    console.log(`❌ Marketplace not found: ${name}`);
    return;
  }
  
  saveMarketplaceConfig(filtered);
  console.log(`✅ Marketplace removed: ${name}`);
}

export function showMarketplaceConfig(): void {
  const configs = loadMarketplaceConfig();
  
  console.log('\n📦 Configured Marketplaces:\n');
  
  for (const config of configs) {
    const pluginCount = config.registry?.plugins.length || 0;
    const isOfficial = config.url === DEFAULT_MARKETPLACE_URL;
    console.log(`  ${config.name}`);
    console.log(`     ${config.description}`);
     console.log(`     ${config.url || '(built-in)'}`);
     console.log(`     ${pluginCount} plugin(s)`);
    if (isOfficial) {
      console.log(`     [Official Marketplace]`);
    }
    console.log('');
  }
}

export function addMarketplaceCommands(): void {
  const marketCmd = program
    .command('market')
    .description('Manage plugin marketplace (support remote URL and custom marketplace)');

  marketCmd
    .command('list')
    .description('List plugins in marketplace')
    .option('-s, --search <keyword>', 'Search plugins')
    .action((options) => {
      if (options.search) {
        searchPlugins(options.search);
      } else {
        listPlugins();
      }
    });

  marketCmd
    .command('search <keyword>')
    .description('Search plugins')
    .action((keyword) => {
      searchPlugins(keyword);
    });

  marketCmd
    .command('install <id>')
    .description('Install plugin from marketplace')
    .action(async (id) => {
      try {
        await installFromMarket(id);
      } catch (err: any) {
        console.error(`❌ Install failed: ${err.message}`);
      }
    });

  marketCmd
    .command('add <url>')
    .description('Add custom marketplace URL')
    .action(async (url) => {
      await addMarketplace(url);
    });

  marketCmd
    .command('remove <name>')
    .description('Remove custom marketplace')
    .action((name) => {
      removeMarketplace(name);
    });

  marketCmd
    .command('refresh')
    .description('Refresh remote marketplace registry')
    .action(async () => {
      await refreshMarketplace();
    });

  marketCmd
    .command('config')
    .description('Show marketplace configuration')
    .action(() => {
      showMarketplaceConfig();
    });
}