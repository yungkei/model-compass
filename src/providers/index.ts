export { openaiAdapter } from './builtin/openai';
export { ollamaAdapter } from './builtin/ollama';
export { geminiAdapter } from './builtin/gemini';
export { anthropicAdapter } from './builtin/anthropic';
export { cohereAdapter } from './builtin/cohere';
export { mistralAdapter } from './builtin/mistral';
export { xaiAdapter } from './builtin/xai';
export { azureAdapter } from './builtin/azure';
export { bedrockAdapter } from './builtin/bedrock';
export { alibabaAdapter } from './builtin/alibaba';

import { adapterRegistry } from './registry';
import { openaiAdapter } from './builtin/openai';
import { ollamaAdapter } from './builtin/ollama';
import { geminiAdapter } from './builtin/gemini';
import { anthropicAdapter } from './builtin/anthropic';
import { cohereAdapter } from './builtin/cohere';
import { mistralAdapter } from './builtin/mistral';
import { xaiAdapter } from './builtin/xai';
import { azureAdapter } from './builtin/azure';
import { bedrockAdapter } from './builtin/bedrock';
import { alibabaAdapter } from './builtin/alibaba';

export function registerBuiltinAdapters(): void {
  adapterRegistry.register(openaiAdapter);
  adapterRegistry.register(ollamaAdapter);
  adapterRegistry.register(geminiAdapter);
  adapterRegistry.register(anthropicAdapter);
  adapterRegistry.register(cohereAdapter);
  adapterRegistry.register(mistralAdapter);
  adapterRegistry.register(xaiAdapter);
  adapterRegistry.register(azureAdapter);
  adapterRegistry.register(bedrockAdapter);
  adapterRegistry.register(alibabaAdapter);
}
