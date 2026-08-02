/**
 * Tool 3: recall_context
 * Given text you're currently writing, surface related old notes from the knowledge graph.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LLMProvider } from "../llm/client.js";
import type { Database } from "sql.js";
import { searchNodeIds, getSubgraph1Hop } from "../graph/queries.js";
import { getNodeById, getEdgesForNode } from "../graph/store.js";
import type { GraphNode } from "../graph/types.js";
import { extractKeywords } from "../text.js";
import { guard } from "./guard.js";

export function registerRecallContextTool(
  server: McpServer,
  llm: LLMProvider,
  db: Database,
): void {
  server.tool(
    "recall_context",
    "While you are writing, surface related notes and ideas from your knowledge graph that you may have forgotten. Helps connect current work with past knowledge.",
    {
      current_text: z.string().describe("The text you are currently writing (a paragraph, section, or draft)"),
      max_results: z.number().optional().describe("Maximum number of related notes to return (default: 5)"),
    },
    guard(async ({ current_text, max_results }) => {
      const limit = max_results ?? 5;

      // 1. Extract keywords from current text (supports Chinese & English)
      const keywords = extractKeywords(current_text, 2, 20);

      if (keywords.length === 0) {
        return { content: [{ type: "text", text: "No significant keywords found in the provided text." }] };
      }

      // 2. Search for related nodes
      const seedIds = searchNodeIds(db, keywords, 15);

      if (seedIds.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No related knowledge found in your graph. Try ingesting more notes about this topic.`,
          }],
        };
      }

      // 3. Get 1-hop subgraph for richer context
      const subgraph = getSubgraph1Hop(db, seedIds.slice(0, 5));

      // 4. Sort by recency and relevance — prioritize older, forgotten nodes
      const now = Date.now();
      const scoredNodes = subgraph.nodes.map((n) => {
        const lastSeen = new Date(n.last_seen_at + "Z").getTime();
        const daysSinceSeen = (now - lastSeen) / (1000 * 60 * 60 * 24);
        // Higher score = more "forgotten" but relevant
        const recencyScore = Math.min(daysSinceSeen / 30, 3); // caps at 3 for 90+ days
        const relevanceScore = n.mention_count;
        return { node: n, score: recencyScore * relevanceScore, daysSinceSeen };
      });

      scoredNodes.sort((a, b) => b.score - a.score);
      const topNodes = scoredNodes.slice(0, limit);

      // 5. Build response
      let response = `Related knowledge from your graph (you may have forgotten these):\n\n`;

      for (const { node, daysSinceSeen } of topNodes) {
        const edges = getEdgesForNode(db, node.id);
        const connections = edges
          .map((e) => {
            const otherId = e.source_id === node.id ? e.target_id : e.source_id;
            const other = getNodeById(db, otherId);
            return other ? `${other.name} [${e.relation}]` : null;
          })
          .filter(Boolean)
          .slice(0, 3);

        const timeLabel = daysSinceSeen < 1
          ? "today"
          : daysSinceSeen < 30
            ? `${Math.round(daysSinceSeen)} days ago`
            : `${Math.round(daysSinceSeen / 30)} months ago`;

        response += `**${node.name}** (${node.type}, ${node.domain})\n`;
        response += `  ${node.summary}\n`;
        response += `  Last seen: ${timeLabel} | Mentions: ${node.mention_count}\n`;
        if (connections.length > 0) {
          response += `  Connected to: ${connections.join(", ")}\n`;
        }
        if (node.source_file) {
          response += `  Source: ${node.source_file}\n`;
        }
        response += `\n`;
      }

      return { content: [{ type: "text", text: response }] };
    }),
  );
}