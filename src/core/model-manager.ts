/**
 * ModelManager - Core model management service
 * 
 * Provides model list, switching, and history tracking
 * Used by CLI, API, and agent plugins
 */

import { loadConfig, getConfig } from '../config';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Type Definitions
// ============================================================================

export interface ModelContext {
  currentModel: string;
  switchedAt: string;
  history: string[];
}

export interface ModelInfo {
  id: string;           // e.g. "mc/auto" or "anthropic/claude-3.5-sonnet"
  provider?: string;    // e.g. "openrouter"
  name: string;         // display name
  description?: string;
  isAuto: boolean;      // is mc/auto
}

// ============================================================================
// Context persistence
// ============================================================================

function getModelContextPath(): string {
  return path.join(
    process.env.HOME || process.env.USERPROFILE || '.',
    '.model-compass',
    'model-context.json'
  );
}

export function loadModelContext(): ModelContext {
  const ctxPath = getModelContextPath();
  try {
    if (fs.existsSync(ctxPath)) {
      return JSON.parse(fs.readFileSync(ctxPath, 'utf-8'));
    }
  } catch {}
  return {
    currentModel: 'mc/auto',
    switchedAt: new Date().toISOString(),
    history: []
  };
}

export function saveModelContext(ctx: ModelContext): void {
  const ctxPath = getModelContextPath();
  const dir = path.dirname(ctxPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(ctxPath, JSON.stringify(ctx, null, 2));
}

// ============================================================================
// Core Model Functions
// ============================================================================

/**
 * Get list of available models
 */
export function getAvailableModels(): ModelInfo[] {
  const config = getConfig();
  const models: ModelInfo[] = [];
  
  // Auto mode
  models.push({
    id: 'mc/auto',
    name: 'mc/auto',
    description: 'Auto routing mode - MC intelligently selects the best model',
    isAuto: true
  });
  
  // Provider models
  for (const provider of config.providers) {
    for (const model of provider.models) {
      models.push({
        id: model,
        provider: provider.name,
        name: model,
        description: `${provider.name} - ${model}`,
        isAuto: false
      });
    }
  }
  
  return models;
}

/**
 * Validate if a model ID is valid
 */
export function isValidModel(modelId: string): boolean {
  if (modelId === 'mc/auto') return true;
  
  const config = getConfig();
  for (const provider of config.providers) {
    if (provider.models.includes(modelId) || modelId.startsWith(`${provider.name}/`)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Switch to a specific model
 */
export function switchModel(modelId: string): { success: boolean; message: string; model?: string } {
  if (!modelId) {
    return { success: false, message: 'Please specify a model ID' };
  }
  
  if (!isValidModel(modelId)) {
    return { success: false, message: `No model '${modelId}' found in config` };
  }
  
  // Save context
  const ctx = loadModelContext();
  if (ctx.currentModel && ctx.currentModel !== modelId) {
    ctx.history.push(ctx.currentModel);
    if (ctx.history.length > 10) {
      ctx.history.shift();
    }
  }
  ctx.currentModel = modelId;
  ctx.switchedAt = new Date().toISOString();
  saveModelContext(ctx);
  
  return { 
    success: true, 
    message: `Switched to: ${modelId}`,
    model: modelId
  };
}

/**
 * Get current model info
 */
export function getCurrentModel(): { currentModel: string; switchedAt: string; history: string[] } {
  const ctx = loadModelContext();
  return {
    currentModel: ctx.currentModel || 'mc/auto',
    switchedAt: ctx.switchedAt || new Date().toISOString(),
    history: ctx.history || []
  };
}

/**
 * Get current model ID (shortcut)
 */
export function getCurrentModelId(): string {
  return loadModelContext().currentModel || 'mc/auto';
}

// ============================================================================
// CLI Helpers
// ============================================================================

/**
 * Format model list for display
 */
export function formatModelList(models: ModelInfo[]): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('🧭 Model Compass - Available models:\n');
  
  // Auto mode first
  const autoModel = models.find(m => m.isAuto);
  if (autoModel) {
    lines.push('  mc/auto - Auto routing mode');
    lines.push('');
  }
  
  // Group by provider
  const grouped = new Map<string, ModelInfo[]>();
  for (const model of models) {
    if (model.isAuto) continue;
    const provider = model.provider || 'unknown';
    if (!grouped.has(provider)) {
      grouped.set(provider, []);
    }
    grouped.get(provider)!.push(model);
  }
  
  for (const [provider, providerModels] of grouped) {
    if (providerModels.length === 0) continue;
    lines.push(`  ${provider}:`);
    for (const model of providerModels) {
      lines.push(`    • ${model.name}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Auto-complete helper for model names
 */
export function autocompleteModel(partial: string): string[] {
  const models = getAvailableModels();
  const partialLower = partial.toLowerCase();
  
  return models
    .filter(m => 
      m.id.toLowerCase().includes(partialLower) || 
      m.name.toLowerCase().includes(partialLower)
    )
    .map(m => m.id);
}
