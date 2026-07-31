/**
 * Tool 7: trace_concept_evolution
 * Track how your understanding of a concept has changed over time.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LLMProvider } from "../llm/client.js";
import type { Database } from "sql.js";
import { getNodeByName, getEvolutionLog, getEdgesForNode, getNodeById } from "../graph/store.js";
import { EVOLUTION_SYSTEM_PROMPT, buildEvolutionPrompt } from "../prompts/analyze.js";

export function registerTraceEvolutionTool(
  server: McpServer,
  llm: LLMProvider,
  db: Database,
): void {
  server.tool(
    "trace_concept_evolution",
    "Trace how your understanding of a concept has evolved over time. Shows a timeline of belief changes, key turning points, and what triggered each shift in understanding.",
    {
      concept: z.string().describe("The concept name to trace evolution for"),
    },
    async ({ concept }) => {
      // 1. Find the node
      const node = getNodeByName(db, concept);
      if (!node) {
        return {
          content: [{
            type: "text",
            text: `Concept "${concept}" not found in your knowledge graph. Try using the exact name as it was extracted, or ingest more notes about this concept.`,
          }],
        };
      }

      // 2. Get evolution log
      const evolution = getEvolutionLog(db, node.id);

      if (evolution.length === 0) {
        // No evolution history — provide current state info
        const edges = getEdgesForNode(db, node.id);
        const connections = edges.map((e) => {
          const otherId = e.source_id === node.id ? e.target_id : e.source_id;
          const other = getNodeById(db, otherId);
          return other ? `${other.name} [${e.relation}]` : null;
        }).filter(Boolean);

        let response = `**${node.name}** (${node.type}, domain: ${node.domain})\n`;
        response += `Summary: ${node.summary}\n`;
        response += `First seen: ${node.first_seen_at} | Last updated: ${node.last_seen_at}\n`;
        response += `Mention count: ${node.mention_count}\n`;
        if (connections.length > 0) {
          response += `Connections: ${connections.join(", ")}\n`;
        }
        response += `\nNo evolution history yet. As you ingest more notes that reference this concept, its evolution will be tracked automatically.`;

        return { content: [{ type: "text", text: response }] };
      }

      // 3. Build timeline for LLM
      let timeline = `Concept: ${node.name}\nCurrent summary: ${node.summary}\n\n`;
      timeline += `Evolution timeline (${evolution.length} snapshots):\n\n`;
      for (const entry of evolution) {
        timeline += `[${entry.snapshot_at}]\n`;
        timeline += `  Belief: ${entry.belief_summary}\n`;
        if (entry.trigger_note) {
          timeline += `  Trigger: "${entry.trigger_note.slice(0, 150)}${entry.trigger_note.length > 150 ? "..." : ""}"\n`;
        }
        if (entry.source_file) {
          timeline += `  Source: ${entry.source_file}\n`;
        }
        timeline += `\n`;
      }

      // 4. Ask LLM to analyze evolution
      const analysis = await llm.chat({
        system: EVOLUTION_SYSTEM_PROMPT,
        user: buildEvolutionPrompt(concept, timeline),
        temperature: 0.6,
        maxTokens: 1536,
      });

      let response = `## Evolution of "${concept}"\n\n`;
      response += `**Current**: ${node.summary}\n`;
      response += `**Tracked since**: ${evolution[0].snapshot_at}\n`;
      response += `**Total snapshots**: ${evolution.length}\n\n`;
      response += analysis;

      return { content: [{ type: "text", text: response }] };
    },
  );
}