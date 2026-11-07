export interface AgentAdapter {
  id: string;
  name: string;
  type: string;
  description: string;
  version: string;

  model?: string;

  /**
   * Environment variables injected into the child process spawned by
   * `mc code <agent>`. These never leak into the parent process and never
   * touch the target application's own configuration.
   */
  launchEnv?: (context: AdapterContext) => Record<string, string>;

  /**
   * Extra CLI arguments injected into the child process spawned by
   * `mc code <agent>`.
   */
  launchArgs?: (context: AdapterContext) => string[];

  /**
   * Third-party configuration files for applications that can only be
   * configured through a file (e.g. MCP based IDEs).
   *
   * IMPORTANT: these are only written when the user explicitly opts in with
   * `mc adapter install <id> --global`. By default MC stores its own profile
   * under ~/.model-compass and applies the routing at launch time only.
   */
  configFiles?: Array<{
    path: string;
    template: object;
    merge?: boolean;
  }>;

  envVars?: Record<string, string>;

  onInstall?: (context: AdapterContext) => Promise<void>;
  onUninstall?: (context: AdapterContext) => Promise<void>;
  onActivate?: (context: AdapterContext) => Promise<void>;
  onDeactivate?: (context: AdapterContext) => Promise<void>;
}

export interface AdapterContext {
  homeDir: string;
  configDir: string;
  port: number;
}

export interface AdapterManifest {
  adapters: Record<string, AgentAdapter>;
}

export type AdapterLoader = (manifest: AdapterManifest) => AgentAdapter[];

export const builtInAdapters: AgentAdapter[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    type: 'claude-code',
    description: 'Claude Code adapter - routes via env vars, no config file is touched',
    version: '1.0.0',
    model: 'mc'
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    type: 'opencode',
    description: 'OpenCode adapter - routes via OPENCODE_CONFIG_CONTENT, no config file is touched',
    version: '1.0.0',
    model: 'mc'
  },
  {
    id: 'cursor',
    name: 'Cursor',
    type: 'cursor',
    description: 'Cursor adapter - MCP based, requires opt-in global MCP entry',
    version: '1.0.0',
    configFiles: [
      {
        path: '~/.cursor/mcp.json',
        template: {
          'model-compass': {
            command: 'node',
            args: ['$MC_PATH/mcp-server.js'],
            env: {
              MC_BASE_URL: 'http://localhost:8765/v1'
            }
          }
        },
        merge: true
      }
    ]
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    type: 'windsurf',
    description: 'Windsurf adapter - MCP based, requires opt-in global MCP entry',
    version: '1.0.0',
    configFiles: [
      {
        path: '~/.codeium/windsurf/mcp_config.json',
        template: {
          'model-compass': {
            command: 'node',
            args: ['$MC_PATH/mcp-server.js'],
            env: {
              MC_BASE_URL: 'http://localhost:8765/v1'
            }
          }
        },
        merge: true
      }
    ]
  }
];

export function createAdapterContext(port: number = 3456): AdapterContext {
  const homeDir = process.env.MC_HOME || process.env.HOME || process.env.USERPROFILE || '.';
  return {
    homeDir,
    configDir: `${homeDir}/.model-compass`,
    port
  };
}