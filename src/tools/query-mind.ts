/**
 * Tool 2: query_mind
 * Answer questions by retrieving relevant subgraph and using LLM to reason over it.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LLMClient } from "../llm/client.js";
import type { Database } from "sql.js";
import { searchNodeIds, getSubgraph1Hop, getSubgraph2Hop } from "../graph/queries.js";
import { QUERY_SYSTEM_PROMPT, buildQueryPrompt } from "../prompts/associate.js";
import type { GraphNode, GraphEdge } from "../graph/types.js";

function formatSubgraphForContext(subgraph: { nodes: GraphNode[]; edges: GraphEdge[] }): string {
  if (subgraph.nodes.length === 0) return "(empty — no relevant knowledge found)";

  const nodeMap = new Map(subgraph.nodes.map((n) => [n.id, n]));

  let ctx = `ENTITIES (${subgraph.nodes.length}):\n`;
  for (const n of subgraph.nodes) {
    ctx += `- [${n.type}] ${n.name} (${n.domain}): ${n.summary} [mentions: ${n.mention_count}]\n`;
  }

  if (subgraph.edges.length > 0) {
    ctx += `\nRELATIONSHIPS (${subgraph.edges.length}):\n`;
    for (const e of subgraph.edges) {
      const src = nodeMap.get(e.source_id);
      const tgt = nodeMap.get(e.target_id);
      const srcName = src?.name ?? e.source_id;
      const tgtName = tgt?.name ?? e.target_id;
      ctx += `- ${srcName} --[${e.relation}]--> ${tgtName} (confidence: ${e.confidence})\n`;
      if (e.evidence) ctx += `  evidence: "${e.evidence}"\n`;
    }
  }

  return ctx;
}

export function registerQueryMindTool(
  server: McpServer,
  llm: LLMClient,
  db: Database,
): void {
  server.tool(
    "query_mind",
    "Answer a question using your personal knowledge graph. Retrieves relevant entities and relationships, then uses the LLM to reason over them. Supports shallow (1-hop) and deep (2-hop) retrieval modes.",
    {
      question: z.string().describe("The question to answer from your knowledge graph"),
      depth: z.enum(["shallow", "deep"]).optional().describe("Retrieval depth: 'shallow' (1-hop, default) or 'deep' (2-hop with path reasoning)"),
    },
    async ({ question, depth }) => {
      // 1. Extract keywords from the question (simple split + filter)
      const keywords = question
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2);

      // 2. Search for seed nodes
      const seedIds = searchNodeIds(db, keywords, 10);

      if (seedIds.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No relevant entities found in your knowledge graph for: "${question}"\n\nTry ingesting notes about this topic first using the ingest_note tool.`,
          }],
        };
      }

      // 3. Retrieve subgraph
      const subgraph = depth === "deep"
        ? getSubgraph2Hop(db, seedIds)
        : getSubgraph1Hop(db, seedIds);

      // 4. Format for LLM context
      const graphContext = formatSubgraphForContext(subgraph);

      // 5. Ask LLM
      const answer = await llm.chat({
        system: QUERY_SYSTEM_PROMPT,
        user: buildQueryPrompt(question, graphContext),
        temperature: 0.5,
        maxTokens: 2048,
      });

      // 6. Build response with citations
      const citedNodes = subgraph.nodes.slice(0, 10).map((n) => `  - ${n.name} (${n.domain})`).join("\n");
      const response = `${answer}\n\n---\nReferenced entities (${subgraph.nodes.length} total):\n${citedNodes}`;

      return { content: [{ type: "text", text: response }] };
    },
  );
}