import { ProviderAdapter, AdapterMetadata, AdapterTransformers, AdapterHooks } from '../registry';
import { Provider } from '../../config';
import { ChatCompletionRequest, ChatCompletionResponse } from '../../providers/base';

const metadata: AdapterMetadata = {
  name: 'gemini',
  version: '1.0.0',
  description: 'Google Gemini API adapter',
  author: 'model-compass',
  providerTypes: ['gemini', 'google']
};

const transformers: AdapterTransformers = {
  buildRequestBody(req: ChatCompletionRequest, config: Provider): unknown {
    const contents = req.messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {}
    };

    if (req.temperature !== undefined) (body.generationConfig as Record<string, unknown>).temperature = req.temperature;
    if (req.max_tokens !== undefined) (body.generationConfig as Record<string, unknown>).maxOutputTokens = req.max_tokens;
    if (req.top_p !== undefined) (body.generationConfig as Record<string, unknown>).topP = req.top_p;

    return body;
  },

  transformResponse(response: unknown, config: Provider): ChatCompletionResponse {
    const resp = response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; promptTokenCount?: number; candidatesTokenCount?: number };
    
    const content = resp.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    return {
      id: `gemini-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: (config as any).models?.[0] || 'gemini-pro',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: resp.promptTokenCount || 0,
        completion_tokens: resp.candidatesTokenCount || 0,
        total_tokens: (resp.promptTokenCount || 0) + (resp.candidatesTokenCount || 0)
      }
    };
  },

  buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json'
    };
  },

  buildEndpoint(config: Provider, path: string): string {
    const model = (config as any).models?.[0]?.replace('gemini-', '') || '2.0-flash';
    return `/models/gemini-${model}:generateContent`;
  }
};

const hooks: AdapterHooks = {
  beforeRequest(req, config) {
    const apiKey = config.api_key;
    if (apiKey) {
      (req as any)._apiKey = apiKey;
    }
    return req;
  }
};

export const geminiAdapter: ProviderAdapter = {
  metadata,
  transformers,
  hooks,
  isCompatible: (providerType: string) => metadata.providerTypes.includes(providerType)
};
