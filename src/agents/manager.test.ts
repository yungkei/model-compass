import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { AdapterManager } from './manager';
import { AgentAdapter, createAdapterContext } from './types';

describe('AdapterManager', () => {
  let manager: AdapterManager;
  let testAdapterDir: string;
  let testInstalledPath: string;

  beforeEach(() => {
    testAdapterDir = path.join(process.cwd(), '.test-model-compass', 'adapters');
    testInstalledPath = path.join(process.cwd(), '.test-model-compass', 'adapters.json');
    
    if (!fs.existsSync(testAdapterDir)) {
      fs.mkdirSync(testAdapterDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testAdapterDir)) {
      fs.rmSync(testAdapterDir, { recursive: true });
    }
    if (fs.existsSync(testInstalledPath)) {
      fs.unlinkSync(testInstalledPath);
    }
  });

  describe('getInstalled', () => {
    it('should return empty array when no adapters installed', () => {
      const manager = new AdapterManager();
      const installed = manager.getInstalled();
      expect(Array.isArray(installed)).toBe(true);
    });
  });

  describe('isInstalled', () => {
    it('should return false for non-installed adapter', () => {
      const manager = new AdapterManager();
      expect(manager.isInstalled('nonexistent')).toBe(false);
    });
  });

  describe('getAdapter', () => {
    it('should return undefined for unknown adapter', () => {
      const manager = new AdapterManager();
      expect(manager.getAdapter('unknown-adapter')).toBeUndefined();
    });

    it('should return built-in adapters', () => {
      const manager = new AdapterManager();
      const claude = manager.getAdapter('claude');
      const opencode = manager.getAdapter('opencode');
      const cursor = manager.getAdapter('cursor');

      expect(claude).toBeDefined();
      expect(claude?.id).toBe('claude');
      expect(opencode).toBeDefined();
      expect(opencode?.id).toBe('opencode');
      expect(cursor).toBeDefined();
      expect(cursor?.id).toBe('cursor');
    });
  });

  describe('getAllAdapters', () => {
    it('should return array of all adapters', () => {
      const manager = new AdapterManager();
      const all = manager.getAllAdapters();

      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThan(0);
      
      const ids = all.map(a => a.id);
      expect(ids).toContain('claude');
      expect(ids).toContain('opencode');
      expect(ids).toContain('cursor');
    });
  });
});

describe('createAdapterContext', () => {
  it('should create context with default port', () => {
    const context = createAdapterContext();
    expect(context.port).toBe(3456);
    expect(context.homeDir).toBeDefined();
    expect(context.configDir).toBeDefined();
  });

  it('should use custom port when provided', () => {
    const context = createAdapterContext(3000);
    expect(context.port).toBe(3000);
  });

  it('should include .model-compass in configDir', () => {
    const context = createAdapterContext();
    expect(context.configDir).toContain('.model-compass');
  });
});

describe('Adapter Installation Flow', () => {
  it('should install adapter and add to installed list', async () => {
    const manager = new AdapterManager();
    
    const testAdapter: AgentAdapter = {
      id: 'test-install',
      name: 'Test Install',
      type: 'custom',
      description: 'Test adapter for installation',
      version: '1.0.0'
    };

    await manager.install('claude', testAdapter);
    
    expect(manager.isInstalled('claude')).toBe(true);
  });

  it('should not install already installed adapter', async () => {
    const manager = new AdapterManager();
    
    await manager.install('claude');
    const result = await manager.install('claude');
    
    expect(result).toBeUndefined();
  });
});