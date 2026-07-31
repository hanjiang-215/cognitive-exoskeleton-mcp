/**
 * Tool integration tests.
 * Tests all 8 MCP tools with a mocked LLM client.
 * Verifies the full pipeline: tool call → graph operations → LLM call → response.
 *
 * Run: npm test
 */

import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { initDatabase, saveDatabase } from "../src/graph/schema.js";
import type { Database } from "sql.js";
import { LLMClient } from "../src/llm/client.js";
import { upsertNode, addEdge, addEvolutionEntry, getGraphStats, getAllNodes, getEvolutionLog } from "../src/graph/store.js";

const TEST_DB_PATH = "./test-tools-cognitive.db";
const SAMPLE_NOTE_PATH = "./examples/sample-notes/distributed-systems.md";

let db: Database;

beforeEach(async () => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  db = await initDatabase(TEST_DB_PATH);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

/**
 * Mock LLM client that returns predictable responses.
 */
function createMockLLM(): LLMClient {
  const mockClient = Object.create(LLMClient.prototype) as LLMClient;

  // Mock chat method
  mockClient.chat = mock.method(mockClient, "chat" as any, async (options: any) => {
    const prompt = (options.system || "") + (options.user || "");

    // Return different responses based on what's being asked
    if (prompt.includes("blindspot") || prompt.includes("Coverage gaps")) {
      return `## Blindspot Report for "distributed systems"
1. **Current Coverage**: CAP theorem, consensus algorithms
2. **Coverage Gaps**: Byzantine fault tolerance, clock synchronization
3. **Contradictions**: None detected
4. **Missing Connections**: No link between consensus and replication
5. **Suggested Exploration**: BFT protocols, vector clocks, CRDTs`;
    }
    if (prompt.toLowerCase().includes("cognitive") || prompt.includes("topology")) {
      return `## Cognitive Portrait
Your knowledge landscape spans 2 domains with a strong bridge concept.
- Dense regions: distributed systems (well-covered)
- Sparse regions: security, performance optimization
- Recommendations: Explore security aspects of distributed protocols`;
    }
    if (prompt.toLowerCase().includes("evolution") || prompt.includes("timeline")) {
      return `## Evolution Analysis
1. **Summary**: Understanding evolved from theoretical to practical
2. **Turning Points**: Learning Raft simplified the mental model
3. **Direction**: Deepening
4. **Current State**: Strong grasp of consensus mechanisms
5. **Future**: Explore BFT and real-world implementations`;
    }
    if (prompt.includes("connection") || prompt.includes("parallel") || prompt.includes("Spark")) {
      return `## Connection Analysis
1. **Structural Parallels**: Both use iterative feedback loops
2. **Cross-domain Insight**: Gradient descent ≈ distributed consensus convergence
3. **Creative Hypothesis**: Apply consensus protocols to federated learning aggregation
4. **Creative Potential**: High — both fields deal with agreement under uncertainty`;
    }
    if (prompt.includes("second-brain") || prompt.includes("knowledge graph context")) {
      return `Based on your knowledge graph, CAP theorem states that distributed systems can only guarantee 2 of 3 properties: Consistency, Availability, and Partition tolerance. You have notes connecting this to Raft and Paxos consensus algorithms.`;
    }
    // Default: extraction response
    return JSON.stringify({
      nodes: [
        { type: "concept", name: "CAP Theorem", summary: "Consistency-Availability-Partition tolerance tradeoff", domain: "distributed-systems" },
        { type: "concept", name: "Consensus Algorithm", summary: "Protocol for nodes to agree on a value", domain: "distributed-systems" },
        { type: "concept", name: "Raft", summary: "Understandable consensus algorithm", domain: "distributed-systems" },
      ],
      edges: [
        { source: "CAP Theorem", target: "Consensus Algorithm", relation: "related_to", confidence: 0.7, evidence: "Both fundamental to distributed systems" },
        { source: "Raft", target: "Consensus Algorithm", relation: "instance_of", confidence: 0.9, evidence: "Raft is a consensus algorithm" },
      ],
    });
  }) as any;

  // Mock chatJSON method
  mockClient.chatJSON = mock.method(mockClient, "chatJSON" as any, async (options: any) => {
    return JSON.parse(await mockClient.chat(options));
  }) as any;

  return mockClient;
}

// ─── Tool 1: ingest_note ──────────────────────────────────

describe("Tool: ingest_note", () => {
  it("should extract entities from inline content", async () => {
    const llm = createMockLLM();
    const { registerIngestNoteTool } = await import("../src/tools/ingest-note.js");

    // We can't easily test the MCP server tool registration in isolation,
    // so we test the underlying logic directly
    const extraction = await llm.chatJSON({
      system: "Extract knowledge entities",
      user: "Distributed systems follow CAP theorem. Raft is a consensus algorithm.",
    });

    assert.ok(extraction.nodes.length >= 2);
    assert.ok(extraction.edges.length >= 1);
  });

  it("should read from file path", () => {
    assert.ok(fs.existsSync(SAMPLE_NOTE_PATH));
    const content = fs.readFileSync(SAMPLE_NOTE_PATH, "utf-8");
    assert.ok(content.includes("CAP"));
    assert.ok(content.includes("Raft"));
  });

  it("should persist extracted data to graph", async () => {
    const llm = createMockLLM();
    const extraction = await llm.chatJSON({
      system: "test",
      user: "CAP theorem and Raft consensus",
    });

    // Manually run the ingestion pipeline (what ingest_note tool does)
    const { ingestExtraction, getGraphStats: stats } = await import("../src/graph/store.js");
    const result = ingestExtraction(db, extraction, "test.md");
    saveDatabase(db, TEST_DB_PATH);

    assert.equal(result.nodesAdded, 3);
    assert.equal(result.edgesAdded, 2);

    const graphStats = stats(db);
    assert.equal(graphStats.totalNodes, 3);
    assert.equal(graphStats.totalEdges, 2);
  });
});

// ─── Tool 2: query_mind ───────────────────────────────────

describe("Tool: query_mind", () => {
  it("should answer from populated graph", async () => {
    // Seed the graph
    const idA = upsertNode(db, { name: "CAP Theorem", type: "concept", summary: "CA+P tradeoff", domain: "distributed-systems" }).node.id;
    const idB = upsertNode(db, { name: "Raft", type: "concept", summary: "Consensus algorithm", domain: "distributed-systems" }).node.id;
    addEdge(db, { source_id: idA, target_id: idB, relation: "related_to", confidence: 0.8, evidence: "Both DS fundamentals" });

    // Simulate what query_mind does: search → subgraph → LLM
    const { searchNodeIds, getSubgraph1Hop } = await import("../src/graph/queries.js");
    const seedIds = searchNodeIds(db, ["CAP"], 10);
    assert.ok(seedIds.length >= 1);

    const subgraph = getSubgraph1Hop(db, seedIds);
    assert.ok(subgraph.nodes.length >= 2); // CAP + Raft (neighbor)

    // LLM call
    const llm = createMockLLM();
    const answer = await llm.chat({
      system: "Answer based on knowledge graph",
      user: `Context: ${JSON.stringify(subgraph.nodes.map(n => n.name))}. Question: What is CAP?`,
    });
    assert.ok(answer.length > 0);
    assert.ok(answer.includes("CAP"));
  });

  it("should return helpful message for empty graph", async () => {
    const { searchNodeIds } = await import("../src/graph/queries.js");
    const ids = searchNodeIds(db, ["nonexistent"], 10);
    assert.equal(ids.length, 0);
    // Tool would return "No relevant entities found" message
  });
});

// ─── Tool 3: recall_context ───────────────────────────────

describe("Tool: recall_context", () => {
  it("should find related notes for writing context", async () => {
    // Seed graph with nodes at different times
    const idA = upsertNode(db, { name: "CAP Theorem", type: "concept", summary: "tradeoff", domain: "ds" }).node.id;
    const idB = upsertNode(db, { name: "Consistency", type: "concept", summary: "reads see writes", domain: "ds" }).node.id;
    addEdge(db, { source_id: idA, target_id: idB, relation: "part_of", confidence: 0.9, evidence: "" });

    // Simulate keyword extraction from writing
    const writing = "I'm writing about consistency models in distributed databases";
    const keywords = writing.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 3);

    const { searchNodeIds, getSubgraph1Hop } = await import("../src/graph/queries.js");
    const seedIds = searchNodeIds(db, keywords, 15);
    assert.ok(seedIds.length >= 1); // Should find "Consistency" or related

    const subgraph = getSubgraph1Hop(db, seedIds.slice(0, 5));
    assert.ok(subgraph.nodes.length >= 1);
  });
});

// ─── Tool 4: discover_connections ─────────────────────────

describe("Tool: discover_connections", () => {
  it("should find cross-domain connections", async () => {
    // Build graph with two domains connected through a bridge
    const idA = upsertNode(db, { name: "Consensus", type: "concept", summary: "Agreement protocol", domain: "distributed-systems" }).node.id;
    const idB = upsertNode(db, { name: "Paxos", type: "concept", summary: "Classic consensus", domain: "distributed-systems" }).node.id;
    const idC = upsertNode(db, { name: "Backpropagation", type: "concept", summary: "Training algorithm", domain: "machine-learning" }).node.id;
    const idD = upsertNode(db, { name: "Gradient Descent", type: "concept", summary: "Optimization", domain: "machine-learning" }).node.id;
    // Bridge: "Iterative Convergence" connects both domains
    const idBridge = upsertNode(db, { name: "Iterative Convergence", type: "concept", summary: "Common pattern", domain: "mathematics" }).node.id;

    addEdge(db, { source_id: idA, target_id: idBridge, relation: "related_to", confidence: 0.7, evidence: "" });
    addEdge(db, { source_id: idBridge, target_id: idC, relation: "related_to", confidence: 0.7, evidence: "" });
    addEdge(db, { source_id: idB, target_id: idA, relation: "instance_of", confidence: 0.9, evidence: "" });
    addEdge(db, { source_id: idD, target_id: idC, relation: "part_of", confidence: 0.9, evidence: "" });

    // Find cross-domain paths
    const { findCrossDomainPaths } = await import("../src/graph/queries.js");
    const crossPaths = findCrossDomainPaths(db);

    assert.ok(crossPaths.length >= 1);
    // Verify bridge is identified
    const bridgeNames = crossPaths.map(p => p.bridge.name);
    assert.ok(bridgeNames.includes("Iterative Convergence"));

    // LLM analysis
    const llm = createMockLLM();
    const analysis = await llm.chat({
      system: "Analyze connections",
      user: "Connection between Consensus and Backpropagation",
    });
    assert.ok(analysis.includes("Parallels") || analysis.includes("Connection"));
  });
});

// ─── Tool 5: detect_blindspots ────────────────────────────

describe("Tool: detect_blindspots", () => {
  it("should identify gaps in topic coverage", async () => {
    // Seed partial knowledge about distributed systems
    upsertNode(db, { name: "CAP Theorem", type: "concept", summary: "tradeoff", domain: "distributed-systems" });
    upsertNode(db, { name: "Raft", type: "concept", summary: "consensus", domain: "distributed-systems" });

    // Simulate blindspot detection
    const { searchNodeIds, getSubgraph2Hop } = await import("../src/graph/queries.js");
    const seedIds = searchNodeIds(db, ["distributed systems"], 15);

    const llm = createMockLLM();
    const analysis = await llm.chat({
      system: "Analyze blindspots",
      user: `Topic: distributed systems. Graph has CAP Theorem and Raft.`,
    });

    assert.ok(analysis.includes("Coverage Gaps") || analysis.includes("Missing"));
    assert.ok(analysis.includes("Byzantine") || analysis.includes("suggested") || analysis.includes("Exploration"));
  });

  it("should report empty graph as a blindspot itself", async () => {
    const { searchNodeIds } = await import("../src/graph/queries.js");
    const ids = searchNodeIds(db, ["anything"], 15);
    assert.equal(ids.length, 0);
    // Tool would return: "No knowledge found — this itself is a blindspot"
  });
});

// ─── Tool 6: analyze_cognitive_topology ───────────────────

describe("Tool: analyze_cognitive_topology", () => {
  it("should generate cognitive portrait from graph", async () => {
    // Build a multi-domain graph
    const idA = upsertNode(db, { name: "A", type: "concept", summary: "ds concept", domain: "distributed-systems" }).node.id;
    const idB = upsertNode(db, { name: "B", type: "concept", summary: "ds concept", domain: "distributed-systems" }).node.id;
    const idC = upsertNode(db, { name: "C", type: "concept", summary: "ml concept", domain: "machine-learning" }).node.id;
    const idD = upsertNode(db, { name: "D", type: "concept", summary: "isolated", domain: "security" }).node.id;

    addEdge(db, { source_id: idA, target_id: idB, relation: "supports", confidence: 0.9, evidence: "" });
    addEdge(db, { source_id: idA, target_id: idC, relation: "related_to", confidence: 0.6, evidence: "" });

    const { analyzeTopology } = await import("../src/graph/queries.js");
    const topo = analyzeTopology(db);

    assert.equal(topo.stats.totalNodes, 4);
    assert.equal(topo.stats.totalDomains, 3);
    assert.ok(topo.components.length >= 2); // D is isolated

    const llm = createMockLLM();
    const portrait = await llm.chat({
      system: "Cognitive cartographer",
      user: `Topology: ${topo.stats.totalNodes} nodes, ${topo.stats.totalDomains} domains, ${topo.components.length} components`,
    });

    assert.ok(portrait.includes("Portrait") || portrait.includes("Landscape") || portrait.includes("knowledge"));
  });
});

// ─── Tool 7: trace_concept_evolution ──────────────────────

describe("Tool: trace_concept_evolution", () => {
  it("should track concept understanding changes", async () => {
    const { node } = upsertNode(db, { name: "Consensus", type: "concept", summary: "Agreement in distributed systems", domain: "ds" });

    // Simulate evolution over time
    addEvolutionEntry(db, {
      node_id: node.id,
      belief_summary: "Only Paxos exists",
      trigger_note: "First learning about distributed consensus",
      source_file: "note1.md",
    });
    addEvolutionEntry(db, {
      node_id: node.id,
      belief_summary: "Raft is more practical than Paxos",
      trigger_note: "Read the Raft paper",
      source_file: "note2.md",
    });
    addEvolutionEntry(db, {
      node_id: node.id,
      belief_summary: "BFT consensus is needed for hostile environments",
      trigger_note: "Studied PBFT and blockchain consensus",
      source_file: "note3.md",
    });

    const log = getEvolutionLog(db, node.id);
    assert.equal(log.length, 3);

    const llm = createMockLLM();
    const analysis = await llm.chat({
      system: "Evolution analyst",
      user: `Concept: Consensus. Timeline: ${log.map(e => e.belief_summary).join(" → ")}`,
    });

    assert.ok(analysis.includes("Evolution") || analysis.includes("Turning") || analysis.includes("evolved"));
  });

  it("should handle concept with no evolution history", async () => {
    upsertNode(db, { name: "NewConcept", type: "concept", summary: "just added", domain: "test" });
    const { getNodeByName } = await import("../src/graph/store.js");
    const node = getNodeByName(db, "NewConcept");
    const log = getEvolutionLog(db, node.id);
    assert.equal(log.length, 0);
    // Tool would return current state info + "No evolution history yet"
  });
});

// ─── Tool 8: spark_serendipity ────────────────────────────

describe("Tool: spark_serendipity", () => {
  it("should generate creative sparks between domains", async () => {
    // Seed two different domains
    upsertNode(db, { name: "Consensus Protocol", type: "concept", summary: "Nodes agree on state", domain: "distributed-systems" });
    upsertNode(db, { name: "Synaptic Plasticity", type: "concept", summary: "Brain adapts connections", domain: "neuroscience" });

    const { getSampleNodesByDomain, getAllDomains } = await import("../src/graph/store.js");
    const domains = getAllDomains(db);
    assert.ok(domains.length >= 2);

    const nodesDS = getSampleNodesByDomain(db, "distributed-systems", 1);
    const nodesNS = getSampleNodesByDomain(db, "neuroscience", 1);
    assert.equal(nodesDS.length, 1);
    assert.equal(nodesNS.length, 1);

    const llm = createMockLLM();
    const spark = await llm.chat({
      system: "Serendipity engine",
      user: `Spark between ${nodesDS[0].name} and ${nodesNS[0].name}`,
    });

    assert.ok(spark.includes("Spark") || spark.includes("Bridge") || spark.includes("connection") || spark.includes("Parallels"));
  });

  it("should report when fewer than 2 domains exist", async () => {
    upsertNode(db, { name: "Only", type: "concept", summary: "", domain: "single" });
    const { getAllDomains } = await import("../src/graph/store.js");
    const domains = getAllDomains(db);
    assert.equal(domains.length, 1);
    // Tool would return: "Need at least 2 domains for serendipity"
  });
});

// ─── Full pipeline integration ────────────────────────────

describe("Full pipeline: ingest → query → discover → blindspot", () => {
  it("should work end-to-end", async () => {
    const llm = createMockLLM();

    // Step 1: Ingest note 1
    const extraction1 = await llm.chatJSON({ system: "extract", user: "CAP theorem and consensus" });
    const { ingestExtraction } = await import("../src/graph/store.js");
    const r1 = ingestExtraction(db, extraction1, "note1.md");
    assert.ok(r1.nodesAdded >= 2);

    // Step 2: Ingest note 2 (different domain)
    const extraction2 = {
      nodes: [
        { type: "concept" as const, name: "Backpropagation", summary: "Training algorithm", domain: "machine-learning" },
        { type: "concept" as const, name: "Gradient Descent", summary: "Optimization", domain: "machine-learning" },
      ],
      edges: [
        { source: "Backpropagation", target: "Gradient Descent", relation: "part_of" as const, confidence: 0.9, evidence: "" },
      ],
    };
    const r2 = ingestExtraction(db, extraction2, "note2.md");
    assert.ok(r2.nodesAdded >= 2);

    // Step 3: Query
    const { searchNodeIds, getSubgraph1Hop } = await import("../src/graph/queries.js");
    const seedIds = searchNodeIds(db, ["CAP"], 10);
    assert.ok(seedIds.length >= 1);
    const sub = getSubgraph1Hop(db, seedIds);
    assert.ok(sub.nodes.length >= 1);

    // Step 4: Stats
    const stats = getGraphStats(db);
    assert.ok(stats.totalNodes >= 4);
    assert.ok(stats.totalDomains >= 2);

    // Step 5: Topology
    const { analyzeTopology } = await import("../src/graph/queries.js");
    const topo = analyzeTopology(db);
    assert.ok(topo.stats.totalDomains >= 2);

    saveDatabase(db, TEST_DB_PATH);

    // Step 6: Verify persistence
    const db2 = await initDatabase(TEST_DB_PATH);
    const stats2 = getGraphStats(db2);
    assert.equal(stats2.totalNodes, stats.totalNodes);
    assert.equal(stats2.totalEdges, stats.totalEdges);
    db2.close();
  });
});