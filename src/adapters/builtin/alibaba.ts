import { ProviderAdapter, AdapterMetadata, AdapterTransformers } from '../registry';
import { Provider } from '../../config';
import { ChatCompletionRequest, ChatCompletionResponse } from '../../providers/base';

const metadata: AdapterMetadata = {
  name: 'alibaba',
  version: '1.0.0',
  description: 'Alibaba Cloud (Bailian/Qwen) adapter - Qwen series models',
  author: 'model-compass',
  providerTypes: ['alibaba', 'bailian', 'dashscope']
};

const transformers: AdapterTransformers = {
  buildRequestBody(req, config): unknown {
    const body: Record<string, unknown> = {
      model: req.model,
      input: {
        messages: req.messages
      },
      parameters: {}
    };

    if (req.temperature !== undefined) (body.parameters as Record<string, unknown>).temperature = req.temperature;
    if (req.max_tokens !== undefined) (body.parameters as Record<string, unknown>).max_tokens = req.max_tokens;
    if (req.top_p !== undefined) (body.parameters as Record<string, unknown>).top_p = req.top_p;

    return body;
  },

  transformResponse(response, config): ChatCompletionResponse {
    const resp = response as { output?: { text?: string }; request_id?: string; model?: string; usage?: { input_tokens?: number; output_tokens?: number } };

    return {
      id: resp.request_id || `alibaba-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: resp.model || 'qwen-max',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: resp.output?.text || ''
        },
        finish_reason: 'stop'
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
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
  }
};

export const alibabaAdapter: ProviderAdapter = {
  metadata,
  transformers,
  isCompatible: (providerType: string) => metadata.providerTypes.includes(providerType)
};
