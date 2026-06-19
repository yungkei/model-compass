import { getConfig, RouterConfig } from '../config';
import { BaseProvider, ChatCompletionRequest } from '../providers/base';
import { providerManager } from './provider-manager';

export type RouteType = 'default' | 'background' | 'think' | 'longContext' | 'webSearch' | 'image';

export interface RouteResult {
  provider: string;
  model: string;
  providerInstance: BaseProvider;
}

export interface AvailableModel {
  provider: string;
  model: string;
  providerInstance: BaseProvider;
}

export interface PluginRouterEntry {
  id: string;
  name: string;
  priority: number;
  canHandle?: (request: ChatCompletionRequest, context: any) => boolean;
  router: Router;
}

export class Router {
  private routeCache: Map<string, RouteResult> = new Map();
  private pluginRouters: Map<string, PluginRouterEntry> = new Map();

  registerPluginRouter(entry: PluginRouterEntry): void {
    this.pluginRouters.set(entry.id, entry);
    this.routeCache.clear();
  }

  unregisterPluginRouter(id: string): boolean {
    const result = this.pluginRouters.delete(id);
    this.routeCache.clear();
    return result;
  }

  getPluginRouters(): PluginRouterEntry[] {
    return Array.from(this.pluginRouters.values()).sort((a, b) => b.priority - a.priority);
  }

  parseModelString(modelStr: string): { provider: string; model: string; providerInstance?: BaseProvider } | null {
    const parts = modelStr.split(',');
    if (parts.length === 2) {
      const provider = parts[0].trim();
      const model = parts[1].trim();
      const providerInstance = providerManager.getProvider(provider);
      return {
        provider,
        model,
        providerInstance
      };
    }
    return null;
  }

  determineRouteType(req: ChatCompletionRequest): RouteType {
    const config = getConfig();
    const lastMessage = req.messages[req.messages.length - 1];
    const content = typeof lastMessage?.content === 'string' 
      ? lastMessage.content 
      : JSON.stringify(lastMessage?.content || '');

    if (req.model.includes('thinking') || content.includes('<think>') || content.includes('深入分析')) {
      return 'think';
    }

    if (content.includes('<websearch>') || content.includes('网络搜索')) {
      return 'webSearch';
    }

    if (content.includes('<image>') || content.includes('图片')) {
      return 'image';
    }

    const totalTokens = (req.messages.reduce((sum, m) => sum + (m.content?.length || 0), 0) / 4);
    if (totalTokens > (config.router.longContextThreshold || 60000)) {
      return 'longContext';
    }

    return 'default';
  }

  getRoute(routeType: RouteType, manualModel?: string): RouteResult | null {
    const cacheKey = `${routeType}-${manualModel || 'auto'}`;

    if (this.routeCache.has(cacheKey)) {
      return this.routeCache.get(cacheKey)!;
    }

    const config = getConfig();

    if (manualModel) {
      const parsed = this.parseModelString(manualModel);
      if (parsed) {
        this.routeCache.set(cacheKey, parsed as RouteResult);
        return parsed as RouteResult;
      }

      const manualRoutes = config.manualRoutes as Record<string, string>;
      if (manualRoutes && manualRoutes[manualModel]) {
        const mapped = this.parseModelString(manualRoutes[manualModel]);
        if (mapped) {
          this.routeCache.set(cacheKey, mapped as RouteResult);
          return mapped as RouteResult;
        }
      }

      const modelMapping = (config.modelMapping as Record<string, string>) || {};
      if (modelMapping[manualModel]) {
        const mapped = this.parseModelString(modelMapping[manualModel]);
        if (mapped) {
          this.routeCache.set(cacheKey, mapped as RouteResult);
          return mapped as RouteResult;
        }
      }
    }

    if (config.connectionMode === 'auto') {
      const autoRoute = this.getBestAutoRoute(routeType);
      if (autoRoute) {
        this.routeCache.set(cacheKey, autoRoute);
        return autoRoute;
      }
    }

    const routerConfig = config.router as unknown as Record<string, string>;
    const modelStr = routerConfig[routeType] || routerConfig['default'];

    if (modelStr) {
      const parsed = this.parseModelString(modelStr);
      if (parsed) {
        this.routeCache.set(cacheKey, parsed as RouteResult);
        return parsed as RouteResult;
      }
    }

    const pluginRoute = this.tryPluginRouters(routeType, manualModel);
    if (pluginRoute) {
      this.routeCache.set(cacheKey, pluginRoute);
      return pluginRoute;
    }

    return null;
  }

  private tryPluginRouters(routeType: RouteType, manualModel?: string): RouteResult | null {
    const pluginEntries = this.getPluginRouters();
    for (const entry of pluginEntries) {
      try {
        const pluginRouter = entry.router;
        const pluginRoute = pluginRouter.getRoute(routeType, manualModel);
        if (pluginRoute) return pluginRoute;
      } catch {
        // Silently skip failed plugin routers
      }
    }
    return null;
  }

  private getBestAutoRoute(routeType: RouteType): RouteResult | null {
    const config = getConfig();
    const statuses = providerManager.getAllStatuses();

    const scoredProviders = config.providers
      .map(provider => {
        const status = statuses.find(s => s.name === provider.name);
        const isOnline = status?.online ?? false;
        const latency = status?.latency ?? Infinity;
        const priority = provider.priority ?? 1;

        let score = 0;
        if (isOnline) {
          const strategy = config.schedulingStrategy || 'network-adaptive';
          switch (strategy) {
            case 'network-adaptive':
              score += 10000;
              score += priority * 100;
              if (latency !== Infinity) {
                score += Math.max(0, 1000 - latency);
              }
              break;
            case 'priority-based':
              score += priority * 1000;
              break;
            case 'load-balance':
              score = priority + Math.random() * 1000;
              break;
            case 'cost-based':
              score = priority * 1000;
              break;
            default:
              score += 10000;
              score += priority * 100;
              if (latency !== Infinity) {
                score += Math.max(0, 1000 - latency);
              }
          }
        }

        return { provider, isOnline, latency, score };
      })
      .sort((a, b) => b.score - a.score);

    for (const scored of scoredProviders) {
      if (!scored.isOnline || !scored.provider.models?.length) continue;

      const model = this.selectBestModel(scored.provider.models, routeType);
      const providerInstance = providerManager.getProvider(scored.provider.name);
      if (providerInstance && model) {
        return {
          provider: scored.provider.name,
          model,
          providerInstance
        };
      }
    }

    return null;
  }

  private selectBestModel(models: string[], routeType: RouteType): string | null {
    const config = getConfig();
    const routeKey = routeType === 'default' ? 'default' : routeType;
    const configuredRoute = config.router[routeKey];
    
    if (configuredRoute) {
      const [, model] = configuredRoute.split(',');
      if (model && models.includes(model.trim())) {
        return model.trim();
      }
    }

    if (routeType === 'think') {
      const thinkingModels = models.filter(m => 
        m.toLowerCase().includes('thinking') || 
        m.toLowerCase().includes('reasoner') ||
        m.toLowerCase().includes('reasoning')
      );
      if (thinkingModels.length > 0) return thinkingModels[0];
    }

    if (routeType === 'longContext') {
      const longContextModels = models.filter(m => 
        m.toLowerCase().includes('pro') || 
        m.toLowerCase().includes('32k') ||
        m.toLowerCase().includes('128k')
      );
      if (longContextModels.length > 0) return longContextModels[0];
    }

    return models[0] ?? null;
  }

  calculateProviderScore(providerName: string): number {
    const config = getConfig();
    const statuses = providerManager.getAllStatuses();
    const provider = config.providers.find(p => p.name === providerName);
    const status = statuses.find(s => s.name === providerName);

    if (!provider || !status) return 0;

    const isOnline = status.online ?? false;
    const latency = status.latency ?? Infinity;
    const priority = provider.priority ?? 1;

    let score = 0;
    if (isOnline) {
      score += 10000;
      score += priority * 100;
      if (latency !== Infinity) {
        score += Math.max(0, 1000 - latency);
      }
    }

    return score;
  }

  getAutoScheduleInfo(): Array<{provider: string; model: string; priority: number; online: boolean; latency?: number; score: number}> {
    const config = getConfig();
    const statuses = providerManager.getAllStatuses();

    return config.providers
      .map(provider => {
        const status = statuses.find(s => s.name === provider.name);
        const isOnline = status?.online ?? false;
        const latency = status?.latency;
        const priority = provider.priority ?? 1;
        const score = this.calculateProviderScore(provider.name);

        return {
          provider: provider.name,
          model: provider.models?.[0] ?? 'N/A',
          priority,
          online: isOnline,
          latency,
          score
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  getAvailableModel(preferredProvider?: string, preferredModel?: string): AvailableModel | null {
    const config = getConfig();
    const statuses = providerManager.getAllStatuses();
    
    const sortedProviders = [...config.providers].sort((a, b) => (b.priority || 1) - (a.priority || 1));
    
    const checkProviderModel = (providerName: string, modelName: string): AvailableModel | null => {
      const status = statuses.find(s => s.name === providerName);
      if (status?.online) {
        const provider = providerManager.getProvider(providerName);
        if (provider) {
          return { provider: providerName, model: modelName, providerInstance: provider };
        }
      }
      return null;
    };

    if (preferredProvider && preferredModel) {
      const result = checkProviderModel(preferredProvider, preferredModel);
      if (result) return result;
    }

    if (preferredProvider) {
      const providerConfig = config.providers.find(p => p.name === preferredProvider);
      if (providerConfig?.models) {
        for (const model of providerConfig.models) {
          const result = checkProviderModel(preferredProvider, model);
          if (result) return result;
        }
      }
    }

    for (const providerConfig of sortedProviders) {
      if (preferredProvider && providerConfig.name === preferredProvider) continue;
      
      if (providerConfig.models && providerConfig.models.length > 0) {
        for (const model of providerConfig.models) {
          const result = checkProviderModel(providerConfig.name, model);
          if (result) return result;
        }
      }
    }

    return null;
  }

  findNextAvailable(currentProvider: string, currentModel: string): AvailableModel | null {
    const config = getConfig();
    const statuses = providerManager.getAllStatuses();
    
    const providerConfig = config.providers.find(p => p.name === currentProvider);
    if (providerConfig?.models) {
      const currentIndex = providerConfig.models.indexOf(currentModel);
      for (let i = currentIndex + 1; i < providerConfig.models.length; i++) {
        const model = providerConfig.models[i];
        const status = statuses.find(s => s.name === currentProvider);
        if (status?.online) {
          const provider = providerManager.getProvider(currentProvider);
          if (provider) {
            return { provider: currentProvider, model, providerInstance: provider };
          }
        }
      }
    }

    const sortedProviders = [...config.providers]
      .filter(p => p.name !== currentProvider)
      .sort((a, b) => (b.priority || 1) - (a.priority || 1));

    for (const nextProvider of sortedProviders) {
      const status = statuses.find(s => s.name === nextProvider.name);
      if (status?.online && nextProvider.models && nextProvider.models.length > 0) {
        const provider = providerManager.getProvider(nextProvider.name);
        if (provider) {
          return { provider: nextProvider.name, model: nextProvider.models[0], providerInstance: provider };
        }
      }
    }

    return null;
  }

  clearCache(): void {
    this.routeCache.clear();
  }

  getAllRouteTypes(): RouteType[] {
    return ['default', 'background', 'think', 'longContext', 'webSearch', 'image'];
  }
}

export const router = new Router();