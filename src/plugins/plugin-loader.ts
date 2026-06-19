import * as fs from 'fs';
import * as path from 'path';
import { adapterRegistry, AdapterPlugin } from '../providers/registry';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  main: string;
  author?: string;
}

export class PluginLoader {
  private pluginDir: string;

  constructor(pluginDir?: string) {
    this.pluginDir = pluginDir || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.model-compass', 'plugins');
  }

  async loadPlugins(): Promise<AdapterPlugin[]> {
    const loadedPlugins: AdapterPlugin[] = [];

    if (!fs.existsSync(this.pluginDir)) {
      return loadedPlugins;
    }

    const entries = fs.readdirSync(this.pluginDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const plugin = await this.loadPlugin(path.join(this.pluginDir, entry.name));
        if (plugin) {
          loadedPlugins.push(plugin);
        }
      }
    }

    return loadedPlugins;
  }

  private async loadPlugin(pluginPath: string): Promise<AdapterPlugin | null> {
    try {
      const manifestPath = path.join(pluginPath, 'package.json');
      if (!fs.existsSync(manifestPath)) {
        return null;
      }

      const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const mainFile = path.join(pluginPath, manifest.main || 'index.js');

      if (!fs.existsSync(mainFile)) {
        console.warn(`Plugin ${manifest.name}: main file not found at ${mainFile}`);
        return null;
      }

      const pluginModule = require(mainFile);

      if (typeof pluginModule.register !== 'function' || !Array.isArray(pluginModule.adapters)) {
        console.warn(`Plugin ${manifest.name}: invalid plugin format`);
        return null;
      }

      const plugin: AdapterPlugin = {
        id: manifest.id || manifest.name,
        name: manifest.name,
        version: manifest.version,
        register: pluginModule.register,
        adapters: pluginModule.adapters
      };

      adapterRegistry.registerPlugin(plugin);
      console.log(`Loaded plugin: ${plugin.name} v${plugin.version}`);

      return plugin;
    } catch (error) {
      console.error(`Failed to load plugin from ${pluginPath}:`, error);
      return null;
    }
  }

  async loadPluginFromPath(pluginPath: string): Promise<AdapterPlugin | null> {
    return this.loadPlugin(pluginPath);
  }

  unloadPlugin(pluginId: string): boolean {
    return adapterRegistry.unregisterPlugin(pluginId);
  }

  getPluginDir(): string {
    return this.pluginDir;
  }
}

export const pluginLoader = new PluginLoader();
