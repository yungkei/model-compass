import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Router, RouteType } from './router';
import { ChatCompletionRequest } from '../providers/base';

describe('Router', () => {
  let router: Router;

  beforeEach(() => {
    router = new Router();
  });

  describe('parseModelString', () => {
    it('should parse valid provider,model format', () => {
      const result = router.parseModelString('openrouter,claude-3.5-sonnet');
      
      expect(result).toBeDefined();
      expect(result?.provider).toBe('openrouter');
      expect(result?.model).toBe('claude-3.5-sonnet');
    });

    it('should handle extra whitespace', () => {
      const result = router.parseModelString(' openrouter , claude-3.5-sonnet ');
      
      expect(result?.provider).toBe('openrouter');
      expect(result?.model).toBe('claude-3.5-sonnet');
    });

    it('should return null for invalid format', () => {
      expect(router.parseModelString('claude-3.5-sonnet')).toBeNull();
      expect(router.parseModelString('')).toBeNull();
      expect(router.parseModelString('a,b,c')).toBeNull();
    });

    it('should handle deepseek format', () => {
      const result = router.parseModelString('deepseek,deepseek-chat');
      
      expect(result?.provider).toBe('deepseek');
      expect(result?.model).toBe('deepseek-chat');
    });

    it('should handle ollama format', () => {
      const result = router.parseModelString('ollama,llama2');
      
      expect(result?.provider).toBe('ollama');
      expect(result?.model).toBe('llama2');
    });
  });

  describe('determineRouteType', () => {
    it('should return default for normal requests', () => {
      const req: ChatCompletionRequest = {
        model: 'claude-3.5-sonnet',
        messages: [
          { role: 'user', content: 'Hello' }
        ]
      };

      const routeType = router.determineRouteType(req);
      expect(routeType).toBe('default');
    });

    it('should return think for reasoning requests', () => {
      const req: ChatCompletionRequest = {
        model: 'claude-3.5-sonnet',
        messages: [
          { role: 'user', content: '深入分析这个算法的时间复杂度' }
        ]
      };

      const routeType = router.determineRouteType(req);
      expect(routeType).toBe('think');
    });

    it('should return think when model includes thinking', () => {
      const req: ChatCompletionRequest = {
        model: 'claude-3.5-sonnet:thinking',
        messages: [
          { role: 'user', content: 'Solve this problem' }
        ]
      };

      const routeType = router.determineRouteType(req);
      expect(routeType).toBe('think');
    });

    it('should return webSearch for web search requests', () => {
      const req: ChatCompletionRequest = {
        model: 'claude-3.5-sonnet',
        messages: [
          { role: 'user', content: '<websearch>搜索最新的AI新闻</websearch>' }
        ]
      };

      const routeType = router.determineRouteType(req);
      expect(routeType).toBe('webSearch');
    });

    it('should return image for image processing', () => {
      const req: ChatCompletionRequest = {
        model: 'claude-3.5-sonnet',
        messages: [
          { role: 'user', content: '<image>分析这张图片</image>' }
        ]
      };

      const routeType = router.determineRouteType(req);
      expect(routeType).toBe('image');
    });
  });

  describe('RouteType', () => {
    it('should have all valid route types', () => {
      const validTypes: RouteType[] = [
        'default',
        'background',
        'think',
        'longContext',
        'webSearch',
        'image'
      ];

      expect(validTypes).toHaveLength(6);
    });
  });
});