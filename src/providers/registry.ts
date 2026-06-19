import { ChatCompletionRequest, ChatCompletionResponse, StreamChunk, ProviderStatus } from '../providers/base';
import { Provider } from '../config';

export interface AdapterMetadata {
  name: string;
  version: string;
  description: string;
  author?: string;
  providerTypes: string[];
}

export interface AdapterHooks {
  beforeRequest?: (req: ChatCompletionRequest, provider: Provider) => ChatCompletionRequest;
  afterResponse?: (response: unknown, provider: Provider) => unknown;
  beforeStreamChunk?: (chunk: unknown, provider: Provider) => unknown;
  onError?: (error: Error, provider: Provider) => void;
  onHealthCheck?: (status: ProviderStatus, provider: Provider) => ProviderStatus;
}

export interface AdapterTransformers {
  buildRequestBody: (req: ChatCompletionRequest, provider: Provider) => unknown;
  transformResponse: (response: unknown, provider: Provider) => ChatCompletionResponse;
  buildHeaders: (apiKey: string, provider: Provider) => Record<string, string>;
  buildEndpoint?: (provider: Provider, path: string) => string;
}

export interface AdapterLifecycle {
  onInitialize?: (provider: Provider) => void;
  onDispose?: (provider: Provider) => void;
  onReload?: (provider: Provider) => void;
}

export interface ProviderAdapter {
  metadata: AdapterMetadata;
  transformers: AdapterTransformers;
  hooks?: AdapterHooks;
  lifecycle?: AdapterLifecycle;
  isCompatible: (providerType: string) => boolean;
}

export interface AdapterPlugin {
  id: string;
  name: string;
  version: string;
  register: (registry: AdapterRegistry) => void;
  adapters: ProviderAdapter[];
}

export class AdapterRegistry {
  private adapters: Map<string, ProviderAdapter> = new Map();
  private plugins: Map<string, AdapterPlugin> = new Map();

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.metadata.name, adapter);
  }

  registerPlugin(plugin: AdapterPlugin): void {
    this.plugins.set(plugin.id, plugin);
    for (const adapter of plugin.adapters) {
      this.register(adapter);
    }
  }

  unregister(name: string): boolean {
    return this.adapters.delete(name);
  }

  unregisterPlugin(id: string): boolean {
    const plugin = this.plugins.get(id);
    if (plugin) {
      for (const adapter of plugin.adapters) {
        this.unregister(adapter.metadata.name);
      }
      return this.plugins.delete(id);
    }
    return false;
  }

  getAdapter(name: string): ProviderAdapter | undefined {
    return this.adapters.get(name);
  }

  getAdapterByType(providerType: string): ProviderAdapter | undefined {
    for (const adapter of this.adapters.values()) {
      if (adapter.isCompatible(providerType)) {
        return adapter;
      }
    }
    return undefined;
  }

  hasAdapter(name: string): boolean {
    return this.adapters.has(name);
  }

  getAllAdapters(): ProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  getPlugin(id: string): AdapterPlugin | undefined {
    return this.plugins.get(id);
  }

  getAllPlugins(): AdapterPlugin[] {
    return Array.from(this.plugins.values());
  }

  clear(): void {
    this.adapters.clear();
    this.plugins.clear();
  }
}

export const adapterRegistry = new AdapterRegistry();
