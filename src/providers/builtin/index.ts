import { adapterRegistry } from '../registry';
import { openaiAdapter } from './openai';
import { ollamaAdapter } from './ollama';
import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';
import { cohereAdapter } from './cohere';
import { mistralAdapter } from './mistral';
import { xaiAdapter } from './xai';
import { azureAdapter } from './azure';
import { bedrockAdapter } from './bedrock';
import { alibabaAdapter } from './alibaba';

export { openaiAdapter } from './openai';
export { ollamaAdapter } from './ollama';
export { anthropicAdapter } from './anthropic';
export { geminiAdapter } from './gemini';
export { cohereAdapter } from './cohere';
export { mistralAdapter } from './mistral';
export { xaiAdapter } from './xai';
export { azureAdapter } from './azure';
export { bedrockAdapter } from './bedrock';
export { alibabaAdapter } from './alibaba';

export const BUILTIN_ADAPTERS = [
  openaiAdapter,
  ollamaAdapter,
  anthropicAdapter,
  geminiAdapter,
  cohereAdapter,
  mistralAdapter,
  xaiAdapter,
  azureAdapter,
  bedrockAdapter,
  alibabaAdapter
];

export function registerBuiltinAdapters(): void {
  for (const adapter of BUILTIN_ADAPTERS) {
    adapterRegistry.register(adapter);
  }
}
