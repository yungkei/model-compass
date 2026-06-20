import { ProviderAdapter, AdapterMetadata, AdapterTransformers } from '../registry';
import { Provider } from '../../config';
import { ChatCompletionRequest, ChatCompletionResponse } from '../../providers/base';

const metadata: AdapterMetadata = {
  name: 'bedrock',
  version: '1.0.0',
  description: 'AWS Bedrock adapter - Claude, LLaMA, Titan and more',
  author: 'model-compass',
  providerTypes: ['bedrock']
};

const transformers: AdapterTransformers = {
  buildRequestBody(req, config): unknown {
    const body: Record<string, unknown> = {
      messages: req.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      inferenceConfig: {}
    };

    if (req.temperature !== undefined) (body.inferenceConfig as Record<string, unknown>).temperature = req.temperature;
    if (req.max_tokens !== undefined) (body.inferenceConfig as Record<string, unknown>).maxTokens = req.max_tokens;

    return body;
  },

  transformResponse(response, config): ChatCompletionResponse {
    const output = (response as any).output || (response as any).results?.[0] || {};
    const content = output.content?.[0]?.text || output.outputText || '';

    return {
      id: output.id || `bedrock-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: output.modelId || 'bedrock-model',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content
        },
        finish_reason: output.stopReason || 'stop'
      }],
      usage: output.usage ? {
        prompt_tokens: output.usage.inputTokens || 0,
        completion_tokens: output.usage.outputTokens || 0,
        total_tokens: (output.usage.inputTokens || 0) + (output.usage.outputTokens || 0)
      } : undefined
    };
  },

  buildHeaders(apiKey: string, config: Provider): Record<string, string> {
    return {
      'Content-Type': 'application/json'
    };
  },

  buildEndpoint(config: Provider, path: string): string {
    const model = (config as any).models?.[0] || 'anthropic.claude-3-sonnet';
    return `/model/${model}/converse`;
  }
};

export const bedrockAdapter: ProviderAdapter = {
  metadata,
  transformers,
  isCompatible: (providerType: string) => metadata.providerTypes.includes(providerType)
};
