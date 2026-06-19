import { loadConfig, getConfig } from '../config';

export interface ResolvedAgentEnv {
  ANTHROPIC_BASE_URL: string;
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_VERSION: string;
  MC_MODEL?: string;
}

export function resolveAgentEnv(model?: string): ResolvedAgentEnv {
  loadConfig();
  const { host, port } = getConfig().server;
  const apiKey = process.env.MC_API_KEY || process.env.ANTHROPIC_API_KEY || 'sk-dummy';
  const baseUrl = process.env.MC_BASE_URL || `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/v1`;
  return {
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_API_KEY: apiKey,
    ANTHROPIC_VERSION: '2023-06-01',
    ...(model ? { MC_MODEL: model } : {})
  };
}
