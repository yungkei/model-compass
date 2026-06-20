import { ProviderAdapter, AdapterMetadata, AdapterTransformers, AdapterHooks } from '../registry';
import { Provider } from '../../config';
import { ChatCompletionRequest, ChatCompletionResponse } from '../../providers/base';

const metadata: AdapterMetadata = {
  name: 'cohere',
  version: '1.0.0',
  description: 'Cohere API adapter - Command, Generate, and Chat models',
  author: 'model-compass',
  providerTypes: ['cohere']
};

const transformers: AdapterTransformers = {
  buildRequestBody(req, config): unknown {
    const systemMessage = req.messages.find(m => m.role === 'system');
    const chatMessages = req.messages.filter(m => m.role !== 'system');

    const lastMessage = chatMessages[chatMessages.length - 1];
    const chatHistory = chatMessages.slice(0, -1).map(msg => ({
      role: msg.role,
      message: msg.content
    }));

    const body: Record<string, unknown> = {
      model: req.model,
      message: lastMessage?.content || '',
      chat_history: chatHistory,
      stream: req.stream
    };

    if (systemMessage) {
      body.preamble = systemMessage.content;
    }

    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.max_tokens !== undefined) body.max_tokens = req.max_tokens;

    return body;
  },

  transformResponse(response, config): ChatCompletionResponse {
    const resp = response as { text?: string; generation_id?: string; model?: string; finish_reason?: string; meta?: { tokens?: { input_tokens?: number; output_tokens?: number } } };

    return {
      id: resp.generation_id || `cohere-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: resp.model || 'command-r',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: resp.text || ''
        },
        finish_reason: resp.finish_reason || 'stop'
      }],
      usage: {
        prompt_tokens: resp.meta?.tokens?.input_tokens || 0,
        completion_tokens: resp.meta?.tokens?.output_tokens || 0,
        total_tokens: (resp.meta?.tokens?.input_tokens || 0) + (resp.meta?.tokens?.output_tokens || 0)
      }
    };
  },

  buildHeaders(apiKey: string, config: Provider): Record<string, string> {
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Client-Name': 'model-compass'
    };
  },

  buildEndpoint(config: Provider, path: string): string {
    return '/chat';
  }
};

export const cohereAdapter: ProviderAdapter = {
  metadata,
  transformers,
  isCompatible: (providerType: string) => metadata.providerTypes.includes(providerType)
};
