/**
 * Tool 5: detect_blindspots
 * Analyze a topic's coverage in the knowledge graph and identify gaps.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LLMClient } from "../llm/client.js";
import type { Database } from "sql.js";
import { searchNodeIds, getSubgraph2Hop } from "../graph/queries.js";
import { getEdgesForNode, getNodeById } from "../graph/store.js";
import { BLINDSPOT_SYSTEM_PROMPT, buildBlindspotPrompt } from "../prompts/analyze.js";
import type { GraphNode, GraphEdge } from "../graph/types.js";

function formatSubgraphCompact(nodes: GraphNode[], edges: GraphEdge[]): string {
  if (nodes.length === 0) return "(empty graph)";

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  let out = `Entities (${nodes.length}):\n`;
  for (const n of nodes) {
    out += `  [${n.type}] ${n.name} (${n.domain}): ${n.summary}\n`;
  }
  if (edges.length > 0) {
    out += `\nRelationships (${edges.length}):\n`;
    for (const e of edges) {
      const src = nodeMap.get(e.source_id);
      const tgt = nodeMap.get(e.target_id);
      out += `  ${src?.name ?? "?"} --[${e.relation}]--> ${tgt?.name ?? "?"} (conf: ${e.confidence})\n`;
    }
  }
  return out;
}

export function registerDetectBlindspotsTool(
  server: McpServer,
  llm: LLMClient,
  db: Database,
): void {
  server.tool(
    "detect_blindspots",
    "Analyze a topic's coverage in your knowledge graph and identify blindspots, contradictions, and missing perspectives. Helps you understand what you don't know about a subject.",
    {
      topic: z.string().describe("The topic to analyze for blindspots"),
    },
    async ({ topic }) => {
      // 1. Search for seed nodes
      const keywords = topic.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const seedIds = searchNodeIds(db, keywords, 15);

      if (seedIds.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No knowledge found about "${topic}" in your graph.\n\nThis itself is a blindspot — you have no notes about this topic. Use ingest_note to start building knowledge about it.`,
          }],
        };
      }

      // 2. Get 2-hop subgraph for comprehensive view
      const subgraph = getSubgraph2Hop(db, seedIds);

      // 3. Analyze coverage
      const domains = new Set(subgraph.nodes.map((n) => n.domain));
      const types = new Set(subgraph.nodes.map((n) => n.type));
      const contradictions = subgraph.edges.filter((e) => e.relation === "contradicts");

      // Build a coverage summary
      let coverageSummary = `Topic: "${topic}"\n`;
      coverageSummary += `Entities found: ${subgraph.nodes.length} (${domains.size} domains, ${types.size} types)\n`;
      coverageSummary += `Relationships: ${subgraph.edges.length}\n`;
      coverageSummary += `Contradictions: ${contradictions.length}\n`;
      coverageSummary += `Domains: ${Array.from(domains).join(", ")}\n`;
      coverageSummary += `Entity types: ${Array.from(types).join(", ")}\n\n`;

      // 4. Format subgraph for LLM
      const graphData = coverageSummary + formatSubgraphCompact(subgraph.nodes, subgraph.edges);

      // 5. Ask LLM to analyze blindspots
      const analysis = await llm.chat({
        system: BLINDSPOT_SYSTEM_PROMPT,
        user: buildBlindspotPrompt(topic, graphData),
        temperature: 0.6,
        maxTokens: 2048,
      });

      return { content: [{ type: "text", text: analysis }] };
    },
  );
}