import { describe, it, expect } from 'vitest';
import type { PluginManifest, MarketplaceRegistry } from './marketplace';

describe('PluginManifest', () => {
  it('should have required fields', () => {
    const plugin: PluginManifest = {
      id: 'claude',
      name: 'Claude Code',
      type: 'claude-code',
      description: 'Anthropic Claude Code adapter',
      version: '1.0.0',
      author: 'Model Compass Team',
      tags: ['claude', 'anthropic']
    };

    expect(plugin.id).toBe('claude');
    expect(plugin.name).toBe('Claude Code');
    expect(plugin.type).toBe('claude-code');
    expect(plugin.version).toBe('1.0.0');
    expect(plugin.author).toBe('Model Compass Team');
    expect(plugin.tags).toContain('claude');
  });

  it('should support builtin flag', () => {
    const plugin: PluginManifest = {
      id: 'claude',
      name: 'Claude Code',
      type: 'claude-code',
      description: 'Test',
      version: '1.0.0',
      author: 'Test',
      tags: [],
      builtin: true
    };

    expect(plugin.builtin).toBe(true);
  });

  it('should support envVars', () => {
    const plugin: PluginManifest = {
      id: 'claude',
      name: 'Claude Code',
      type: 'claude-code',
      description: 'Test',
      version: '1.0.0',
      author: 'Test',
      tags: [],
      envVars: {
        ANTHROPIC_BASE_URL: 'http://localhost:8765/v1',
        ANTHROPIC_API_KEY: 'sk-dummy'
      }
    };

    expect(plugin.envVars?.ANTHROPIC_BASE_URL).toBe('http://localhost:8765/v1');
  });

  it('should support configFiles with merge option', () => {
    const plugin: PluginManifest = {
      id: 'claude',
      name: 'Claude Code',
      type: 'claude-code',
      description: 'Test',
      version: '1.0.0',
      author: 'Test',
      tags: [],
      configFiles: [
        {
          path: '~/.claude/settings.json',
          template: { env: {} },
          merge: true
        }
      ]
    };

    expect(plugin.configFiles?.[0].merge).toBe(true);
  });

  it('should support adapter entry for complex plugins', () => {
    const plugin: PluginManifest = {
      id: 'custom',
      name: 'Custom',
      type: 'custom',
      description: 'Test',
      version: '1.0.0',
      author: 'Test',
      tags: [],
      adapter: {
        entry: './src/index.js',
        type: 'file'
      }
    };

    expect(plugin.adapter?.type).toBe('file');
    expect(plugin.adapter?.entry).toBe('./src/index.js');
  });

  it('should support dependencies', () => {
    const plugin: PluginManifest = {
      id: 'custom',
      name: 'Custom',
      type: 'custom',
      description: 'Test',
      version: '1.0.0',
      author: 'Test',
      tags: [],
      dependencies: ['axios', 'express']
    };

    expect(plugin.dependencies).toContain('axios');
    expect(plugin.dependencies).toContain('express');
  });

  it('should support hooks', () => {
    const plugin: PluginManifest = {
      id: 'custom',
      name: 'Custom',
      type: 'custom',
      description: 'Test',
      version: '1.0.0',
      author: 'Test',
      tags: [],
      hooks: {
        preInstall: './scripts/pre-install.sh',
        postInstall: './scripts/post-install.sh'
      }
    };

    expect(plugin.hooks?.preInstall).toBe('./scripts/pre-install.sh');
    expect(plugin.hooks?.postInstall).toBe('./scripts/post-install.sh');
  });
});

describe('MarketplaceRegistry', () => {
  it('should have valid structure', () => {
    const registry: MarketplaceRegistry = {
      name: 'Test Marketplace',
      description: 'Test description',
      version: '1.0.0',
      plugins: [
        {
          id: 'plugin1',
          name: 'Plugin 1',
          type: 'custom',
          description: 'Test plugin',
          version: '1.0.0',
          author: 'Test',
          tags: ['test']
        }
      ]
    };

    expect(registry.name).toBe('Test Marketplace');
    expect(registry.plugins).toHaveLength(1);
    expect(registry.plugins[0].id).toBe('plugin1');
  });
});