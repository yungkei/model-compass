import { describe, it, expect } from 'vitest';
import {
  buildLaunchArgs,
  buildLaunchEnv,
  createLaunchContext,
  getInjectedEnv,
  getLaunchStrategy,
  maskEnv
} from './launch';

describe('Launch Strategies', () => {
  describe('getLaunchStrategy', () => {
    it('should return env strategy for claude-code', () => {
      const strategy = getLaunchStrategy('claude-code');
      expect(strategy.mode).toBe('env');
      expect(strategy.env).toBeDefined();
    });

    it('should return env strategy for opencode', () => {
      const strategy = getLaunchStrategy('opencode');
      expect(strategy.mode).toBe('env');
    });

    it('should return config-file strategy for MCP based IDEs', () => {
      expect(getLaunchStrategy('cursor').mode).toBe('config-file');
      expect(getLaunchStrategy('windsurf').mode).toBe('config-file');
    });

    it('should fall back to generic env strategy for unknown types', () => {
      const strategy = getLaunchStrategy('totally-unknown');
      expect(strategy.mode).toBe('env');
      expect(strategy.id).toBe('generic');
    });
  });

  describe('getInjectedEnv', () => {
    it('should inject ANTHROPIC_* variables for claude-code', () => {
      const env = getInjectedEnv('claude-code', createLaunchContext());
      expect(env.ANTHROPIC_BASE_URL).toBeDefined();
      expect(env.ANTHROPIC_API_KEY).toBeDefined();
      expect(env.ANTHROPIC_MODEL).toBeDefined();
    });

    it('should inject OPENCODE_CONFIG_CONTENT for opencode', () => {
      const env = getInjectedEnv('opencode', createLaunchContext());
      expect(env.OPENCODE_CONFIG_CONTENT).toBeDefined();

      const parsed = JSON.parse(env.OPENCODE_CONFIG_CONTENT);
      expect(parsed.provider['model-compass']).toBeDefined();
      expect(parsed.provider['model-compass'].options.baseURL).toBeDefined();
    });

    it('should always inject the common MC variables', () => {
      const env = getInjectedEnv('claude-code', createLaunchContext());
      expect(env.MC_BASE_URL).toBeDefined();
      expect(env.MC_API_KEY).toBeDefined();
      expect(env.MC_MODEL).toBeDefined();
    });
  });

  describe('buildLaunchEnv', () => {
    it('should keep the parent process environment intact', () => {
      const before = { ...process.env };
      const env = buildLaunchEnv('claude-code');

      expect(process.env).toEqual(before);
      expect(env.ANTHROPIC_BASE_URL).toBeDefined();
    });

    it('should allow overrides', () => {
      const env = buildLaunchEnv('claude-code', { ANTHROPIC_BASE_URL: 'http://custom:1234/v1' });
      expect(env.ANTHROPIC_BASE_URL).toBe('http://custom:1234/v1');
    });
  });

  describe('buildLaunchArgs', () => {
    it('should append base args without mutating them', () => {
      const base = ['--foo'];
      const args = buildLaunchArgs('claude-code', base);

      expect(args[0]).toBe('--foo');
      expect(base).toEqual(['--foo']);
    });
  });

  describe('maskEnv', () => {
    it('should mask secret-looking variables', () => {
      const masked = maskEnv({ ANTHROPIC_API_KEY: 'sk-1234567890abcdef', OTHER: 'plain' });

      expect(masked.ANTHROPIC_API_KEY).not.toBe('sk-1234567890abcdef');
      expect(masked.ANTHROPIC_API_KEY).toContain('****');
      expect(masked.OTHER).toBe('plain');
    });
  });
});
