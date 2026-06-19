import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { 
  loadConfig, 
  getConfig, 
  updateConfig, 
  saveConfig,
  Config,
  Provider,
  RouterConfig,
  DEFAULT_CONFIG
} from './index';

describe('Config Module', () => {
  const testConfigDir = path.join(process.cwd(), '.test-config');
  const testConfigPath = path.join(testConfigDir, 'config.json');

  beforeEach(() => {
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }
    vi.stubEnv('HOME', testConfigDir);
    updateConfig(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
  });

  afterEach(() => {
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true });
    }
    vi.unstubAllEnvs();
    updateConfig(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have default server config', () => {
      const config = getConfig();
      expect(config.server.host).toBe('0.0.0.0');
      expect(config.server.port).toBe(8765);
      expect(config.server.timeout).toBe(600000);
    });

    it('should have default smart routing config', () => {
      const config = getConfig();
      expect(config.smartRouting.enabled).toBe(true);
      expect(config.smartRouting.autoSwitch.enabled).toBe(true);
      expect(config.smartRouting.autoSwitch.retryableErrors).toContain(429);
      expect(config.smartRouting.autoSwitch.retryableErrors).toContain(500);
      expect(config.smartRouting.autoSwitch.maxRetries).toBe(3);
    });

    it('should have default plugins config', () => {
      const config = getConfig();
      expect(config.plugins.claudeCode?.enabled).toBe(true);
      expect(config.plugins.opencode?.enabled).toBe(true);
    });
  });

  describe('loadConfig', () => {
    it('should load config from file', () => {
      const testConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      testConfig.server.port = 3000;
      testConfig.server.host = 'localhost';
      testConfig.router.default = 'openrouter,claude-3.5-sonnet';

      fs.writeFileSync(testConfigPath, JSON.stringify(testConfig));
      loadConfig(testConfigPath);

      const config = getConfig();
      expect(config.server.port).toBe(3000);
      expect(config.server.host).toBe('localhost');
      expect(config.router.default).toBe('openrouter,claude-3.5-sonnet');
    });

    it('should handle missing config file', () => {
      const config = loadConfig('/nonexistent/config.json');
      expect(config.server.port).toBe(8765);
    });
  });

  describe('updateConfig', () => {
    it('should update config values', () => {
      const config = getConfig();
      config.server.port = 4000;
      updateConfig(config);
      
      const updated = getConfig();
      expect(updated.server.port).toBe(4000);
    });
  });

  describe('Provider Interface', () => {
    it('should validate provider structure', () => {
      const provider: Provider = {
        name: 'openrouter',
        type: 'openai',
        api_base_url: 'https://openrouter.ai/api/v1',
        api_key: 'sk-test',
        models: ['claude-3.5-sonnet', 'gpt-4']
      };

      expect(provider.name).toBe('openrouter');
      expect(provider.type).toBe('openai');
      expect(provider.models).toHaveLength(2);
    });

    it('should support fallback chain', () => {
      const provider: Provider = {
        name: 'openrouter',
        type: 'openai',
        api_base_url: 'https://openrouter.ai/api/v1',
        api_key: 'sk-test',
        models: ['claude-3.5-sonnet'],
        fallback: ['deepseek', 'ollama']
      };

      expect(provider.fallback).toHaveLength(2);
      expect(provider.fallback).toContain('deepseek');
    });

    it('should support priority and weight', () => {
      const provider: Provider = {
        name: 'openrouter',
        type: 'openai',
        api_base_url: 'https://openrouter.ai/api/v1',
        api_key: 'sk-test',
        models: ['claude-3.5-sonnet'],
        priority: 1,
        weight: 100
      };

      expect(provider.priority).toBe(1);
      expect(provider.weight).toBe(100);
    });
  });

  describe('RouterConfig Interface', () => {
    it('should support all routing scenarios', () => {
      const router: RouterConfig = {
        default: 'openrouter,claude-3.5-sonnet',
        background: 'openrouter,haiku',
        think: 'deepseek,deepseek-chat',
        longContext: 'openrouter,claude-3-5-sonnet-200k',
        longContextThreshold: 60000,
        webSearch: 'openrouter,gemini-pro',
        image: 'openrouter,claude-3-sonnet'
      };

      expect(router.default).toBe('openrouter,claude-3.5-sonnet');
      expect(router.background).toBe('openrouter,haiku');
      expect(router.think).toBe('deepseek,deepseek-chat');
      expect(router.longContext).toBeDefined();
      expect(router.image).toBeDefined();
    });
  });
});