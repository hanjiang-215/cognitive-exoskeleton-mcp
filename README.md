# Cognitive Exoskeleton MCP Server

> **个人认知外骨骼** — 基于知识图谱 + LLM 推理的「第二大脑」MCP Server
>
> **Your Personal Cognitive Exoskeleton** — a "second brain" MCP Server powered by knowledge graph + LLM reasoning

---



## 中文文档

Cognitive Exoskeleton 不是普通的搜索工具。它从你的笔记中构建动态知识图谱，然后利用 LLM 推理能力**主动发现知识盲点、寻找隐藏的跨领域关联、追踪你对某个概念的理解如何随时间演变，并通过碰撞不同领域的想法来激发创造性灵感**。

- 所有数据完全本地存储（SQLite），隐私安全
- 模型无关：支持 Hy3、OpenAI、Ollama、vLLM 等任意 OpenAI 兼容 API
- 即插即用：兼容 Cursor、CodeBuddy、WorkBuddy、Cline 等主流 MCP 客户端

### 功能特性

提供 **8 个 MCP 工具**，分为四个层次：


| 层次      | 工具                           | 功能                         |
| ------- | ---------------------------- | -------------------------- |
| **基础层** | `ingest_note`                | 从笔记/文档中抽取实体和关系，写入知识图谱      |
|         | `query_mind`                 | 基于知识图谱回答问题，支持浅层/深层检索       |
|         | `recall_context`             | 写作时自动召回相关但可能遗忘的旧笔记         |
| **推理层** | `discover_connections`       | 发现不同领域间隐藏的、非显而易见的知识关联      |
|         | `detect_blindspots`          | 分析某话题的知识覆盖度，识别盲点、矛盾和缺失视角   |
|         | `analyze_cognitive_topology` | 生成「认知画像」：知识孤岛、桥梁概念、密集区/空白区 |
| **时间层** | `trace_concept_evolution`    | 追踪你对某个概念的理解如何随时间变化         |
| **灵感层** | `spark_serendipity`          | 碰撞两个不同领域的概念，激发跨域创造性灵感      |


### 快速开始

**环境要求**：Node.js >= 18 + 任意 OpenAI 兼容 LLM API 端点

```bash
# 克隆并安装
git clone https://github.com/Tencent-Hunyuan/Hy3.git
cd Hy3/rhinobird2026/cognitive-exoskeleton-mcp
npm install && npm run build

# 启动
export LLM_API_BASE="http://127.0.0.1:8000/v1"
export LLM_API_KEY="EMPTY"
export LLM_MODEL_NAME="hy3"
node dist/index.js
```

### 环境变量


| 变量                  | 说明                    | 默认值                        |
| ------------------- | --------------------- | -------------------------- |
| `LLM_API_BASE`      | OpenAI 兼容 API 的基础 URL | `http://127.0.0.1:8000/v1` |
| `LLM_API_KEY`       | LLM 提供商的 API Key      | `EMPTY`                    |
| `LLM_MODEL_NAME`    | 使用的模型名称               | `hy3`                      |
| `COGNITIVE_DB_PATH` | SQLite 数据库文件路径        | `./cognitive.db`           |


### 多模型支持


| 模型提供商        | `LLM_API_BASE`                       | `LLM_MODEL_NAME` |
| ------------ | ------------------------------------ | ---------------- |
| Hy3（本地 vLLM） | `http://127.0.0.1:8000/v1`           | `hy3`            |
| Hy3（官方 API）  | `https://api.hunyuan.tencent.com/v1` | `hy3`            |
| OpenAI       | `https://api.openai.com/v1`          | `gpt-4o`         |
| Ollama（本地）   | `http://localhost:11434/v1`          | `qwen2.5:32b`    |
| vLLM（任意模型）   | `http://127.0.0.1:8000/v1`           | `<模型名>`          |


### MCP 客户端配置

**Cursor** — `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "cognitive-exoskeleton": {
      "command": "node",
      "args": ["<项目路径>/dist/index.js"],
      "env": {
        "LLM_API_BASE": "http://127.0.0.1:8000/v1",
        "LLM_API_KEY": "EMPTY",
        "LLM_MODEL_NAME": "hy3"
      }
    }
  }
}
```

**CodeBuddy / WorkBuddy** — CLI 命令：

```bash
codebuddy mcp add cognitive-exoskeleton \
  --command "node" \
  --arg "<项目路径>/dist/index.js" \
  --env LLM_API_BASE=http://127.0.0.1:8000/v1 \
  --env LLM_API_KEY=EMPTY \
  --env LLM_MODEL_NAME=hy3
```

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

### 架构

```
MCP 客户端 (Cursor / CodeBuddy / Cline)
        │ stdio (JSON-RPC)
        ▼
┌──────────────────────────────────────┐
│  Cognitive Exoskeleton MCP Server   │
│                                      │
│  8 个 MCP 工具                       │
│         │                            │
│  知识图谱引擎 (SQLite + 图算法)       │
│         │                            │
│  LLM 客户端 (模型无关, OpenAI 兼容)   │
└──────────────────────────────────────┘
```

### 知识图谱数据模型

```sql
nodes (id, type, name, summary, domain, source_file,
       first_seen_at, last_seen_at, mention_count)
edges (id, source_id, target_id, relation, confidence, evidence, created_at)
notes_index (file_path, content_hash, node_ids, last_ingested_at)
evolution_log (id, node_id, snapshot_at, belief_summary, trigger_note, source_file)
topology_cache (snapshot_at, isolated_clusters, bridge_nodes, density_map, summary)
serendipity_log (id, node_a, node_b, hypothesis, user_feedback, created_at)
```

---



## English

Cognitive Exoskeleton is not just a search tool. It builds a dynamic knowledge graph from your notes, then uses LLM reasoning to **proactively discover blindspots, find hidden cross-domain connections, trace how your understanding evolves over time, and spark creative inspiration** by colliding ideas from different fields.

- All data stays local (SQLite) — privacy-first
- Model-agnostic: works with any OpenAI-compatible LLM API (Hy3, OpenAI, Ollama, vLLM, etc.)
- Plug-and-play: compatible with Cursor, CodeBuddy, WorkBuddy, Cline, and other MCP clients

### Features

**8 MCP tools** organized in four layers:


| Layer           | Tool                         | What it does                                                             |
| --------------- | ---------------------------- | ------------------------------------------------------------------------ |
| **Foundation**  | `ingest_note`                | Extract entities + relationships from notes into the knowledge graph     |
|                 | `query_mind`                 | Answer questions using your knowledge graph (shallow/deep retrieval)     |
|                 | `recall_context`             | Surface forgotten notes related to what you're writing                   |
| **Reasoning**   | `discover_connections`       | Find hidden connections between knowledge from different domains         |
|                 | `detect_blindspots`          | Identify gaps, contradictions, and missing perspectives                  |
|                 | `analyze_cognitive_topology` | Generate a "cognitive portrait" — islands, bridges, dense/sparse regions |
| **Temporal**    | `trace_concept_evolution`    | Track how your understanding of a concept changes over time              |
| **Inspiration** | `spark_serendipity`          | Create creative sparks by colliding concepts from different domains      |


### Quick Start

**Prerequisites**: Node.js >= 18 + any OpenAI-compatible LLM API endpoint

```bash
git clone https://github.com/Tencent-Hunyuan/Hy3.git
cd Hy3/rhinobird2026/cognitive-exoskeleton-mcp
npm install && npm run build

export LLM_API_BASE="http://127.0.0.1:8000/v1"
export LLM_API_KEY="EMPTY"
export LLM_MODEL_NAME="hy3"
node dist/index.js
```

### Environment Variables


| Variable            | Description                    | Default                    |
| ------------------- | ------------------------------ | -------------------------- |
| `LLM_API_BASE`      | OpenAI-compatible API base URL | `http://127.0.0.1:8000/v1` |
| `LLM_API_KEY`       | API key for the LLM provider   | `EMPTY`                    |
| `LLM_MODEL_NAME`    | Model name to use              | `hy3`                      |
| `COGNITIVE_DB_PATH` | SQLite database file path      | `./cognitive.db`           |


### Multi-Model Support


| Provider           | `LLM_API_BASE`                       | `LLM_MODEL_NAME` |
| ------------------ | ------------------------------------ | ---------------- |
| Hy3 (local vLLM)   | `http://127.0.0.1:8000/v1`           | `hy3`            |
| Hy3 (official API) | `https://api.hunyuan.tencent.com/v1` | `hy3`            |
| OpenAI             | `https://api.openai.com/v1`          | `gpt-4o`         |
| Ollama (local)     | `http://localhost:11434/v1`          | `qwen2.5:32b`    |
| vLLM (any model)   | `http://127.0.0.1:8000/v1`           | `<model-name>`   |


### MCP Client Setup

**Cursor** — `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cognitive-exoskeleton": {
      "command": "node",
      "args": ["<project-path>/dist/index.js"],
      "env": {
        "LLM_API_BASE": "http://127.0.0.1:8000/v1",
        "LLM_API_KEY": "EMPTY",
        "LLM_MODEL_NAME": "hy3"
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
  --env LLM_API_BASE=http://127.0.0.1:8000/v1 \
  --env LLM_API_KEY=EMPTY \
  --env LLM_MODEL_NAME=hy3
```

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
│  (Model-agnostic, OpenAI-compatible) │
└──────────────────────────────────────┘
```

### Knowledge Graph Schema

```sql
nodes (id, type, name, summary, domain, source_file,
       first_seen_at, last_seen_at, mention_count)
edges (id, source_id, target_id, relation, confidence, evidence, created_at)
notes_index (file_path, content_hash, node_ids, last_ingested_at)
evolution_log (id, node_id, snapshot_at, belief_summary, trigger_note, source_file)
topology_cache (snapshot_at, isolated_clusters, bridge_nodes, density_map, summary)
serendipity_log (id, node_a, node_b, hypothesis, user_feedback, created_at)
```

### Development

```bash
npm install          # Install dependencies
npm run dev          # Watch mode (auto-rebuild)
npm run build        # Production build
node dist/index.js   # Start server
```

### Tech Stack


| Component | Choice                      | Notes                          |
| --------- | --------------------------- | ------------------------------ |
| Language  | TypeScript                  | Node.js >= 18                  |
| MCP SDK   | `@modelcontextprotocol/sdk` | Official TypeScript SDK        |
| Database  | SQLite (sql.js)             | Pure JS/WASM, zero native deps |
| LLM       | `openai` SDK                | OpenAI-compatible, any model   |
| Markdown  | `gray-matter`               | Frontmatter parsing            |
| Bundler   | `tsup`                      | Single-file bundle             |


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

