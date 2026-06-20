import { Router } from '../core/router';
import { BaseProvider, ChatCompletionRequest } from '../providers/base';
import { ProviderManager } from '../core/provider-manager';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  main?: string;
  author?: { name: string; email?: string; url?: string };
  license?: string;
  homepage?: string;
  categories?: string[];
  tags?: string[];
  engine?: string;
  dependencies?: Record<string, string>;
  configFiles?: Array<{ path: string; template: object; merge?: boolean }>;
  envVars?: Record<string, string>;
}

export enum PluginType {
  PROVIDER = 'provider',
  AGENT = 'agent',
  ROUTER = 'router'
}

export interface PluginContext {
  homeDir: string;
  configDir: string;
  server: { host: string; port: number };
  core: { providerManager: ProviderManager; router: Router };
}

export interface BasePlugin {
  readonly metadata: PluginManifest;
  readonly type: PluginType;
  initialize?(context: PluginContext): Promise<void> | void;
  dispose?(): Promise<void> | void;
}

export interface ProviderConfig {
  name: string;
  type: string;
  priority?: number;
  weight?: number;
  fallback?: string[];
  api_base_url: string;
  api_key: string;
  models: string[];
  config?: Record<string, unknown>;
}

export interface PluginRequestHooks {
  onBeforeRequest?(req: ChatCompletionRequest, providerConfig: ProviderConfig): ChatCompletionRequest | Promise<ChatCompletionRequest>;
  onAfterResponse?(response: unknown, providerConfig: ProviderConfig): unknown | Promise<unknown>;
  onBeforeStreamChunk?(chunk: unknown, providerConfig: ProviderConfig): unknown;
  onError?(error: Error, providerConfig: ProviderConfig): void;
}

export interface ProviderPlugin extends BasePlugin {
  readonly type: PluginType.PROVIDER;
  readonly configSchema?: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; required?: boolean; default?: unknown }>;
    required?: string[];
  };
  createProvider(config: ProviderConfig): BaseProvider;
  validateConfig?(config: ProviderConfig): { valid: boolean; errors?: string[] };
  hooks?: PluginRequestHooks;
}

export interface AgentPlugin extends BasePlugin {
  readonly type: PluginType.AGENT;
  supportedTypes: string[];
  configFiles?: Array<{ path: string; template: object; merge?: boolean }>;
  onActivate?(context: PluginContext): Promise<void> | void;
  onDeactivate?(context: PluginContext): Promise<void> | void;
  onInstall?(context: PluginContext): Promise<void> | void;
  onUninstall?(context: PluginContext): Promise<void> | void;
}

export interface RoutingContext {
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface RouterPlugin extends BasePlugin {
  readonly type: PluginType.ROUTER;
  createRouter(): Router;
  canHandle?(request: ChatCompletionRequest, context: RoutingContext): boolean;
  priority?: number;
}

export interface RouteResult {
  provider: string;
  model: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface PluginLoadResult {
  success: boolean;
  plugin?: Plugin;
  error?: string;
}

export interface PluginInstallation {
  id: string;
  version: string;
  installedAt: number;
  source: 'npm' | 'file' | 'builtin';
}

export type Plugin = ProviderPlugin | AgentPlugin | RouterPlugin;

export type AgentAdapter = Omit<AgentPlugin, 'type' | 'metadata'> & {
  id: string;
  name: string;
  description: string;
  type: string;
  version: string;
};

export type AdapterContext = PluginContext;
