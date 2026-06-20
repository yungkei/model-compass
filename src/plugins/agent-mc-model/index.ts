/**
 * MCP Agent Plugin for Model Compass
 * 
 * 为 Claude Code Agent 提供 /mc-model 命令支持
 * 
 * 功能：
 * - 在 Claude Code 中输入 /mc-model 时弹出模型选择
 * - 支持自动补全和提示
 * - 支持模型切换和历史记录
 */

import { PluginType, AgentPlugin, PluginContext } from '../types';
import { loadConfig, getConfig } from '../../config';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

// ============================================================================
// 模型管理核心逻辑
// ============================================================================

interface ModelContext {
  currentModel?: string;
  switchedAt?: string;
  history?: string[];
}

function getModelContextPath(): string {
  return path.join(
    process.env.HOME || process.env.USERPROFILE || '.',
    '.model-compass',
    'agent-model-context.json'
  );
}

function loadModelContext(): ModelContext {
  const ctxPath = getModelContextPath();
  try {
    if (fs.existsSync(ctxPath)) {
      return JSON.parse(fs.readFileSync(ctxPath, 'utf-8'));
    }
  } catch {}
  return { history: [] };
}

function saveModelContext(ctx: ModelContext): void {
  const ctxPath = getModelContextPath();
  const dir = path.dirname(ctxPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(ctxPath, JSON.stringify(ctx, null, 2));
}

// ============================================================================
// Agent 命令定义
// ============================================================================

export interface AgentCommand {
  /** 命令名称，如 /mc-model */
  name: string;
  
  /** 命令描述 */
  description: string;
  
  /** 命令处理函数 */
  handler: (args: string[]) => Promise<void>;
  
  /** 自动补全建议 */
  autocomplete?: (partial: string) => string[];
  
  /** 是否在当前 agent 激活时注册 */
  whenActive?: string[];
}

// ============================================================================
// 模型管理函数
// ============================================================================

export function getModelList(filter: 'all' | 'auto' | 'manual' = 'all'): string[] {
  const config = getConfig();
  const list: string[] = [];
  
  if (filter === 'all' || filter === 'auto') {
    list.push('mc/auto');
  }
  
  if (filter === 'all' || filter === 'manual') {
    for (const provider of config.providers) {
      for (const model of provider.models) {
        list.push(`${provider.name}/${model}`);
      }
    }
  }
  
  return list;
}

export function switchModel(model: string): { success: boolean; message: string } {
  if (!model) {
    return { success: false, message: 'Please specify a model ID' };
  }
  
  const config = getConfig();
  
  // 验证模型
  let isValid = model === 'mc/auto';
  
  if (!isValid) {
    for (const provider of config.providers) {
      if (provider.models.includes(model) || model.startsWith(`${provider.name}/`)) {
        isValid = true;
        break;
      }
    }
  }
  
  if (!isValid) {
    return { 
      success: false, 
      message: `Model '${model}' not found in configuration` 
    };
  }
  
  // 保存上下文
  const ctx = loadModelContext();
  if (ctx.currentModel) {
    ctx.history = ctx.history || [];
    ctx.history.push(ctx.currentModel);
    if (ctx.history.length > 10) ctx.history.shift();
  }
  ctx.currentModel = model;
  ctx.switchedAt = new Date().toISOString();
  saveModelContext(ctx);
  
  return { 
    success: true, 
    message: `Switched to model: ${model}`
  };
}

export function getCurrentModel(): { currentModel: string; switchedAt: string | null } {
  const ctx = loadModelContext();
  return {
    currentModel: ctx.currentModel || 'mc/auto',
    switchedAt: ctx.switchedAt || null
  };
}

// ============================================================================
// Agent 命令注册
// ============================================================================

/**
 * 注册 /mc-model 命令到当前 agent
 */
export function registerMcModelCommand(agentType: string): void {
  // 这里应该与 agent 的交互层集成
  // 例如：Claude Code 的 slash commands, OpenCode 的工具等
  
  console.log(`[MC] Registering /mc-model command for ${agentType}`);
  
  // 实际注册逻辑由 agent 自身处理
  // 这里提供一个回调函数供 agent 调用
}

/**
 * /mc-model 命令处理函数
 */
export async function handleMcModelCommand(args: string[]): Promise<void> {
  const subCommand = args[0] || 'list';
  
  switch (subCommand) {
    case 'list':
      await handleListCommand();
      break;
    case 'switch':
      await handleSwitchCommand(args[1]);
      break;
    case 'current':
      await handleCurrentCommand();
      break;
    case 'auto':
      await handleSwitchCommand('mc/auto');
      break;
    default:
      if (subCommand) {
        // 假设输入的是模型ID，直接切换
        await handleSwitchCommand(subCommand);
      } else {
        await handleListCommand();
      }
  }
}

async function handleListCommand(): Promise<void> {
  const models = getModelList('all');
  console.log('\n🧭 Model Compass - Available models:\n');
  console.log('  mc/auto - Auto routing mode');
  console.log('');
  
  const config = getConfig();
  for (const provider of config.providers) {
    if (provider.models.length > 0) {
      console.log(`  ${provider.name}:`);
      for (const model of provider.models) {
        console.log(`    • ${model}`);
      }
    }
  }
  
  console.log('\n💡 Usage:');
  console.log('   /mc-model switch <model-id>');
  console.log('   /mc-model auto');
  console.log('   /mc-model current\n');
}

async function handleSwitchCommand(modelId?: string): Promise<void> {
  if (!modelId) {
    console.log('❌ Please specify a model ID');
    return;
  }
  
  const result = switchModel(modelId);
  if (result.success) {
    console.log(`✅ ${result.message}`);
  } else {
    console.log(`❌ ${result.message}`);
  }
}

async function handleCurrentCommand(): Promise<void> {
  const current = getCurrentModel();
  console.log(`\n🧭 Current model: ${current.currentModel}`);
  if (current.switchedAt) {
    console.log(`🕐 Switched at: ${current.switchedAt}`);
  }
  console.log('');
}

// ============================================================================
// 插件定义
// ============================================================================

export const plugin: AgentPlugin = {
  type: PluginType.AGENT,
  metadata: {
    id: 'agent-mc-model',
    name: 'MC Model Switcher',
    version: '1.0.0',
    description: 'Provides /mc-model command support for all agents',
    categories: ['agent-tools', 'model-management'],
    tags: ['model-switch', 'cli-commands']
  },
  
  supportedTypes: ['claude-code', 'opencode', 'cursor', 'windsurf'],
  
  async onActivate(context: PluginContext): Promise<void> {
    console.log('🔧 MC Model Switcher activated');
    
    // 注册命令到当前激活的 agent
    const agentType = context.currentAgent || 'unknown';
    registerMcModelCommand(agentType);
  },
  
  async onDeactivate(context: PluginContext): Promise<void> {
    console.log('🔧 MC Model Switcher deactivated');
  },
  
  async initialize(context) {
    console.log('🧭 MC Model Switcher initialized');
  },
  
  async dispose() {
    console.log('🧭 MC Model Switcher disposed');
  }
};

// ============================================================================
// 命令行工具（用于测试和独立使用）
// ============================================================================

if (require.main === module) {
  // 直接运行时的命令行支持
  const args = process.argv.slice(2);
  handleMcModelCommand(args).catch(console.error);
}

export default plugin;
