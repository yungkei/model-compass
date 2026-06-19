import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('AgentAdapter Interface', () => {
  it('should have required fields', () => {
    const adapter = {
      id: 'test-adapter',
      name: 'Test Adapter',
      type: 'custom',
      description: 'Test description',
      version: '1.0.0'
    };

    expect(adapter.id).toBe('test-adapter');
    expect(adapter.name).toBe('Test Adapter');
    expect(adapter.type).toBe('custom');
    expect(adapter.description).toBe('Test description');
    expect(adapter.version).toBe('1.0.0');
  });

  it('should support optional configFiles', () => {
    const adapter = {
      id: 'test',
      name: 'Test',
      type: 'custom',
      description: 'Test',
      version: '1.0.0',
      configFiles: [
        {
          path: '~/.test/config.json',
          template: { key: 'value' },
          merge: true
        }
      ]
    };

    expect(adapter.configFiles).toHaveLength(1);
    expect(adapter.configFiles?.[0].merge).toBe(true);
  });

  it('should support optional envVars', () => {
    const adapter = {
      id: 'test',
      name: 'Test',
      type: 'custom',
      description: 'Test',
      version: '1.0.0',
      envVars: {
        API_URL: 'http://localhost:8765/v1',
        API_KEY: 'sk-test'
      }
    };

    expect(adapter.envVars?.API_URL).toBe('http://localhost:8765/v1');
  });

  it('should support lifecycle hooks', () => {
    const onInstall = vi.fn();
    const onActivate = vi.fn();

    const adapter = {
      id: 'test',
      name: 'Test',
      type: 'custom',
      description: 'Test',
      version: '1.0.0',
      onInstall,
      onActivate
    };

    expect(typeof adapter.onInstall).toBe('function');
    expect(typeof adapter.onActivate).toBe('function');
  });
});

describe('AdapterContext', () => {
  it('should have required fields', () => {
    const context = {
      homeDir: '/home/user',
      configDir: '/home/user/.model-compass',
      port: 3456
    };

    expect(context.homeDir).toBe('/home/user');
    expect(context.configDir).toBe('/home/user/.model-compass');
    expect(context.port).toBe(3456);
  });
});