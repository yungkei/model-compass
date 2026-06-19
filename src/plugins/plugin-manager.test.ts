import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';
import { PluginManager } from './plugin-manager';
import { PluginType } from './types';

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  rmSync: vi.fn(),
  unlinkSync: vi.fn()
}));

vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

vi.mock('../config', () => ({
  getConfig: () => ({ server: { host: '0.0.0.0', port: 8765 } })
}));

vi.mock('../core/provider-manager', () => ({
  providerManager: {}
}));

vi.mock('../core/router', () => ({
  router: { registerPluginRouter: vi.fn(), unregisterPluginRouter: vi.fn() }
}));

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeAll(() => {
    vi.stubGlobal('process', {
      ...process,
      env: { ...process.env, MC_HOME: '/tmp/mc-test' }
    });
  });

  beforeEach(() => {
    manager = new PluginManager('/tmp/test-plugins');
  });

  describe('registerBuiltinPlugin', () => {
    it('should register a plugin with builtin source', () => {
      const plugin = {
        type: PluginType.PROVIDER,
        metadata: { id: 'test-plugin', name: 'Test', version: '1.0.0', description: 'test' },
        createProvider: vi.fn()
      } as any;
      manager.registerBuiltinPlugin(plugin);
      expect(manager.isInstalled('test-plugin')).toBe(true);
      const inst = manager.getInstallation('test-plugin');
      expect(inst?.source).toBe('builtin');
    });

    it('should not overwrite existing plugin', () => {
      const plugin = {
        type: PluginType.PROVIDER,
        metadata: { id: 'dup', name: 'Dup', version: '1.0.0', description: 'first' },
        createProvider: vi.fn()
      } as any;
      manager.registerBuiltinPlugin(plugin);
      const plugin2 = {
        type: PluginType.PROVIDER,
        metadata: { id: 'dup', name: 'Dup', version: '2.0.0', description: 'second' },
        createProvider: vi.fn()
      } as any;
      manager.registerBuiltinPlugin(plugin2);
      expect(manager.getPlugin('dup')?.metadata.version).toBe('1.0.0');
    });
  });

  describe('register / unregister plugin', () => {
    it('should register and list plugin', async () => {
      const plugin = {
        type: PluginType.PROVIDER,
        metadata: { id: 'p1', name: 'P1', version: '1.0.0', description: 'test provider' },
        createProvider: vi.fn()
      } as any;
      await manager.registerPlugin(plugin, 'file');
      expect(manager.listPlugins()).toHaveLength(1);
      expect(manager.getPluginsByType(PluginType.PROVIDER)).toHaveLength(1);
    });

    it('should throw when registering duplicate plugin', async () => {
      const plugin = {
        type: PluginType.PROVIDER,
        metadata: { id: 'dup', name: 'Dup', version: '1.0.0', description: '' },
        createProvider: vi.fn()
      } as any;
      await manager.registerPlugin(plugin);
      await expect(manager.registerPlugin(plugin)).rejects.toThrow('already registered');
    });

    it('should unregister plugin', async () => {
      const plugin = {
        type: PluginType.PROVIDER,
        metadata: { id: 'p2', name: 'P2', version: '1.0.0', description: '' },
        createProvider: vi.fn()
      } as any;
      await manager.registerPlugin(plugin);
      expect(await manager.unregisterPlugin('p2')).toBe(true);
      expect(manager.isInstalled('p2')).toBe(false);
    });

    it('should return false when unregistering unknown plugin', async () => {
      expect(await manager.unregisterPlugin('nope')).toBe(false);
    });

    it('should call initialize on plugin if present', async () => {
      const initFn = vi.fn();
      const plugin = {
        type: PluginType.PROVIDER,
        metadata: { id: 'init-test', name: 'Init', version: '1.0.0', description: '' },
        createProvider: vi.fn(),
        initialize: initFn
      } as any;
      await manager.registerPlugin(plugin);
      expect(initFn).toHaveBeenCalledOnce();
    });

    it('should call dispose on unregister if present', async () => {
      const disposeFn = vi.fn();
      const plugin = {
        type: PluginType.AGENT,
        metadata: { id: 'dispose-test', name: 'Dispose', version: '1.0.0', description: '' },
        supportedTypes: ['generic'],
        dispose: disposeFn
      } as any;
      await manager.registerPlugin(plugin);
      await manager.unregisterPlugin('dispose-test');
      expect(disposeFn).toHaveBeenCalledOnce();
    });
  });

  describe('getPluginsByType', () => {
    it('should filter plugins by type', async () => {
      const provider = {
        type: PluginType.PROVIDER,
        metadata: { id: 'p', name: 'P', version: '1.0.0', description: '' },
        createProvider: vi.fn()
      } as any;
      const agent = {
        type: PluginType.AGENT,
        metadata: { id: 'a', name: 'A', version: '1.0.0', description: '' },
        supportedTypes: ['generic']
      } as any;
      const router = {
        type: PluginType.ROUTER,
        metadata: { id: 'r', name: 'R', version: '1.0.0', description: '' },
        createRouter: vi.fn()
      } as any;
      await manager.registerPlugin(provider);
      await manager.registerPlugin(agent);
      await manager.registerPlugin(router);
      expect(manager.getPluginsByType(PluginType.PROVIDER)).toHaveLength(1);
      expect(manager.getPluginsByType(PluginType.AGENT)).toHaveLength(1);
      expect(manager.getPluginsByType(PluginType.ROUTER)).toHaveLength(1);
    });
  });

  describe('getPluginManifest', () => {
    it('should return manifest for installed plugin', async () => {
      const plugin = {
        type: PluginType.PROVIDER,
        metadata: { id: 'manifest-test', name: 'Manifest', version: '1.0.0', description: 'desc' },
        createProvider: vi.fn()
      } as any;
      await manager.registerPlugin(plugin);
      const m = manager.getPluginManifest('manifest-test');
      expect(m?.name).toBe('Manifest');
      expect(m?.version).toBe('1.0.0');
    });

    it('should return undefined for unknown plugin', () => {
      expect(manager.getPluginManifest('nope')).toBeUndefined();
    });
  });

  describe('listInstallations', () => {
    it('should list all installations', async () => {
      const plugin = {
        type: PluginType.PROVIDER,
        metadata: { id: 'inst-test', name: 'Inst', version: '1.0.0', description: '' },
        createProvider: vi.fn()
      } as any;
      await manager.registerPlugin(plugin, 'npm');
      const insts = manager.listInstallations();
      expect(insts).toHaveLength(1);
      expect(insts[0].source).toBe('npm');
    });
  });
});
