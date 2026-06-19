import { AxiosInstance, AxiosError } from 'axios';
import axios from 'axios';
import { Provider } from '../config';
import { BaseProvider, ChatCompletionRequest, ChatCompletionResponse, StreamChunk, ProviderStatus } from './base';
import { adapterRegistry, ProviderAdapter } from './registry';

export class AdaptableProvider extends BaseProvider {
  private adapter: ProviderAdapter;
  private endpointPath: string;

  constructor(config: Provider) {
    super(config);
    const adapter = adapterRegistry.getAdapterByType(config.type);
    if (!adapter) {
      throw new Error(`No adapter found for provider type: ${config.type}`);
    }
    this.adapter = adapter;
    this.endpointPath = config.transformer?.use?.[0] || config.type;
    this.initializeAdapter();
  }

  private initializeAdapter(): void {
    if (this.adapter.lifecycle?.onInitialize) {
      this.adapter.lifecycle.onInitialize(this.config);
    }
  }

  buildRequestBody(req: ChatCompletionRequest): unknown {
    let transformedReq = req;
    if (this.adapter.hooks?.beforeRequest) {
      transformedReq = this.adapter.hooks.beforeRequest(req, this.config);
    }
    const body = this.adapter.transformers.buildRequestBody(transformedReq, this.config);
    if (this.adapter.hooks?.afterResponse) {
      return this.adapter.hooks.afterResponse(body, this.config);
    }
    return body;
  }

  transformResponse(response: unknown): ChatCompletionResponse {
    let transformedResponse = response;
    if (this.adapter.hooks?.afterResponse) {
      transformedResponse = this.adapter.hooks.afterResponse(response, this.config);
    }
    return this.adapter.transformers.transformResponse(transformedResponse, this.config);
  }

  buildHeaders(apiKey: string): Record<string, string> {
    return this.adapter.transformers.buildHeaders(apiKey, this.config);
  }

  async chatCompletion(req: ChatCompletionRequest, apiKey: string): Promise<ChatCompletionResponse> {
    const body = this.buildRequestBody(req);
    const headers = this.buildHeaders(apiKey);
    const endpoint = this.adapter.transformers.buildEndpoint
      ? this.adapter.transformers.buildEndpoint(this.config, '/chat/completions')
      : '/chat/completions';

    try {
      const response = await this.client.post(endpoint, body, { headers, validateStatus: () => true });
      if (response.status < 200 || response.status >= 300) {
        const errMsg = `Upstream ${response.status}: ${JSON.stringify(response.data).slice(0, 500)}`;
        throw Object.assign(new Error(errMsg), { status: response.status, response });
      }
      return this.transformResponse(response.data);
    } catch (error) {
      if (this.adapter.hooks?.onError) {
        this.adapter.hooks.onError(error as Error, this.config);
      }
      throw error;
    }
  }

  async chatCompletionStream(
    req: ChatCompletionRequest,
    apiKey: string,
    onChunk: (chunk: StreamChunk) => void,
    options?: { timeout?: number; onTimeout?: () => void }
  ): Promise<void> {
    const body = this.buildRequestBody(req);
    const headers = this.buildHeaders(apiKey);
    const endpoint = this.adapter.transformers.buildEndpoint
      ? this.adapter.transformers.buildEndpoint(this.config, '/chat/completions')
      : '/chat/completions';

    const response = await this.client.post(endpoint, body, {
      headers,
      responseType: 'stream',
      validateStatus: () => true
    });

    if (response.status < 200 || response.status >= 300) {
      const errorBody = await new Promise<string>((resolve) => {
        let data = '';
        response.data.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        response.data.on('end', () => resolve(data));
      });
      throw Object.assign(new Error(`Upstream returned ${response.status}: ${errorBody.slice(0, 500)}`), { status: response.status, body: errorBody });
    }

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
              let parsed = JSON.parse(data);
              if (this.adapter.hooks?.beforeStreamChunk) {
                parsed = this.adapter.hooks.beforeStreamChunk(parsed, this.config);
              }
              onChunk(parsed);
            } catch {
              // ignore parse errors
            }
          }
        }
      });

      response.data.on('error', (err: Error) => {
        if (this.adapter.hooks?.onError) {
          this.adapter.hooks.onError(err, this.config);
        }
        reject(err);
      });
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

      if (this.adapter.hooks?.onHealthCheck) {
        this.status = this.adapter.hooks.onHealthCheck(this.status, this.config);
      }

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
}
