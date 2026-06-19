import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { PluginType, Plugin, ProviderPlugin, PluginContext, PluginLoadResult, PluginInstallation, PluginManifest, PluginRequestHooks } from './types';
import { adapterRegistry, ProviderAdapter } from '../providers/registry';
import { adapterManager } from '../agents/manager';
import { BaseProvider } from '../providers/base';
import { getConfig } from '../config';
import { providerManager } from '../core/provider-manager';
import { router } from '../core/router';

import { Provider as ConfigProvider } from '../config';

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private installations: Map<string, PluginInstallation> = new Map();
  private pluginDir: string;

  constructor(pluginDir?: string) {
    const homeDir = process.env.MC_HOME || process.env.HOME || process.env.USERPROFILE || '.';
    this.pluginDir = pluginDir || path.join(homeDir, '.model-compass', 'plugins');
    this.ensurePluginDir();
    this.loadInstallManifest();
    this.registerBuiltinAdapters();
  }

  private ensurePluginDir(): void {
    if (!fs.existsSync(this.pluginDir)) {
      fs.mkdirSync(this.pluginDir, { recursive: true });
    }
  }

  private getInstallManifestPath(): string {
    return path.join(path.dirname(this.pluginDir), 'plugin-installations.json');
  }

  private loadInstallManifest(): void {
    const manifestPath = this.getInstallManifestPath();
    if (fs.existsSync(manifestPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        this.installations = new Map(Object.entries(data.installations || {}));
      } catch {
        this.installations = new Map();
      }
    }
  }

  private saveInstallManifest(): void {
    const manifestPath = this.getInstallManifestPath();
    const dir = path.dirname(manifestPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = {
      version: '1.0.0',
      installations: Object.fromEntries(this.installations)
    };
    fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2));
  }

  async loadPlugin(pluginPath: string): Promise<PluginLoadResult> {
    try {
      const packagePath = path.join(pluginPath, 'package.json');
      if (!fs.existsSync(packagePath)) {
        return { success: false, error: 'Plugin manifest not found (package.json required)' };
      }
      const manifest: PluginManifest = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
      const mainFile = path.join(pluginPath, manifest.main || 'index.js');
      if (!fs.existsSync(mainFile)) {
        return { success: false, error: `Plugin main file not found at ${mainFile}` };
      }

      delete require.cache[require.resolve(mainFile)];
      const pluginModule = require(mainFile);

      if (typeof pluginModule.plugin !== 'object') {
        return { success: false, error: 'Plugin must export a "plugin" object' };
      }

      const plugin = pluginModule.plugin as Plugin;
      const validation = this.validatePlugin(plugin, manifest);
      if (!validation.valid) {
        return { success: false, error: `Plugin validation failed: ${validation.errors?.join(', ')}` };
      }

      return { success: true, plugin };
    } catch (error) {
      return {
        success: false,
        error: `Failed to load plugin: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async registerPlugin(plugin: Plugin, source: PluginInstallation['source'] = 'file'): Promise<void> {
    const id = plugin.metadata.id;
    if (this.plugins.has(id)) {
      throw new Error(`Plugin ${id} is already registered`);
    }

    if (plugin.initialize) {
      const context = this.createPluginContext();
      await plugin.initialize(context);
    }

    this.plugins.set(id, plugin);
    this.installations.set(id, {
      id,
      version: plugin.metadata.version,
      installedAt: Date.now(),
      source
    });

    switch (plugin.type) {
      case PluginType.PROVIDER:
        await this.registerProviderPlugin(plugin as ProviderPlugin);
        break;
      case PluginType.AGENT:
        await this.registerAgentPlugin(plugin);
        break;
      case PluginType.ROUTER:
        await this.registerRouterPlugin(plugin);
        break;
    }

    this.saveInstallManifest();
    console.log(`✓ Plugin registered: ${plugin.metadata.name} v${plugin.metadata.version}`);
  }

  async unregisterPlugin(id: string): Promise<boolean> {
    const plugin = this.plugins.get(id);
    if (!plugin) return false;

    if (plugin.dispose) {
      await plugin.dispose();
    }

    this.plugins.delete(id);
    this.installations.delete(id);

    switch (plugin.type) {
      case PluginType.PROVIDER:
        this.unregisterProviderPlugin(plugin as ProviderPlugin);
        break;
      case PluginType.AGENT:
        this.unregisterAgentPlugin(plugin);
        break;
      case PluginType.ROUTER:
        this.unregisterRouterPlugin(plugin);
        break;
    }

    this.saveInstallManifest();
    console.log(`✓ Plugin unregistered: ${plugin.metadata.name}`);
    return true;
  }

  async loadAllPlugins(): Promise<void> {
    if (!fs.existsSync(this.pluginDir)) return;

    const entries = fs.readdirSync(this.pluginDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginPath = path.join(this.pluginDir, entry.name);
        try {
          const result = await this.loadPlugin(pluginPath);
          if (result.success && result.plugin) {
            await this.registerPlugin(result.plugin, 'file');
          }
        } catch {
          // skip invalid plugins
        }
      }
    }
  }

  async installFromNpm(packageName: string, version?: string): Promise<PluginLoadResult> {
    const fullPackageName = version ? `${packageName}@${version}` : packageName;
    console.log(`🚀 Installing plugin from npm: ${fullPackageName}`);
    const installDir = path.join(this.pluginDir, packageName.replace('@', '').replace('/', '-'));

    try {
      execSync('npm --version', { stdio: 'ignore' } as any);
      execSync(`npm install ${fullPackageName} --no-save --prefix "${installDir}"`, { stdio: 'inherit', shell: true } as any);

      const result = await this.loadPlugin(path.join(installDir, 'node_modules', packageName));
      if (result.success && result.plugin) {
        await this.registerPlugin(result.plugin, 'npm');
      }

      if (fs.existsSync(installDir)) {
        fs.rmSync(installDir, { recursive: true, force: true });
      }
      return result;
    } catch (error) {
      if (fs.existsSync(installDir)) {
        fs.rmSync(installDir, { recursive: true, force: true });
      }
      return {
        success: false,
        error: `Failed to install ${fullPackageName}: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async installFromGitHub(repo: string, ref?: string): Promise<PluginLoadResult> {
    console.log(`🚀 Installing plugin from GitHub: ${repo}${ref ? `@${ref}` : ''}`);
    const repoName = repo.split('/').pop() || 'plugin';
    const installDir = path.join(this.pluginDir, repoName);

    try {
      const gitUrl = `https://github.com/${repo}.git`;
      const cloneCommand = ref
        ? `git clone -b ${ref} --depth 1 ${gitUrl} "${installDir}"`
        : `git clone --depth 1 ${gitUrl} "${installDir}"`;
      execSync(cloneCommand, { stdio: 'inherit', shell: true } as any);

      const result = await this.loadPlugin(installDir);
      if (result.success && result.plugin) {
        await this.registerPlugin(result.plugin, 'file');
      }
      return result;
    } catch (error) {
      if (fs.existsSync(installDir)) {
        fs.rmSync(installDir, { recursive: true, force: true });
      }
      return {
        success: false,
        error: `Failed to install from GitHub: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private providerInstanceCache = new WeakMap<object, BaseProvider>();

  private getOrCreateProviderInstance(plugin: ProviderPlugin, config: object): BaseProvider {
    let instance = this.providerInstanceCache.get(config);
    if (!instance) {
      instance = plugin.createProvider(config as any);
      this.providerInstanceCache.set(config, instance);
    }
    return instance;
  }

  private safePluginCall<T>(fn: () => T, fallback: T, context: string): T {
    try {
      return fn();
    } catch (error) {
      console.error(`[Plugin Isolation] Error in ${context}:`, error);
      return fallback;
    }
  }

  private async registerProviderPlugin(plugin: ProviderPlugin): Promise<void> {
    const pluginHooks: PluginRequestHooks | undefined = plugin.hooks;

    const adapter: ProviderAdapter = {
      metadata: {
        name: plugin.metadata.id,
        version: plugin.metadata.version,
        description: plugin.metadata.description,
        author: plugin.metadata.author?.name,
        providerTypes: [plugin.metadata.id]
      },
      transformers: {
        buildRequestBody: (req, provider) =>
          this.safePluginCall(
            () => this.getOrCreateProviderInstance(plugin, provider).buildRequestBody(req),
            req as any,
            `${plugin.metadata.id}.buildRequestBody`
          ),
        transformResponse: (response, provider) =>
          this.safePluginCall(
            () => this.getOrCreateProviderInstance(plugin, provider).transformResponse(response),
            response as any,
            `${plugin.metadata.id}.transformResponse`
          ),
        buildHeaders: (apiKey, provider) =>
          this.safePluginCall(
            () => this.getOrCreateProviderInstance(plugin, provider).buildHeaders(apiKey),
            {},
            `${plugin.metadata.id}.buildHeaders`
          ),
        buildEndpoint: (provider, path) =>
          this.safePluginCall(
            () => {
              const p = this.getOrCreateProviderInstance(plugin, provider);
              return (p as any).buildEndpoint ? (p as any).buildEndpoint(path) : path;
            },
            path,
            `${plugin.metadata.id}.buildEndpoint`
          )
      },
      hooks: {
        beforeRequest: pluginHooks?.onBeforeRequest
          ? ((req: any, _provider: any) => this.safePluginCall(
              () => pluginHooks!.onBeforeRequest!(req, _provider as any) ?? req,
              req,
              `${plugin.metadata.id}.onBeforeRequest`
            ))
          : undefined,
        afterResponse: pluginHooks?.onAfterResponse
          ? ((response: any, _provider: any) => this.safePluginCall(
              () => pluginHooks!.onAfterResponse!(response, _provider as any) ?? response,
              response,
              `${plugin.metadata.id}.onAfterResponse`
            ))
          : undefined,
        beforeStreamChunk: pluginHooks?.onBeforeStreamChunk
          ? ((chunk: any, _provider: any) => this.safePluginCall(
              () => pluginHooks!.onBeforeStreamChunk!(chunk, _provider as any) ?? chunk,
              chunk,
              `${plugin.metadata.id}.onBeforeStreamChunk`
            ))
          : undefined,
        onError: pluginHooks?.onError
          ? ((error: Error, _provider: any) => this.safePluginCall(
              () => { pluginHooks!.onError!(error, _provider as any); },
              undefined,
              `${plugin.metadata.id}.onError`
            ))
          : undefined,
        onHealthCheck: undefined
      },
      lifecycle: {
        onInitialize: (provider) =>
          this.safePluginCall(
            () => {
              const p = this.getOrCreateProviderInstance(plugin, provider);
              if ((p as any).initialize) (p as any).initialize();
            },
            undefined,
            `${plugin.metadata.id}.onInitialize`
          )
      },
      isCompatible: (providerType) => providerType === plugin.metadata.id
    };

    adapterRegistry.register(adapter);
  }

  private unregisterProviderPlugin(_plugin: ProviderPlugin): void {
    adapterRegistry.unregister(_plugin.metadata.id);
  }

  private async registerAgentPlugin(plugin: Plugin): Promise<void> {
    const agentAdapter: any = {
      ...plugin,
      id: plugin.metadata.id,
      name: plugin.metadata.name,
      type: plugin.metadata.categories?.[0] || 'generic',
      description: plugin.metadata.description,
      version: plugin.metadata.version,
    };
    adapterManager.addAdapter(agentAdapter);
  }

  private unregisterAgentPlugin(plugin: Plugin): void {
    adapterManager.removeAdapter(plugin.metadata.id);
  }

  private async registerRouterPlugin(plugin: Plugin): Promise<void> {
    let routerPlugin: any = plugin;
    if (typeof routerPlugin.createRouter === 'function') {
      try {
        const pluginRouter = routerPlugin.createRouter();
        if (typeof (router as any).registerPluginRouter === 'function') {
          (router as any).registerPluginRouter({
            id: plugin.metadata.id,
            name: plugin.metadata.name,
            priority: routerPlugin.priority ?? 0,
            canHandle: routerPlugin.canHandle,
            router: pluginRouter
          });
        }
        console.log(`Registered router plugin: ${plugin.metadata.name} v${plugin.metadata.version}`);
      } catch (error) {
        console.error(`Failed to register router plugin ${plugin.metadata.name}:`, error);
      }
    }
  }

  private unregisterRouterPlugin(plugin: Plugin): void {
    if (typeof (router as any).unregisterPluginRouter === 'function') {
      (router as any).unregisterPluginRouter(plugin.metadata.id);
    }
    console.log(`Unregistered router plugin: ${plugin.metadata.name}`);
  }

  private validatePlugin(plugin: Plugin, _manifest: PluginManifest): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!plugin.metadata?.id) errors.push('Plugin metadata must have an "id" field');
    if (!plugin.metadata?.name) errors.push('Plugin metadata must have a "name" field');
    if (!plugin.metadata?.version) errors.push('Plugin metadata must have a "version" field');
    if (!plugin.type) errors.push('Plugin must have a "type" field');
    if (!Object.values(PluginType).includes(plugin.type as PluginType)) errors.push(`Invalid plugin type: ${plugin.type}`);

    switch (plugin.type) {
      case PluginType.PROVIDER:
        if (typeof (plugin as ProviderPlugin).createProvider !== 'function') {
          errors.push('Provider plugins must implement "createProvider" method');
        }
        break;
      case PluginType.AGENT:
        if (!Array.isArray((plugin as any).supportedTypes)) {
          errors.push('Agent plugins must have "supportedTypes" array');
        }
        break;
      case PluginType.ROUTER:
        if (typeof (plugin as any).createRouter !== 'function') {
          errors.push('Router plugins must implement "createRouter" method');
        }
        break;
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  private createPluginContext(): PluginContext {
    const config = getConfig();
    return {
      homeDir: process.env.MC_HOME || process.env.HOME || process.env.USERPROFILE || '.',
      configDir: path.join(process.env.MC_HOME || process.env.HOME || process.env.USERPROFILE || '.', '.model-compass'),
      server: config.server,
      core: { providerManager, router }
    };
  }

  getPlugin(id: string): Plugin | undefined { return this.plugins.get(id); }
  listPlugins(): Plugin[] { return Array.from(this.plugins.values()); }
  getPluginsByType(type: PluginType): Plugin[] { return Array.from(this.plugins.values()).filter(p => p.type === type); }
  getPluginManifest(id: string): PluginManifest | undefined { return this.plugins.get(id)?.metadata; }
  isInstalled(id: string): boolean { return this.plugins.has(id); }
  getInstallation(id: string): PluginInstallation | undefined { return this.installations.get(id); }
  listInstallations(): PluginInstallation[] { return Array.from(this.installations.values()); }

  registerBuiltinPlugin(plugin: Plugin): void {
    if (!this.plugins.has(plugin.metadata.id)) {
      this.plugins.set(plugin.metadata.id, plugin);
      this.installations.set(plugin.metadata.id, {
        id: plugin.metadata.id,
        version: plugin.metadata.version,
        installedAt: Date.now(),
        source: 'builtin'
      });
    }
  }

  private registerBuiltinAdapters(): void {
    try {
      const adaptersIndex = require('../providers/index');
      const builtinIndex = require('../providers/builtin/index');
      adaptersIndex.registerBuiltinAdapters();
      for (const adapter of builtinIndex.BUILTIN_ADAPTERS) {
        const pluginId = `@model-compass/${adapter.metadata.name}`;
        if (!this.isInstalled(pluginId)) {
          this.registerBuiltinPlugin({
            type: PluginType.PROVIDER,
            metadata: {
              id: pluginId,
              name: adapter.metadata.name,
              version: adapter.metadata.version,
              description: adapter.metadata.description,
              author: adapter.metadata.author ? { name: adapter.metadata.author } : undefined
            },
            createProvider: () => { throw new Error('Built-in adapters use AdaptableProvider directly'); }
          } as ProviderPlugin);
        }
      }
    } catch {
      // Adapter modules may not be available in some contexts
    }
  }
}

export const pluginManager = new PluginManager();
