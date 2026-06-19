# Model Compass

<p align="center">
  <strong>智能 LLM 路由代理</strong><br>
  <em>多提供商 · 自动故障转移 · Anthropic↔OpenAI 转换 · 内置管理面板</em>
</p>

<p align="center">
  <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue?style=flat" alt="version">
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat" alt="license">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat&logo=node.js" alt="node version">
  <img src="https://img.shields.io/badge/types-TypeScript-blue?style=flat&logo=typescript" alt="typescript">
</p>

---

## 这是什么？

Model Compass 是一个轻量级、自托管的 API 网关，位于你的 LLM 应用和 AI 提供商之间。它解决三个问题：

1. **提供商多样性** — 无需修改客户端代码即可路由到 OpenAI、OpenRouter、Anthropic、DeepSeek、Ollama、Gemini 或任意 OpenAI 兼容 API
2. **弹性** — 当提供商返回 429、5xx 或超时时，自动重试备用提供商，具有可配置的重试策略和冷却规则
3. **协议转换** — `/v1/messages` 端点接收 Anthropic 的 Messages API 格式并在内部转换为 OpenAI 格式，然后将响应转换回来。这意味着 Claude Code 和其他 Anthropic 原生工具可以使用仅支持 OpenAI 格式的提供商

### 为什么选择 Model Compass？

- **无 Python 依赖** — npm 安装即可运行，单一 Node.js 进程
- **Claude Code 原生支持** — 内置 Anthropic↔OpenAI 转换，无需额外配置
- **自带 Web UI** — 运行时管理提供商和路由
- **插件系统** — 支持适配器、市场和 agent 配置扩展

## 功能特性

- **多提供商路由** — OpenAI、OpenRouter、DeepSeek、Anthropic、Gemini、Ollama、Moonshot、SiliconFlow 或任意 OpenAI 兼容 API
- **双路由模式** — 手动模式显式选择 `provider,model`，或自动模式基于延迟/优先级调度
- **自动故障转移** — 自动分类错误（限速、超时、配额、网络）并重试备用提供商，可配置冷却时间
- **Anthropic ↔ OpenAI 转换** — 完整的 `/v1/messages` 端点，支持工具调用、系统提示和 SSE 流式
- **健康检查** — 启动时立即执行 + 每 30 秒一次
- **Web 仪表盘** — 深色主题 UI，提供商管理、实时健康监控和请求统计
- **CLI 启动器** — `mc code` 自动配置 Claude Code，将其 API 指向 Model Compass
- **SSE 流式** — OpenAI 和 Anthropic 格式都支持，含工具调用累积
- **评分自动路由** — 四种策略：网络自适应、优先级、负载均衡、成本优化
- **插件系统** — Agent 插件、提供商适配器、市场扩展

## 安装

```bash
# 全局安装
npm install -g @yungkei/model-compass

# 或克隆本地运行
git clone https://github.com/yungkei/model-compass.git
cd model-compass
npm install
npm run dev
```

## 快速开始

### 1. 创建配置

```bash
mkdir -p ~/.model-compass
cp config.example.json ~/.model-compass/config.json
```

至少添加一个提供商和有效 API Key：

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

### 2. 启动服务

```bash
npm run dev
```

打开 [http://localhost:8765](http://localhost:8765)。

### 3. 发送请求

```bash
curl http://localhost:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "openrouter,anthropic/claude-3.5-sonnet", "messages": [{"role": "user", "content": "你好！"}]}'
```

## 配置说明

配置文件按以下顺序查找：`-c` 参数 → `$MC_HOME/config.json` → `~/.model-compass/config.json`

### 路由模式

- **手动模式**（`connectionMode: "manual"`）：显式指定每次请求的 `provider,model`。失败时故障转移仍生效。
- **自动模式**（`connectionMode: "auto"`）：根据评分策略自动选择最优提供商。仅在线且未冷却的提供商参与评分。

### 调度策略（自动模式）

| 策略 | 适用场景 |
|------|----------|
| `network-adaptive` | 通用——平衡优先级和最新延迟 |
| `priority-based` | 有明确的优先级顺序 |
| `load-balance` | 均衡分布负载 |
| `cost-based` | 成本优先 |

### 智能路由 / 故障转移

提供商调用失败时，自动分类错误（429、超时、5xx、配额、网络）并设置相应冷却时长。重试顺序：同一提供商的不同模型 → 按优先级排序的其他提供商 → 回退到 `autoRoute` 配置。

### 环境变量替换

API Key 支持 `${ENV_VAR}` 语法，例如 `"${OPENROUTER_API_KEY}"` 从运行时的环境变量读取。

## CLI 参考

```
Usage: mc <command> [options]

Commands:
  start     启动服务
  model     列出配置的模型
  provider  管理提供商 (list, status, add, remove)
  route     查看或设置路由
  config    查看/编辑配置
  code      启动 Claude Code 或管理 agents
  plugin    管理 agent 插件
  market    市场插件管理
```

### `mc start`

```
Options:
  -p, --port <port>        端口（默认: 8765）
  -h, --host <host>        绑定地址（默认: 0.0.0.0）
  -c, --config <path>      配置文件路径
```

### `mc code`

```
mc code [agent]             启动 agent（默认: claude）
  -s, --session <id>            恢复之前的会话
  -l, --list                    列出可用 agents

mc code use <agent>         切换默认 agent
mc code sessions            列出所有会话
mc code context             显示全局上下文
```

### `mc market`

```
Commands:
  list [-s, --search <keyword>]   列出市场插件
  install <id>                     从市场安装插件
  add <url>                        添加自定义市场
  remove <name>                    删除自定义市场
  refresh                          刷新远程仓库
```

## API 概览

| 端点 | 说明 |
|------|------|
| `GET /health` | 服务器健康状态 |
| `GET /v1` | API 版本信息 |
| `GET /v1/models` | 列出模型（OpenAI 兼容格式） |
| `POST /v1/chat/completions` | OpenAI 兼容聊天补全 |
| `POST /v1/chat/completions/stream` | SSE 流式聊天补全 |
| `POST /v1/messages` | Anthropic Messages API（自动转换为 OpenAI） |
| `GET /providers` | 列出提供商及健康状态 |
| `POST /providers/add` | 添加提供商 |
| `POST /providers/update` | 更新提供商 |
| `POST /providers/delete` | 删除提供商 |
| `POST /reload` | 从磁盘重新加载配置 |
| `GET /routes` | 查看路由映射 |
| `POST /routes/save` | 保存路由配置 |
| `GET /stats` | 请求统计 |
| `GET /auto-schedule` | 自动调度状态及评分 |

### 模型选择优先级

1. `x-model` HTTP 头（如 `x-model: openrouter,gpt-4o`）
2. `model` URL 查询参数
3. 请求体中的 `model` 字段

如果模型值包含逗号（`openrouter,gpt-4o`），第一部分为提供商名称，第二部分为实际模型 ID。

## Claude Code 集成

### 方式 1：`mc code`（推荐）

```bash
mc code
```

此命令：
1. 查找 agent 配置（默认："claude"）
2. 解析 Model Compass 代理（通过 `MC_MODEL=mc`）并从服务器配置中设置 `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY`
3. 确保服务正在运行（需要时自动启动）
4. 派生 Claude Code 进程

所有 Claude Code 的 API 调用都被 Model Compass 拦截，转换为 OpenAI 格式，发送到配置的提供商，再将响应转换回来。

### 方式 2：手动设置环境变量

```bash
export ANTHROPIC_BASE_URL=http://localhost:8765
export ANTHROPIC_API_KEY=sk-dummy
claude
```

### 方式 3：Claude Code settings.json

添加到 `~/.claude/settings.json`：
```json
{ "ANTHROPIC_BASE_URL": "http://localhost:8765" }
```

### 会话管理

```bash
mc code -s session-xxxx        # 恢复特定会话
mc code sessions                # 列出所有会话
mc code context                 # 显示当前上下文
```

## 构建与测试

```bash
npm run build            # 编译 TypeScript 到 dist/
npm run dev              # 从源码运行（ts-node，热重载）
npm run test             # 运行单元测试（vitest）
npm run test:watch       # 监听模式运行测试
```

---

## License

Apache License 2.0。详见 [LICENSE](./LICENSE)。
