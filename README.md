# Cognitive Exoskeleton MCP Server

> **个人认知外骨骼** — 基于知识图谱 + LLM 推理的「第二大脑」MCP Server
>
> **Your Personal Cognitive Exoskeleton** — a "second brain" MCP Server powered by knowledge graph + LLM reasoning

**当前版本：v1.0.0**（详见文末[版本说明](#版本说明)）

---

## 中文文档

### 这是什么？写给第一次接触的朋友

Cognitive Exoskeleton（认知外骨骼）是一款**帮你把笔记变成「会思考的知识网络」的工具**。

先打个比方：普通笔记软件像一叠散乱的卡片，而它会把你的笔记**自动织成一张网**——

- **实体**：网上的「点」，比如一个概念（CAP 定理）、一个人（你的导师）、一个项目（毕业论文）
- **关系**：点之间的「线」，比如「A 是 B 的一部分」「A 导致 B」「A 和 B 互相引用」
- **知识图谱**：这张由点和线组成的网

你只需要把笔记交给它（`ingest_note`），AI 会自动识别出网上的点和线，存进你**本地**的数据库里。之后你可以：

- 问它「我对 CAP 定理了解多少？」——它在你的网上检索、推理后回答
- 让它「找找分布式系统和机器学习之间的隐藏联系」——它碰撞不同领域，给你灵感
- 让它「看看我知识图谱的盲区」——它指出你学过的和没学的之间的缺口
- 写作时自动召回你 3 个月前写过的相关笔记

**隐私**：所有数据（笔记、图谱）只存在你本机的 SQLite 文件里（默认 `./cognitive.db`），不上传任何服务器。

---

### 功能特性

提供 **8 个 MCP 工具**，分为四个层次：

| 层次 | 工具 | 功能 |
| --- | --- | --- |
| **基础层** | `ingest_note` | 从笔记/文档中抽取实体和关系，写入知识图谱 |
| | `query_mind` | 基于知识图谱回答问题，支持浅层/深层检索 |
| | `recall_context` | 写作时自动召回相关但可能遗忘的旧笔记 |
| **推理层** | `discover_connections` | 发现不同领域间隐藏的、非显而易见的知识关联 |
| | `detect_blindspots` | 分析某话题的知识覆盖度，识别盲点、矛盾和缺失视角 |
| | `analyze_cognitive_topology` | 生成「认知画像」：知识孤岛、桥梁概念、密集区/空白区 |
| **时间层** | `trace_concept_evolution` | 追踪你对某个概念的理解如何随时间变化 |
| **灵感层** | `spark_serendipity` | 碰撞两个不同领域的概念，激发跨域创造性灵感 |

---

### 快速开始

**环境要求**：Node.js >= 18（[下载地址](https://nodejs.org/)）

```bash
# 1. 克隆项目
git clone https://github.com/hanjiang-215/cognitive-exoskeleton-mcp.git
cd cognitive-exoskeleton-mcp

# 2. 安装依赖并构建
npm install
npm run build

# 3. 启动（默认零配置）
node dist/index.js
```

> 启动后看到 `Mode: sampling` 等日志，说明服务已正常运行，可以到 MCP 客户端里添加并开始使用了。

---

### 选择你的模型（重要）

这个工具本身不带 AI 模型，它需要一个大语言模型（LLM）来做「识别实体」「推理回答」这些事。你有两种方式接入模型：

#### 模式 A：零配置 —— 复用 IDE 自带的模型（推荐新手）

**适合**：你在 Cursor / CodeBuddy / WorkBuddy 里使用，这些工具本身已配置了 AI 模型（如 Claude、GPT）。

这种模式下，服务器通过 **MCP Sampling 协议**「借用」你正在使用的 IDE 的模型——**不需要申请任何 API key，不需要额外配置**。每次调用模型时，你的 IDE 会弹窗提示你确认。

**Cursor** — 在 `.cursor/mcp.json` 中加入：

```json
{
  "mcpServers": {
    "cognitive-exoskeleton": {
      "command": "node",
      "args": ["<项目路径>/dist/index.js"],
      "env": {
        "LLM_MODE": "sampling"
      }
    }
  }
}
```

**CodeBuddy / WorkBuddy** — 命令行添加：

```bash
codebuddy mcp add cognitive-exoskeleton \
  --command "node" \
  --arg "<项目路径>/dist/index.js" \
  --env LLM_MODE=sampling
```

#### 模式 B：自带模型 —— 不使用 IDE 模型，直连你自己的 LLM API

**适合**：你想用自己的模型（OpenAI、腾讯混元 Hy3、本地运行的 Ollama、vLLM 等），不经过 IDE。

需要设置 4 个环境变量。**注意**：环境变量的设置方式取决于你的操作系统，请对号入座。

**macOS / Linux（bash）**：

```bash
export LLM_MODE=direct
export LLM_API_BASE="https://api.openai.com/v1"
export LLM_API_KEY="sk-你的密钥"
export LLM_MODEL_NAME="gpt-4o-mini"
node dist/index.js
```

**Windows PowerShell**：

```powershell
$env:LLM_MODE = "direct"
$env:LLM_API_BASE = "https://api.openai.com/v1"
$env:LLM_API_KEY = "sk-你的密钥"
$env:LLM_MODEL_NAME = "gpt-4o-mini"
node dist/index.js
```

**Windows 命令提示符（CMD）**：

```cmd
set LLM_MODE=direct
set LLM_API_BASE=https://api.openai.com/v1
set LLM_API_KEY=sk-你的密钥
set LLM_MODEL_NAME=gpt-4o-mini
node dist/index.js
```

**常见模型提供商参考配置**（`LLM_API_BASE` + `LLM_MODEL_NAME` 的取值）：

| 模型提供商 | `LLM_API_BASE` | `LLM_MODEL_NAME` 示例 |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini`、`gpt-4o` |
| 腾讯混元 Hy3（官方 API） | `https://api.hunyuan.tencent.com/v1` | `hy3` |
| Ollama（本地） | `http://localhost:11434/v1` | `qwen2.5:32b`、`llama3.1:8b` |
| vLLM（本地） | `http://127.0.0.1:8000/v1` | `<你的模型名>` |

> **本地模型（Ollama/vLLM）提示**：这类服务不校验 key，但自动检测要求 key 不能是 `EMPTY`，建议填 `ollama` 或 `local` 这类任意字符串，并显式设置 `LLM_MODE=direct`（见下文自动检测说明）。

**在 Cursor 中使用模式 B**（在 `.cursor/mcp.json` 里直接写环境变量）：

```json
{
  "mcpServers": {
    "cognitive-exoskeleton": {
      "command": "node",
      "args": ["<项目路径>/dist/index.js"],
      "env": {
        "LLM_MODE": "direct",
        "LLM_API_BASE": "https://api.openai.com/v1",
        "LLM_API_KEY": "sk-你的密钥",
        "LLM_MODEL_NAME": "gpt-4o-mini"
      }
    }
  }
}
```

**如何验证配置生效**：启动服务后看日志——显示 `Mode: direct — <你的API地址> / <模型名>` 说明直连成功；显示 `Mode: sampling` 说明仍在使用 IDE 模型。

---

### 环境变量总表

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `LLM_MODE` | LLM 调用模式：`sampling`（借用 IDE 模型）或 `direct`（直连 API） | 自动检测* |
| `LLM_API_BASE` | (Direct) OpenAI 兼容 API 的基础 URL | `http://127.0.0.1:8000/v1` |
| `LLM_API_KEY` | (Direct) LLM 提供商的 API Key | `EMPTY` |
| `LLM_MODEL_NAME` | (Direct) 使用的模型名称 | `gpt-4o-mini` |
| `COGNITIVE_DB_PATH` | SQLite 数据库文件路径 | `./cognitive.db` |

> \* **自动检测逻辑**：如果 `LLM_API_BASE` 和 `LLM_API_KEY` **都已配置**（且 key 不是 `EMPTY`），则使用 `direct`；否则使用 `sampling`。想强制指定某个模式，就显式设置 `LLM_MODE`。

---

### 使用示例

**导入笔记**：

```
用户：请把这篇笔记导入知识图谱：
"分布式系统遵循 CAP 定理，真正选择是在 CP 和 AP 之间。"
→ 自动抽取 CAP定理、一致性、可用性等实体及关系
```

**图谱问答**：

```
用户：我对 CAP 定理了解多少？
→ 从图谱检索相关实体，LLM 推理后返回结构化答案
```

**写作时召回**：

```
用户：我正在写关于数据库一致性模型的文字...
→ 召回 3 个月前关于 CAP 定理的旧笔记
```

**发现隐藏关联**：

```
用户：分布式系统和机器学习之间有什么隐藏联系？
→ "你的'共识算法'和'反向传播'可能有关联：都通过迭代反馈达成全局一致性"
```

**盲点检测**：

```
用户：分析我对"神经网络"理解的盲点
→ "你了解 CNN、RNN、Transformer，但缺少：图神经网络、神经架构搜索、模型压缩..."
```

**认知拓扑**：

```
用户：展示我的知识图谱整体结构
→ 3 个孤岛、桥梁概念"一致性"、稀疏区域：系统安全和性能优化
```

**灵感碰撞**：

```
用户：碰撞"分布式系统"和"神经科学"
→ "大脑的神经可塑性类似于分布式系统的自适应拓扑。突触修剪 ≈ 节点退役。"
```

---

### 架构

```
MCP 客户端 (Cursor / CodeBuddy / Cline)
        │ stdio (JSON-RPC)
        │ + sampling/createMessage (Sampling 模式)
        ▼
┌──────────────────────────────────────┐
│  Cognitive Exoskeleton MCP Server   │
│                                      │
│  8 个 MCP 工具                       │
│         │                            │
│  知识图谱引擎 (SQLite + 图算法)       │
│         │                            │
│  LLM 双模式: Sampling / Direct       │
└──────────────────────────────────────┘
```

---

### 知识图谱数据模型

```sql
nodes (id, type, name, summary, domain, aliases, source_file,
       first_seen_at, last_seen_at, mention_count)
edges (id, source_id, target_id, relation, confidence, evidence, created_at)
notes_index (file_path, content_hash, node_ids, last_ingested_at)
evolution_log (id, node_id, snapshot_at, belief_summary, trigger_note, source_file)
topology_cache (snapshot_at, isolated_clusters, bridge_nodes, density_map, summary)
serendipity_log (id, node_a, node_b, hypothesis, user_feedback, created_at)
```

- **aliases（节点别名）**：多语言支持——中文笔记抽取的实体可携带英文译名等别名，检索时中英文都能命中同一节点
- **relation（关系）**：17 种枚举（`supports` / `contradicts` / `evolves_from` / `references` / `related_to` / `co_occurs` / `part_of` / `instance_of` / `causes` / `enables` / `requires` / `uses` / `implements` / `specializes` / `replaces` / `inspires` / `influences`），LLM 抽取的未识别关系会宽容降级为 `related_to`，不会中断导入

---

### 版本说明

**当前版本：v1.0.0**

| 版本 | 日期 | 主要内容 |
| --- | --- | --- |
| **v1.0.0** | 2026-03 | 首个正式版本 |

**v1.0.0 包含的能力**：

- **功能**：8 个 MCP 工具（导入/问答/召回/关联发现/盲点检测/拓扑分析/概念演化/灵感碰撞）
- **模型接入**：双模式 LLM —— 零配置 Sampling（借用 IDE 模型）+ Direct（直连 OpenAI 兼容 API）
- **知识图谱**：17 种关系枚举（含同义词归一化）、节点别名（aliases）多语言检索、`(name, domain)` 唯一性约束、自动 schema 迁移
- **中文支持**：中文关键词提取（Unicode 属性）、中文关系动词映射（导致→causes 等）、实体名保留原文语言
- **健壮性**：LLM 输出 zod 校验（宽容解析）、长笔记输出截断自动修复（括号补全 + 动态 token 预算）、工具级错误兜底、数据库原子写入
- **存储**：SQLite 纯本地（sql.js / WASM，零原生依赖）、无第三方网络请求

**变更历史**（git 提交记录）：

| 提交 | 说明 |
| --- | --- |
| `3038de5` | 初始版本 |
| `6c23ff1` | 文档与 .gitignore 完善 |
| `471a738` | 新增 LLM 双模式（Sampling/Direct），默认零配置 |
| `1ae622c` | 检索/校验/持久化加固（中文检索、zod 校验、错误兜底） |
| `79e77eb` | 关系枚举扩展至 17 种 + 同义词归一化 |
| `fa89a6d` | 截断 JSON 自动修复 + 动态 token 预算 |
| 待发布 | 节点别名（aliases）多语言检索 |

---

## English

Cognitive Exoskeleton is not just a search tool. It builds a dynamic knowledge graph from your notes, then uses LLM reasoning to **proactively discover blindspots, find hidden cross-domain connections, trace how your understanding evolves over time, and spark creative inspiration** by colliding ideas from different fields.

- All data stays local (SQLite) — privacy-first
- Zero-config: uses your MCP client's LLM via Sampling protocol — or bring your own API (Hy3, OpenAI, Ollama, vLLM, etc.)
- Plug-and-play: compatible with Cursor, CodeBuddy, WorkBuddy, Cline, and other MCP clients

**Version: v1.0.0**

### Features

**8 MCP tools** organized in four layers:

| Layer | Tool | What it does |
| --- | --- | --- |
| **Foundation** | `ingest_note` | Extract entities + relationships from notes into the knowledge graph |
| | `query_mind` | Answer questions using your knowledge graph (shallow/deep retrieval) |
| | `recall_context` | Surface forgotten notes related to what you're writing |
| **Reasoning** | `discover_connections` | Find hidden connections between knowledge from different domains |
| | `detect_blindspots` | Identify gaps, contradictions, and missing perspectives |
| | `analyze_cognitive_topology` | Generate a "cognitive portrait" — islands, bridges, dense/sparse regions |
| **Temporal** | `trace_concept_evolution` | Track how your understanding of a concept changes over time |
| **Inspiration** | `spark_serendipity` | Create creative sparks by colliding concepts from different domains |

### Quick Start

**Prerequisites**: Node.js >= 18

```bash
git clone https://github.com/hanjiang-215/cognitive-exoskeleton-mcp.git
cd cognitive-exoskeleton-mcp
npm install
npm run build

# Zero-config — automatically reuses your MCP client's LLM via Sampling
node dist/index.js
```

> **Zero-config mode**: The MCP Server delegates LLM calls to the client (Cursor, WorkBuddy, etc.) via MCP Sampling protocol. No separate API key needed.

### Choosing Your Model

**Mode A — zero-config (recommended)**: reuse your IDE's built-in model via MCP Sampling.

**Cursor** — `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cognitive-exoskeleton": {
      "command": "node",
      "args": ["<project-path>/dist/index.js"],
      "env": {
        "LLM_MODE": "sampling"
      }
    }
  }
}
```

**CodeBuddy / WorkBuddy** — CLI command:

```bash
codebuddy mcp add cognitive-exoskeleton \
  --command "node" \
  --arg "<project-path>/dist/index.js" \
  --env LLM_MODE=sampling
```

**Mode B — bring your own LLM API** (Direct mode, does not use the IDE's model):

macOS / Linux (bash):

```bash
export LLM_MODE=direct
export LLM_API_BASE="https://api.openai.com/v1"
export LLM_API_KEY="sk-..."
export LLM_MODEL_NAME="gpt-4o-mini"
node dist/index.js
```

Windows PowerShell:

```powershell
$env:LLM_MODE = "direct"
$env:LLM_API_BASE = "https://api.openai.com/v1"
$env:LLM_API_KEY = "sk-..."
$env:LLM_MODEL_NAME = "gpt-4o-mini"
node dist/index.js
```

Windows CMD:

```cmd
set LLM_MODE=direct
set LLM_API_BASE=https://api.openai.com/v1
set LLM_API_KEY=sk-...
set LLM_MODEL_NAME=gpt-4o-mini
node dist/index.js
```

**Provider reference** (Direct mode only):

| Provider | `LLM_API_BASE` | `LLM_MODEL_NAME` |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` / `gpt-4o` |
| Tencent Hunyuan Hy3 (official) | `https://api.hunyuan.tencent.com/v1` | `hy3` |
| Ollama (local) | `http://localhost:11434/v1` | `qwen2.5:32b` |
| vLLM (local) | `http://127.0.0.1:8000/v1` | `<model-name>` |

> For local models (Ollama/vLLM), the API key is not validated — use any non-`EMPTY` string (e.g. `ollama`) and set `LLM_MODE=direct` explicitly.

Verify: the startup log prints `Mode: direct — <base> / <model>` for Direct mode, or `Mode: sampling` for Sampling mode.

### Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `LLM_MODE` | LLM mode: `sampling` (delegate to client) or `direct` (API) | auto-detected* |
| `LLM_API_BASE` | (Direct) OpenAI-compatible API base URL | `http://127.0.0.1:8000/v1` |
| `LLM_API_KEY` | (Direct) API key for the LLM provider | `EMPTY` |
| `LLM_MODEL_NAME` | (Direct) Model name to use | `gpt-4o-mini` |
| `COGNITIVE_DB_PATH` | SQLite database file path | `./cognitive.db` |

> \* Auto-detection: if `LLM_API_BASE` and `LLM_API_KEY` are both set (and key is not `EMPTY`), uses `direct`; otherwise uses `sampling`. Set `LLM_MODE` explicitly to force a mode.

### Usage Examples

**Ingest a note**:

```
User: Ingest this note: "Distributed systems follow the CAP theorem..."
→ Extracts CAP Theorem, Consistency, Availability, etc. + relationships
```

**Graph Q&A**:

```
User: What do I know about the CAP theorem?
→ Retrieves related entities, LLM reasons and returns structured answer
```

**Writing recall**:

```
User: I'm writing about database consistency models...
→ Recalls notes from 3 months ago about CAP theorem
```

**Hidden connections**:

```
User: Hidden connections between distributed systems and ML?
→ "Your 'consensus algorithms' and 'backpropagation' may be related:
   both achieve global consistency through iterative feedback"
```

**Blindspot detection**:

```
User: Blindspots in my understanding of neural networks?
→ "You know CNNs, RNNs, Transformers, but missing: GNNs, NAS, model compression..."
```

**Cognitive topology**:

```
User: Show me the overall structure of my knowledge graph
→ 3 islands, bridge concept "consistency", sparse: security, optimization
```

**Serendipity spark**:

```
User: Spark between distributed-systems and neuroscience
→ "Neural plasticity ≈ adaptive topology. Synaptic pruning ≈ node decommissioning."
```

### Architecture

```
MCP Client (Cursor / CodeBuddy / Cline)
        │ stdio (JSON-RPC)
        │ + sampling/createMessage (Sampling mode)
        ▼
┌──────────────────────────────────────┐
│  Cognitive Exoskeleton MCP Server   │
│                                      │
│  8 MCP Tools                         │
│         │                            │
│  Knowledge Graph Engine              │
│  (SQLite + graph algorithms)         │
│         │                            │
│  LLM Client                          │
│  (Sampling / Direct dual mode)       │
└──────────────────────────────────────┘
```

### Knowledge Graph Schema

```sql
nodes (id, type, name, summary, domain, aliases, source_file,
       first_seen_at, last_seen_at, mention_count)
edges (id, source_id, target_id, relation, confidence, evidence, created_at)
notes_index (file_path, content_hash, node_ids, last_ingested_at)
evolution_log (id, node_id, snapshot_at, belief_summary, trigger_note, source_file)
topology_cache (snapshot_at, isolated_clusters, bridge_nodes, density_map, summary)
serendipity_log (id, node_a, node_b, hypothesis, user_feedback, created_at)
```

- **aliases**: multilingual support — Chinese entities can carry English translations, retrievable in either language
- **relation**: 17 enums; unrecognized relations from the LLM degrade gracefully to `related_to`

### Version

**Current: v1.0.0** (2026-03) — first official release:

- 8 MCP tools (ingest / query / recall / discover / blindspots / topology / evolution / serendipity)
- Dual-mode LLM: zero-config Sampling + Direct (OpenAI-compatible API)
- 17 relation enums with synonym normalization; node aliases for multilingual retrieval; auto schema migration
- Chinese support: Unicode keyword extraction, Chinese relation verbs, original-language entity naming
- Robustness: zod validation, truncated-JSON auto-repair with dynamic token budget, tool error guard, atomic DB writes
- Local SQLite storage (sql.js/WASM), zero native deps

### Development

```bash
npm install          # Install dependencies
npm run dev          # Watch mode (auto-rebuild)
npm run build        # Production build
node dist/index.js   # Start server
```

### Tech Stack

| Component | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript | Node.js >= 18 |
| MCP SDK | `@modelcontextprotocol/sdk` | Official TypeScript SDK |
| Database | SQLite (sql.js) | Pure JS/WASM, zero native deps |
| LLM | `openai` SDK | OpenAI-compatible, any model |
| Markdown | `gray-matter` | Frontmatter parsing |
| Bundler | `tsup` | Single-file bundle |

### Demo Walkthrough

```bash
npm run build

# In your MCP client:
# 1. ingest_note → "examples/sample-notes/distributed-systems.md"
# 2. ingest_note → "examples/sample-notes/neural-networks.md"
# 3. query_mind → "What do I know about consensus?"
# 4. detect_blindspots → topic = "distributed systems"
# 5. analyze_cognitive_topology → (no arguments)
# 6. discover_connections → topic = "consensus"
# 7. spark_serendipity → domain_a = "distributed-systems", domain_b = "machine-learning"
```

---

## License / 许可证

Apache-2.0

> 本项目为 2026 犀牛鸟开源人才培养活动参赛项目，基于腾讯混元 Hy3 模型构建。
>
> This project was developed for the 2026 Rhinobird Open Source Talent Program, built on Tencent Hunyuan Hy3.

---

Copyright (c) 2026 hanjiang-215. All rights reserved.

本项目由 hanjiang-215 制作。