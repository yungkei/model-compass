import { describe, it, expect } from 'vitest';
import { openaiAdapter } from './openai';
import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';
import { ollamaAdapter } from './ollama';
import { BUILTIN_ADAPTERS } from './index';

const request = {
  model: 'gpt-4',
  messages: [{ role: 'user' as const, content: 'Hello' }],
  temperature: 0.7,
  max_tokens: 100
};

const config = { name: 'test', type: 'openai', api_base_url: 'http://localhost:8000/v1', api_key: 'sk-test', models: ['gpt-4'] };

describe('openaiAdapter', () => {
  it('should have correct metadata', () => {
    expect(openaiAdapter.metadata.name).toBe('openai');
    expect(openaiAdapter.metadata.version).toBe('1.0.0');
    expect(openaiAdapter.metadata.providerTypes).toContain('openai');
    expect(openaiAdapter.metadata.providerTypes).toContain('openrouter');
  });

  it('should build request body', () => {
    const body = openaiAdapter.transformers.buildRequestBody(request, config as any) as any;
    expect(body.model).toBe('gpt-4');
    expect(body.messages).toHaveLength(1);
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(100);
    expect(body.stream).toBeUndefined();
  });

  it('should apply model mapping', () => {
    const cfg = { ...config, modelMapping: { 'gpt-4': 'gpt-4-32k' } };
    const body = openaiAdapter.transformers.buildRequestBody(request, cfg as any) as any;
    expect(body.model).toBe('gpt-4-32k');
  });

  it('should build headers', () => {
    const headers = openaiAdapter.transformers.buildHeaders('sk-test', config as any);
    expect(headers.Authorization).toBe('Bearer sk-test');
  });

  it('should add openrouter-specific headers', () => {
    const cfg = { ...config, type: 'openrouter' as const };
    const headers = openaiAdapter.transformers.buildHeaders('sk-test', cfg as any);
    expect(headers['HTTP-Referer']).toBe('https://model-compass.ai');
    expect(headers['X-Title']).toBe('Model Compass');
  });

  it('should check compatibility', () => {
    expect(openaiAdapter.isCompatible('openai')).toBe(true);
    expect(openaiAdapter.isCompatible('openrouter')).toBe(true);
    expect(openaiAdapter.isCompatible('deepseek')).toBe(true);
    expect(openaiAdapter.isCompatible('anthropic')).toBe(false);
  });

  it('should passthrough transformResponse', () => {
    const response = { id: '1', object: 'text', created: 0, model: 'gpt-4', choices: [] };
    expect(openaiAdapter.transformers.transformResponse(response, config as any)).toBe(response);
  });
});

describe('anthropicAdapter', () => {
  it('should have correct metadata', () => {
    expect(anthropicAdapter.metadata.name).toBe('anthropic');
    expect(anthropicAdapter.metadata.providerTypes).toEqual(['anthropic', 'claude']);
  });

  it('should build request body with system message filtered', () => {
    const req = {
      ...request,
      messages: [
        { role: 'system' as const, content: 'Be helpful' },
        { role: 'user' as const, content: 'Hello' }
      ]
    };
    const body = anthropicAdapter.transformers.buildRequestBody(req, { ...config, type: 'anthropic' } as any) as any;
    expect(body.model).toBe('gpt-4');
    expect(body.max_tokens).toBe(100);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe('user');
  });

  it('should build headers', () => {
    const headers = anthropicAdapter.transformers.buildHeaders('sk-ant-test', config as any);
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('should build endpoint', () => {
    const ep = anthropicAdapter.transformers.buildEndpoint!(config as any, '/chat/completions');
    expect(ep).toBe('/v1/messages');
  });

  it('should transform response from Anthropic format', () => {
    const anthropicResponse = {
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello!' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 }
    };
    const result = anthropicAdapter.transformers.transformResponse(anthropicResponse, { ...config, models: ['claude-3-sonnet'] } as any);
    expect(result.choices[0].message.content).toBe('Hello!');
    expect(result.usage?.prompt_tokens).toBe(10);
    expect(result.usage?.completion_tokens).toBe(5);
  });
});

describe('geminiAdapter', () => {
  it('should have correct metadata', () => {
    expect(geminiAdapter.metadata.name).toBe('gemini');
    expect(geminiAdapter.metadata.providerTypes).toEqual(['gemini', 'google']);
  });

  it('should build request body', () => {
    const body = geminiAdapter.transformers.buildRequestBody(request, { ...config, type: 'gemini' } as any) as any;
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0].role).toBe('user');
    expect(body.contents[0].parts[0].text).toBe('Hello');
    expect(body.generationConfig.temperature).toBe(0.7);
    expect(body.generationConfig.maxOutputTokens).toBe(100);
  });

  it('should map assistant role to model', () => {
    const req = {
      ...request,
      messages: [
        { role: 'assistant' as const, content: 'Sure!' }
      ]
    };
    const body = geminiAdapter.transformers.buildRequestBody(req, { ...config, type: 'gemini' } as any) as any;
    expect(body.contents[0].role).toBe('model');
  });

  it('should transform response from Gemini format', () => {
    const geminiResponse = {
      candidates: [{ content: { parts: [{ text: 'Hi there' }] } }],
      promptTokenCount: 15,
      candidatesTokenCount: 3
    };
    const result = geminiAdapter.transformers.transformResponse(geminiResponse, { ...config, models: ['gemini-pro'] } as any);
    expect(result.choices[0].message.content).toBe('Hi there');
    expect(result.usage?.prompt_tokens).toBe(15);
    expect(result.usage?.completion_tokens).toBe(3);
  });

  it('should build headers', () => {
    const headers = geminiAdapter.transformers.buildHeaders('AIza-test', config as any);
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('should build endpoint', () => {
    const cfg = { ...config, models: ['gemini-2.0-flash'] };
    const ep = geminiAdapter.transformers.buildEndpoint!(cfg as any, '');
    expect(ep).toContain('/models/gemini-2.0-flash');
    expect(ep).toContain(':generateContent');
  });

  it('should have beforeRequest hook', () => {
    expect(geminiAdapter.hooks?.beforeRequest).toBeDefined();
    const req = { ...request, _apiKey: '' };
    const result = geminiAdapter.hooks!.beforeRequest!(req, { ...config, api_key: 'AIza-test' } as any);
    expect((result as any)._apiKey).toBe('AIza-test');
  });
});

describe('ollamaAdapter', () => {
  it('should have correct metadata', () => {
    expect(ollamaAdapter.metadata.name).toBe('ollama');
    expect(ollamaAdapter.metadata.providerTypes).toEqual(['ollama']);
  });

  it('should build request body', () => {
    const body = ollamaAdapter.transformers.buildRequestBody(request, { ...config, type: 'ollama' } as any) as any;
    expect(body.model).toBe('gpt-4');
    expect(body.messages).toHaveLength(1);
    expect(body.options.temperature).toBe(0.7);
    expect(body.options.num_predict).toBe(100);
  });

  it('should strip tag from model name', () => {
    const req = { ...request, model: 'llama3:70b' };
    const body = ollamaAdapter.transformers.buildRequestBody(req, { ...config, type: 'ollama' } as any) as any;
    expect(body.model).toBe('llama3');
  });

  it('should transform response from Ollama format', () => {
    const ollamaResponse = { message: { content: 'Hello!' }, model: 'llama3', done: true };
    const result = ollamaAdapter.transformers.transformResponse(ollamaResponse, config as any);
    expect(result.choices[0].message.content).toBe('Hello!');
    expect(result.choices[0].finish_reason).toBe('stop');
    expect(result.model).toBe('llama3');
  });

  it('should build headers with api key', () => {
    const headers = ollamaAdapter.transformers.buildHeaders('sk-test', config as any);
    expect(headers.Authorization).toBe('Bearer sk-test');
  });

  it('should return empty headers for default key', () => {
    const headers = ollamaAdapter.transformers.buildHeaders('ollama', config as any);
    expect(Object.keys(headers)).toHaveLength(0);
  });
});

describe('BUILTIN_ADAPTERS', () => {
  it('should include all 4 adapters', () => {
    expect(BUILTIN_ADAPTERS).toHaveLength(4);
    const names = BUILTIN_ADAPTERS.map(a => a.metadata.name);
    expect(names).toContain('openai');
    expect(names).toContain('anthropic');
    expect(names).toContain('gemini');
    expect(names).toContain('ollama');
  });

  it('each adapter should have required fields', () => {
    for (const adapter of BUILTIN_ADAPTERS) {
      expect(adapter.metadata.name).toBeTruthy();
      expect(adapter.metadata.version).toBeTruthy();
      expect(typeof adapter.metadata.description).toBe('string');
      expect(typeof adapter.transformers.buildRequestBody).toBe('function');
      expect(typeof adapter.transformers.transformResponse).toBe('function');
      expect(typeof adapter.transformers.buildHeaders).toBe('function');
      expect(typeof adapter.isCompatible).toBe('function');
    }
  });
});
