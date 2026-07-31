/**
 * End-to-end full-lifecycle tests.
 *
 * Simulates a realistic user journey:
 *   1. Bootstrap empty DB
 *   2. Ingest multiple notes (different domains)
 *   3. Re-ingest (dedup / update)
 *   4. Query mind (shallow + deep)
 *   5. Recall context while writing
 *   6. Discover cross-domain connections
 *   7. Detect blindspots
 *   8. Analyze cognitive topology
 *   9. Trace concept evolution
 *  10. Spark serendipity
 *  11. Persist → reload → verify
 *
 * Run:  npx tsx --test test/e2e.test.ts
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { initDatabase, saveDatabase } from "../src/graph/schema.js";
import type { Database } from "sql.js";
import {
  upsertNode,
  addEdge,
  addEvolutionEntry,
  ingestExtraction,
  isNoteChanged,
  getGraphStats,
  getAllNodes,
  getAllDomains,
  getNodesByDomain,
  getNodeByName,
  getEvolutionLog,
  getSampleNodesByDomain,
  getEdgesForNode,
  getNodeById,
  getNoteIndex,
} from "../src/graph/store.js";
import {
  searchNodeIds,
  getSubgraph1Hop,
  getSubgraph2Hop,
  findPaths,
  findCrossDomainPaths,
  analyzeTopology,
} from "../src/graph/queries.js";
import type { ExtractionResult } from "../src/graph/types.js";

const E2E_DB = "./test-e2e-cognitive.db";
let db: Database;

beforeEach(async () => {
  if (fs.existsSync(E2E_DB)) fs.unlinkSync(E2E_DB);
  db = await initDatabase(E2E_DB);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(E2E_DB)) fs.unlinkSync(E2E_DB);
});

// ─── helper: realistic extraction payloads ─────────────────

const EXTRACTION_DS: ExtractionResult = {
  nodes: [
    { type: "concept", name: "CAP Theorem", summary: "Consistency-Availability-Partition tolerance tradeoff", domain: "distributed-systems" },
    { type: "concept", name: "Raft", summary: "Understandable consensus algorithm", domain: "distributed-systems" },
    { type: "concept", name: "Paxos", summary: "Classic consensus protocol by Lamport", domain: "distributed-systems" },
    { type: "concept", name: "Consensus Algorithm", summary: "Protocol for distributed nodes to agree on a value", domain: "distributed-systems" },
  ],
  edges: [
    { source: "Raft", target: "Consensus Algorithm", relation: "instance_of", confidence: 0.9, evidence: "Raft is a consensus algorithm" },
    { source: "Paxos", target: "Consensus Algorithm", relation: "instance_of", confidence: 0.9, evidence: "Paxos is a consensus algorithm" },
    { source: "CAP Theorem", target: "Consensus Algorithm", relation: "related_to", confidence: 0.7, evidence: "Consensus relates to CAP tradeoffs" },
  ],
};

const EXTRACTION_ML: ExtractionResult = {
  nodes: [
    { type: "concept", name: "Backpropagation", summary: "Training algorithm for neural networks using chain rule", domain: "machine-learning" },
    { type: "concept", name: "Gradient Descent", summary: "Optimization algorithm that iteratively minimizes a function", domain: "machine-learning" },
    { type: "concept", name: "Neural Network", summary: "Computational model inspired by biological neurons", domain: "machine-learning" },
  ],
  edges: [
    { source: "Backpropagation", target: "Gradient Descent", relation: "part_of", confidence: 0.9, evidence: "Backprop uses gradient descent" },
    { source: "Backpropagation", target: "Neural Network", relation: "part_of", confidence: 0.8, evidence: "Backprop trains neural networks" },
  ],
};

const EXTRACTION_MATH: ExtractionResult = {
  nodes: [
    { type: "concept", name: "Iterative Convergence", summary: "Process of approaching a solution through repeated refinement", domain: "mathematics" },
    { type: "concept", name: "Fixed Point Theorem", summary: "Theorems about points that remain unchanged under transformations", domain: "mathematics" },
  ],
  edges: [
    { source: "Iterative Convergence", target: "Fixed Point Theorem", relation: "related_to", confidence: 0.8, evidence: "Convergence relates to fixed points" },
  ],
};

// ─── Phase 1: Bootstrap ────────────────────────────────────

describe("E2E Phase 1: Bootstrap empty database", () => {
  it("starts with zero nodes, edges, and domains", () => {
    const stats = getGraphStats(db);
    assert.equal(stats.totalNodes, 0);
    assert.equal(stats.totalEdges, 0);
    assert.equal(stats.totalDomains, 0);
    assert.deepEqual(getAllDomains(db), []);
    assert.deepEqual(getAllNodes(db), []);
  });

  it("topology on empty graph returns empty components", () => {
    const topo = analyzeTopology(db);
    assert.equal(topo.components.length, 0);
    assert.equal(topo.stats.totalNodes, 0);
  });
});

// ─── Phase 2: Ingest ───────────────────────────────────────

describe("E2E Phase 2: Ingest multiple notes", () => {
  it("ingest distributed-systems note", () => {
    const r = ingestExtraction(db, EXTRACTION_DS, "ds-note.md");
    assert.equal(r.nodesAdded, 4);
    assert.equal(r.edgesAdded, 3);
    assert.equal(r.nodesUpdated, 0);
  });

  it("ingest machine-learning note", () => {
    ingestExtraction(db, EXTRACTION_DS, "ds-note.md");
    const r = ingestExtraction(db, EXTRACTION_ML, "ml-note.md");
    assert.equal(r.nodesAdded, 3);
    assert.equal(r.edgesAdded, 2);
  });

  it("ingest mathematics note", () => {
    ingestExtraction(db, EXTRACTION_DS, "ds-note.md");
    ingestExtraction(db, EXTRACTION_ML, "ml-note.md");
    const r = ingestExtraction(db, EXTRACTION_MATH, "math-note.md");
    assert.equal(r.nodesAdded, 2);
    assert.equal(r.edgesAdded, 1);
  });

  it("after all ingests: 9 nodes, 6 edges, 3 domains", () => {
    ingestExtraction(db, EXTRACTION_DS, "ds-note.md");
    ingestExtraction(db, EXTRACTION_ML, "ml-note.md");
    ingestExtraction(db, EXTRACTION_MATH, "math-note.md");

    const stats = getGraphStats(db);
    assert.equal(stats.totalNodes, 9);
    assert.equal(stats.totalEdges, 6);
    assert.equal(stats.totalDomains, 3);
  });

  it("notes_index records each ingested file", () => {
    ingestExtraction(db, EXTRACTION_DS, "ds-note.md");
    ingestExtraction(db, EXTRACTION_ML, "ml-note.md");

    const dsIndex = getNoteIndex(db, "ds-note.md");
    assert.ok(dsIndex);
    assert.equal(dsIndex!.file_path, "ds-note.md");
    assert.ok(dsIndex!.node_ids.length > 0);

    const mlIndex = getNoteIndex(db, "ml-note.md");
    assert.ok(mlIndex);
  });
});

// ─── Phase 3: Re-ingest (dedup + update) ───────────────────

describe("E2E Phase 3: Re-ingestion deduplication", () => {
  it("re-ingesting same note updates nodes but doesn't create duplicates", () => {
    ingestExtraction(db, EXTRACTION_DS, "ds-note.md");
    const r2 = ingestExtraction(db, EXTRACTION_DS, "ds-note.md");

    assert.equal(r2.nodesAdded, 0); // No new nodes
    assert.equal(r2.nodesUpdated, 4); // All 4 updated
    assert.equal(r2.edgesAdded, 3); // Edges are always added (no dedup for edges by design)

    const stats = getGraphStats(db);
    assert.equal(stats.totalNodes, 4); // Still 4 nodes
  });

  it("isNoteChanged detects content changes", () => {
    // First time: always changed
    assert.equal(isNoteChanged(db, "test.md", "v1"), true);

    ingestExtraction(db, EXTRACTION_DS, "test.md", "v1");
    saveDatabase(db, E2E_DB);

    assert.equal(isNoteChanged(db, "test.md", "v1"), false);
    assert.equal(isNoteChanged(db, "test.md", "v2"), true);
  });
});

// ─── Phase 4: Query mind ───────────────────────────────────

describe("E2E Phase 4: query_mind pipeline", () => {
  beforeEach(() => {
    ingestExtraction(db, EXTRACTION_DS, "ds.md");
    ingestExtraction(db, EXTRACTION_ML, "ml.md");
    ingestExtraction(db, EXTRACTION_MATH, "math.md");
  });

  it("shallow query: finds relevant nodes via keyword search", () => {
    const seedIds = searchNodeIds(db, ["consensus"], 10);
    assert.ok(seedIds.length >= 1);

    const sub = getSubgraph1Hop(db, seedIds);
    assert.ok(sub.nodes.length >= 2);
    // Should find Consensus Algorithm + its neighbors
    const names = new Set(sub.nodes.map((n) => n.name));
    assert.ok(names.has("Consensus Algorithm"));
  });

  it("deep query: expands to 2-hop neighborhood", () => {
    const seedIds = searchNodeIds(db, ["Raft"], 10);
    assert.ok(seedIds.length >= 1);

    const shallow = getSubgraph1Hop(db, seedIds);
    const deep = getSubgraph2Hop(db, seedIds);

    // Deep should have at least as many nodes as shallow
    assert.ok(deep.nodes.length >= shallow.nodes.length);
    // Deep should have at least as many edges
    assert.ok(deep.edges.length >= shallow.edges.length);
  });

  it("query with no matches returns empty seed", () => {
    const seedIds = searchNodeIds(db, ["blockchain", "ethereum"], 10);
    assert.equal(seedIds.length, 0);
  });

  it("multi-keyword search finds more nodes", () => {
    const singleKw = searchNodeIds(db, ["consensus"], 10);
    const multiKw = searchNodeIds(db, ["consensus", "gradient", "convergence"], 10);
    assert.ok(multiKw.length >= singleKw.length);
  });
});

// ─── Phase 5: Recall context ───────────────────────────────

describe("E2E Phase 5: recall_context pipeline", () => {
  beforeEach(() => {
    ingestExtraction(db, EXTRACTION_DS, "ds.md");
    ingestExtraction(db, EXTRACTION_ML, "ml.md");
  });

  it("finds related nodes from writing context", () => {
    const writingText = "I am writing about consensus algorithms and how they ensure agreement in distributed systems";
    const keywords = writingText.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 3);

    const seedIds = searchNodeIds(db, keywords, 15);
    assert.ok(seedIds.length >= 1);

    const sub = getSubgraph1Hop(db, seedIds.slice(0, 5));
    assert.ok(sub.nodes.length >= 1);
  });

  it("recalled nodes include connection info", () => {
    const seedIds = searchNodeIds(db, ["Raft"], 5);
    assert.ok(seedIds.length >= 1);

    const sub = getSubgraph1Hop(db, seedIds);
    const raftNode = sub.nodes.find((n) => n.name === "Raft");
    assert.ok(raftNode);

    const edges = getEdgesForNode(db, raftNode!.id);
    assert.ok(edges.length >= 1);
    // Raft should connect to Consensus Algorithm
    const neighborIds = edges.map((e) => e.source_id === raftNode!.id ? e.target_id : e.source_id);
    const neighborNames = neighborIds.map((id) => getNodeById(db, id)?.name).filter(Boolean);
    assert.ok(neighborNames.includes("Consensus Algorithm"));
  });
});

// ─── Phase 6: Discover connections ─────────────────────────

describe("E2E Phase 6: discover_connections pipeline", () => {
  beforeEach(() => {
    ingestExtraction(db, EXTRACTION_DS, "ds.md");
    ingestExtraction(db, EXTRACTION_ML, "ml.md");
    ingestExtraction(db, EXTRACTION_MATH, "math.md");

    // Add a bridge node connecting DS and ML via mathematics
    const iterConvId = upsertNode(db, { name: "Iterative Convergence", type: "concept", summary: "common pattern", domain: "mathematics" }).node.id;
    const gradientId = getNodeByName(db, "Gradient Descent")!.id;
    const consensusId = getNodeByName(db, "Consensus Algorithm")!.id;
    addEdge(db, { source_id: iterConvId, target_id: gradientId, relation: "related_to", confidence: 0.6, evidence: "" });
    addEdge(db, { source_id: iterConvId, target_id: consensusId, relation: "related_to", confidence: 0.6, evidence: "" });
  });

  it("finds cross-domain paths", () => {
    const crossPaths = findCrossDomainPaths(db);
    assert.ok(crossPaths.length >= 1);
  });

  it("topic-focused discovery finds nodes related to a topic", () => {
    const keywords = "distributed consensus".toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const seedIds = searchNodeIds(db, keywords, 10);
    assert.ok(seedIds.length >= 1);

    const sub = getSubgraph1Hop(db, seedIds);
    const domains = new Set(sub.nodes.map((n) => n.domain));
    // Should span at least distributed-systems
    assert.ok(domains.has("distributed-systems"));
  });

  it("bridge node connects different domains", () => {
    const iterConv = getNodeByName(db, "Iterative Convergence");
    assert.ok(iterConv);
    assert.equal(iterConv!.domain, "mathematics");

    const edges = getEdgesForNode(db, iterConv!.id);
    const neighborDomains = new Set<string>();
    for (const e of edges) {
      const otherId = e.source_id === iterConv!.id ? e.target_id : e.source_id;
      const other = getNodeById(db, otherId);
      if (other) neighborDomains.add(other.domain);
    }
    // Should connect to at least 2 different domains
    assert.ok(neighborDomains.size >= 2);
  });
});

// ─── Phase 7: Detect blindspots ────────────────────────────

describe("E2E Phase 7: detect_blindspots pipeline", () => {
  beforeEach(() => {
    ingestExtraction(db, EXTRACTION_DS, "ds.md");
  });

  it("2-hop subgraph captures broader context for analysis", () => {
    const keywords = "distributed systems consensus".split(/\s+/).filter((w) => w.length > 2);
    const seedIds = searchNodeIds(db, keywords, 15);
    assert.ok(seedIds.length >= 1);

    const sub = getSubgraph2Hop(db, seedIds);
    assert.ok(sub.nodes.length >= 2);
    assert.ok(sub.edges.length >= 1);
  });

  it("coverage analysis identifies domains and types", () => {
    const seedIds = searchNodeIds(db, ["CAP", "Raft"], 15);
    const sub = getSubgraph2Hop(db, seedIds);

    const domains = new Set(sub.nodes.map((n) => n.domain));
    const types = new Set(sub.nodes.map((n) => n.type));
    assert.ok(domains.size >= 1);
    assert.ok(types.has("concept"));

    // Check for contradictions
    const contradictions = sub.edges.filter((e) => e.relation === "contradicts");
    assert.equal(contradictions.length, 0); // None in our test data
  });

  it("empty topic returns no seeds (blindspot itself)", () => {
    const seedIds = searchNodeIds(db, ["quantum computing"], 15);
    assert.equal(seedIds.length, 0);
  });
});

// ─── Phase 8: Analyze cognitive topology ───────────────────

describe("E2E Phase 8: analyze_cognitive_topology pipeline", () => {
  beforeEach(() => {
    ingestExtraction(db, EXTRACTION_DS, "ds.md");
    ingestExtraction(db, EXTRACTION_ML, "ml.md");
    ingestExtraction(db, EXTRACTION_MATH, "math.md");
  });

  it("identifies connected components", () => {
    const topo = analyzeTopology(db);
    // DS nodes are connected, ML nodes are connected, Math nodes are connected
    // But no edges between the three groups => at least 3 components
    assert.ok(topo.components.length >= 3);
  });

  it("computes domain density", () => {
    const topo = analyzeTopology(db);
    assert.equal(topo.density["distributed-systems"], 4);
    assert.equal(topo.density["machine-learning"], 3);
    assert.equal(topo.density["mathematics"], 2);
  });

  it("computes avg degree", () => {
    const topo = analyzeTopology(db);
    // 9 nodes, 6 edges → avg degree = 2*6/9 = 1.333...
    assert.ok(Math.abs(topo.stats.avgDegree - 12 / 9) < 0.01);
  });

  it("bridge nodes are ranked by betweenness", () => {
    const topo = analyzeTopology(db);
    // Bridges may be empty since the 3 components aren't connected
    // But within each component, nodes have betweenness > 0
    for (const bridge of topo.bridges) {
      assert.ok(bridge.score > 0);
      assert.ok(bridge.name.length > 0);
    }
  });

  it("topology with domain filter shows only that domain's nodes", () => {
    const dsNodes = getNodesByDomain(db, "distributed-systems");
    assert.equal(dsNodes.length, 4);

    const mlNodes = getNodesByDomain(db, "machine-learning");
    assert.equal(mlNodes.length, 3);
  });
});

// ─── Phase 9: Trace concept evolution ──────────────────────

describe("E2E Phase 9: trace_concept_evolution pipeline", () => {
  it("tracks multi-stage understanding evolution", () => {
    const { node } = upsertNode(db, { name: "Consensus", type: "concept", summary: "Agreement in DS", domain: "ds" });

    addEvolutionEntry(db, {
      node_id: node.id,
      belief_summary: "Paxos is the only consensus algorithm",
      trigger_note: "First lecture on distributed systems",
      source_file: "lecture1.md",
    });
    addEvolutionEntry(db, {
      node_id: node.id,
      belief_summary: "Raft is more practical, Paxos more theoretical",
      trigger_note: "Read Raft paper",
      source_file: "raft-paper.md",
    });
    addEvolutionEntry(db, {
      node_id: node.id,
      belief_summary: "BFT consensus is needed for adversarial environments",
      trigger_note: "Studied blockchain consensus mechanisms",
      source_file: "blockchain-notes.md",
    });

    const log = getEvolutionLog(db, node.id);
    assert.equal(log.length, 3);
    assert.equal(log[0].belief_summary, "Paxos is the only consensus algorithm");
    assert.equal(log[2].belief_summary, "BFT consensus is needed for adversarial environments");
    // Verify ordering by snapshot_at
    assert.ok(log[0].snapshot_at <= log[1].snapshot_at);
  });

  it("concept with no evolution log returns empty array", () => {
    const { node } = upsertNode(db, { name: "NewConcept", type: "concept", summary: "just created", domain: "test" });
    const log = getEvolutionLog(db, node.id);
    assert.equal(log.length, 0);
  });
});

// ─── Phase 10: Spark serendipity ───────────────────────────

describe("E2E Phase 10: spark_serendipity pipeline", () => {
  beforeEach(() => {
    ingestExtraction(db, EXTRACTION_DS, "ds.md");
    ingestExtraction(db, EXTRACTION_ML, "ml.md");
    ingestExtraction(db, EXTRACTION_MATH, "math.md");
  });

  it("has at least 3 domains for cross-domain sparks", () => {
    const domains = getAllDomains(db);
    assert.ok(domains.length >= 3);
  });

  it("can sample nodes from each domain", () => {
    const dsSample = getSampleNodesByDomain(db, "distributed-systems", 2);
    const mlSample = getSampleNodesByDomain(db, "machine-learning", 2);
    assert.equal(dsSample.length, 2);
    assert.equal(mlSample.length, 2);
    assert.ok(dsSample.every((n) => n.domain === "distributed-systems"));
    assert.ok(mlSample.every((n) => n.domain === "machine-learning"));
  });

  it("sampling more than available returns what exists", () => {
    const sample = getSampleNodesByDomain(db, "mathematics", 100);
    assert.equal(sample.length, 2); // Only 2 math nodes
  });

  it("sampling from nonexistent domain returns empty", () => {
    const sample = getSampleNodesByDomain(db, "nonexistent-domain", 5);
    assert.equal(sample.length, 0);
  });
});

// ─── Phase 11: Persist → Reload → Verify ───────────────────

describe("E2E Phase 11: Database persistence lifecycle", () => {
  it("save → close → reopen preserves all data", async () => {
    // Populate
    ingestExtraction(db, EXTRACTION_DS, "ds.md");
    ingestExtraction(db, EXTRACTION_ML, "ml.md");

    // Add evolution
    const node = getNodeByName(db, "CAP Theorem")!;
    addEvolutionEntry(db, {
      node_id: node.id,
      belief_summary: "CAP is fundamental",
      trigger_note: "initial",
      source_file: "ds.md",
    });

    const originalStats = getGraphStats(db);
    const originalDomains = getAllDomains(db);
    saveDatabase(db, E2E_DB);
    db.close();

    // Reopen
    const db2 = await initDatabase(E2E_DB);

    const stats2 = getGraphStats(db2);
    assert.equal(stats2.totalNodes, originalStats.totalNodes);
    assert.equal(stats2.totalEdges, originalStats.totalEdges);
    assert.equal(stats2.totalDomains, originalStats.totalDomains);

    const domains2 = getAllDomains(db2);
    assert.deepEqual(domains2.sort(), originalDomains.sort());

    // Verify evolution survived
    const node2 = getNodeByName(db2, "CAP Theorem")!;
    const log = getEvolutionLog(db2, node2.id);
    assert.equal(log.length, 1);
    assert.equal(log[0].belief_summary, "CAP is fundamental");

    // Verify notes_index survived
    const idx = getNoteIndex(db2, "ds.md");
    assert.ok(idx);

    db2.close();
  });

  it("double save doesn't corrupt data", async () => {
    ingestExtraction(db, EXTRACTION_DS, "ds.md");
    saveDatabase(db, E2E_DB);
    saveDatabase(db, E2E_DB); // second save

    db.close();
    const db2 = await initDatabase(E2E_DB);
    const stats = getGraphStats(db2);
    assert.equal(stats.totalNodes, 4);
    db2.close();
  });
});

// ─── Full pipeline mega-test ───────────────────────────────

describe("E2E Full pipeline: end-to-end mega test", () => {
  it("ingest → query → connect → topology → evolve → spark → persist", async () => {
    // 1. Ingest 3 domains
    const r1 = ingestExtraction(db, EXTRACTION_DS, "ds.md");
    const r2 = ingestExtraction(db, EXTRACTION_ML, "ml.md");
    const r3 = ingestExtraction(db, EXTRACTION_MATH, "math.md");
    assert.equal(r1.nodesAdded, 4);
    assert.equal(r2.nodesAdded, 3);
    assert.equal(r3.nodesAdded, 2);

    // 2. Add bridge between domains
    const iterConv = getNodeByName(db, "Iterative Convergence")!;
    const gradient = getNodeByName(db, "Gradient Descent")!;
    const consensus = getNodeByName(db, "Consensus Algorithm")!;
    addEdge(db, { source_id: iterConv.id, target_id: gradient.id, relation: "related_to", confidence: 0.5, evidence: "" });
    addEdge(db, { source_id: iterConv.id, target_id: consensus.id, relation: "related_to", confidence: 0.5, evidence: "" });

    // 3. Query
    const seedIds = searchNodeIds(db, ["CAP", "theorem"], 10);
    assert.ok(seedIds.length >= 1);
    const sub = getSubgraph1Hop(db, seedIds);
    assert.ok(sub.nodes.length >= 1);

    // 4. Discover connections
    const crossPaths = findCrossDomainPaths(db);
    assert.ok(crossPaths.length >= 1);

    // 5. Topology
    const topo = analyzeTopology(db);
    assert.equal(topo.stats.totalNodes, 9);
    assert.equal(topo.stats.totalDomains, 3);
    assert.ok(topo.components.length >= 1);

    // 6. Evolution
    addEvolutionEntry(db, {
      node_id: consensus.id,
      belief_summary: "Consensus is the foundation of DS",
      trigger_note: "deep study",
      source_file: "deep-study.md",
    });
    const log = getEvolutionLog(db, consensus.id);
    assert.equal(log.length, 1);

    // 7. Serendipity
    const dsSample = getSampleNodesByDomain(db, "distributed-systems", 1);
    const mlSample = getSampleNodesByDomain(db, "machine-learning", 1);
    assert.equal(dsSample.length, 1);
    assert.equal(mlSample.length, 1);
    assert.notEqual(dsSample[0].domain, mlSample[0].domain);

    // 8. Persist and verify
    saveDatabase(db, E2E_DB);
    db.close();

    const db2 = await initDatabase(E2E_DB);
    const stats = getGraphStats(db2);
    assert.equal(stats.totalNodes, 9);
    assert.equal(stats.totalEdges, 8); // 6 original + 2 bridge
    assert.equal(stats.totalDomains, 3);

    // Verify cross-domain connections survived
    const crossPaths2 = findCrossDomainPaths(db2);
    assert.ok(crossPaths2.length >= 1);

    // Verify evolution survived
    const consensus2 = getNodeByName(db2, "Consensus Algorithm")!;
    const log2 = getEvolutionLog(db2, consensus2.id);
    assert.equal(log2.length, 1);

    db2.close();
  });
});

// ─── Path finding across domains ───────────────────────────

describe("E2E: Path finding across domains", () => {
  it("finds path from DS concept to ML concept through bridge", () => {
    // DS: A → B
    const idA = upsertNode(db, { name: "DS-Concept", type: "concept", summary: "", domain: "ds" }).node.id;
    const idB = upsertNode(db, { name: "Bridge-Node", type: "concept", summary: "", domain: "bridge" }).node.id;
    const idC = upsertNode(db, { name: "ML-Concept", type: "concept", summary: "", domain: "ml" }).node.id;

    addEdge(db, { source_id: idA, target_id: idB, relation: "related_to", confidence: 0.8, evidence: "" });
    addEdge(db, { source_id: idB, target_id: idC, relation: "related_to", confidence: 0.8, evidence: "" });

    const paths = findPaths(db, idA, idC, 4);
    assert.ok(paths.length >= 1);
    assert.equal(paths[0].path.length, 3);
    assert.equal(paths[0].path[0].name, "DS-Concept");
    assert.equal(paths[0].path[1].name, "Bridge-Node");
    assert.equal(paths[0].path[2].name, "ML-Concept");
  });

  it("no path between disconnected domains", () => {
    const idA = upsertNode(db, { name: "Isolated-A", type: "concept", summary: "", domain: "d1" }).node.id;
    const idB = upsertNode(db, { name: "Isolated-B", type: "concept", summary: "", domain: "d2" }).node.id;

    const paths = findPaths(db, idA, idB, 5);
    assert.equal(paths.length, 0);
  });
});