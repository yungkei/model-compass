import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { Provider } from '../config';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  tools?: unknown[];
  tool_choice?: unknown;
  [key: string]: unknown;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
      tool_calls?: unknown[];
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  [key: string]: unknown;
}

export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      content?: string;
      tool_calls?: unknown[];
    };
    finish_reason?: string;
  }[];
}

export interface ProviderStatus {
  name: string;
  online: boolean;
  lastCheck: number;
  error?: string;
  latency?: number;
  models: string[];
}

export abstract class BaseProvider {
  protected client: AxiosInstance;
  public config: Provider;
  public status: ProviderStatus;

  constructor(config: Provider) {
    this.config = config;
    this.status = {
      name: config.name,
      online: false,
      lastCheck: 0,
      models: config.models
    };

    this.client = axios.create({
      baseURL: config.api_base_url,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  abstract buildRequestBody(req: ChatCompletionRequest): unknown;
  abstract transformResponse(response: unknown): ChatCompletionResponse;
  abstract buildHeaders(apiKey: string): Record<string, string>;

  async chatCompletion(
    req: ChatCompletionRequest,
    apiKey: string
  ): Promise<ChatCompletionResponse> {
    const body = this.buildRequestBody(req);
    const headers = this.buildHeaders(apiKey);

    const response = await this.client.post('/chat/completions', body, {
      headers
    });

    return this.transformResponse(response.data);
  }

  async chatCompletionStream(
    req: ChatCompletionRequest,
    apiKey: string,
    onChunk: (chunk: StreamChunk) => void,
    options?: { timeout?: number; onTimeout?: () => void }
  ): Promise<void> {
    const body = this.buildRequestBody(req);
    const headers = this.buildHeaders(apiKey);

    const response = await this.client.post('/chat/completions', body, {
      headers,
      responseType: 'stream'
    });

    let startTime = Date.now();
    const timeout = options?.timeout || 0;

    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk: Buffer) => {
        if (timeout > 0) {
          const elapsed = Date.now() - startTime;
          if (elapsed > timeout && options?.onTimeout) {
            options.onTimeout();
          }
        }

        const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              resolve();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              onChunk(parsed);
            } catch {
              // ignore parse errors
            }
          }
        }
      });

      response.data.on('error', reject);
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const start = Date.now();
      await this.client.get('/models', { timeout: 5000, validateStatus: () => true });
      this.status.latency = Date.now() - start;
      this.status.online = true;
      this.status.lastCheck = Date.now();
      this.status.error = undefined;
      return true;
    } catch (error) {
      this.status.online = false;
      this.status.lastCheck = Date.now();
      if (error instanceof AxiosError) {
        this.status.error = error.message;
      }
      return false;
    }
  }

  getName(): string {
    return this.config.name;
  }

  getModels(): string[] {
    return this.config.models;
  }

  supportsModel(model: string): boolean {
    return this.config.models.includes(model);
  }
}

export function createProvider(config: Provider): BaseProvider {
  const { AdaptableProvider } = require('./adaptable');
  return new AdaptableProvider(config);
}