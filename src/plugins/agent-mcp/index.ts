/**
 * MCP Agent Plugin for Model Compass
 * 
 * Provides model switching capabilities as MCP tools
 * that can be used by Claude Code and other MCP clients.
 * 
 * This plugin registers as an AGENT type plugin and provides
 * tools for model management.
 */

import { PluginType, AgentPlugin, PluginContext } from '../types';
import { loadConfig, getConfig } from '../../config';
import * as fs from 'fs';
import * as path from 'path';

interface ModelContext {
  currentModel?: string;
  switchedAt?: string;
  history?: string[];
}

function getModelContextPath(): string {
  return path.join(
    process.env.HOME || process.env.USERPROFILE || '.',
    '.model-compass',
    'mcp-model-context.json'
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

export const plugin: AgentPlugin = {
  type: PluginType.AGENT,
  metadata: {
    id: 'agent-mcp-tools',
    name: 'MCP Model Tools',
    version: '1.0.0',
    description: 'MCP tool set for model switching and management',
    categories: ['mcp', 'model-management'],
    tags: ['mcp', 'model-switch', 'agent-tools']
  },
  
  supportedTypes: ['mcp', 'mcp-tools', 'model-switcher'],
  
  async onActivate(context: PluginContext): Promise<void> {
    console.log('🔧 MCP Model Tools activated');
  },
  
  async onDeactivate(context: PluginContext): Promise<void> {
    console.log('🔧 MCP Model Tools deactivated');
  },
  
  async initialize(context) {
    console.log('🧭 MCP Model Tools initialized');
  },
  
  async dispose() {
    console.log('🧭 MCP Model Tools disposed');
  }
};

/**
 * Get list of available models
 */
export function getModelList(filter: 'all' | 'auto' | 'manual' = 'all'): string[] {
  const config = getConfig();
  const list: string[] = [];
  
  // Auto mode
  if (filter === 'all' || filter === 'auto') {
    list.push('mc/auto - Auto routing mode (intelligently selects best model)');
  }
  
  // Manual models from providers
  if (filter === 'all' || filter === 'manual') {
    for (const provider of config.providers) {
      for (const model of provider.models) {
        list.push(`${model} [${provider.name}]`);
      }
    }
  }
  
  return list;
}

/**
 * Switch to a specific model
 */
export function switchModel(model: string, providerHint?: string): { success: boolean; message: string } {
  if (!model) {
    return { success: false, message: 'Please specify a model ID. e.g. mc/auto, anthropic/claude-3.5-sonnet' };
  }
  
  const config = getConfig();
  
  // Validate model
  let isValid = model === 'mc/auto';
  let matchedProvider = '';
  
  if (!isValid) {
    for (const provider of config.providers) {
      if (provider.models.includes(model) || model.startsWith(`${provider.name}/`)) {
        isValid = true;
        matchedProvider = provider.name;
        break;
      }
    }
  }
  
  if (!isValid) {
    return { 
      success: false, 
      message: `Model '${model}' not found in configuration. Run mc_model_list to see available models.` 
    };
  }
  
  // Save context
  const ctx = loadModelContext();
  if (ctx.currentModel) {
    ctx.history = ctx.history || [];
    ctx.history.push(ctx.currentModel);
    if (ctx.history.length > 10) ctx.history.shift();
  }
  ctx.currentModel = model;
  ctx.switchedAt = new Date().toISOString();
  saveModelContext(ctx);
  
  const display = providerHint 
    ? `${model} (provider: ${providerHint})` 
    : model;
  
  return { 
    success: true, 
    message: `✅ Switched to model: ${display}\n🔄 Mode: ${model === 'mc/auto' ? 'Auto routing' : 'Manual'}\n📋 Recent models: ${ctx.history?.join(', ') || 'None'}`
  };
}

/**
 * Get current model
 */
export function getCurrentModel(): { currentModel: string; switchedAt: string | null; history: string[] } {
  const ctx = loadModelContext();
  return {
    currentModel: ctx.currentModel || 'mc/auto (default)',
    switchedAt: ctx.switchedAt || null,
    history: ctx.history || []
  };
}

// Export plugin as default
export default plugin;
