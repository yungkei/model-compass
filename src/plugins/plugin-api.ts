import { BaseProvider, ChatCompletionRequest, ChatCompletionResponse } from '../providers/base';
import { ProviderAdapter } from '../providers/registry';
import { ProviderConfig } from './types';
import {
  ProviderPlugin, AgentPlugin, RouterPlugin, PluginManifest, PluginRequestHooks
} from './types';

export interface ProviderPluginOptions {
  metadata: Omit<PluginManifest, 'type'>;
  createProvider: (config: ProviderConfig) => BaseProvider;
  configSchema?: ProviderPlugin['configSchema'];
  validateConfig?: ProviderPlugin['validateConfig'];
  hooks?: PluginRequestHooks;
}

export interface AgentPluginOptions {
  metadata: Omit<PluginManifest, 'type'>;
  supportedTypes: AgentPlugin['supportedTypes'];
  onInstall?: AgentPlugin['onInstall'];
  onUninstall?: AgentPlugin['onUninstall'];
  onActivate?: AgentPlugin['onActivate'];
  onDeactivate?: AgentPlugin['onDeactivate'];
  initialize?: AgentPlugin['initialize'];
  dispose?: AgentPlugin['dispose'];
}

export interface RouterPluginOptions {
  metadata: Omit<PluginManifest, 'type'>;
  createRouter: RouterPlugin['createRouter'];
  priority?: RouterPlugin['priority'];
  canHandle?: RouterPlugin['canHandle'];
  initialize?: RouterPlugin['initialize'];
  dispose?: RouterPlugin['dispose'];
}

export function createProviderPlugin(options: ProviderPluginOptions): ProviderPlugin {
  return {
    type: 'provider' as any,
    metadata: { ...options.metadata, type: 'provider' },
    createProvider: options.createProvider,
    configSchema: options.configSchema,
    validateConfig: options.validateConfig,
    hooks: options.hooks,
    initialize: (options.metadata as any).initialize,
    dispose: (options.metadata as any).dispose
  } as ProviderPlugin;
}

export function createAgentPlugin(options: AgentPluginOptions): AgentPlugin {
  return {
    type: 'agent' as any,
    metadata: { ...options.metadata, type: 'agent' },
    supportedTypes: options.supportedTypes,
    onInstall: options.onInstall,
    onUninstall: options.onUninstall,
    onActivate: options.onActivate,
    onDeactivate: options.onDeactivate,
    initialize: options.initialize,
    dispose: options.dispose
  } as AgentPlugin;
}

export function createRouterPlugin(options: RouterPluginOptions): RouterPlugin {
  return {
    type: 'router' as any,
    metadata: { ...options.metadata, type: 'router' },
    createRouter: options.createRouter,
    priority: options.priority,
    canHandle: options.canHandle,
    initialize: options.initialize,
    dispose: options.dispose
  } as RouterPlugin;
}

export abstract class AbstractProvider extends BaseProvider {
  abstract providerType: string;
  constructor(config: ProviderConfig) {
    super(config as any);
  }
  abstract buildRequestBody(req: ChatCompletionRequest): unknown;
  abstract transformResponse(response: unknown): ChatCompletionResponse;
  abstract buildHeaders(apiKey: string): Record<string, string>;
}

const providerInstanceCache = new WeakMap<object, AbstractProvider>();

function getOrCreateProvider(providerClass: typeof AbstractProvider, config: object): AbstractProvider {
  const cached = providerInstanceCache.get(config);
  if (cached) return cached;
  const instance = new (providerClass as any)(config);
  providerInstanceCache.set(config, instance);
  return instance;
}

export function createAdapterFromProvider(
  providerClass: typeof AbstractProvider,
  metadata: Omit<PluginManifest, 'id' | 'type'>
): ProviderAdapter {
  return {
    metadata: {
      name: metadata.name,
      version: metadata.version || '1.0.0',
      description: metadata.description || '',
      author: (metadata.author as any)?.name,
      providerTypes: metadata.categories || ['unknown']
    },
    transformers: {
      buildRequestBody: (req, provider) => {
        return getOrCreateProvider(providerClass, provider).buildRequestBody(req);
      },
      transformResponse: (response, provider) => {
        return getOrCreateProvider(providerClass, provider).transformResponse(response);
      },
      buildHeaders: (apiKey, provider) => {
        return getOrCreateProvider(providerClass, provider).buildHeaders(apiKey);
      },
      buildEndpoint: (provider, path) => {
        const instance = getOrCreateProvider(providerClass, provider);
        return (instance as any).buildEndpoint ? (instance as any).buildEndpoint(path) : path;
      }
    },
    isCompatible: (providerType) => providerType === (providerClass as any).name.toLowerCase()
  };
}

export * from './types';
