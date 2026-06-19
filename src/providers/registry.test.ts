import { describe, it, expect, beforeEach } from 'vitest';
import { AdapterRegistry, ProviderAdapter, AdapterPlugin } from './registry';

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;
  const mockAdapter: ProviderAdapter = {
    metadata: { name: 'test', version: '1.0.0', description: 'Test', providerTypes: ['test'] },
    transformers: {
      buildRequestBody: (req) => req,
      transformResponse: (res) => res as any,
      buildHeaders: (key) => ({ Authorization: `Bearer ${key}` })
    },
    isCompatible: (type) => type === 'test'
  };

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  it('should register and retrieve an adapter', () => {
    registry.register(mockAdapter);
    expect(registry.getAdapter('test')).toBe(mockAdapter);
  });

  it('should return undefined for unknown adapter', () => {
    expect(registry.getAdapter('nonexistent')).toBeUndefined();
  });

  it('should find adapter by provider type', () => {
    registry.register(mockAdapter);
    expect(registry.getAdapterByType('test')).toBe(mockAdapter);
  });

  it('should return undefined for unsupported type', () => {
    registry.register(mockAdapter);
    expect(registry.getAdapterByType('other')).toBeUndefined();
  });

  it('should list all registered adapters', () => {
    registry.register(mockAdapter);
    const a2: ProviderAdapter = {
      metadata: { name: 'test2', version: '1.0.0', description: 'Test 2', providerTypes: ['other'] },
      transformers: {
        buildRequestBody: (req) => req,
        transformResponse: (res) => res as any,
        buildHeaders: (key) => ({ Authorization: `Bearer ${key}` })
      },
      isCompatible: (type) => type === 'other'
    };
    registry.register(a2);
    expect(registry.getAllAdapters()).toHaveLength(2);
  });

  it('should unregister an adapter', () => {
    registry.register(mockAdapter);
    expect(registry.unregister('test')).toBe(true);
    expect(registry.getAdapter('test')).toBeUndefined();
  });

  it('should return false when unregistering unknown adapter', () => {
    expect(registry.unregister('nonexistent')).toBe(false);
  });

  it('should check if adapter exists', () => {
    registry.register(mockAdapter);
    expect(registry.hasAdapter('test')).toBe(true);
    expect(registry.hasAdapter('nonexistent')).toBe(false);
  });

  it('should register a plugin with multiple adapters', () => {
    const plugin: AdapterPlugin = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      register: () => {},
      adapters: [mockAdapter]
    };
    registry.registerPlugin(plugin);
    expect(registry.getPlugin('test-plugin')).toBe(plugin);
    expect(registry.getAdapter('test')).toBe(mockAdapter);
  });

  it('should unregister a plugin and its adapters', () => {
    const plugin: AdapterPlugin = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      register: () => {},
      adapters: [mockAdapter]
    };
    registry.registerPlugin(plugin);
    expect(registry.unregisterPlugin('test-plugin')).toBe(true);
    expect(registry.getPlugin('test-plugin')).toBeUndefined();
    expect(registry.getAdapter('test')).toBeUndefined();
  });

  it('should clear all adapters and plugins', () => {
    registry.register(mockAdapter);
    registry.clear();
    expect(registry.getAllAdapters()).toHaveLength(0);
  });
});

describe('ProviderAdapter Interface', () => {
  const adapter: ProviderAdapter = {
    metadata: {
      name: 'openai',
      version: '1.0.0',
      description: 'OpenAI adapter',
      author: 'mc',
      providerTypes: ['openai', 'openrouter']
    },
    transformers: {
      buildRequestBody: (req, config) => ({ model: req.model, messages: req.messages }),
      transformResponse: (res) => res as any,
      buildHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
      buildEndpoint: (config, path) => path
    },
    hooks: {
      beforeRequest: (req) => req,
      afterResponse: (res, config) => res,
      onError: (err, provider) => console.error(err)
    },
    lifecycle: {
      onInitialize: (config) => {},
      onDispose: (config) => {}
    },
    isCompatible: (type) => ['openai', 'openrouter'].includes(type)
  };

  it('should have metadata', () => {
    expect(adapter.metadata.name).toBe('openai');
    expect(adapter.metadata.version).toBe('1.0.0');
  });

  it('should transform request body', () => {
    const req = { model: 'gpt-4', messages: [{ role: 'user' as const, content: 'hi' }] };
    const result = adapter.transformers.buildRequestBody(req, {} as any);
    expect(result).toHaveProperty('model', 'gpt-4');
  });

  it('should build headers', () => {
    const headers = adapter.transformers.buildHeaders('sk-test', {} as any);
    expect(headers.Authorization).toBe('Bearer sk-test');
  });

  it('should support optional buildEndpoint', () => {
    expect(adapter.transformers.buildEndpoint).toBeDefined();
    expect(adapter.transformers.buildEndpoint!({} as any, '/chat')).toBe('/chat');
  });

  it('should support optional hooks', () => {
    expect(adapter.hooks?.beforeRequest).toBeDefined();
    expect(adapter.hooks?.onError).toBeDefined();
  });

  it('should support optional lifecycle', () => {
    expect(adapter.lifecycle?.onInitialize).toBeDefined();
    expect(adapter.lifecycle?.onDispose).toBeDefined();
  });

  it('should check compatibility', () => {
    expect(adapter.isCompatible('openai')).toBe(true);
    expect(adapter.isCompatible('openrouter')).toBe(true);
    expect(adapter.isCompatible('anthropic')).toBe(false);
  });
});
