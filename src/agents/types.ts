export interface AgentAdapter {
  id: string;
  name: string;
  type: string;
  description: string;
  version: string;

  model?: string;

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
    description: 'Claude Code adapter plugin - auto-config via MC proxy',
    version: '1.0.0',
    model: 'mc',
    configFiles: [
      {
        path: '~/.claude/settings.json',
        template: {
          env: {
            ANTHROPIC_BASE_URL: '{env:MC_BASE_URL}',
            ANTHROPIC_API_KEY: '{env:MC_API_KEY}',
            MC_MODEL: 'mc'
          }
        }
      }
    ]
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    type: 'opencode',
    description: 'OpenCode adapter plugin - auto-generate Provider config',
    version: '1.0.0',
    configFiles: [
      {
        path: '~/.config/opencode/opencode.json',
        template: {
          $schema: 'https://opencode.ai/config.json',
          provider: {
            'model-compass': {
              npm: '@ai-sdk/openai-compatible',
              name: 'Model Compass Router',
              options: {
                baseURL: '{env:MC_BASE_URL}',
                apiKey: '{env:MC_API_KEY}'
              },
              models: {
                'mc': {
                  name: 'Model Compass Router'
                }
              }
            }
          }
        }
      }
    ]
  },
  {
    id: 'cursor',
    name: 'Cursor',
    type: 'cursor',
    description: 'Cursor adapter plugin - configure MCP routing server',
    version: '1.0.0',
    configFiles: [
      {
        path: '~/.cursor/mcp.json',
        template: {
          'model-compass': {
            command: 'node',
            args: ['/path/to/mc/router-mcp.js'],
            env: {
              MC_BASE_URL: '{env:MC_BASE_URL}'
            }
          }
        }
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