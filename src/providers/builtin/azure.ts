import { ProviderAdapter, AdapterMetadata, AdapterTransformers } from '../registry';
import { Provider } from '../../config';
import { ChatCompletionRequest, ChatCompletionResponse } from '../../providers/base';

const metadata: AdapterMetadata = {
  name: 'azure',
  version: '1.0.0',
  description: 'Azure OpenAI Service adapter - special URL structure with deployment IDs',
  author: 'model-compass',
  providerTypes: ['azure']
};

const transformers: AdapterTransformers = {
  buildRequestBody(req, config): unknown {
    const body: Record<string, unknown> = {
      messages: req.messages
    };

    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.max_tokens !== undefined) body.max_tokens = req.max_tokens;
    if (req.top_p !== undefined) body.top_p = req.top_p;
    if (req.stream !== undefined) body.stream = req.stream;
    if (req.tools) body.tools = req.tools;
    if (req.tool_choice) body.tool_choice = req.tool_choice;

    return body;
  },

  transformResponse(response, config): ChatCompletionResponse {
    return response as ChatCompletionResponse;
  },

  buildHeaders(apiKey: string, config: Provider): Record<string, string> {
    return {
      'api-key': apiKey,
      'Content-Type': 'application/json'
    };
  },

  buildEndpoint(config: Provider, path: string): string {
    const model = (config as any).models?.[0] || 'gpt-4';
    return `/chat/completions?api-version=2024-02-01`;
  }
};

export const azureAdapter: ProviderAdapter = {
  metadata,
  transformers,
  isCompatible: (providerType: string) => metadata.providerTypes.includes(providerType)
};
