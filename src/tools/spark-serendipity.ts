/**
 * Tool 8: spark_serendipity
 * Deliberately create creative collisions between concepts from different domains.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import crypto from "node:crypto";
import type { LLMClient } from "../llm/client.js";
import type { Database } from "sql.js";
import { getAllDomains, getSampleNodesByDomain } from "../graph/store.js";
import { SERENDIPITY_SYSTEM_PROMPT, buildSerendipityPrompt } from "../prompts/associate.js";
import { saveDatabase as saveDb } from "../graph/schema.js";

export function registerSparkSerendipityTool(
  server: McpServer,
  llm: LLMClient,
  db: Database,
  dbPath: string,
): void {
  server.tool(
    "spark_serendipity",
    "Deliberately spark creative inspiration by colliding concepts from two different knowledge domains. Like a digital serendipity engine — find unexpected connections that neither domain has explored alone.",
    {
      domain_a: z.string().describe("First knowledge domain (e.g., 'distributed-systems')"),
      domain_b: z.string().describe("Second knowledge domain (e.g., 'biology')"),
    },
    async ({ domain_a, domain_b }) => {
      // 1. Get available domains if user wants to browse
      const allDomains = getAllDomains(db);
      if (allDomains.length < 2) {
        return {
          content: [{
            type: "text",
            text: `Your knowledge graph has only ${allDomains.length} domain(s): ${allDomains.join(", ")}.\n\nSerendipity needs at least 2 different domains to create cross-domain sparks. Ingest notes from different fields!`,
          }],
        };
      }

      // 2. Sample nodes from each domain
      const nodesA = getSampleNodesByDomain(db, domain_a, 3);
      const nodesB = getSampleNodesByDomain(db, domain_b, 3);

      if (nodesA.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No entities found in domain "${domain_a}".\n\nAvailable domains: ${allDomains.join(", ")}\n\nTry a different domain name or ingest more notes.`,
          }],
        };
      }
      if (nodesB.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No entities found in domain "${domain_b}".\n\nAvailable domains: ${allDomains.join(", ")}\n\nTry a different domain name or ingest more notes.`,
          }],
        };
      }

      // 3. Pick a pair and generate spark
      const nodeA = nodesA[Math.floor(Math.random() * nodesA.length)];
      const nodeB = nodesB[Math.floor(Math.random() * nodesB.length)];

      const spark = await llm.chat({
        system: SERENDIPITY_SYSTEM_PROMPT,
        user: buildSerendipityPrompt(
          domain_a, domain_b,
          nodeA.name, nodeA.summary,
          nodeB.name, nodeB.summary,
        ),
        temperature: 0.9,
        maxTokens: 1536,
      });

      // 4. Log to serendipity_log
      try {
        const id = crypto.randomUUID();
        db.run(
          `INSERT INTO serendipity_log (id, node_a, node_b, hypothesis) VALUES (?, ?, ?, ?)`,
          [id, nodeA.id, nodeB.id, spark.slice(0, 1000)]
        );
        saveDb(db, dbPath);
      } catch {
        // Non-critical
      }

      // 5. Build response
      let response = `## Serendipity Spark\n\n`;
      response += `**${nodeA.name}** (${domain_a}) x **${nodeB.name}** (${domain_b})\n\n`;
      response += spark;
      response += `\n\n---\n`;
      response += `Available domains for next spark: ${allDomains.join(", ")}`;

      return { content: [{ type: "text", text: response }] };
    },
  );
}