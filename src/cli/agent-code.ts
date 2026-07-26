import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { loadConfig, getConfig } from '../config';
import { startServer } from '../server';
import { resolveAgentEnv } from '../agents/resolve';

function showContext(): void {
  const ctx = loadContext();
  console.log('\n=== Global Context ===');
  console.log(`Current Agent: ${ctx.currentAgent}`);
  console.log(`Active Session: ${ctx.activeSession || 'none'}`);
  console.log(`Sessions: ${Object.keys(ctx.sessions).length}`);
  console.log('========================\n');
}

export interface AgentConfig {
  name: string;
  type: 'claude-code' | 'opencode' | 'cursor' | 'windsurf';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  requiresAuth?: boolean;
}

export interface Session {
  id: string;
  agent: string;
  created: number;
  messages: Array<{ role: string; content: string; timestamp: number }>;
}

export interface GlobalContext {
  currentAgent: string;
  sessions: Record<string, Session>;
  activeSession: string | null;
}

const DEFAULT_AGENTS: AgentConfig[] = [
  {
    name: 'claude',
    type: 'claude-code',
    command: 'claude',
    env: {}
  },
  {
    name: 'opencode',
    type: 'opencode',
    command: 'opencode',
    env: {}
  },
  {
    name: 'cursor',
    type: 'cursor',
    command: 'cursor',
    env: {}
  },
  {
    name: 'windsurf',
    type: 'windsurf',
    command: 'windsurf',
    env: {}
  }
];

function getContextPath(): string {
  const basePath = process.env.MC_HOME || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.model-compass');
  return path.join(basePath, 'context.json');
}

function loadContext(): GlobalContext {
  const ctxPath = getContextPath();
  try {
    if (fs.existsSync(ctxPath)) {
      return JSON.parse(fs.readFileSync(ctxPath, 'utf-8'));
    }
  } catch {}
  return {
    currentAgent: 'claude-code',
    sessions: {},
    activeSession: null
  };
}

function saveContext(ctx: GlobalContext): void {
  const ctxPath = getContextPath();
  const dir = path.dirname(ctxPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(ctxPath, JSON.stringify(ctx, null, 2));
}

function getAgentsConfig(): AgentConfig[] {
  const configPath = path.join(process.env.MC_HOME || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.model-compass'), 'agents.json');
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {}
  return DEFAULT_AGENTS;
}

function saveAgentsConfig(agents: AgentConfig[]): void {
  const configPath = path.join(process.env.MC_HOME || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.model-compass'), 'agents.json');
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(agents, null, 2));
}

let currentProcess: ChildProcess | null = null;

function isCommandAvailable(command: string): boolean {
  try {
    const { execSync } = require('child_process');
    execSync(process.platform === 'win32' 
      ? `where ${command}` 
      : `which ${command}`, 
      { stdio: 'ignore' }
    );
    return true;
  } catch {
    return false;
  }
}

export async function startAgent(agentType: string, sessionId?: string, startServerFlag = true): Promise<void> {
  const agents = getAgentsConfig();
  const agent = agents.find(a => a.name === agentType);

  if (!agent) {
    console.error(`Agent not found: ${agentType}`);
    console.log(`Available agents: ${agents.map(a => a.name).join(', ')}`);
    return;
  }

  if (!isCommandAvailable(agent.command)) {
    console.log(`\n${agent.name} is not installed or not in PATH`);
    console.log(`   Command: ${agent.command}`);
    console.log(`\nPlease install first:`);
    console.log(`   - Visit: https://${agent.name}.ai/download`);
    console.log(`   - Or use package manager`);
    console.log(`   - Make sure ${agent.command} is executable\n`);
    return;
  }

  const ctx = loadContext();

  if (!sessionId) {
    sessionId = `session-${Date.now()}`;
    if (!ctx.sessions[sessionId]) {
      ctx.sessions[sessionId] = {
        id: sessionId,
        agent: agentType,
        created: Date.now(),
        messages: []
      };
    }
  }

  ctx.currentAgent = agentType;
  ctx.activeSession = sessionId;
  saveContext(ctx);

  const resolved = resolveAgentEnv('mc');
  const env = {
    ...process.env,
    ...agent.env,
    ANTHROPIC_BASE_URL: resolved.ANTHROPIC_BASE_URL,
    ANTHROPIC_API_KEY: resolved.ANTHROPIC_API_KEY,
    ANTHROPIC_VERSION: resolved.ANTHROPIC_VERSION,
    ANTHROPIC_MODEL: 'modelcompass',
    CLAUDE_MODEL: 'modelcompass',
    MC_MODEL: 'mc'
  };

  console.log(`Launching ${agent.name} (session: ${sessionId})`);
  console.log(`   Command: ${agent.command} ${agent.args?.join(' ') || ''}`);
  console.log(`   Env: ANTHROPIC_MODEL=modelcompass, ANTHROPIC_BASE_URL=${env.ANTHROPIC_BASE_URL}\n`);

  if (startServerFlag) {
    await startServer();
  }

  currentProcess = spawn(agent.command, agent.args || [], {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  currentProcess.on('exit', (code) => {
    console.log(`\n${agent.name} exited with code ${code})`);
    currentProcess = null;
    process.exit(code || 0);
  });

  currentProcess.on('error', (err) => {
    console.error(`\nFailed to launch ${agent.name}: ${err.message}`);
    currentProcess = null;
    process.exit(1);
  });
}

export async function switchAgent(agentType: string, options?: { session?: string }): Promise<void> {
  const ctx = loadContext();
  const oldAgent = ctx.currentAgent;
  const oldSession = ctx.activeSession;

  if (oldSession && ctx.sessions[oldSession]) {
    console.log(`Saving ${oldAgent} session context...`);
  }

  ctx.currentAgent = agentType;
  saveContext(ctx);

  console.log(`Switched agent: ${oldAgent} → ${agentType}`);

  if (agentType === 'claude') {
    const resolved = resolveAgentEnv('mc');
    // The MC wrapper needs these env vars for the spawned Claude process,
    // but we avoid mutating the global process.env to keep native Claude config intact.
    // The values are passed to the child process via its environment (see startAgent).
    console.log(`\nClaude environment configured:`);
    console.log(`   MC_MODEL=mc, ANTHROPIC_BASE_URL=${resolved.ANTHROPIC_BASE_URL}`);
    console.log('\nNow starting server...\n');
    await startServer();
  }

  await startAgent(agentType, options?.session, false);
}

export function listSessions(): void {
  const ctx = loadContext();
console.log('\nSessions:\n');

  if (Object.keys(ctx.sessions).length === 0) {
    console.log('  No sessions');
  }

  for (const [id, session] of Object.entries(ctx.sessions)) {
    const isActive = id === ctx.activeSession;
    const time = new Date(session.created).toLocaleString();
    console.log(`  ${isActive ? '*' : 'o'} ${id.slice(0, 8)}... | ${session.agent} | ${session.messages.length} msgs | ${time}`);
  }

  console.log('\nGlobal context:\n');
  console.log(`  Current agent: ${ctx.currentAgent}`);
  console.log(`  Active session: ${ctx.activeSession || 'none'}`);
  console.log(`  Total sessions: ${Object.keys(ctx.sessions).length}`);
  console.log('');
}

export function addMessage(content: string, role: string = 'user'): void {
  const ctx = loadContext();
  if (!ctx.activeSession || !ctx.sessions[ctx.activeSession]) return;
  
  ctx.sessions[ctx.activeSession].messages.push({
    role,
    content,
    timestamp: Date.now()
  });
  saveContext(ctx);
}

export function addCommand(): void {
  const codeCmd = program
    .command('code [agent]')
    .description('Start agent or manage agents')

  codeCmd
    .option('-s, --session <id>', 'Specify session ID')
    .option('-l, --list', 'List available agents')
    .action(async (agent, options) => {
      if (options.list) {
        const agents = getAgentsConfig();
        const ctx = loadContext();
        console.log('\nAvailable Agents:\n');
        for (const a of agents) {
          const isDefault = a.name === ctx.currentAgent;
          console.log(`  ${isDefault ? '●' : '○'} ${a.name} (${a.type}) - ${a.command}`);
        }
        console.log('');
        return;
      }

      if (!agent) {
        const ctx = loadContext();
        agent = ctx.currentAgent;
        console.log(`Using default agent: ${agent}\n`);
      }

      await startAgent(agent, options.session);
    });

  codeCmd
    .command('use <agent>')
    .description('Use agent (auto-config Claude env if claude)')
    .option('-s, --session <id>', 'Session ID')
    .option('--no-start', 'Only set default, do not start agent')
    .action(async (agent, options) => {
      if (options.noStart) {
        const ctx = loadContext();
        ctx.currentAgent = agent;
        saveContext(ctx);
        console.log(`Set default agent: ${agent}`);
        return;
      }
      await switchAgent(agent, { session: options.session });
    });

  codeCmd
    .command('sessions')
    .description('List all sessions')
    .action(() => {
      listSessions();
    });

  codeCmd
    .command('context')
    .description('Show global context')
    .action(() => {
      showContext();
    });
}