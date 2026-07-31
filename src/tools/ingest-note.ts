/**
 * Tool 1: ingest_note
 * Reads a note (from text or file), uses LLM to extract entities+relations, writes to graph.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import matter from "gray-matter";
import type { LLMProvider } from "../llm/client.js";
import type { Database } from "sql.js";
import { EXTRACT_SYSTEM_PROMPT, buildExtractUserPrompt } from "../prompts/extract.js";
import { ingestExtraction, isNoteChanged, addEvolutionEntry, getNodeByName, getGraphStats } from "../graph/store.js";
import { saveDatabase } from "../graph/schema.js";
import type { ExtractionResult } from "../graph/types.js";

export function registerIngestNoteTool(
  server: McpServer,
  llm: LLMProvider,
  db: Database,
  dbPath: string,
): void {
  server.tool(
    "ingest_note",
    "Extract knowledge entities and relationships from a note or text, and store them in the personal knowledge graph. Accepts either raw text content or a file path to a Markdown/text file.",
    {
      content: z.string().optional().describe("Raw text content to extract knowledge from. Provide this OR file_path."),
      file_path: z.string().optional().describe("Path to a Markdown or text file to read and extract from. Provide this OR content."),
    },
    async ({ content, file_path }) => {
      // 1. Resolve content source
      let text = content ?? "";
      let sourceFile = file_path ?? "<inline-text>";

      if (file_path) {
        if (!fs.existsSync(file_path)) {
          return { content: [{ type: "text", text: `Error: File not found: ${file_path}` }] };
        }
        const raw = fs.readFileSync(file_path, "utf-8");
        const parsed = matter(raw);
        text = parsed.content;
        sourceFile = file_path;
      }

      if (!text.trim()) {
        return { content: [{ type: "text", text: "Error: No content provided. Supply either 'content' or 'file_path'." }] };
      }

      // 2. Check if note has changed since last ingestion
      if (file_path && !isNoteChanged(db, file_path, text)) {
        return { content: [{ type: "text", text: `Note "${file_path}" has not changed since last ingestion. Skipping.` }] };
      }

      // 3. Call LLM for extraction
      const extraction = await llm.chatJSON<ExtractionResult>({
        system: EXTRACT_SYSTEM_PROMPT,
        user: buildExtractUserPrompt(text),
        temperature: 0.3,
        maxTokens: 4096,
      });

      // 4. Write to graph database
      const result = ingestExtraction(db, extraction, sourceFile, text);
      saveDatabase(db, dbPath);

      // 5. Check for evolution entries (existing concepts with new info)
      const evolutionNotes: string[] = [];
      for (const n of extraction.nodes) {
        const existing = getNodeByName(db, n.name);
        if (existing && existing.mention_count > 1) {
          addEvolutionEntry(db, {
            node_id: existing.id,
            belief_summary: n.summary,
            trigger_note: text.slice(0, 200),
            source_file: sourceFile,
          });
          evolutionNotes.push(n.name);
        }
      }
      if (evolutionNotes.length > 0) {
        saveDatabase(db, dbPath);
      }

      // 6. Build response
      const stats = getGraphStats(db);
      let response = `Ingestion complete!\n\n`;
      response += `- New entities: ${result.nodesAdded}\n`;
      response += `- Updated entities: ${result.nodesUpdated}\n`;
      response += `- New relationships: ${result.edgesAdded}\n`;
      response += `- Source: ${sourceFile}\n\n`;
      response += `Graph stats: ${stats.totalNodes} entities, ${stats.totalEdges} relationships, ${stats.totalDomains} domains`;

      if (evolutionNotes.length > 0) {
        response += `\n\nEvolution tracked for: ${evolutionNotes.join(", ")}`;
      }

      return { content: [{ type: "text", text: response }] };
    },
  );
}