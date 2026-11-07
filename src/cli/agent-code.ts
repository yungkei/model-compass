import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { loadConfig, getConfig } from '../config';
import { startServer } from '../server';
import {
  buildLaunchArgs,
  buildLaunchEnv,
  createLaunchContext,
  getInjectedEnv,
  getLaunchStrategy,
  maskEnv
} from '../agents/launch';
import { loadProfile } from '../agents/profiles';

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

export async function startAgent(
  agentType: string,
  sessionId?: string,
  startServerFlag = true,
  options?: { dryRun?: boolean }
): Promise<void> {
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

  // ---------------------------------------------------------------------
  // Launch-time injection.
  // The routing configuration is applied to the child process environment
  // only. The parent process.env and the target application's own config
  // files are never modified, so running the original program directly keeps
  // its original behaviour.
  // ---------------------------------------------------------------------
  const profile = loadProfile(agentType);
  const launchCtx = createLaunchContext();
  const strategy = getLaunchStrategy(profile?.type || agent.type);

  const extraEnv: Record<string, string> = {
    ...(agent.env || {}),
    ...(profile?.env || {})
  };

  // Claude Code reads ANTHROPIC_* ; keep them in sync with the MC proxy.
  if ((profile?.type || agent.type) === 'claude-code') {
    extraEnv.ANTHROPIC_BASE_URL = extraEnv.ANTHROPIC_BASE_URL || launchCtx.baseUrl;
    extraEnv.ANTHROPIC_API_KEY = extraEnv.ANTHROPIC_API_KEY || launchCtx.apiKey;
    extraEnv.ANTHROPIC_MODEL = extraEnv.ANTHROPIC_MODEL || launchCtx.model;
    extraEnv.CLAUDE_MODEL = extraEnv.CLAUDE_MODEL || launchCtx.model;
  }

  const env = buildLaunchEnv(profile?.type || agent.type, extraEnv, launchCtx);
  const args = buildLaunchArgs(profile?.type || agent.type, [...(agent.args || []), ...(profile?.args || [])], launchCtx);

  const injected = getInjectedEnv(profile?.type || agent.type, launchCtx);

  console.log(`Launching ${agent.name} (session: ${sessionId})`);
  console.log(`   Command: ${agent.command} ${args.join(' ')}`.trimEnd());
  console.log(`   Route:   ${launchCtx.baseUrl}  (model: ${launchCtx.model})`);
  console.log(`   Mode:    ${strategy.mode} - ${strategy.note}\n`);

  if (options?.dryRun) {
    console.log('   Injected environment variables:');
    for (const [key, value] of Object.entries(maskEnv(injected))) {
      console.log(`     ${key}=${value}`);
    }
    console.log('\n   (dry run - nothing was launched)\n');
    return;
  }

  if (startServerFlag) {
    await startServer();
  }

  currentProcess = spawn(agent.command, args, {
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

  // Note: no global environment variable is mutated here. The routing is
  // applied to the spawned child process only, so the original application
  // keeps working normally when started outside of MC.
  const strategy = getLaunchStrategy(agentType);
  console.log(`\nRouting configured for ${agentType}:`);
  console.log(`   Mode: ${strategy.mode} - ${strategy.note}`);
  console.log('\nNow starting server...\n');
  await startServer();

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
    .option('--dry-run', 'Show the injected configuration without launching')
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

      await startAgent(agent, options.session, true, { dryRun: options.dryRun });
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