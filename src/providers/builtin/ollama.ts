import { ProviderAdapter, AdapterMetadata, AdapterTransformers } from '../registry';
import { Provider } from '../../config';
import { ChatCompletionRequest, ChatCompletionResponse } from '../../providers/base';

const metadata: AdapterMetadata = {
  name: 'ollama',
  version: '1.0.0',
  description: 'Ollama local model adapter',
  author: 'model-compass',
  providerTypes: ['ollama']
};

const transformers: AdapterTransformers = {
  buildRequestBody(req: ChatCompletionRequest, config: Provider): unknown {
    const model = req.model.split(':')[0] || req.model;
    return {
      model,
      messages: req.messages,
      stream: req.stream,
      options: {
        temperature: req.temperature,
        num_predict: req.max_tokens
      }
    };
  },

  transformResponse(response: unknown): ChatCompletionResponse {
    const resp = response as { message: { content: string }; model: string; done: boolean };
    return {
      id: `ollama-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: resp.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: resp.message?.content || ''
        },
        finish_reason: resp.done ? 'stop' : 'length'
      }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };
  },

  buildHeaders(apiKey: string, config: Provider): Record<string, string> {
    return apiKey && apiKey !== 'ollama' ? { 'Authorization': `Bearer ${apiKey}` } : {};
  }
};

export const ollamaAdapter: ProviderAdapter = {
  metadata,
  transformers,
  isCompatible: (providerType: string) => metadata.providerTypes.includes(providerType)
};
