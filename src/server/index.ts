import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';
import { loadConfig, getConfig, saveConfig } from '../config';
import { providerManager } from '../core/provider-manager';
import { failoverManager } from '../core/failover';
import { router } from '../core/router';
import { createProvider } from '../providers/base';
import { adapterRegistry } from '../providers/registry';
import { pluginService } from '../plugins/plugin-service';
import { PluginLoader } from '../plugins/plugin-loader';
import { registerChatRoutes } from './routes/chat';
import { requestStats } from './request-stats';

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8'));
const appVersion = pkg.version;

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const uiPath = path.join(__dirname, '../../public');
if (fs.existsSync(uiPath)) {
  // Serve index.html with version injection, all other static files normally
  app.get('/', (_req: Request, res: Response) => {
    let html = fs.readFileSync(path.join(uiPath, 'index.html'), 'utf-8');
    html = html.replace(/v\d+\.\d+\.\d+/g, `v${appVersion}`);
    res.type('html').send(html);
  });
  app.use(express.static(uiPath));
}

app.use((_req: Request, _res: Response, next: NextFunction) => next());

app.get('/stats', (_req: Request, res: Response) => {
  res.json({
    total: requestStats.total,
    success: requestStats.success,
    failed: requestStats.failed,
    successRate: requestStats.total > 0 ? Math.round((requestStats.success / requestStats.total) * 100) : 0,
    avgLatency: 0,
    cost: 0,
    promptTokens: requestStats.promptTokens,
    completionTokens: requestStats.completionTokens,
    totalTokens: requestStats.totalTokens,
    recent: requestStats.recent.slice(0, 10)
  });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/v1', (_req: Request, res: Response) => {
  res.json({
    object: 'api_info',
    version: 'v1',
    endpoint: '/v1/chat/completions'
  });
});

app.get('/v1/models', (_req: Request, res: Response) => {
  const config = getConfig();
  const models: Array<{ id: string; object: string; created: number; owned_by: string }> = [];
  for (const provider of config.providers) {
    for (const model of provider.models) {
      models.push({
        id: model,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: provider.name
      });
    }
  }
  if (config.modelMapping) {
    for (const [alias, _target] of Object.entries(config.modelMapping as Record<string, string>)) {
      if (!models.find(m => m.id === alias)) {
        models.push({
          id: alias,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'model-compass'
        });
      }
    }
  }
  res.json({ object: 'list', data: models });
});

app.get('/models', (_req: Request, res: Response) => {
  const config = getConfig();
  const models: Array<{ id: string; provider: string; name: string }> = [];
  for (const provider of config.providers) {
    for (const model of provider.models) {
      models.push({
        id: `${provider.name},${model}`,
        provider: provider.name,
        name: model
      });
    }
  }
  if (config.modelMapping) {
    for (const [alias, _target] of Object.entries(config.modelMapping as Record<string, string>)) {
      if (!models.find(m => m.id === alias)) {
        models.push({
          id: alias,
          provider: 'model-compass',
          name: alias
        });
      }
    }
  }
  res.json({ object: 'list', data: models });
});

app.get('/providers', (_req: Request, res: Response) => {
  const statuses = providerManager.getAllStatuses();
  const cooldown = failoverManager.getCooldownStatus();
  const providers = statuses.map(s => ({
    ...s,
    cooldown: cooldown[s.name] || 0
  }));
  res.json({ providers });
});

app.get('/routes', (_req: Request, res: Response) => {
  const config = getConfig();
  const routes: Record<string, string> = {};
  for (const routeType of router.getAllRouteTypes()) {
    const route = router.getRoute(routeType);
    if (route) {
      routes[routeType] = `${route.provider},${route.model}`;
    }
  }
  res.json({ routes, default: config.router.default });
});

app.get('/auto-schedule', (_req: Request, res: Response) => {
  const scheduleInfo = router.getAutoScheduleInfo();
  res.json({
    connectionMode: getConfig().connectionMode,
    providers: scheduleInfo
  });
});

app.get('/config', (_req: Request, res: Response) => {
  const config = getConfig();
  const safeConfig = {
    version: config.version,
    server: config.server,
    providers: config.providers.map(p => ({
      name: p.name,
      type: p.type,
      api_base_url: p.api_base_url,
      models: p.models,
      priority: p.priority,
      weight: p.weight
    })),
    router: config.router,
    smartRouting: {
      enabled: config.smartRouting.enabled,
      autoSwitch: {
        enabled: config.smartRouting.autoSwitch.enabled,
        maxRetries: config.smartRouting.autoSwitch.maxRetries,
        cooldownSeconds: config.smartRouting.autoSwitch.cooldownSeconds,
        fallbackChain: config.smartRouting.autoSwitch.fallbackChain
      }
    },
    connectionMode: config.connectionMode || 'auto',
    schedulingStrategy: config.schedulingStrategy || 'network-adaptive',
    autoRoute: config.autoRoute || null,
    manualRoutes: config.manualRoutes || null
  };
  res.json(safeConfig);
});

app.get('/provider/:name', (_req: Request, res: Response) => {
  const { name } = _req.params;
  const config = getConfig();
  const provider = config.providers.find(p => p.name === name);
  if (!provider) {
    res.status(404).json({ error: 'Provider not found' });
    return;
  }
  res.json(provider);
});

registerChatRoutes(app);

app.post('/reload', (_req: Request, res: Response) => {
  try {
    loadConfig();
    providerManager.reload(getConfig());
    router.clearCache();
    res.json({ success: true, message: 'Config reloaded' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/provider/:name/health', async (req: Request, res: Response) => {
  const { name } = req.params;
  const provider = providerManager.getProvider(name);
  if (!provider) {
    res.status(404).json({ error: 'Provider not found' });
    return;
  }
  const result = await provider.healthCheck();
  res.json({ name, online: result, status: provider.status });
});

app.post('/provider/:name/test', async (req: Request, res: Response) => {
  const { name } = req.params;
  const config = getConfig();
  const providerConfig = config.providers.find(p => p.name === name);
  if (!providerConfig) {
    res.status(404).json({ success: false, error: 'Provider not found' });
    return;
  }
  try {
    const response = await fetch(providerConfig.api_base_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(providerConfig.api_key ? { 'Authorization': `Bearer ${providerConfig.api_key}` } : {}),
        ...(providerConfig.type === 'anthropic' ? { 'x-api-key': providerConfig.api_key, 'anthropic-version': '2023-06-01' } : {})
      },
      body: JSON.stringify({
        model: providerConfig.models?.[0] || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5
      })
    });
    if (response.ok || response.status === 400) {
      res.json({ success: true, message: 'Connection OK' });
    } else {
      res.json({ success: false, error: `HTTP ${response.status}` });
    }
  } catch (err) {
    res.json({ success: false, error: (err as Error).message });
  }
});

app.post('/providers/add', async (req: Request, res: Response) => {
  const { type, name, api_base_url, api_key, models, priority } = req.body;
  const config = getConfig();
  if (config.providers.find(p => p.name === name)) {
    res.status(400).json({ success: false, error: 'Provider already exists' });
    return;
  }
  const newProvider = {
    name: name || type,
    type: type as any,
    api_base_url: api_base_url || '',
    api_key: api_key || '',
    models: models || [],
    priority: priority || 1
  };
  config.providers.push(newProvider);
  const provider = createProvider(newProvider as any);
  providerManager.addProvider(provider);
  await provider.healthCheck();
  saveConfig();
  res.json({ success: true, provider: newProvider });
});

app.post('/providers/update', async (req: Request, res: Response) => {
  const { oldName, name, type, api_base_url, api_key, models, priority } = req.body;
  if (!oldName) {
    res.status(400).json({ success: false, error: 'Missing oldName' });
    return;
  }
  const config = getConfig();
  const index = config.providers.findIndex(p => p.name === oldName);
  if (index === -1) {
    res.status(404).json({ success: false, error: 'Provider not found' });
    return;
  }
  config.providers[index] = {
    name: name || type,
    type: type as any,
    api_base_url: api_base_url || '',
    api_key: api_key || config.providers[index].api_key || '',
    models: models || config.providers[index].models || [],
    priority: priority || config.providers[index].priority || 1
  };
  const newName = config.providers[index].name;
  providerManager.removeProvider(oldName);
  const provider = createProvider(config.providers[index] as any);
  providerManager.addProvider(provider);
  await provider.healthCheck();
  saveConfig();
  res.json({ success: true, provider: config.providers[index] });
});

app.post('/providers/delete', (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const config = getConfig();
    const index = config.providers.findIndex(p => p.name === name);
    if (index === -1) {
      res.status(404).json({ success: false, error: 'Provider not found' });
      return;
    }
    config.providers.splice(index, 1);
    providerManager.removeProvider(name);
    saveConfig();
    res.json({ success: true });
  } catch (err: any) {
    console.error('[providers/delete] error:', err.message, err.stack);
    try { res.status(500).json({ success: false, error: err.message }); } catch {}
  }
});

app.post('/routes/save', (req: Request, res: Response) => {
  const { autoSwitch, connectionMode, schedulingStrategy, manualRoutes, autoRoute } = req.body as {
    autoSwitch?: Record<string, unknown>;
    connectionMode?: string;
    schedulingStrategy?: 'network-adaptive' | 'priority-based' | 'load-balance' | 'cost-based';
    manualRoutes?: Record<string, { provider?: string; model?: string }>;
    autoRoute?: { provider?: string; model?: string };
  };
  console.log('[routes/save] received:', { connectionMode, schedulingStrategy, manualRoutes, autoRoute });
  const config = getConfig();
  if (connectionMode) {
    config.connectionMode = connectionMode as 'auto' | 'manual';
  }
  if (schedulingStrategy) {
    config.schedulingStrategy = schedulingStrategy;
  }
  if (connectionMode === 'auto' && autoRoute?.provider && autoRoute?.model) {
    config.autoRoute = {
      provider: autoRoute.provider,
      model: autoRoute.model
    };
    config.router.default = `${autoRoute.provider},${autoRoute.model}`;
    config.router.background = `${autoRoute.provider},${autoRoute.model}`;
    config.router.think = `${autoRoute.provider},${autoRoute.model}`;
    config.router.longContext = `${autoRoute.provider},${autoRoute.model}`;
  }
  if (connectionMode === 'manual' && manualRoutes) {
    console.log('[routes/save] manualRoutes received:', JSON.stringify(manualRoutes));
    config.manualRoutes = {};
    if (manualRoutes.default?.provider && manualRoutes.default?.model) {
      config.manualRoutes.default = { provider: manualRoutes.default.provider, model: manualRoutes.default.model };
      config.router.default = `${manualRoutes.default.provider},${manualRoutes.default.model}`;
    }
    if (manualRoutes.background?.provider && manualRoutes.background?.model) {
      config.manualRoutes.background = { provider: manualRoutes.background.provider, model: manualRoutes.background.model };
      config.router.background = `${manualRoutes.background.provider},${manualRoutes.background.model}`;
    }
    if (manualRoutes.think?.provider && manualRoutes.think?.model) {
      config.manualRoutes.think = { provider: manualRoutes.think.provider, model: manualRoutes.think.model };
      config.router.think = `${manualRoutes.think.provider},${manualRoutes.think.model}`;
    }
    if (manualRoutes.longContext?.provider && manualRoutes.longContext?.model) {
      config.manualRoutes.longContext = { provider: manualRoutes.longContext.provider, model: manualRoutes.longContext.model };
      config.router.longContext = `${manualRoutes.longContext.provider},${manualRoutes.longContext.model}`;
    }
    console.log('[routes/save] after saving, config.manualRoutes:', JSON.stringify(config.manualRoutes));
  }
  if (autoSwitch) {
    config.smartRouting.autoSwitch = {
      ...config.smartRouting.autoSwitch,
      ...autoSwitch
    } as typeof config.smartRouting.autoSwitch;
  }
  saveConfig();
  console.log('[routes/save] saved config.manualRoutes:', config.manualRoutes);
  res.json({ success: true });
});

app.get('/local-models', (_req: Request, res: Response) => {
  const localModels: Array<{ name: string; source: string; size: number }> = [];
  const ollamaModels = providerManager.getProvider('ollama');
  if (ollamaModels) {
    for (const model of ollamaModels.config.models) {
      localModels.push({ name: model, source: 'ollama', size: 4000000000 });
    }
  }
  const lmstudioModels = providerManager.getProvider('lmstudio');
  if (lmstudioModels) {
    for (const model of lmstudioModels.config.models) {
      localModels.push({ name: model, source: 'lmstudio', size: 4000000000 });
    }
  }
  const janModels = providerManager.getProvider('jan');
  if (janModels) {
    for (const model of janModels.config.models) {
      localModels.push({ name: model, source: 'jan', size: 4000000000 });
    }
  }
  res.json({ models: localModels });
});

app.get('/adapters', (_req: Request, res: Response) => {
  const adapters = adapterRegistry.getAllAdapters().map(a => ({
    name: a.metadata.name,
    version: a.metadata.version,
    description: a.metadata.description,
    author: a.metadata.author,
    providerTypes: a.metadata.providerTypes
  }));
  res.json({ adapters, plugins: [] });
});

app.post('/adapters/reload', async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    const pluginDir = config.plugins?.pluginDir;
    if (pluginDir) {
      const loader = new PluginLoader(pluginDir);
      const plugins = await loader.loadPlugins();
      res.json({ success: true, loaded: plugins.length, plugins: plugins.map(p => p.name) });
    } else {
      await pluginService.reloadPlugins();
      const plugins = pluginService.listPlugins();
      res.json({ success: true, loaded: plugins.length, plugins: plugins.map(p => p.metadata.name) });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

let serverStarted = false;

export async function startServer(force = false): Promise<void> {
  if (serverStarted && !force) {
    return;
  }
  loadConfig();
  const config = getConfig();
  await pluginService.initialize().catch(err => console.error('Failed to initialize plugins:', err));
  providerManager.initialize();
  await providerManager.runHealthChecks();
  await new Promise<void>((resolve) => {
    const server = app.listen(config.server.port, config.server.host, () => {
      serverStarted = true;
      const allProviderStatuses = providerManager.getAllStatuses();
      const availableProviders = providerManager.getAvailableProviders();
      const totalProviders = allProviderStatuses.length;
      const availableProviderCount = availableProviders.length;
      const activeRoutes = Object.entries(config.router || {}).filter(([, value]) => value && value !== '').length;
      console.log(`Model Compass running on http://${config.server.host}:${config.server.port}`);
      console.log(`Health check: http://${config.server.host}:${config.server.port}/health`);
      console.log(`API endpoint: http://${config.server.host}:${config.server.port}/v1/chat/completions`);
      console.log(`  ${totalProviders} provider(s) (${availableProviderCount} available), ${activeRoutes} route(s)`);
      resolve();
    });
    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        serverStarted = true;
      }
      resolve();
    });
  });
}

process.on('uncaughtException', (err) => {
  console.error('[CRASH] uncaughtException:', err.message, err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] unhandledRejection:', reason);
});

if (require.main === module) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
