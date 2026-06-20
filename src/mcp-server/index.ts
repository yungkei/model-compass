#!/usr/bin/env node
/**
 * Model Compass MCP Server
 * 
 * Provides model switching capabilities as an MCP tool
 * that can be used by Claude Code and other MCP clients.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig, getConfig } from "../config/index.js";
import { getAvailableModels, switchModel as doSwitchModel, getCurrentModel, isValidModel } from "../core/model-manager";

// MCP Server
const server = new Server(
  {
    name: "model-compass-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  loadConfig();
  const config = getConfig();
  const providers = config.providers.map(p => `${p.name} (${p.models.length} models)`).join(", ");

  // Build dynamic enum for available models
  const allModels = getAvailableModels();
  const modelEnum = allModels.map((m: any) => m.id);
  
  return {
    tools: [
      {
        name: "mc_model_list",
        description: "List all available models from Model Compass. Shows both auto mode (mc/auto) and configured models from all providers. Always call this first if you need to know available models.",
        inputSchema: {
          type: "object",
          properties: {
            filter: {
              type: "string",
              description: "Optional filter: 'auto' for only auto mode, 'manual' for only manual models, 'all' for everything (default)",
              enum: ["all", "auto", "manual"],
            },
          },
        },
      },
      {
        name: "mc_model_switch",
        description: "Switch to a specific model. Use 'mc/auto' for automatic routing or any specific model ID from the list. Call mc_model_list first if you are unsure what models are available.",
        inputSchema: {
          type: "object",
          properties: {
            model: {
              type: "string",
              description: `Model ID to switch to. Available models include: ${modelEnum.slice(0, 20).join(", ")}${modelEnum.length > 20 ? "..." : ""}`,
              enum: modelEnum,
            },
            provider: {
              type: "string",
              description: "Optional: provider name if the model ID alone is ambiguous",
            },
          },
          required: ["model"],
        },
      },
      {
        name: "mc_model_current",
        description: "Get the currently active model and recent model history",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  loadConfig();
  const config = getConfig();
  
  switch (request.params.name) {
    case "mc_model_list": {
      const filter = (request.params.arguments as any)?.filter || "all";
      const list: string[] = [];
      
      // Auto mode
      if (filter === "all" || filter === "auto") {
        list.push("mc/auto - Auto routing mode (intelligently select best model)");
      }
      
      // Manual models from providers
      if (filter === "all" || filter === "manual") {
        for (const provider of config.providers) {
          for (const model of provider.models) {
            list.push(`${model} [${provider.name}]`);
          }
        }
      }
      
      return {
        content: [
          {
            type: "text",
            text: `🧭 Model Compass - Available Models (${list.length}):

${list.join("\n")}

💡 Switch: Use /mc-model or mc_model_switch tool`,
          },
        ],
      };
    }
    
    case "mc_model_switch": {
      const model = (request.params.arguments as any)?.model;
      const providerHint = (request.params.arguments as any)?.provider;
      
      if (!model) {
        return {
          content: [
            {
              type: "text",
              text: "❌ Error: Please specify a model ID. Example: mc/auto, anthropic/claude-3.5-sonnet",
            },
          ],
        };
      }
      
      // Validate model
      let isValid = model === "mc/auto";
      let matchedProvider = "";
      
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
          content: [
            {
              type: "text",
              text: `❌ Error: Model '${model}' not found in config.\n\nRun mc_model_list first to see available models.`,
            },
          ],
        };
      }
      
      // Save context via modelManager to ensure consistency
      const result = doSwitchModel(model);
      if (!result.success) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Error: ${result.message}`,
            },
          ],
        };
      }
      
      // Read the latest state after switch
      const info = getCurrentModel();
      
      const display = providerHint 
        ? `${model} (provider: ${providerHint})` 
        : model;
      
      return {
        content: [
          {
            type: "text",
            text: `✅ Switched to model: ${display}\n\n🔄 Current mode: ${model === "mc/auto" ? "Auto routing" : "Manual selection"}\n\n📋 Recently used models: ${info.history.join(", ") || "None"}`,
          },
        ],
      };
    }
    
    case "mc_model_current": {
      const info = getCurrentModel();
      
      return {
        content: [
          {
            type: "text",
            text: `🧭 Current model: ${info.currentModel}\n🕐 Switched at: ${info.switchedAt}\n\n📋 History: ${info.history.slice().reverse().join(" | ") || "None"}`,
          },
        ],
      };
    }
    
    default:
      return {
        content: [
          {
            type: "text",
            text: `❌ Unknown tool: ${request.params.name}`,
          },
        ],
      };
  }
});

// Define the 'mc-model' prompt to support #mc-model trigger in Claude
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "mc-model",
        description: "Show Model Compass help and available model commands. Use this when the user wants to know how to switch models or list available models.",
      },
    ],
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name === "mc-model") {
    const current = getCurrentModel();
    return {
      description: "Model Compass Help",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You can use the following Model Compass MCP tools to manage models:\n\n- mc_model_list: List all available models\n- mc_model_switch: Switch to a different model (e.g., 'mc/auto', 'anthropic/claude-3.5-sonnet')\n- mc_model_current: Show current model\n\nCurrent model: ${current.currentModel}\nLast switched: ${current.switchedAt}`,
          },
        },
      ],
    };
  }
  throw new Error("Unknown prompt");
});
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Model Compass MCP Server running on stdio");

  // Graceful shutdown on stdio close
  process.stdin.on("close", () => {
    process.exit(0);
  });

  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
