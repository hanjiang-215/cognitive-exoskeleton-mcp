/**
 * Tool 6: analyze_cognitive_topology
 * Analyze the overall shape of the knowledge graph and generate a cognitive portrait.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LLMClient } from "../llm/client.js";
import type { Database } from "sql.js";
import { analyzeTopology } from "../graph/queries.js";
import { getNodesByDomain, getNodeById } from "../graph/store.js";
import { saveDatabase } from "../graph/schema.js";
import { TOPOLOGY_SYSTEM_PROMPT, buildTopologyPrompt } from "../prompts/analyze.js";

export function registerAnalyzeTopologyTool(
  server: McpServer,
  llm: LLMClient,
  db: Database,
  dbPath: string,
): void {
  server.tool(
    "analyze_cognitive_topology",
    "Analyze the overall structure of your knowledge graph. Generates a 'cognitive portrait' showing knowledge islands, bridge concepts, dense/sparse regions, and recommendations for improving knowledge connectivity.",
    {
      domain: z.string().optional().describe("Optional: limit analysis to a specific knowledge domain"),
    },
    async ({ domain }) => {
      // 1. Run topology analysis
      const topology = analyzeTopology(db);

      if (topology.stats.totalNodes === 0) {
        return {
          content: [{
            type: "text",
            text: "Your knowledge graph is empty. Use ingest_note to start adding knowledge.",
          }],
        };
      }

      // 2. Build topology description for LLM
      const componentDesc = topology.components.map((comp, i) => {
        const nodeNames = comp.slice(0, 5).map((id) => {
          const n = getNodeById(db, id);
          return n ? n.name : id;
        });
        const extra = comp.length > 5 ? ` (+${comp.length - 5} more)` : "";
        return `  Cluster ${i + 1} (${comp.length} nodes): ${nodeNames.join(", ")}${extra}`;
      }).join("\n");

      const bridgeDesc = topology.bridges.slice(0, 10).map((b) =>
        `  ${b.name} (score: ${b.score.toFixed(2)})`
      ).join("\n");

      const densityDesc = Object.entries(topology.density)
        .sort((a, b) => b[1] - a[1])
        .map(([d, count]) => `  ${d}: ${count} entities`)
        .join("\n");

      let topoText = `KNOWLEDGE GRAPH TOPOLOGY\n`;
      topoText += `========================\n`;
      topoText += `Total: ${topology.stats.totalNodes} entities, ${topology.stats.totalEdges} relationships, ${topology.stats.totalDomains} domains\n`;
      topoText += `Avg degree: ${topology.stats.avgDegree.toFixed(1)}\n\n`;
      topoText += `Connected components (${topology.components.length}):\n${componentDesc}\n\n`;
      topoText += `Bridge nodes (top 10 by betweenness centrality):\n${bridgeDesc}\n\n`;
      topoText += `Domain density:\n${densityDesc}\n`;

      if (domain) {
        topoText += `\nFocus domain: ${domain}\n`;
        const domainNodes = getNodesByDomain(db, domain);
        topoText += `Entities in this domain: ${domainNodes.length}\n`;
        topoText += `Entity names: ${domainNodes.map((n) => n.name).join(", ")}\n`;
      }

      // 3. Ask LLM for cognitive portrait
      const portrait = await llm.chat({
        system: TOPOLOGY_SYSTEM_PROMPT,
        user: buildTopologyPrompt(topoText),
        temperature: 0.7,
        maxTokens: 2048,
      });

      // 4. Cache topology result
      try {
        db.run(
          `INSERT OR REPLACE INTO topology_cache (snapshot_at, isolated_clusters, bridge_nodes, density_map, summary)
           VALUES (datetime('now'), ?, ?, ?, ?)`,
          [
            JSON.stringify(topology.components.map((c) => c.length)),
            JSON.stringify(topology.bridges.slice(0, 10)),
            JSON.stringify(topology.density),
            portrait.slice(0, 2000),
          ]
        );
        saveDatabase(db, dbPath);
      } catch {
        // Non-critical: cache write failure
      }

      // 5. Build response
      let response = `## Cognitive Portrait\n\n`;
      response += `**Graph stats**: ${topology.stats.totalNodes} entities, ${topology.stats.totalEdges} relationships, ${topology.stats.totalDomains} domains, ${topology.components.length} connected components\n\n`;
      response += portrait;

      return { content: [{ type: "text", text: response }] };
    },
  );
}