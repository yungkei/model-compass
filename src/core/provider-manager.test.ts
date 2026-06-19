import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProviderManager } from './provider-manager';

vi.mock('../providers/base', async (importOriginal) => {
  const actual = await importOriginal() as any;
  class MockBaseProvider {
    config: any; status: any; client = {};
    constructor(config: any) {
      this.config = config;
      this.status = { name: config.name, online: true, lastCheck: Date.now(), models: config.models || [] };
    }
    getName = () => this.config.name;
    getModels = () => this.config.models || [];
    supportsModel = (m: string) => (this.config.models || []).includes(m);
    buildRequestBody = vi.fn();
    transformResponse = vi.fn();
    buildHeaders = vi.fn();
    chatCompletion = vi.fn();
    chatCompletionStream = vi.fn();
    healthCheck = vi.fn().mockResolvedValue(true);
  }
  return {
    ...actual,
    BaseProvider: MockBaseProvider,
    createProvider: (config: any) => new MockBaseProvider(config)
  };
});

function mockProvider(name: string, online = true, priority = 99, models = [`model-${name}`]) {
  return {
    config: { name, type: 'openai', api_base_url: `http://${name}.test/v1`, api_key: 'sk-test', models, priority },
    status: { name, online, lastCheck: Date.now(), models },
    getName: () => name,
    getModels: () => models,
    supportsModel: (m: string) => models.includes(m),
    buildRequestBody: vi.fn(),
    transformResponse: vi.fn(),
    buildHeaders: vi.fn(),
    chatCompletion: vi.fn(),
    chatCompletionStream: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(online),
    client: {}
  } as any;
}

describe('ProviderManager', () => {
  let manager: ProviderManager;

  beforeEach(() => {
    manager = new ProviderManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    manager.stopHealthCheck();
    vi.useRealTimers();
  });

  describe('getProvider', () => {
    it('should return provider by name', () => {
      const p = mockProvider('alpha');
      manager.addProvider(p);
      expect(manager.getProvider('alpha')).toBe(p);
    });

    it('should return undefined for unknown provider', () => {
      expect(manager.getProvider('unknown')).toBeUndefined();
    });
  });

  describe('getAllProviders', () => {
    it('should return all providers', () => {
      manager.addProvider(mockProvider('a'));
      manager.addProvider(mockProvider('b'));
      expect(manager.getAllProviders().size).toBe(2);
    });
  });

  describe('getAllStatuses', () => {
    it('should return statuses for all providers', () => {
      manager.addProvider(mockProvider('a', true));
      manager.addProvider(mockProvider('b', false));
      const statuses = manager.getAllStatuses();
      expect(statuses).toHaveLength(2);
      expect(statuses.find(s => s.name === 'a')?.online).toBe(true);
      expect(statuses.find(s => s.name === 'b')?.online).toBe(false);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return online providers sorted by priority', () => {
      manager.addProvider(mockProvider('low', true, 10));
      manager.addProvider(mockProvider('high', true, 1));
      const available = manager.getAvailableProviders();
      expect(available).toHaveLength(2);
      expect(available[0].getName()).toBe('high');
    });

    it('should exclude offline providers', () => {
      manager.addProvider(mockProvider('online', true));
      manager.addProvider(mockProvider('offline', false));
      expect(manager.getAvailableProviders()).toHaveLength(1);
      expect(manager.getAvailableProviders()[0].getName()).toBe('online');
    });

    it('should exclude providers in cooldown', () => {
      manager.addProvider(mockProvider('cooling', true));
      manager.setCooldown('cooling', 60000);
      expect(manager.getAvailableProviders()).toHaveLength(0);
    });

    it('should include provider after cooldown expires', () => {
      manager.addProvider(mockProvider('recovered', true));
      manager.setCooldown('recovered', 1000);
      vi.advanceTimersByTime(2000);
      expect(manager.getAvailableProviders()).toHaveLength(1);
    });
  });

  describe('isProviderAvailable', () => {
    it('should return true for online not-cooldown provider', () => {
      manager.addProvider(mockProvider('ready', true));
      expect(manager.isProviderAvailable('ready')).toBe(true);
    });

    it('should return false for offline provider', () => {
      manager.addProvider(mockProvider('down', false));
      expect(manager.isProviderAvailable('down')).toBe(false);
    });

    it('should return false for unknown provider', () => {
      expect(manager.isProviderAvailable('nope')).toBe(false);
    });

    it('should return false for provider in cooldown', () => {
      manager.addProvider(mockProvider('cooling', true));
      manager.setCooldown('cooling', 60000);
      expect(manager.isProviderAvailable('cooling')).toBe(false);
    });
  });

  describe('cooldown management', () => {
    it('should set and clear cooldown', () => {
      manager.setCooldown('p1', 10000);
      expect(manager.getCooldownStatus()).toHaveProperty('p1');
      manager.clearCooldown('p1');
      expect(manager.getCooldownStatus()).not.toHaveProperty('p1');
    });

    it('should clear all cooldowns', () => {
      manager.setCooldown('p1', 10000);
      manager.setCooldown('p2', 20000);
      manager.clearAllCooldowns();
      expect(manager.getCooldownStatus()).toEqual({});
    });

    it('should not include expired cooldowns in status', () => {
      manager.setCooldown('expired', -1000);
      expect(manager.getCooldownStatus()).not.toHaveProperty('expired');
    });
  });

  describe('addProvider / removeProvider', () => {
    it('should add and retrieve dynamic provider', () => {
      const p = mockProvider('dynamic');
      manager.addProvider(p);
      expect(manager.getProvider('dynamic')).toBe(p);
    });

    it('should remove provider', () => {
      manager.addProvider(mockProvider('temp'));
      expect(manager.removeProvider('temp')).toBe(true);
      expect(manager.getProvider('temp')).toBeUndefined();
    });

    it('should return false when removing unknown provider', () => {
      expect(manager.removeProvider('nope')).toBe(false);
    });
  });

  describe('reload', () => {
    it('should replace all providers', () => {
      manager.addProvider(mockProvider('old'));
      manager.reload({
        providers: [{ name: 'new', type: 'openai', api_base_url: 'http://new.test/v1', api_key: 'sk-new', models: ['gpt-4'] }]
      } as any);
      expect(manager.getProvider('old')).toBeUndefined();
      expect(manager.getProvider('new')).toBeDefined();
    });

    it('should clear cooldowns on reload', () => {
      manager.addProvider(mockProvider('p'));
      manager.setCooldown('p', 60000);
      manager.reload({ providers: [{ name: 'p', type: 'openai', api_base_url: 'http://p.test/v1', api_key: 'sk-p', models: ['gpt-4'] }] } as any);
      expect(manager.getCooldownStatus()).toEqual({});
    });
  });

  describe('stopHealthCheck', () => {
    it('should clear health check interval', () => {
      manager.stopHealthCheck();
      expect((manager as any).healthCheckInterval).toBeNull();
    });
  });
});
