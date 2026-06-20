import { program } from 'commander';
import { PluginManager } from '../plugins/plugin-manager';
import { loadConfig, getConfig } from '../config';
import { pluginManager as defaultPluginManager } from '../plugins/plugin-manager';

import {
  listProviderPlugins,
  listAllPlugins,
  installNpmPlugin,
  installGitHubPlugin,
  uninstallPlugin as uninstallProviderPlugin,
  loadLocalPlugin,
} from './provider-plugins';

import {
  installPlugin as installAgentPlugin,
  uninstallPlugin as uninstallAgentPlugin,
  listPlugins as listAgentPlugins,
  loadPlugins,
  AGENT_PLUGINS,
} from './agent-plugins';

import {
  getAllPlugins,
  listPlugins as listMarketPlugins,
  searchPlugins,
  installFromMarket,
  addMarketplace,
  removeMarketplace,
  refreshMarketplace,
  showMarketplaceConfig,
} from '../agents/marketplace';

function getPluginManager(): PluginManager {
  loadConfig();
  const config = getConfig();
  const pluginDir = config.plugins?.pluginDir;
  if (pluginDir) return new PluginManager(pluginDir);
  return defaultPluginManager;
}

export function addPluginCommands(): void {
  const pluginCmd = program
    .command('plugin')
    .description('Manage plugins (marketplace, npm, GitHub, agent adapters)');

  // Install from marketplace (lookup by id)
  pluginCmd
    .command('install <id>')
    .description('Install a plugin from marketplace or by npm package name')
    .action(async (id) => {
      const plugins = getAllPlugins();
      const found = plugins.find(p => p.id === id);
      if (found) {
        await installFromMarket(id);
      } else {
        console.log(`Plugin "${id}" not found in marketplace, trying npm...`);
        await installNpmPlugin(id);
      }
    });

  // Install directly from npm
  pluginCmd
    .command('install-npm <package> [version]')
    .description('Install a plugin directly from npm registry')
    .action(async (pkg, ver) => await installNpmPlugin(pkg, ver));

  // Install from GitHub
  pluginCmd
    .command('install-github <repo> [ref]')
    .description('Install a plugin from GitHub')
    .action(async (repo, ref) => await installGitHubPlugin(repo, ref));

  // Install agent adapter plugin (claude, cursor, etc.)
  pluginCmd
    .command('install-agent <name>')
    .description('Install an agent adapter plugin (claude, opencode, cursor, windsurf)')
    .action((name) => {
      installAgentPlugin(name);
    });

  // List all installed plugins
  pluginCmd
    .command('list')
    .description('List all installed plugins (provider, agent, router)')
    .action(() => listAllPlugins());

  // List agent adapter plugins
  pluginCmd
    .command('list-agents')
    .description('List available agent adapter plugins')
    .action(() => listAgentPlugins());

  // Search marketplace
  pluginCmd
    .command('search <keyword>')
    .description('Search plugins in marketplace')
    .action((keyword) => searchPlugins(keyword));

  // Uninstall plugin
  pluginCmd
    .command('uninstall <id>')
    .description('Uninstall a plugin by ID')
    .action(async (id) => {
      const pm = getPluginManager();
      const plugin = pm.getPlugin(id);
      if (plugin) {
        await uninstallProviderPlugin(id);
      } else if (AGENT_PLUGINS[id]) {
        uninstallAgentPlugin(id);
      } else {
        const installed = loadPlugins();
        if (installed[id]) {
          uninstallAgentPlugin(id);
        } else {
          console.error(`Plugin not found: ${id}`);
        }
      }
    });

  // Reload all plugins
  pluginCmd
    .command('reload')
    .description('Reload all plugins from plugin directory')
    .action(async () => {
      const pm = getPluginManager();
      const all = pm.listPlugins();
      for (const p of all) {
        await pm.unregisterPlugin(p.metadata.id);
      }
      await pm.loadAllPlugins();
      console.log('✅ Plugins reloaded');
    });

  // ── Marketplace subcommands ──
  const marketCmd = pluginCmd
    .command('market')
    .description('Manage plugin marketplaces');

  marketCmd
    .command('list')
    .description('List plugins in marketplace')
    .option('-s, --search <keyword>', 'Search plugins')
    .action((options) => {
      if (options.search) {
        searchPlugins(options.search);
      } else {
        listMarketPlugins();
      }
    });

  marketCmd
    .command('add <url>')
    .description('Add custom marketplace URL')
    .action(async (url) => await addMarketplace(url));

  marketCmd
    .command('remove <name>')
    .description('Remove custom marketplace')
    .action((name) => removeMarketplace(name));

  marketCmd
    .command('refresh')
    .description('Refresh remote marketplace registries')
    .action(async () => await refreshMarketplace());

  marketCmd
    .command('config')
    .description('Show marketplace configuration')
    .action(() => showMarketplaceConfig());
}
