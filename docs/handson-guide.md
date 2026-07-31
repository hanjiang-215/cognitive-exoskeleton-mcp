# 实战测试指南

> 本指南带你从零开始，在 MCP 客户端中逐步测试全部 8 个工具。
> 预计耗时：20~30 分钟。

---

## 前置检查清单

在开始之前，确认以下条件已满足：

- [ ] Node.js >= 18 已安装（`node -v` 检查）
- [ ] 项目已克隆到本地（`d:\007` 或你选择的路径）
- [ ] 已运行 `npm install && npm run build`，`dist/index.js` 存在
- [ ] **Sampling 模式（默认）**：无需额外配置，MCP 客户端已配置好 LLM 即可
- [ ] **Direct 模式（可选）**：有一个可用的 OpenAI 兼容 LLM API，已记录好 API 地址、API Key、模型名称

---

## 阶段 0：启动验证（5 分钟）

### Step 0.1：手动启动 Server

打开一个终端：

```bash
# Windows PowerShell — Sampling 模式（零配置）
cd d:\007
node dist/index.js
```

```bash
# Linux / macOS — Sampling 模式（零配置）
cd d:/007
node dist/index.js
```

> 默认自动使用 Sampling 模式，复用 MCP 客户端的 LLM 配置。如需使用独立 API，设置 `$env:LLM_MODE="direct"` 并配置 `LLM_API_BASE`、`LLM_API_KEY`、`LLM_MODEL_NAME`。

**预期输出**：
```
[cognitive-exoskeleton] MCP Server started — 8 tools registered (stdio, llm=sampling)
```

看到即表示 Server 正常启动。按 `Ctrl+C` 退出（后续由客户端自动管理启动）。

### Step 0.2：配置 MCP 客户端

根据你的客户端选择一种配置方式（详见 `docs/client-tutorial.md`）：

**Cursor 用户**：
1. 在项目根目录创建 `.cursor/mcp.json`
2. 填入配置（注意替换路径和 API 信息）
3. 重启 Cursor

**WorkBuddy/CodeBuddy 用户**：
1. 运行 CLI 命令添加 MCP Server
2. 或用项目级配置文件 `.codebuddy/mcp.json`

### Step 0.3：验证连接

在客户端 Chat 中输入：

```
请使用 cognitive-exoskeleton 的工具 analyze_cognitive_topology，
分析一下我的知识图谱结构。
```

**预期回复**：
```
Your knowledge graph is empty. Use ingest_note to start adding knowledge.
```

如果看到这个回复，说明连接成功！开始正式测试。

---

## 阶段 1：导入知识（10 分钟）

### Step 1.1：导入第一篇笔记（内联文本）

在 Chat 中输入：

```
请使用 ingest_note 工具，将以下内容导入知识图谱：

"分布式系统遵循 CAP 定理，真正选择是在 CP 和 AP 之间。
Raft 是一种易于理解的共识算法，而 Paxos 则是经典的共识协议。"
```

**预期结果**：
```
Ingestion complete!
- New entities: 3~5
- New relationships: 2~4
- Graph stats: X entities, Y relationships, 1 domains
```

### Step 1.2：导入示例笔记文件

```
请使用 ingest_note 工具，读取文件 examples/sample-notes/distributed-systems.md 并导入知识图谱。
```

**预期结果**：
```
Ingestion complete!
- New entities: 10~20
- New relationships: 8~15
```

### Step 1.3：导入第二篇示例笔记（不同领域）

```
请使用 ingest_note 工具，读取文件 examples/sample-notes/neural-networks.md 并导入知识图谱。
```

**预期结果**：
```
Ingestion complete!
- New entities: 10~20
- New relationships: 5~10
```

### Step 1.4：验证去重 — 重复导入同一笔记

```
请再次导入 examples/sample-notes/distributed-systems.md。
```

**预期结果**：
```
Note "examples/sample-notes/distributed-systems.md" has not changed since last ingestion. Skipping.
```

说明去重机制生效。

### 检查点

此时你应该有：
- 两个不同领域的知识（distributed-systems + machine-learning）
- 多个实体和关系
- 至少 2 个域

可以调用 `analyze_cognitive_topology` 确认：

```
查看我的知识图谱现在有多少实体和关系？
```

---

## 阶段 2：基础查询（5 分钟）

### Step 2.1：图谱问答（query_mind — 浅层）

```
我对 CAP 定理了解多少？请用 query_mind 工具回答。
```

**预期结果**：
- 返回关于 CAP 定理的结构化回答
- 末尾附带引用的实体列表

### Step 2.2：图谱问答（query_mind — 深层）

```
用深度检索模式回答：共识算法有哪些？它们之间有什么关系？
```

**预期结果**：
- 返回更丰富的上下文（2-hop 邻居）
- 提到 Paxos、Raft、PBFT 等

### Step 2.3：上下文召回（recall_context）

```
我正在写一段关于神经网络训练方法的文字，
用到反向传播和梯度下降。帮我回忆一下相关知识。
```

**预期结果**：
- 返回与"反向传播""梯度下降""神经网络"相关的实体
- 包含最后出现时间、提及次数、关联节点

### Step 2.4：查询不存在的知识

```
请查询一下我对"量子计算"了解多少？
```

**预期结果**：
```
No relevant entities found in your knowledge graph for: "量子计算"
Try ingesting notes about this topic first using the ingest_note tool.
```

---

## 阶段 3：推理层测试（10 分钟）

### Step 3.1：跨域连接发现（discover_connections）

```
分布式系统和机器学习之间有什么隐藏联系？
```

**预期结果**：
- 发现跨域连接（例如：共识算法 ↔ 梯度下降 都涉及迭代收敛）
- LLM 分析结构相似性和创造性假说

### Step 3.2：全图扫描模式

```
不指定话题，扫描我的整个知识图谱，找到跨域连接。
```

**预期结果**：
- 列出多个跨域连接对
- 标注桥梁节点

### Step 3.3：盲点检测（detect_blindspots）

```
分析我对"分布式系统"理解的盲点。
```

**预期结果**：
- 当前覆盖：CAP 定理、共识算法、一致性模型等
- 缺失视角：拜占庭容错、时钟同步、分布式事务、CRDT 等
- 建议探索方向

### Step 3.4：认知拓扑分析（analyze_cognitive_topology）

```
展示我的知识图谱整体结构，生成认知画像。
```

**预期结果**：
- 图统计信息（实体数、关系数、域数、连通分量数）
- 知识孤岛列表
- 桥梁概念排名
- 密集区/空白区分析

### Step 3.5：限定域的拓扑分析

```
只分析 distributed-systems 这个域的拓扑结构。
```

**预期结果**：
- 仅展示该域内的实体和关系
- 分析该域在整体图谱中的位置

---

## 阶段 4：时间层 + 灵感层（5 分钟）

### Step 4.1：概念演化追踪（trace_concept_evolution）

```
追踪一下"Consensus Algorithm"这个概念的演化历史。
```

**预期结果**：
- 如果有演化记录：显示时间线和观点变迁
- 如果没有：显示当前状态 + "No evolution history yet"

### Step 4.2：手动添加演化记录再追踪

先导入一篇对已有概念有新描述的笔记：

```
请使用 ingest_note 导入以下内容：
"我最近研究了 BFT 共识，发现它在区块链中非常重要，
与传统 Paxos/Raft 有本质区别——需要处理恶意节点。"
```

然后再追踪：

```
再次追踪"Consensus Algorithm"的演化历史。
```

**预期结果**：
- 应该能看到新的演化快照

### Step 4.3：灵感碰撞（spark_serendipity）

```
碰撞 distributed-systems 和 machine-learning 这两个领域！
```

**预期结果**：
- 从两个域各选一个概念
- LLM 生成创造性关联假说
- 例如："共识算法的收敛性分析 ↔ 梯度下降的收敛保证"

### Step 4.4：碰撞不存在的域

```
碰撞 distributed-systems 和 biology 这两个领域。
```

**预期结果**：
```
No entities found in domain "biology".
Available domains: distributed-systems, machine-learning, ...
```

---

## 阶段 5：进阶场景（可选，10 分钟）

### Step 5.1：导入第三领域知识，观察拓扑变化

```
请使用 ingest_note 导入以下内容：

"博弈论研究策略互动下的理性决策。纳什均衡是每个参与者都选择
最优策略的状态。拍卖设计是机制设计的核心应用。"
```

然后重新分析拓扑：

```
重新分析知识图谱的拓扑结构，看看导入博弈论后有什么变化。
```

**预期结果**：
- 新增一个域（game-theory 或类似）
- 可能形成新的孤岛（因为没有与已有知识的连接）
- 连通分量数增加

### Step 5.2：让 LLM 发现跨域联系

```
博弈论和分布式系统之间有什么联系？用 discover_connections 分析。
```

**预期结果**：
- LLM 可能发现：共识机制 ↔ 博弈论中的激励兼容
- 机制设计 ↔ 分布式协议的经济激励

### Step 5.3：写作全流程演示

模拟一个真实场景：你正在写一篇技术博客。

```
我正在写一段博客：

"分布式机器学习需要解决数据一致性问题。Parameter Server 架构
使用异步更新，而 All-Reduce 使用同步梯度聚合..."

请帮我回忆相关的知识笔记。
```

**预期结果**：
- 召回 distributed-systems 中的一致性模型笔记
- 召回 machine-learning 中的训练算法笔记
- 可能发现你之前导入的 CAP 定理笔记

### Step 5.4：全面盲点分析

```
分析我整个知识图谱的盲点。
```

**预期结果**：
- 跨多个域的综合分析
- 指出缺失的交叉领域知识
- 建议学习路径

---

## 测试检查表

完成以上步骤后，对照以下检查表确认所有功能正常：

| # | 测试项 | 工具 | 状态 |
|---|---|---|---|
| 1 | 内联文本导入 | `ingest_note` | [ ] |
| 2 | 文件导入 | `ingest_note` | [ ] |
| 3 | 去重机制 | `ingest_note` | [ ] |
| 4 | 浅层问答 | `query_mind` (shallow) | [ ] |
| 5 | 深层问答 | `query_mind` (deep) | [ ] |
| 6 | 上下文召回 | `recall_context` | [ ] |
| 7 | 空图谱提示 | `query_mind` | [ ] |
| 8 | 跨域连接发现 | `discover_connections` | [ ] |
| 9 | 全图扫描 | `discover_connections` | [ ] |
| 10 | 盲点检测 | `detect_blindspots` | [ ] |
| 11 | 认知拓扑 | `analyze_cognitive_topology` | [ ] |
| 12 | 限定域拓扑 | `analyze_cognitive_topology` | [ ] |
| 13 | 概念演化（无历史） | `trace_concept_evolution` | [ ] |
| 14 | 概念演化（有历史） | `trace_concept_evolution` | [ ] |
| 15 | 灵感碰撞 | `spark_serendipity` | [ ] |
| 16 | 不存在域的处理 | `spark_serendipity` | [ ] |
| 17 | 多域拓扑变化 | `analyze_cognitive_topology` | [ ] |
| 18 | 写作全流程 | `recall_context` | [ ] |

---

## 常见问题排查

### 工具调用无响应
- 检查 LLM API 是否可达：`curl http://127.0.0.1:8000/v1/models`
- 检查环境变量是否正确设置

### 导入笔记返回错误
- 确认文件路径正确（相对于运行目录）
- 确认文件是 UTF-8 编码的文本/Markdown

### 查询返回空结果
- 先用 `analyze_cognitive_topology` 确认图谱中有数据
- 检查查询关键词是否与已导入内容匹配

### 重置图谱
删除数据库文件即可：
```bash
rm cognitive.db        # 或删除你设置的 COGNITIVE_DB_PATH 路径
```
下次调用工具时自动创建空图谱。

---

## 运行自动化测试

如果想在命令行直接跑测试套件（不需要 MCP 客户端）：

```bash
# 运行全部 138 个测试
npm test

# 只运行图引擎单元测试
node --import tsx --test test/graph.test.ts

# 只运行工具集成测试
node --import tsx --test test/tools.test.ts

# 只运行端到端全流程测试
node --import tsx --test test/e2e.test.ts

# 只运行边界条件测试
node --import tsx --test test/edge-cases.test.ts

# 只运行配置和 LLM 客户端测试
node --import tsx --test test/config-llm.test.ts
```