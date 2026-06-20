import { ProviderAdapter, AdapterMetadata, AdapterTransformers } from '../registry';
import { Provider } from '../../config';
import { ChatCompletionRequest, ChatCompletionResponse } from '../../providers/base';

const metadata: AdapterMetadata = {
  name: 'mistral',
  version: '1.0.0',
  description: 'Mistral AI API adapter - OpenAI-compatible',
  author: 'model-compass',
  providerTypes: ['mistral']
};

const transformers: AdapterTransformers = {
  buildRequestBody(req, config): unknown {
    const body: Record<string, unknown> = {
      model: req.model,
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

  transformResponse(response, config): ChatCompletionResponse {
    return response as ChatCompletionResponse;
  },

  buildHeaders(apiKey: string, config: Provider): Record<string, string> {
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
  }
};

export const mistralAdapter: ProviderAdapter = {
  metadata,
  transformers,
  isCompatible: (providerType: string) => metadata.providerTypes.includes(providerType)
};
