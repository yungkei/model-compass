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
  /**
   * Registration order per adapter. The most recently registered adapter wins
   * when several of them claim the same provider type, which lets an
   * installed plugin take over a built-in adapter.
   */
  private priority: Map<string, number> = new Map();
  private counter = 0;

  register(adapter: ProviderAdapter): void {
    // Re-registering the exact same instance keeps its original priority so
    // that a repeated built-in registration cannot shadow a plugin that was
    // registered later.
    if (this.adapters.get(adapter.metadata.name) === adapter) {
      return;
    }
    this.adapters.set(adapter.metadata.name, adapter);
    this.counter += 1;
    this.priority.set(adapter.metadata.name, this.counter);
  }

  registerPlugin(plugin: AdapterPlugin): void {
    this.plugins.set(plugin.id, plugin);
    for (const adapter of plugin.adapters) {
      this.register(adapter);
    }
  }

  unregister(name: string): boolean {
    this.priority.delete(name);
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

  /**
   * Find the adapter serving a provider type.
   * When multiple adapters claim the same type, the most recently registered
   * one wins - this is what allows an installed plugin to override a
   * built-in adapter.
   */
  getAdapterByType(providerType: string): ProviderAdapter | undefined {
    if (!providerType) return undefined;

    let match: ProviderAdapter | undefined;
    let matchPriority = -1;

    for (const adapter of this.adapters.values()) {
      if (!adapter.isCompatible(providerType)) continue;
      const p = this.priority.get(adapter.metadata.name) ?? 0;
      if (p > matchPriority) {
        matchPriority = p;
        match = adapter;
      }
    }
    return match;
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
    this.priority.clear();
    this.counter = 0;
  }
}

export const adapterRegistry = new AdapterRegistry();
