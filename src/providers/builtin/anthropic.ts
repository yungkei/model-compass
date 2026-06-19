import { ProviderAdapter, AdapterMetadata, AdapterTransformers } from '../registry';
import { Provider } from '../../config';
import { ChatCompletionRequest, ChatCompletionResponse } from '../../providers/base';

const metadata: AdapterMetadata = {
  name: 'anthropic',
  version: '1.0.0',
  description: 'Anthropic Claude API adapter',
  author: 'model-compass',
  providerTypes: ['anthropic', 'claude']
};

const transformers: AdapterTransformers = {
  buildRequestBody(req: ChatCompletionRequest, config: Provider): unknown {
    return {
      model: req.model,
      max_tokens: req.max_tokens || 4096,
      messages: req.messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role,
        content: m.content
      })),
      temperature: req.temperature,
      stream: req.stream
    };
  },

  transformResponse(response: unknown, config: Provider): ChatCompletionResponse {
    const resp = response as { id: string; type: string; role: string; content: Array<{ type: string; text?: string }>; stop_reason?: string; usage?: { input_tokens: number; output_tokens: number } };
    
    return {
      id: resp.id || `anthropic-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: (config as any).models?.[0] || 'claude-3-sonnet',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: resp.content?.[0]?.text || ''
        },
        finish_reason: resp.stop_reason || 'stop'
      }],
      usage: {
        prompt_tokens: resp.usage?.input_tokens || 0,
        completion_tokens: resp.usage?.output_tokens || 0,
        total_tokens: (resp.usage?.input_tokens || 0) + (resp.usage?.output_tokens || 0)
      }
    };
  },

  buildHeaders(apiKey: string, config: Provider): Record<string, string> {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    };
  },

  buildEndpoint(config: Provider, path: string): string {
    return '/v1/messages';
  }
};

export const anthropicAdapter: ProviderAdapter = {
  metadata,
  transformers,
  isCompatible: (providerType: string) => metadata.providerTypes.includes(providerType)
};
