import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

let bindingShown = false;

export interface Provider {
  name: string;
  type: string;
  api_base_url: string;
  api_key: string;
  models: string[];
  priority?: number;
  weight?: number;
  fallback?: string[];
  transformer?: {
    use: string[];
    [key: string]: unknown;
  };
}

export interface RouterConfig {
  default: string;
  background?: string;
  think?: string;
  longContext?: string;
  longContextThreshold?: number;
  webSearch?: string;
  image?: string;
  modelMapping?: Record<string, string>;
}

export interface AutoSwitchConfig {
  enabled: boolean;
  retryableErrors: number[];
  maxRetries: number;
  retryDelay: number;
  cooldownSeconds: number;
  fallbackChain: string[];
}

export type SchedulingStrategy = 'network-adaptive' | 'priority-based' | 'load-balance' | 'cost-based';

export interface SmartRoutingConfig {
  enabled: boolean;
  autoSwitch: AutoSwitchConfig;
  loadBalance?: {
    enabled: boolean;
    strategy: 'round-robin' | 'random' | 'weighted';
  };
  costOptimization?: {
    enabled: boolean;
    maxBudget: number;
    preferCheaperOnSimple: boolean;
  };
}

export interface AdapterPluginConfig {
  enabled: boolean;
  path?: string;
  autoLoad?: boolean;
}

export interface PluginConfig {
  claudeCode?: {
    enabled: boolean;
    dynamicModels: boolean;
    configPath?: string;
  };
  opencode?: {
    enabled: boolean;
    dynamicModels: boolean;
    configPath?: string;
  };
  adapters?: {
    [key: string]: AdapterPluginConfig;
  };
  pluginDir?: string;
}

export interface Config {
  version: string;
  server: {
    host: string;
    port: number;
    timeout: number;
  };
  providers: Provider[];
  router: RouterConfig;
  smartRouting: SmartRoutingConfig;
  plugins: PluginConfig;
  logging: {
    level: string;
    file: string;
  };
  connectionMode?: 'auto' | 'manual';
  schedulingStrategy?: SchedulingStrategy;
  autoRoute?: {
    provider: string;
    model: string;
  };
  modelMapping?: Record<string, string>;
  manualRoutes?: {
    default?: { provider: string; model: string };
    background?: { provider: string; model: string };
    think?: { provider: string; model: string };
    longContext?: { provider: string; model: string };
  };
}

export const DEFAULT_CONFIG: Config = {
  version: '1.0.0',
  server: {
    host: '0.0.0.0',
    port: 8765,
    timeout: 600000
  },
  providers: [],
  router: {
    default: ''
  },
  schedulingStrategy: 'network-adaptive',
  smartRouting: {
    enabled: true,
    autoSwitch: {
      enabled: true,
      retryableErrors: [429, 500, 502, 503, 504],
      maxRetries: 3,
      retryDelay: 1000,
      cooldownSeconds: 60,
      fallbackChain: []
    }
  },
  plugins: {
    claudeCode: { enabled: true, dynamicModels: true },
    opencode: { enabled: true, dynamicModels: true }
  },
  logging: {
    level: 'info',
    file: ''
  }
};

function expandEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    const match = obj.match(/^\$\{(\w+)\}$/);
    if (match) {
      const envValue = process.env[match[1]];
      if (envValue !== undefined) return envValue;
    }
    if (obj.startsWith('${') && obj.endsWith('}')) {
      const envKey = obj.slice(2, -1);
      return process.env[envKey] || obj;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => expandEnvVars(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandEnvVars(value);
    }
    return result;
  }
  return obj;
}

let currentConfig: Config = { ...DEFAULT_CONFIG };

export function loadConfig(configPath?: string): Config {
  const filePath = configPath || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.model-compass', 'config.json');

  currentConfig = { ...DEFAULT_CONFIG };

  try {
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(fileContent);
      const expanded = expandEnvVars(parsed) as Config;
      currentConfig = { ...DEFAULT_CONFIG, ...expanded };
    }
  } catch (error) {
    console.error(`Failed to load config from ${filePath}:`, error);
  }

  // Environment variable overrides for quick local testing
  const envHost = process.env.MODEL_COMPASS_HOST;
  const envPort = process.env.MODEL_COMPASS_PORT;
  if (envHost) {
    currentConfig.server.host = envHost;
  }
  if (envPort) {
    const n = Number(envPort);
    if (!Number.isNaN(n) && n > 0 && n < 65536) {
      currentConfig.server.port = n;
    }
  }
  // Debug: show final binding (only once)
  if (!bindingShown) {
    bindingShown = true;
    try {
      console.log(`Model Compass binding: host=${currentConfig.server.host}, port=${currentConfig.server.port}`);
    } catch {
      // ignore logging errors
    }
  }
  return currentConfig;
}

export function getConfig(): Config {
  return currentConfig;
}

export function updateConfig(updates: Partial<Config>): Config {
  currentConfig = { ...currentConfig, ...updates };
  return currentConfig;
}

export function saveConfig(configPath?: string): void {
  const filePath = configPath || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.model-compass', 'config.json');
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(currentConfig, null, 2));
}
