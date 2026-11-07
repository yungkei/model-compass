/**
 * Launch Strategies - Zero-pollution agent startup
 *
 * Core principle:
 *   Model Compass NEVER writes into a third-party application's own config
 *   directory (e.g. ~/.claude, ~/.config/opencode, ~/.cursor) unless the
 *   user explicitly opts in with `--global`.
 *
 * Instead, routing is injected at launch time into the child process that
 * `mc code <agent>` spawns. Running the original program directly therefore
 * keeps its original behaviour, untouched.
 */

import * as path from 'path';
import { loadConfig, getConfig } from '../config';

// ============================================================================
// Types
// ============================================================================

export type LaunchMode =
  /** Fully routed via environment variables - no file is ever written */
  | 'env'
  /** The target app only supports file-based configuration */
  | 'config-file'
  /** The target app cannot be routed automatically */
  | 'manual';

export interface LaunchContext {
  /** Base URL of the MC proxy, e.g. http://localhost:8765/v1 */
  baseUrl: string;
  /** Base URL of the MC proxy without the /v1 suffix (used by MCP clients) */
  serverUrl: string;
  /** Dummy API key accepted by the MC proxy */
  apiKey: string;
  /** Model id routed through MC */
  model: string;
  host: string;
  port: number;
  /** MC config directory, e.g. ~/.model-compass */
  configDir: string;
  /** User home directory */
  homeDir: string;
  /** Absolute path of the mc entry script (used by MCP stdio servers) */
  mcPath: string;
}

export interface LaunchStrategy {
  /** Unique strategy id */
  id: string;
  /** How the routing is delivered to the target application */
  mode: LaunchMode;
  /** Environment variables injected into the spawned child process only */
  env?: (ctx: LaunchContext) => Record<string, string>;
  /** Extra CLI arguments injected into the spawned child process only */
  args?: (ctx: LaunchContext) => string[];
  /** Human readable explanation shown to the user */
  note: string;
}

// ============================================================================
// Context helpers
// ============================================================================

export function getMcConfigDir(): string {
  const home = process.env.MC_HOME || process.env.HOME || process.env.USERPROFILE || '.';
  return path.join(home, '.model-compass');
}

export function getMcEntryPath(): string {
  const dist = path.join(__dirname, '..', '..', 'cli', 'index.js');
  return path.normalize(dist);
}

export function createLaunchContext(model = 'mc/auto'): LaunchContext {
  loadConfig();
  const { host, port } = getConfig().server;
  const apiKey = process.env.MC_API_KEY || process.env.ANTHROPIC_API_KEY || 'sk-dummy';
  const publicHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
  const serverUrl = `http://${publicHost}:${port}`;

  return {
    baseUrl: process.env.MC_BASE_URL || `${serverUrl}/v1`,
    serverUrl: process.env.MC_SERVER_URL || serverUrl,
    apiKey,
    model,
    host: publicHost,
    port,
    configDir: getMcConfigDir(),
    homeDir: process.env.MC_HOME || process.env.HOME || process.env.USERPROFILE || '.',
    mcPath: getMcEntryPath()
  };
}

// ============================================================================
// Shared fragments
// ============================================================================

/** Env vars every routed child process receives. */
function commonEnv(ctx: LaunchContext): Record<string, string> {
  return {
    MC_MODEL: ctx.model,
    MC_BASE_URL: ctx.baseUrl,
    MC_API_KEY: ctx.apiKey,
    MC_SERVER_URL: ctx.serverUrl
  };
}

/** MCP server entry shared by MCP-based IDEs. */
export function buildMcpServerEntry(ctx: LaunchContext): Record<string, unknown> {
  return {
    command: 'node',
    args: [path.join(ctx.configDir, 'mcp-server.js')],
    env: {
      MC_BASE_URL: ctx.baseUrl,
      MC_API_KEY: ctx.apiKey,
      MC_MODEL: ctx.model
    }
  };
}

// ============================================================================
// Strategies
// ============================================================================

const claudeCodeStrategy: LaunchStrategy = {
  id: 'claude-code',
  mode: 'env',
  env: (ctx) => ({
    ...commonEnv(ctx),
    // Claude Code reads its API endpoint from these variables.
    ANTHROPIC_BASE_URL: ctx.baseUrl,
    ANTHROPIC_API_KEY: ctx.apiKey,
    ANTHROPIC_MODEL: ctx.model,
    CLAUDE_MODEL: ctx.model,
    // Keep the original program from phoning home.
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
  }),
  note: 'Env injection only - ~/.claude/settings.json is never modified.'
};

const opencodeStrategy: LaunchStrategy = {
  id: 'opencode',
  mode: 'env',
  env: (ctx) => ({
    ...commonEnv(ctx),
    // OpenCode accepts an inline config through OPENCODE_CONFIG_CONTENT,
    // which keeps the user's own opencode.json untouched.
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      provider: {
        'model-compass': {
          npm: '@ai-sdk/openai-compatible',
          name: 'Model Compass Router',
          options: {
            baseURL: ctx.baseUrl,
            apiKey: ctx.apiKey
          },
          models: {
            [ctx.model]: { name: `Model Compass (${ctx.model})` }
          }
        }
      }
    })
  }),
  note: 'Env injection only - ~/.config/opencode/opencode.json is never modified.'
};

const genericEnvStrategy: LaunchStrategy = {
  id: 'generic',
  mode: 'env',
  env: (ctx) => commonEnv(ctx),
  note: 'Env injection only - MC_* variables are exported to the child process.'
};

function configFileStrategy(id: string, targetPath: string): LaunchStrategy {
  return {
    id,
    mode: 'config-file',
    note:
      `${targetPath} is the only way to configure this application. ` +
      'MC does not write it automatically - run ' +
      `"mc adapter install <id> --global" to opt in, or "mc adapter export <id>" to copy the snippet manually.`
  };
}

const strategies: LaunchStrategy[] = [
  claudeCodeStrategy,
  opencodeStrategy,
  configFileStrategy('cursor', '~/.cursor/mcp.json'),
  configFileStrategy('windsurf', '~/.codeium/windsurf/mcp_config.json'),
  configFileStrategy('zed', '~/.config/zed/settings.json'),
  configFileStrategy('vscode', '~/.continue/config.json'),
  configFileStrategy('local', 'the application settings file'),
  genericEnvStrategy
];

// ============================================================================
// Public API
// ============================================================================

export function getLaunchStrategy(agentType: string): LaunchStrategy {
  return strategies.find(s => s.id === agentType) || genericEnvStrategy;
}

/**
 * Build the environment for the spawned child process.
 * The parent process.env is never mutated - the returned object is passed
 * straight to spawn(), so the original program keeps its own settings.
 */
export function buildLaunchEnv(
  agentType: string,
  overrides?: Record<string, string>,
  ctx?: LaunchContext
): Record<string, string> {
  const strategy = getLaunchStrategy(agentType);
  const launchCtx = ctx || createLaunchContext();
  const injected = strategy.env ? strategy.env(launchCtx) : {};

  return {
    ...process.env as Record<string, string>,
    ...injected,
    ...(overrides || {})
  };
}

/** Build the CLI arguments for the spawned child process. */
export function buildLaunchArgs(
  agentType: string,
  baseArgs: string[] = [],
  ctx?: LaunchContext
): string[] {
  const strategy = getLaunchStrategy(agentType);
  const launchCtx = ctx || createLaunchContext();
  const injected = strategy.args ? strategy.args(launchCtx) : [];

  return [...baseArgs, ...injected];
}

/**
 * Return only the variables MC injects (without process.env) so the CLI can
 * show the user exactly what is being changed.
 */
export function getInjectedEnv(
  agentType: string,
  ctx?: LaunchContext
): Record<string, string> {
  const strategy = getLaunchStrategy(agentType);
  const launchCtx = ctx || createLaunchContext();
  return strategy.env ? strategy.env(launchCtx) : {};
}

/** Mask secrets so they can safely be printed. */
export function maskEnv(env: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (/KEY|TOKEN|SECRET|PASSWORD/i.test(key)) {
      masked[key] = value.length > 8 ? `${value.slice(0, 4)}****${value.slice(-4)}` : '****';
    } else {
      masked[key] = value;
    }
  }
  return masked;
}
