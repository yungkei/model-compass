import { ProviderAdapter, AdapterMetadata, AdapterTransformers } from '../registry';
import { Provider } from '../../config';
import { ChatCompletionRequest, ChatCompletionResponse } from '../../providers/base';

const metadata: AdapterMetadata = {
  name: 'openai',
  version: '1.0.0',
  description: 'OpenAI compatible API adapter - supports all OpenAI-compatible providers',
  author: 'model-compass',
  providerTypes: ['openai', 'openrouter', 'deepseek', 'moonshot', 'siliconflow', 'kimi', 'minimax', 'stepfun']
};

const transformers: AdapterTransformers = {
  buildRequestBody(req: ChatCompletionRequest, config: Provider): unknown {
    const mapping = (config as any).modelMapping || {};
    const model = mapping[req.model] || req.model;

    const body: Record<string, unknown> = {
      model,
      messages: req.messages,
      stream: req.stream
    };

    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.max_tokens !== undefined) body.max_tokens = req.max_tokens;
    if (req.top_p !== undefined) body.top_p = req.top_p;
    if (req.tools) body.tools = req.tools;
    if (req.tool_choice) body.tool_choice = req.tool_choice;

    return body;
  },

  transformResponse(response: unknown): ChatCompletionResponse {
    return response as ChatCompletionResponse;
  },

  buildHeaders(apiKey: string, config: Provider): Record<string, string> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`
    };

    if (config.type === 'openrouter') {
      headers['HTTP-Referer'] = 'https://model-compass.ai';
      headers['X-Title'] = 'Model Compass';
    }

    return headers;
  }
};

export const openaiAdapter: ProviderAdapter = {
  metadata,
  transformers,
  isCompatible: (providerType: string) => metadata.providerTypes.includes(providerType)
};
