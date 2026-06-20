# Model Compass

<p align="center">
  <strong>Intelligent LLM routing proxy</strong><br>
  <em>Multi-provider · Automatic failover · Anthropic↔OpenAI conversion · Built-in dashboard</em>
</p>

<p align="center">
  <a href="README-zh.md">中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/@yungkei/model-compass?style=flat" alt="version">
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat" alt="license">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat&logo=node.js" alt="node version">
  <img src="https://img.shields.io/badge/types-TypeScript-blue?style=flat&logo=typescript" alt="typescript">
</p>

---

## What is Model Compass?

Model Compass is a lightweight, self-hosted API gateway that sits between your LLM-powered applications and the AI providers they depend on. It solves three problems at once:

1. **Provider diversity** — Route requests to OpenAI, OpenRouter, Anthropic, DeepSeek, Ollama, Gemini, or any OpenAI-compatible API without changing your client code.
2. **Resilience** — When a provider returns a 429, 5xx, or times out, Model Compass automatically retries with fallback providers based on configurable retry policies and cooldown rules.
3. **Protocol translation** — The `/v1/messages` endpoint accepts Anthropic's Messages API format and converts it to OpenAI format, then converts the response back. This means Claude Code and other Anthropic-native tools can use providers that only support OpenAI format.

### Why Model Compass?

- **Zero Python dependencies** — install with npm, run as a single Node.js process
- **Claude Code native** — built-in Anthropic↔OpenAI conversion
- **Web UI included** — manage providers and routes at runtime
- **Plugin system** — extend with adapters, marketplaces, and agent configs

## Features

- **Multi-provider routing** — OpenAI, OpenRouter, DeepSeek, Anthropic, Gemini, Ollama, Moonshot, SiliconFlow, or any OpenAI-compatible API
- **Dual routing modes** — Manual mode for explicit `provider,model` selection, or Auto mode for latency/priority-based automatic scheduling
- **Automatic failover** — Classifies errors (rate limit, timeout, quota, network) and retries fallback providers with configurable cooldowns
- **Anthropic ↔ OpenAI conversion** — Full `/v1/messages` endpoint with tool calls, system prompts, and SSE streaming
- **Health checks** — Immediate startup check + 30-second intervals per provider
- **Web dashboard** — Dark-theme UI for provider and route management, real-time health monitoring, request statistics
- **CLI launcher** — `mc code` auto-configures Claude Code to use Model Compass as its API proxy
- **SSE streaming** — Both OpenAI and Anthropic-format streaming with tool call accumulation
- **Scoring-based auto routing** — Four strategies: network-adaptive, priority-based, load-balance, cost-optimized
- **Plugin system** — Agent plugins, provider adapters, and marketplace for extending functionality

## Installation

```bash
# Global install (recommended)
npm install -g @yungkei/model-compass

# Or clone and build locally
git clone https://github.com/yungkei/model-compass.git
cd model-compass
npm install
npm run build
```

## Quick Start

### 1. Start the server

```bash
mc start
```

Open [http://localhost:8765](http://localhost:8765) to access the **management dashboard**, where you can add providers, configure routes, and monitor health — all from the browser.

### 2. Add a provider

In the dashboard, click **Add Provider** and fill in:
- **Provider Name** — e.g. `openrouter`
- **API Base URL** — e.g. `https://openrouter.ai/api/v1`
- **API Key** — your provider key
- **Models** — comma-separated model IDs

Or create a config file manually:

```bash
mkdir -p ~/.model-compass
cp config.example.json ~/.model-compass/config.json
```

```json
{
  "version": "1.0.0",
  "server": { "host": "0.0.0.0", "port": 8765 },
  "providers": [
    {
      "name": "openrouter",
      "type": "openai",
      "api_base_url": "https://openrouter.ai/api/v1",
      "api_key": "sk-or-v1-...",
      "models": ["anthropic/claude-3.5-sonnet"],
      "priority": 1
    }
  ],
  "router": { "default": "openrouter,anthropic/claude-3.5-sonnet" },
  "connectionMode": "manual"
}
```

### 3. Use it

**Option A: Launch Claude Code**

```bash
# Write Claude Code config file (sets ANTHROPIC_BASE_URL to local proxy)
mc plugin install claude

# Launch Claude Code through the proxy
mc code
```

**Option B: Send API requests**

```bash
curl http://localhost:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "openrouter,anthropic/claude-3.5-sonnet", "messages": [{"role": "user", "content": "Hello!"}]}'
```

### 4. (Optional) Install more plugins

```bash
# Quick setup — install commonly used integrations
mc init --quick

# Browse available plugins
mc plugin market list

# Install specific integrations
mc plugin install cursor
mc plugin install opencode
```

## Configuration Overview

Config file is loaded from: `-c` flag → `$MC_HOME/config.json` → `~/.model-compass/config.json`

### Routing Modes

- **Manual mode** (`connectionMode: "manual"`): Explicitly specify `provider,model` per-request. Fallback still works on failure.
- **Auto mode** (`connectionMode: "auto"`): Model Compass selects the best provider based on a scoring strategy. Only online, non-cooling providers are eligible.

### Scheduling Strategies (Auto Mode)

| Strategy | Best for |
|----------|----------|
| `network-adaptive` | Balances priority with recent latency |
| `priority-based` | Clear preference order |
| `load-balance` | Distribute load evenly |
| `cost-based` | Minimize cost |

### Smart Routing / Failover

When a provider call fails, Model Compass classifies the error (429, timeout, 5xx, quota, network) and applies appropriate cooldown durations. `findNextAvailable()` tries different models on the same provider, then other providers sorted by priority, then falls back to `autoRoute` config if set.

### Environment Variable Substitution

API keys support `${ENV_VAR}` syntax — for example `"${OPENROUTER_API_KEY}"` reads from the `OPENROUTER_API_KEY` environment variable at runtime.

## CLI Reference

```
Usage: mc <command> [options]

Commands:
  start      Start Model Compass service
  model      Manage model list
  provider   Manage providers (list, status, add, remove)
  route      View or set routes
  config     View/edit configuration
  code       Start agent or manage agents
  plugin     Manage plugins (marketplace, npm, GitHub, agent adapters)
  adapter    Manage Agent adapters (built-in + custom)
  init       Initialize with commonly used plugins
```

### `mc start`

```
Options:
  -p, --port <port>        Port (default: 8765)
  -h, --host <host>        Bind address (default: 0.0.0.0)
  -c, --config <path>      Config file path
```

### `mc code`

```
mc code [agent]            Start agent (default: claude)
  -s, --session <id>           Resume a session
  -l, --list                   List available agents

mc code use <agent>        Switch default agent
mc code sessions           List all sessions
mc code context            Show global context
```

### `mc plugin`

```
Commands:
  install <id>                         Install from marketplace or npm
  install-npm <package> [version]      Install directly from npm
  install-github <repo> [ref]          Install from GitHub
  install-agent <name>                 Install agent adapter (claude, cursor...)
  list                                 List all installed plugins
  list-agents                          List agent adapter plugins
  search <keyword>                     Search marketplace
  uninstall <id>                       Uninstall a plugin
  reload                               Reload all plugins from disk
  market list [-s <keyword>]           List marketplace plugins
  market add <url>                     Add custom marketplace
  market remove <name>                 Remove custom marketplace
  market refresh                       Refresh remote registries
  market config                        Show marketplace configuration
```

### `mc init`

```
Options:
  --quick     Install commonly used plugins (claude, opencode, cursor)
  --list      List all available plugins for setup
```

### `mc adapter`

```
Commands:
  list                   List all available adapters
  installed              Show installed adapters
  install <id>           Install adapter
  uninstall <id>         Uninstall adapter
  reload                 Reload custom adapters
  create <id>            Create custom adapter template
  remove <id>            Delete custom adapter
  dev                    Show custom adapter dev guide
```

## API Overview

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Server health status |
| `GET /v1` | API version info |
| `GET /v1/models` | List models (OpenAI-compatible format) |
| `POST /v1/chat/completions` | OpenAI-compatible chat completion |
| `POST /v1/chat/completions/stream` | SSE streaming chat completion |
| `POST /v1/messages` | Anthropic Messages API (auto-converts to OpenAI) |
| `GET /providers` | List providers with health status |
| `POST /providers/add` | Add a provider |
| `POST /providers/update` | Update a provider |
| `POST /providers/delete` | Delete a provider |
| `POST /reload` | Reload config from disk |
| `GET /routes` | View route mappings |
| `POST /routes/save` | Save route configuration |
| `GET /stats` | Request statistics |
| `GET /auto-schedule` | Auto-scheduling state with scores |

### Model Selection Priority

1. `x-model` HTTP header (e.g., `x-model: openrouter,gpt-4o`)
2. `model` query parameter
3. Request body `model` field

If the model value contains a comma (`openrouter,gpt-4o`), the first part is the provider name and the second is the model ID.

## Claude Code Integration

> **Note:** `mc code` is a pure launcher — it spawns the agent process but does **not** install any plugins. To write config files for Claude Code (or other agents), run `mc plugin install <id>` first.

### Method 1: `mc code` (recommended)

```bash
# Optional: write config files first
mc plugin install claude

# Launch Claude Code
mc code
```

This command:
1. Finds the agent config (default: "claude")
2. Resolves the Model Compass proxy (via `MC_MODEL=mc`) and sets `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY` from your server config
3. Ensures the server is running (starts it if needed)
4. Spawns Claude Code with inherited stdio

All Claude Code API calls to `/v1/messages` are intercepted, converted to OpenAI format, sent to your configured provider, and the response is converted back.

### Method 2: Manual environment setup

```bash
export ANTHROPIC_BASE_URL=http://localhost:8765
export ANTHROPIC_API_KEY=sk-dummy
claude
```

### Method 3: Claude Code settings.json

Add to `~/.claude/settings.json`:
```json
{ "ANTHROPIC_BASE_URL": "http://localhost:8765" }
```

### Session Management

```bash
mc code -s session-xxxx        # Resume a specific session
mc code sessions                # List all sessions
mc code context                 # Show current context
```

## Build & Test

```bash
npm run build          # Compile TypeScript to dist/
npm run dev            # Run from source (ts-node, hot-reload)
npm run test           # Run unit tests (vitest)
npm run test:watch     # Run tests in watch mode
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE).
