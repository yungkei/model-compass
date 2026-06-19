export { openaiAdapter } from './builtin/openai';
export { ollamaAdapter } from './builtin/ollama';
export { geminiAdapter } from './builtin/gemini';
export { anthropicAdapter } from './builtin/anthropic';

import { adapterRegistry } from './registry';
import { openaiAdapter } from './builtin/openai';
import { ollamaAdapter } from './builtin/ollama';
import { geminiAdapter } from './builtin/gemini';
import { anthropicAdapter } from './builtin/anthropic';

export function registerBuiltinAdapters(): void {
  adapterRegistry.register(openaiAdapter);
  adapterRegistry.register(ollamaAdapter);
  adapterRegistry.register(geminiAdapter);
  adapterRegistry.register(anthropicAdapter);
}
