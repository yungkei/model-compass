import { PluginManager, pluginManager as defaultPluginManager } from './plugin-manager';
import { PluginType } from './types';
import { getConfig } from '../config';

export class PluginService {
  private pluginManager: PluginManager;

  constructor(pluginDir?: string) {
    this.pluginManager = pluginDir ? new PluginManager(pluginDir) : defaultPluginManager;
  }

  async initialize(): Promise<void> {
    const config = getConfig();

    await this.pluginManager.loadAllPlugins();

    const providerPlugins = this.pluginManager.getPluginsByType(PluginType.PROVIDER).length;
    const agentCount = this.pluginManager.getPluginsByType(PluginType.AGENT).length;
    const routerPlugins = this.pluginManager.getPluginsByType(PluginType.ROUTER).length;
    const configuredProviders = config.providers?.length || 0;
    const activeRoutes = Object.entries(config.router || {}).filter(([, v]) => v && v !== '').length;
    const totalProviders = configuredProviders + providerPlugins;
    const totalRouters = activeRoutes + routerPlugins;

    console.log(`Plugin system initialized:`);
    if (totalProviders > 0) console.log(`  - ${totalProviders} provider(s) (${configuredProviders} configured, ${providerPlugins} plugins)`);
    if (agentCount > 0) console.log(`  - ${agentCount} agent(s)`);
    if (totalRouters > 0) console.log(`  - ${totalRouters} router(s) (${activeRoutes} configured, ${routerPlugins} plugins)`);
  }

  async loadPlugin(pluginPath: string) { return this.pluginManager.loadPlugin(pluginPath); }

  async installFromNpm(packageName: string, version?: string) {
    const result = await this.pluginManager.installFromNpm(packageName, version);
    if (result.success && result.plugin) return { success: true as const, plugin: result.plugin };
    return { success: false as const, error: result.error };
  }

  async installFromGitHub(repo: string, ref?: string) {
    const result = await this.pluginManager.installFromGitHub(repo, ref);
    if (result.success && result.plugin) return { success: true as const, plugin: result.plugin };
    return { success: false as const, error: result.error };
  }

  async uninstallPlugin(pluginId: string) {
    const success = await this.pluginManager.unregisterPlugin(pluginId);
    if (success) return { success: true as const };
    return { success: false as const, error: `Plugin ${pluginId} not found or failed to uninstall` };
  }

  listPlugins(type?: PluginType) {
    if (type) return this.pluginManager.getPluginsByType(type);
    return this.pluginManager.listPlugins();
  }

  getPlugin(id: string) { return this.pluginManager.getPlugin(id); }
  getPluginManifest(id: string) { return this.pluginManager.getPluginManifest(id); }
  isPluginInstalled(id: string) { return this.pluginManager.isInstalled(id); }

  async reloadPlugins(): Promise<void> {
    const loadedPlugins = Array.from(this.pluginManager.listPlugins());
    for (const plugin of loadedPlugins) {
      await this.pluginManager.unregisterPlugin(plugin.metadata.id);
    }
    await this.initialize();
  }

  getMarketplaces() {
    const config = getConfig();
    return (config.plugins as any)?.marketplaces || [
      {
        name: 'Model Compass Official',
        url: 'https://raw.githubusercontent.com/yungkei/model-compass-plugins/main/registry.json',
        description: 'Official Model Compass plugin marketplace'
      }
    ];
  }
}

export const pluginService = new PluginService();
