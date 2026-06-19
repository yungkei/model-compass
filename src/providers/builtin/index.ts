import { adapterRegistry } from '../registry';
import { openaiAdapter } from './openai';
import { ollamaAdapter } from './ollama';
import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';

export { openaiAdapter } from './openai';
export { ollamaAdapter } from './ollama';
export { anthropicAdapter } from './anthropic';
export { geminiAdapter } from './gemini';

export const BUILTIN_ADAPTERS = [
  openaiAdapter,
  ollamaAdapter,
  anthropicAdapter,
  geminiAdapter
];

export function registerBuiltinAdapters(): void {
  for (const adapter of BUILTIN_ADAPTERS) {
    adapterRegistry.register(adapter);
  }
}
