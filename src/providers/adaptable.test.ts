import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockPost = vi.fn();
const mockGet = vi.fn();
const mockOn = vi.fn();

vi.mock('axios', () => ({
  default: {
    create: () => ({
      post: mockPost,
      get: mockGet,
      defaults: { baseURL: 'http://test.test/v1' }
    })
  },
  AxiosError: class extends Error {
    constructor(msg: string, public status?: number) { super(msg); }
  }
}));

const mockAdapter = {
  metadata: { name: 'openai', version: '1.0.0', description: '', providerTypes: ['openai'] },
  transformers: {
    buildRequestBody: vi.fn((req) => req),
    transformResponse: vi.fn((res) => res),
    buildHeaders: vi.fn((key) => ({ Authorization: `Bearer ${key}` })),
    buildEndpoint: vi.fn((config, path) => path)
  },
  hooks: {
    beforeRequest: vi.fn((req) => req),
    afterResponse: vi.fn((res) => res),
    onError: vi.fn(),
    onHealthCheck: vi.fn((status) => status),
    beforeStreamChunk: vi.fn((chunk) => chunk)
  },
  lifecycle: { onInitialize: vi.fn() },
  isCompatible: vi.fn(() => true)
};

const mockConfig = {
  name: 'test-openai',
  type: 'openai',
  api_base_url: 'http://test.test/v1',
  api_key: 'sk-test',
  models: ['gpt-4']
};

vi.mock('./registry', () => ({
  adapterRegistry: {
    getAdapterByType: vi.fn(() => mockAdapter)
  }
}));

import { adapterRegistry } from './registry';
import { AdaptableProvider } from './adaptable';

describe('AdaptableProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with adapter lookup', () => {
      const p = new AdaptableProvider(mockConfig as any);
      expect(adapterRegistry.getAdapterByType).toHaveBeenCalledWith('openai');
      expect(p).toBeDefined();
    });

    it('should call lifecycle onInitialize', () => {
      new AdaptableProvider(mockConfig as any);
      expect(mockAdapter.lifecycle.onInitialize).toHaveBeenCalledWith(mockConfig);
    });

    it('should throw when no adapter found', () => {
      (adapterRegistry.getAdapterByType as any).mockReturnValueOnce(undefined);
      expect(() => new AdaptableProvider(mockConfig as any)).toThrow('No adapter found');
    });
  });

  describe('buildRequestBody', () => {
    it('should call adapter transformers', () => {
      const p = new AdaptableProvider(mockConfig as any);
      const req = { model: 'gpt-4', messages: [{ role: 'user' as const, content: 'hi' }] };
      p.buildRequestBody(req);
      expect(mockAdapter.hooks.beforeRequest).toHaveBeenCalledWith(req, mockConfig);
      expect(mockAdapter.transformers.buildRequestBody).toHaveBeenCalled();
    });
  });

  describe('transformResponse', () => {
    it('should call adapter transformers', () => {
      const p = new AdaptableProvider(mockConfig as any);
      const res = { id: '1', object: 'text', created: 0, model: 'gpt-4', choices: [] };
      p.transformResponse(res);
      expect(mockAdapter.hooks.afterResponse).toHaveBeenCalledWith(res, mockConfig);
      expect(mockAdapter.transformers.transformResponse).toHaveBeenCalled();
    });
  });

  describe('buildHeaders', () => {
    it('should delegate to adapter', () => {
      const p = new AdaptableProvider(mockConfig as any);
      const headers = p.buildHeaders('sk-test123');
      expect(mockAdapter.transformers.buildHeaders).toHaveBeenCalledWith('sk-test123', mockConfig);
      expect(headers.Authorization).toBe('Bearer sk-test123');
    });
  });

  describe('chatCompletion', () => {
    it('should POST to endpoint and transform response', async () => {
      const apiResponse = { data: { id: 'resp-1', object: 'chat.completion', created: 0, model: 'gpt-4', choices: [] } };
      mockPost.mockResolvedValueOnce(apiResponse);

      const p = new AdaptableProvider(mockConfig as any);
      const req = { model: 'gpt-4', messages: [{ role: 'user' as const, content: 'hi' }] };
      const result = await p.chatCompletion(req, 'sk-test');

      expect(mockPost).toHaveBeenCalledWith(
        '/chat/completions',
        req,
        expect.objectContaining({ headers: { Authorization: 'Bearer sk-test' }, validateStatus: expect.any(Function) })
      );
      expect(result.id).toBe('resp-1');
    });

    it('should call onError hook on failure', async () => {
      const error = new Error('Network error');
      mockPost.mockRejectedValueOnce(error);

      const p = new AdaptableProvider(mockConfig as any);
      await expect(p.chatCompletion({ model: 'x', messages: [] }, 'sk-test')).rejects.toThrow('Network error');
      expect(mockAdapter.hooks.onError).toHaveBeenCalled();
    });

    it('should use custom endpoint from buildEndpoint', async () => {
      mockAdapter.transformers.buildEndpoint.mockReturnValueOnce('/v1/messages');
      mockPost.mockResolvedValueOnce({ data: { id: '1', object: 'chat.completion', created: 0, model: 'gpt-4', choices: [] } });

      const p = new AdaptableProvider(mockConfig as any);
      await p.chatCompletion({ model: 'x', messages: [] }, 'sk-test');

      expect(mockPost).toHaveBeenCalledWith('/v1/messages', expect.any(Object), expect.any(Object));
    });
  });

  describe('healthCheck', () => {
    it('should return true on success and update status', async () => {
      mockGet.mockResolvedValueOnce({ data: { models: [] } });
      const p = new AdaptableProvider(mockConfig as any);
      const result = await p.healthCheck();
      expect(result).toBe(true);
      expect(p.status.online).toBe(true);
      expect(mockGet).toHaveBeenCalledWith('/models', expect.objectContaining({ timeout: 5000, validateStatus: expect.any(Function) }));
    });

    it('should return false on failure and update status', async () => {
      mockGet.mockRejectedValueOnce(new Error('timeout'));
      const p = new AdaptableProvider(mockConfig as any);
      const result = await p.healthCheck();
      expect(result).toBe(false);
      expect(p.status.online).toBe(false);
    });

    it('should call onHealthCheck hook', async () => {
      mockGet.mockResolvedValueOnce({ data: { models: [] } });
      const p = new AdaptableProvider(mockConfig as any);
      await p.healthCheck();
      expect(mockAdapter.hooks.onHealthCheck).toHaveBeenCalled();
    });
  });

  describe('chatCompletionStream', () => {
    async function createStreamTest() {
      const eventHandlers: Record<string, Function> = {};
      const mockStream = { on: vi.fn((e: string, h: Function) => { eventHandlers[e] = h; }) };
      mockPost.mockResolvedValueOnce({ data: mockStream });
      return eventHandlers;
    }

    it('should process SSE chunks', async () => {
      const eventHandlers = await createStreamTest();
      const p = new AdaptableProvider(mockConfig as any);
      const onChunk = vi.fn();
      const promise = p.chatCompletionStream({ model: 'x', messages: [], stream: true }, 'sk-test', onChunk);

      await Promise.resolve();
      eventHandlers['data'](Buffer.from('data: {"id":"1"}\n\n'));
      eventHandlers['data'](Buffer.from('data: [DONE]\n\n'));

      await promise;
      expect(onChunk).toHaveBeenCalledWith({ id: '1' });
      expect(mockPost).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({ stream: true }),
        expect.objectContaining({ responseType: 'stream' })
      );
    });

    it('should reject on stream error', async () => {
      const eventHandlers = await createStreamTest();
      const p = new AdaptableProvider(mockConfig as any);
      const promise = p.chatCompletionStream({ model: 'x', messages: [] }, 'sk-test', vi.fn());

      await Promise.resolve();
      eventHandlers['error'](new Error('Stream broken'));
      await expect(promise).rejects.toThrow('Stream broken');
    });

    it('should fire timeout when exceeded', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      const eventHandlers = await createStreamTest();
      const p = new AdaptableProvider(mockConfig as any);
      const onTimeout = vi.fn();
      const promise = p.chatCompletionStream({ model: 'x', messages: [] }, 'sk-test', vi.fn(), { timeout: 10, onTimeout });

      await Promise.resolve();
      vi.advanceTimersByTime(20);
      eventHandlers['data'](Buffer.from('data: {"id":"1"}\n\n'));

      expect(onTimeout).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });
});
