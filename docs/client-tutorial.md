# MCP 客户端配置与使用教程

> 本文档教你在 **Cursor** 和 **WorkBuddy/CodeBuddy** 中配置并使用 Cognitive Exoskeleton MCP Server。

---

## 一、前置准备

### 1.1 确认环境

```bash
# 确认 Node.js 版本 >= 18
node -v

# 确认项目已构建
cd d:\007
npm install && npm run build
```

构建成功后，`dist/index.js` 即为可运行的 MCP Server 单文件。

### 1.2 确认 LLM 调用模式

Cognitive Exoskeleton 支持两种 LLM 调用模式：

| 模式 | 说明 | 需要配置 API Key |
|---|---|---|
| **Sampling**（推荐） | 复用 MCP 客户端（Cursor/WorkBuddy）已配置的模型 | 不需要 |
| **Direct** | 自行连接外部 OpenAI 兼容 API | 需要 |

**Sampling 模式（零配置）**：无需任何额外配置，MCP Server 会自动通过 MCP 协议委托客户端调用 LLM。客户端使用自己已配置的模型（Cursor 的 Claude/GPT、WorkBuddy 的模型等）。

**Direct 模式**：需要一个 OpenAI 兼容的 LLM API 端点。以下任选其一：

| 方案 | API 地址 | 模型名 | API Key |
|---|---|---|---|
| Hy3 本地 vLLM | `http://127.0.0.1:8000/v1` | `hy3` | `EMPTY` |
| Hy3 官方 API | `https://api.hunyuan.tencent.com/v1` | `hy3` | 你的 Key |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` | `sk-...` |
| Ollama 本地 | `http://localhost:11434/v1` | `qwen2.5:32b` | `EMPTY` |

### 1.3 手动验证 Server 能启动

```bash
# Sampling 模式（零配置）
node dist/index.js

# Direct 模式 — Linux / macOS
export LLM_MODE=direct
export LLM_API_BASE="http://127.0.0.1:8000/v1"
export LLM_API_KEY="EMPTY"
export LLM_MODEL_NAME="hy3"
node dist/index.js

# Direct 模式 — Windows PowerShell
$env:LLM_MODE="direct"
$env:LLM_API_BASE="http://127.0.0.1:8000/v1"
$env:LLM_API_KEY="EMPTY"
$env:LLM_MODEL_NAME="hy3"
node dist/index.js
```

如果看到 `[cognitive-exoskeleton] MCP Server started — 8 tools registered (stdio, llm=sampling)` 或 `llm=direct` 即说明正常。按 `Ctrl+C` 退出。

---

## 二、Cursor 配置教程

### 2.1 创建配置文件

在项目根目录创建 `.cursor/mcp.json`（如果已有该目录则直接创建文件）：

```bash
mkdir -p .cursor
```

将以下内容写入 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "cognitive-exoskeleton": {
      "command": "node",
      "args": ["d:/007/dist/index.js"],
      "env": {
        "LLM_MODE": "sampling",
        "COGNITIVE_DB_PATH": "d:/007/cognitive.db"
      }
    }
  }
}
```

> Sampling 模式复用 Cursor 已配置的模型，无需 API key。如需使用独立 API，改为 `"LLM_MODE": "direct"` 并配置 `LLM_API_BASE` / `LLM_API_KEY` / `LLM_MODEL_NAME`。

**注意**：
- `args` 中的路径需要替换为你的**实际项目路径**，Windows 用正斜杠 `/` 或双反斜杠 `\\`
- `COGNITIVE_DB_PATH` 为知识图谱数据库存储位置，可以自定义

### 2.2 重启 Cursor

配置完成后，**重启 Cursor** 或在 Cursor 设置中刷新 MCP Server 列表。

### 2.3 验证连接

1. 打开 Cursor 的 AI Chat（`Ctrl+L` 或 `Cmd+L`）
2. 输入以下问题来测试 MCP 连接：

```
请调用 cognitive-exoskeleton 的 analyze_cognitive_topology 工具，
分析我当前的知识图谱结构。
```

如果看到类似"你的知识图谱是空的"的回复，说明连接成功。

### 2.4 Cursor 中使用技巧

- 在 Chat 中直接说"导入这篇笔记到知识图谱"，Cursor 会自动调用 `ingest_note`
- 写代码时可以说"回忆一下我之前关于 XX 的笔记"，触发 `recall_context`
- 所有 8 个工具都可以通过自然语言触发，Cursor 会根据描述自动选择

---

## 三、WorkBuddy / CodeBuddy 配置教程

### 3.1 方式一：CLI 命令添加（推荐）

```bash
# 基本添加
codebuddy mcp add cognitive-exoskeleton \
  --command "node" \
  --arg "d:/007/dist/index.js" \
  --env LLM_MODE=sampling \
  --env COGNITIVE_DB_PATH=d:/007/cognitive.db
```

添加后可以查看已配置的 MCP 列表：

```bash
codebuddy mcp list
```

### 3.2 方式二：项目级配置文件

在项目根目录创建 `.codebuddy/mcp.json`：

```json
{
  "mcpServers": {
    "cognitive-exoskeleton": {
      "command": "node",
      "args": ["d:/007/dist/index.js"],
      "cwd": "d:/007",
      "env": {
        "LLM_MODE": "sampling",
        "COGNITIVE_DB_PATH": "d:/007/cognitive.db"
      }
    }
  }
}
```

### 3.3 验证连接

在 WorkBuddy/CodeBuddy 的 Chat 中输入：

```
请使用认知外骨骼的 analyze_cognitive_topology 工具，看看我的知识图谱结构。
```

---

## 四、八个工具的功能与触发方式

下面列出每个工具的名称、参数、功能说明，以及**在 Cursor/WorkBuddy 中的自然语言触发示例**。

### 4.1 `ingest_note` — 知识抽取

| 项目 | 说明 |
|---|---|
| **参数** | `content` (文本内容，可选) 或 `file_path` (文件路径，可选) |
| **功能** | 从笔记/文档中抽取实体和关系，写入知识图谱 |
| **触发示例** | "把这段文字导入知识图谱：CAP 定理指出分布式系统最多只能同时满足一致性、可用性和分区容错性中的两个" |
| | "读取 `examples/sample-notes/distributed-systems.md` 并导入知识图谱" |

### 4.2 `query_mind` — 图谱问答

| 项目 | 说明 |
|---|---|
| **参数** | `question` (问题，必填), `depth` (检索深度: `shallow`/`deep`，可选) |
| **功能** | 基于知识图谱回答问题 |
| **触发示例** | "我对 CAP 定理了解多少？" |
| | "深度检索一下关于共识算法的知识" |

### 4.3 `recall_context` — 上下文召回

| 项目 | 说明 |
|---|---|
| **参数** | `current_text` (当前正在写的文本，必填), `max_results` (最大返回数，可选) |
| **功能** | 根据你正在写的内容，自动召回相关但可能遗忘的旧笔记 |
| **触发示例** | "我正在写关于数据库一致性模型的章节，帮我回忆相关知识" |

### 4.4 `discover_connections` — 跨域连接发现

| 项目 | 说明 |
|---|---|
| **参数** | `topic` (话题，可选，不给则全图扫描) |
| **功能** | 发现不同领域间隐藏的、非显而易见的知识关联 |
| **触发示例** | "分布式系统和机器学习之间有什么隐藏联系？" |
| | "扫描我的知识图谱，找到跨域连接" |

### 4.5 `detect_blindspots` — 盲点检测

| 项目 | 说明 |
|---|---|
| **参数** | `topic` (话题，必填) |
| **功能** | 分析某话题的知识覆盖度，识别盲点、矛盾和缺失视角 |
| **触发示例** | "分析我对'分布式系统'理解的盲点" |

### 4.6 `analyze_cognitive_topology` — 认知拓扑分析

| 项目 | 说明 |
|---|---|
| **参数** | `domain` (限定分析范围，可选) |
| **功能** | 生成「认知画像」：知识孤岛、桥梁概念、密集区/空白区 |
| **触发示例** | "展示我的知识图谱整体结构" |
| | "分析一下 distributed-systems 这个域的拓扑" |

### 4.7 `trace_concept_evolution` — 概念演化追踪

| 项目 | 说明 |
|---|---|
| **参数** | `concept` (概念名称，必填) |
| **功能** | 追踪你对某个概念的理解如何随时间变化 |
| **触发示例** | "追踪一下我对'共识算法'的理解是如何演变的" |

### 4.8 `spark_serendipity` — 灵感碰撞

| 项目 | 说明 |
|---|---|
| **参数** | `domain_a` (第一个知识域，必填), `domain_b` (第二个知识域，必填) |
| **功能** | 碰撞两个不同领域的概念，激发跨域创造性灵感 |
| **触发示例** | "碰撞 distributed-systems 和 machine-learning 这两个领域" |

---

## 五、常见问题

### Q: Cursor 中看不到 MCP 工具列表？
- 确认 `.cursor/mcp.json` 路径正确（在项目根目录下）
- 确认 `dist/index.js` 文件存在
- 重启 Cursor

### Q: 工具调用报错 "Connection refused"？
- 确认 `LLM_API_BASE` 指向的 LLM 服务正在运行
- 尝试用 curl 测试 API：`curl http://127.0.0.1:8000/v1/models`

### Q: 导入笔记后查询没有结果？
- 确认 `ingest_note` 返回了 "Ingestion complete"
- 查询时使用的关键词要和笔记内容匹配
- 可以先用 `analyze_cognitive_topology` 确认图谱中有数据

### Q: 如何重置知识图谱？
- 删除 `COGNITIVE_DB_PATH` 指向的数据库文件（默认 `cognitive.db`）
- 下次调用工具时会自动创建新的空数据库

---

## 六、配置模板快速复制

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "cognitive-exoskeleton": {
      "command": "node",
      "args": ["<你的项目路径>/dist/index.js"],
      "env": {
        "LLM_API_BASE": "<你的API地址>",
        "LLM_API_KEY": "<你的API Key>",
        "LLM_MODEL_NAME": "<模型名>"
      }
    }
  }
}
```

### WorkBuddy/CodeBuddy CLI

```bash
codebuddy mcp add cognitive-exoskeleton \
  --command "node" \
  --arg "<你的项目路径>/dist/index.js" \
  --env LLM_API_BASE=<你的API地址> \
  --env LLM_API_KEY=<你的API Key> \
  --env LLM_MODEL_NAME=<模型名>
```