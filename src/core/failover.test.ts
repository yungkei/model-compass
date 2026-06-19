import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FailoverManager, ErrorClassification, FailoverResult } from './failover';
import { loadConfig, updateConfig, Config, DEFAULT_CONFIG } from '../config';

describe('FailoverManager', () => {
  let manager: FailoverManager;

  beforeEach(() => {
    loadConfig();
    manager = new FailoverManager();
  });

  describe('classifyError', () => {
    it('should classify 429 as retryable', () => {
      const result = manager.classifyError(429, 'Rate limit exceeded');
      
      expect(result.retryable).toBe(true);
      expect(result.cooldownSeconds).toBeGreaterThan(0);
    });

    it('should classify 500 as retryable', () => {
      const result = manager.classifyError(500, 'Internal Server Error');
      
      expect(result.retryable).toBe(true);
    });

    it('should classify 502 as retryable', () => {
      const result = manager.classifyError(502, 'Bad Gateway');
      
      expect(result.retryable).toBe(true);
    });

    it('should classify 503 as retryable', () => {
      const result = manager.classifyError(503, 'Service Unavailable');
      
      expect(result.retryable).toBe(true);
    });

    it('should classify 504 as retryable', () => {
      const result = manager.classifyError(504, 'Gateway Timeout');
      
      expect(result.retryable).toBe(true);
    });

    it('should classify 404 as non-retryable', () => {
      const result = manager.classifyError(404, 'Not Found');
      
      expect(result.retryable).toBe(false);
    });

    it('should classify 401 as non-retryable', () => {
      const result = manager.classifyError(401, 'Unauthorized');
      
      expect(result.retryable).toBe(false);
    });

    it('should classify 403 as non-retryable', () => {
      const result = manager.classifyError(403, 'Forbidden');
      
      expect(result.retryable).toBe(false);
    });

    it('should detect rate limit in error message', () => {
      const result = manager.classifyError(200, 'Rate limit exceeded');
      
      expect(result.retryable).toBe(true);
      expect(result.message).toBe('Rate limit exceeded');
    });

    it('should detect timeout in error message', () => {
      const result = manager.classifyError(200, 'Request timeout');
      
      expect(result.retryable).toBe(true);
      expect(result.message).toBe('Request timeout');
    });

    it('should detect ETIMEDOUT in error message', () => {
      const result = manager.classifyError(200, 'connect ETIMEDOUT');
      
      expect(result.retryable).toBe(true);
      expect(result.message).toBe('Request timeout');
    });

    it('should handle disabled auto switch', () => {
      const testConfig: Partial<Config> = {
        smartRouting: {
          enabled: true,
          autoSwitch: {
            enabled: false,
            retryableErrors: [429, 500],
            maxRetries: 3,
            retryDelay: 1000,
            cooldownSeconds: 60,
            fallbackChain: []
          }
        }
      };
      updateConfig(testConfig as any);

      const result = manager.classifyError(500, 'Server Error');
      
      expect(result.retryable).toBe(false);
      expect(result.message).toBe('Auto switch disabled');
    });
  });

  describe('ErrorClassification Interface', () => {
    it('should have required properties', () => {
      const classification: ErrorClassification = {
        retryable: true,
        cooldownSeconds: 60,
        message: 'Test error'
      };

      expect(classification.retryable).toBe(true);
      expect(classification.cooldownSeconds).toBe(60);
      expect(classification.message).toBe('Test error');
    });
  });

  describe('FailoverResult Interface', () => {
    it('should represent successful failover', () => {
      const result: FailoverResult = {
        success: true,
        provider: 'openrouter',
        model: 'claude-3.5-sonnet',
        response: { data: 'test' },
        attempts: 1
      };

      expect(result.success).toBe(true);
      expect(result.provider).toBe('openrouter');
      expect(result.attempts).toBe(1);
    });

    it('should represent failed failover', () => {
      const result: FailoverResult = {
        success: false,
        provider: 'openrouter',
        model: 'claude-3.5-sonnet',
        error: 'All providers failed',
        attempts: 3
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('All providers failed');
      expect(result.attempts).toBe(3);
    });
  });

  describe('Retryable Error Detection', () => {
    it('should detect rate limit in error message', () => {
      const result = manager.classifyError(200, 'rate limit exceeded');
      
      expect(result.retryable).toBe(true);
      expect(result.message).toBe('Rate limit exceeded');
    });

    it('should detect timeout in error message', () => {
      const result = manager.classifyError(200, 'request timeout');
      
      expect(result.retryable).toBe(true);
      expect(result.message).toBe('Request timeout');
    });

    it('should detect ETIMEDOUT in error message', () => {
      const result = manager.classifyError(200, 'connect ETIMEDOUT');
      
      expect(result.retryable).toBe(true);
    });
  });
});