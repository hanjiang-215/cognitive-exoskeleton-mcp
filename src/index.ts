/**
 * MCP Server entry point.
 * Registers all 8 tools and starts the stdio transport.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { LLMClient } from "./llm/client.js";
import { initDatabase } from "./graph/schema.js";

// Tool registration imports
import { registerIngestNoteTool } from "./tools/ingest-note.js";
import { registerQueryMindTool } from "./tools/query-mind.js";
import { registerRecallContextTool } from "./tools/recall-context.js";

// Phase 4 imports
import { registerDiscoverConnectionsTool } from "./tools/discover-connections.js";
import { registerDetectBlindspotsTool } from "./tools/detect-blindspots.js";
import { registerAnalyzeTopologyTool } from "./tools/analyze-topology.js";

// Phase 5 imports
import { registerTraceEvolutionTool } from "./tools/trace-evolution.js";
import { registerSparkSerendipityTool } from "./tools/spark-serendipity.js";

const server = new McpServer({
  name: "cognitive-exoskeleton",
  version: "1.0.0",
});

async function main() {
  const config = loadConfig();
  const llm = new LLMClient(config);
  const db = await initDatabase(config.cognitiveDbPath);

  // Register all 8 tools
  registerIngestNoteTool(server, llm, db, config.cognitiveDbPath);
  registerQueryMindTool(server, llm, db);
  registerRecallContextTool(server, llm, db);
  registerDiscoverConnectionsTool(server, llm, db);
  registerDetectBlindspotsTool(server, llm, db);
  registerAnalyzeTopologyTool(server, llm, db, config.cognitiveDbPath);
  registerTraceEvolutionTool(server, llm, db);
  registerSparkSerendipityTool(server, llm, db, config.cognitiveDbPath);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[cognitive-exoskeleton] MCP Server started — 8 tools registered (stdio)");
}

main().catch((err) => {
  console.error("[cognitive-exoskeleton] Fatal error:", err);
  process.exit(1);
});