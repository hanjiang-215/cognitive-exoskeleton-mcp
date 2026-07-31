/**
 * Tool 4: discover_connections
 * Find non-obvious connections between knowledge entities across domains.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LLMProvider } from "../llm/client.js";
import type { Database } from "sql.js";
import { findCrossDomainPaths, searchNodeIds, getSubgraph1Hop } from "../graph/queries.js";
import { getNodeById, getEdgesForNode, getAllDomains, getNodesByDomain } from "../graph/store.js";
import { CONNECTION_SYSTEM_PROMPT, buildConnectionPrompt } from "../prompts/associate.js";
import type { GraphNode } from "../graph/types.js";

export function registerDiscoverConnectionsTool(
  server: McpServer,
  llm: LLMProvider,
  db: Database,
): void {
  server.tool(
    "discover_connections",
    "Discover hidden, non-obvious connections between knowledge entities from different domains. If a topic is given, finds connections related to that topic. Without a topic, scans the whole graph for cross-domain bridges.",
    {
      topic: z.string().optional().describe("Optional topic to focus connection discovery on. If omitted, scans the entire graph."),
    },
    async ({ topic }) => {
      let connections: Array<{ nodeA: GraphNode; nodeB: GraphNode; bridge: GraphNode }> = [];

      if (topic) {
        // Topic-focused: search for nodes related to the topic, then find their cross-domain connections
        const keywords = topic.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        const seedIds = searchNodeIds(db, keywords, 10);

        if (seedIds.length === 0) {
          return { content: [{ type: "text", text: `No entities found for topic "${topic}". Try ingesting notes about this topic first.` }] };
        }

        // Get neighbors and find cross-domain pairs
        const subgraph = getSubgraph1Hop(db, seedIds);
        const domainGroups = new Map<string, GraphNode[]>();
        for (const n of subgraph.nodes) {
          if (!domainGroups.has(n.domain)) domainGroups.set(n.domain, []);
          domainGroups.get(n.domain)!.push(n);
        }

        // Find pairs from different domains
        const domains = Array.from(domainGroups.keys());
        for (let i = 0; i < domains.length; i++) {
          for (let j = i + 1; j < domains.length; j++) {
            const a = domainGroups.get(domains[i])![0];
            const b = domainGroups.get(domains[j])![0];
            if (a && b) {
              // Find bridge: a node connected to both
              const edgesA = getEdgesForNode(db, a.id);
              const edgesB = getEdgesForNode(db, b.id);
              const neighborsA = new Set(edgesA.map((e) => e.source_id === a.id ? e.target_id : e.source_id));
              const bridgeId = edgesB.map((e) => e.source_id === b.id ? e.target_id : e.source_id).find((id) => neighborsA.has(id));
              const bridge = bridgeId ? getNodeById(db, bridgeId) : undefined;
              connections.push({ nodeA: a, nodeB: b, bridge: bridge ?? a });
            }
          }
        }
      } else {
        // Global scan: find all cross-domain paths
        const crossPaths = findCrossDomainPaths(db);
        connections = crossPaths.map((p) => ({ nodeA: p.nodeA, nodeB: p.nodeB, bridge: p.bridge }));
      }

      if (connections.length === 0) {
        return { content: [{ type: "text", text: "No cross-domain connections found. Your knowledge graph may need more diverse content." }] };
      }

      // Limit to top 5 and analyze with LLM
      const topConnections = connections.slice(0, 5);
      const analyses: string[] = [];

      for (const conn of topConnections) {
        const contextA = `${conn.nodeA.summary} (domain: ${conn.nodeA.domain}, mentions: ${conn.nodeA.mention_count})`;
        const contextB = `${conn.nodeB.summary} (domain: ${conn.nodeB.domain}, mentions: ${conn.nodeB.mention_count})`;
        const bridgeContext = conn.bridge.id !== conn.nodeA.id && conn.bridge.id !== conn.nodeB.id
          ? `Connected through: ${conn.bridge.name} (${conn.bridge.domain})`
          : undefined;

        const analysis = await llm.chat({
          system: CONNECTION_SYSTEM_PROMPT,
          user: buildConnectionPrompt(conn.nodeA.name, conn.nodeB.name, contextA, contextB, bridgeContext),
          temperature: 0.8,
          maxTokens: 1024,
        });

        analyses.push(analysis);
      }

      // Build response
      let response = `Discovered ${connections.length} cross-domain connection(s). Here are the top ${topConnections.length}:\n\n`;
      for (let i = 0; i < topConnections.length; i++) {
        const conn = topConnections[i];
        response += `## Connection ${i + 1}: ${conn.nodeA.name} (${conn.nodeA.domain}) <-> ${conn.nodeB.name} (${conn.nodeB.domain})\n`;
        if (conn.bridge.id !== conn.nodeA.id && conn.bridge.id !== conn.nodeB.id) {
          response += `Bridge: ${conn.bridge.name}\n`;
        }
        response += `\n${analyses[i]}\n\n---\n\n`;
      }

      return { content: [{ type: "text", text: response }] };
    },
  );
}