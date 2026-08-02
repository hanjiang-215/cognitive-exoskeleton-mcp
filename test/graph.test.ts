/**
 * Graph engine unit tests.
 * Covers: schema init, node CRUD, edge CRUD, batch ingestion,
 *         subgraph queries, path finding, topology analysis.
 *
 * Run: npm test
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import initSqlJs from "sql.js";
import { initDatabase, saveDatabase } from "../src/graph/schema.js";
import type { Database } from "sql.js";
import {
  upsertNode,
  getNodeById,
  getNodeByName,
  searchNodes,
  getNodesByDomain,
  getAllNodes,
  getAllDomains,
  getSampleNodesByDomain,
  addEdge,
  getEdgesForNode,
  getOutgoingEdges,
  getIncomingEdges,
  ingestExtraction,
  addEvolutionEntry,
  getEvolutionLog,
  isNoteChanged,
  getGraphStats,
} from "../src/graph/store.js";
import {
  getSubgraph1Hop,
  getSubgraph2Hop,
  findPaths,
  findCrossDomainPaths,
  analyzeTopology,
  searchNodeIds,
} from "../src/graph/queries.js";
import type { ExtractionResult } from "../src/graph/types.js";

const TEST_DB_PATH = "./test-cognitive.db";

let db: Database;

beforeEach(async () => {
  // Clean up any leftover test DB
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  db = await initDatabase(TEST_DB_PATH);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

// ─── Schema ────────────────────────────────────────────────

describe("Schema initialization", () => {
  it("should create all 6 tables", () => {
    const tables = db.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );
    const tableNames = tables[0]?.values.map((r) => r[0]) ?? [];
    assert.ok(tableNames.includes("nodes"));
    assert.ok(tableNames.includes("edges"));
    assert.ok(tableNames.includes("notes_index"));
    assert.ok(tableNames.includes("evolution_log"));
    assert.ok(tableNames.includes("topology_cache"));
    assert.ok(tableNames.includes("serendipity_log"));
  });

  it("should be idempotent (calling initDatabase twice is safe)", async () => {
    const db2 = await initDatabase(TEST_DB_PATH);
    const tables = db2.exec(
      `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    );
    assert.equal(tables[0]?.values[0][0], 6);
    db2.close();
  });
});

// ─── Node CRUD ─────────────────────────────────────────────

describe("Node operations", () => {
  it("upsertNode: create a new node", () => {
    const { node, isNew } = upsertNode(db, {
      name: "CAP Theorem",
      type: "concept",
      summary: "Consistency, Availability, Partition tolerance tradeoff",
      domain: "distributed-systems",
    });
    assert.equal(isNew, true);
    assert.equal(node.name, "CAP Theorem");
    assert.equal(node.type, "concept");
    assert.equal(node.domain, "distributed-systems");
    assert.equal(node.mention_count, 1);
  });

  it("upsertNode: update existing node (same name+domain)", () => {
    upsertNode(db, { name: "CAP Theorem", type: "concept", summary: "v1", domain: "distributed-systems" });
    const { node, isNew } = upsertNode(db, { name: "CAP Theorem", type: "concept", summary: "v2", domain: "distributed-systems" });
    assert.equal(isNew, false);
    assert.equal(node.mention_count, 2);
    assert.equal(node.summary, "v2");
  });

  it("upsertNode: same name but different domain = different nodes", () => {
    const { node: n1 } = upsertNode(db, { name: "Transformer", type: "concept", summary: "ML architecture", domain: "machine-learning" });
    const { node: n2, isNew } = upsertNode(db, { name: "Transformer", type: "concept", summary: "Design pattern", domain: "software-engineering" });
    assert.equal(isNew, true);
    assert.notEqual(n1.id, n2.id);
  });

  it("getNodeById and getNodeByName", () => {
    const { node } = upsertNode(db, { name: "Raft", type: "concept", summary: "Consensus algorithm", domain: "distributed-systems" });
    assert.equal(getNodeById(db, node.id)?.name, "Raft");
    assert.equal(getNodeByName(db, "Raft")?.id, node.id);
    assert.equal(getNodeById(db, "nonexistent"), undefined);
  });

  it("searchNodes: fuzzy search by name and summary", () => {
    upsertNode(db, { name: "Paxos", type: "concept", summary: "Consensus protocol by Lamport", domain: "ds" });
    upsertNode(db, { name: "Raft", type: "concept", summary: "Understandable consensus", domain: "ds" });
    upsertNode(db, { name: "Neural Network", type: "concept", summary: "ML model", domain: "ml" });

    const results = searchNodes(db, "consensus");
    assert.equal(results.length, 2);
    const names = results.map(r => r.name);
    assert.ok(names.includes("Paxos"));
    assert.ok(names.includes("Raft"));
  });

  it("getNodesByDomain and getAllDomains", () => {
    upsertNode(db, { name: "A", type: "concept", summary: "", domain: "alpha" });
    upsertNode(db, { name: "B", type: "concept", summary: "", domain: "beta" });
    upsertNode(db, { name: "C", type: "concept", summary: "", domain: "alpha" });

    assert.equal(getNodesByDomain(db, "alpha").length, 2);
    assert.equal(getNodesByDomain(db, "beta").length, 1);
    const domains = getAllDomains(db);
    assert.equal(domains.length, 2);
    assert.ok(domains.includes("alpha"));
    assert.ok(domains.includes("beta"));
  });

  it("getSampleNodesByDomain: returns random subset", () => {
    for (let i = 0; i < 10; i++) {
      upsertNode(db, { name: `Node-${i}`, type: "concept", summary: "", domain: "test" });
    }
    const sample = getSampleNodesByDomain(db, "test", 3);
    assert.equal(sample.length, 3);
    assert.ok(sample.every((n) => n.domain === "test"));
  });
});

// ─── Edge CRUD ─────────────────────────────────────────────

describe("Edge operations", () => {
  let nodeA: string;
  let nodeB: string;
  let nodeC: string;

  beforeEach(() => {
    nodeA = upsertNode(db, { name: "A", type: "concept", summary: "", domain: "d1" }).node.id;
    nodeB = upsertNode(db, { name: "B", type: "concept", summary: "", domain: "d1" }).node.id;
    nodeC = upsertNode(db, { name: "C", type: "concept", summary: "", domain: "d2" }).node.id;
  });

  it("addEdge and getEdgesForNode", () => {
    const edge = addEdge(db, { source_id: nodeA, target_id: nodeB, relation: "supports", confidence: 0.9, evidence: "test" });
    assert.equal(edge.relation, "supports");
    assert.equal(edge.confidence, 0.9);

    const edgesA = getEdgesForNode(db, nodeA);
    assert.equal(edgesA.length, 1);

    const edgesB = getEdgesForNode(db, nodeB);
    assert.equal(edgesB.length, 1);
  });

  it("getOutgoingEdges and getIncomingEdges", () => {
    addEdge(db, { source_id: nodeA, target_id: nodeB, relation: "references", confidence: 0.8, evidence: "" });
    addEdge(db, { source_id: nodeC, target_id: nodeA, relation: "related_to", confidence: 0.5, evidence: "" });

    const outgoing = getOutgoingEdges(db, nodeA);
    assert.equal(outgoing.length, 1);
    assert.equal(outgoing[0].target_id, nodeB);

    const incoming = getIncomingEdges(db, nodeA);
    assert.equal(incoming.length, 1);
    assert.equal(incoming[0].source_id, nodeC);
  });
});

// ─── Batch ingestion ───────────────────────────────────────

describe("Batch ingestion (ingestExtraction)", () => {
  it("should create nodes and edges from extraction result", () => {
    const extraction: ExtractionResult = {
      nodes: [
        { type: "concept", name: "CAP Theorem", summary: "CA+P tradeoff", domain: "distributed-systems" },
        { type: "concept", name: "Consistency", summary: "All reads see latest write", domain: "distributed-systems" },
        { type: "concept", name: "Availability", summary: "Every request gets a response", domain: "distributed-systems" },
      ],
      edges: [
        { source: "CAP Theorem", target: "Consistency", relation: "part_of", confidence: 0.9, evidence: "CAP includes C" },
        { source: "CAP Theorem", target: "Availability", relation: "part_of", confidence: 0.9, evidence: "CAP includes A" },
      ],
    };

    const result = ingestExtraction(db, extraction, "test-note.md");
    assert.equal(result.nodesAdded, 3);
    assert.equal(result.edgesAdded, 2);
    assert.equal(result.nodesUpdated, 0);

    // Verify graph state
    const nodes = getAllNodes(db);
    assert.equal(nodes.length, 3);
    const stats = getGraphStats(db);
    assert.equal(stats.totalNodes, 3);
    assert.equal(stats.totalEdges, 2);
  });

  it("should deduplicate on re-ingestion", () => {
    const extraction: ExtractionResult = {
      nodes: [
        { type: "concept", name: "CAP Theorem", summary: "v1", domain: "ds" },
        { type: "concept", name: "Raft", summary: "Consensus", domain: "ds" },
      ],
      edges: [
        { source: "CAP Theorem", target: "Raft", relation: "related_to", confidence: 0.7, evidence: "" },
      ],
    };

    ingestExtraction(db, extraction, "note1.md");
    const result2 = ingestExtraction(db, extraction, "note2.md");

    assert.equal(result2.nodesAdded, 0);   // No new nodes
    assert.equal(result2.nodesUpdated, 2); // Both updated
    assert.equal(getAllNodes(db).length, 2); // Still only 2 nodes
  });

  it("should skip self-loops", () => {
    const extraction: ExtractionResult = {
      nodes: [{ type: "concept", name: "Self", summary: "", domain: "test" }],
      edges: [{ source: "Self", target: "Self", relation: "related_to", confidence: 1, evidence: "" }],
    };
    const result = ingestExtraction(db, extraction, "test.md");
    assert.equal(result.edgesAdded, 0); // Self-loop skipped
  });

  it("should skip edges referencing unknown nodes", () => {
    const extraction: ExtractionResult = {
      nodes: [{ type: "concept", name: "A", summary: "", domain: "test" }],
      edges: [{ source: "A", target: "Nonexistent", relation: "related_to", confidence: 1, evidence: "" }],
    };
    const result = ingestExtraction(db, extraction, "test.md");
    assert.equal(result.edgesAdded, 0); // Edge to nonexistent node skipped
  });
});

// ─── Evolution log ─────────────────────────────────────────

describe("Evolution log", () => {
  it("should track belief changes", () => {
    const { node } = upsertNode(db, { name: "Paxos", type: "concept", summary: "Complex consensus", domain: "ds" });
    addEvolutionEntry(db, { node_id: node.id, belief_summary: "Paxos is the only option", trigger_note: "initial", source_file: "n1.md" });
    addEvolutionEntry(db, { node_id: node.id, belief_summary: "Raft is more understandable", trigger_note: "learned raft", source_file: "n2.md" });

    const log = getEvolutionLog(db, node.id);
    assert.equal(log.length, 2);
    assert.equal(log[0].belief_summary, "Paxos is the only option");
    assert.equal(log[1].belief_summary, "Raft is more understandable");
  });
});

// ─── Notes index ───────────────────────────────────────────

describe("Notes index", () => {
  it("should detect changed content", () => {
    // First time: always changed
    assert.equal(isNoteChanged(db, "test.md", "content v1"), true);

    // Ingest to set hash
    const extraction: ExtractionResult = {
      nodes: [{ type: "concept", name: "Test", summary: "", domain: "test" }],
      edges: [],
    };
    ingestExtraction(db, extraction, "test.md", "content v1");
    saveDatabase(db, TEST_DB_PATH);

    // Same content: not changed
    assert.equal(isNoteChanged(db, "test.md", "content v1"), false);

    // Different content: changed
    assert.equal(isNoteChanged(db, "test.md", "content v2"), true);
  });
});

// ─── Subgraph queries ──────────────────────────────────────

describe("Subgraph queries", () => {
  // Build a small graph:
  //   A --[supports]--> B --[references]--> C
  //   A --[related_to]--> D
  //   E (isolated)
  let idA: string, idB: string, idC: string, idD: string, idE: string;

  beforeEach(() => {
    idA = upsertNode(db, { name: "A", type: "concept", summary: "node A", domain: "d1" }).node.id;
    idB = upsertNode(db, { name: "B", type: "concept", summary: "node B", domain: "d1" }).node.id;
    idC = upsertNode(db, { name: "C", type: "concept", summary: "node C", domain: "d2" }).node.id;
    idD = upsertNode(db, { name: "D", type: "concept", summary: "node D", domain: "d2" }).node.id;
    idE = upsertNode(db, { name: "E", type: "concept", summary: "isolated", domain: "d3" }).node.id;

    addEdge(db, { source_id: idA, target_id: idB, relation: "supports", confidence: 0.9, evidence: "" });
    addEdge(db, { source_id: idB, target_id: idC, relation: "references", confidence: 0.8, evidence: "" });
    addEdge(db, { source_id: idA, target_id: idD, relation: "related_to", confidence: 0.7, evidence: "" });
  });

  it("getSubgraph1Hop: returns seed + direct neighbors", () => {
    const sub = getSubgraph1Hop(db, [idA]);
    assert.equal(sub.nodes.length, 3); // A, B, D (C is 2-hop away, E is isolated)
    const nodeIds = new Set(sub.nodes.map((n) => n.id));
    assert.ok(nodeIds.has(idA));
    assert.ok(nodeIds.has(idB));
    assert.ok(nodeIds.has(idD));
    assert.equal(sub.edges.length, 2); // A→B, A→D
  });

  it("getSubgraph2Hop: expands one more hop", () => {
    // From E (isolated), 2-hop is still just E
    const sub = getSubgraph2Hop(db, [idE]);
    assert.equal(sub.nodes.length, 1);
    assert.equal(sub.edges.length, 0);

    // From C, 1-hop gets B, 2-hop gets A and D
    const sub2 = getSubgraph2Hop(db, [idC]);
    assert.ok(sub2.nodes.length >= 3); // At least C, B, A
  });

  it("getSubgraph1Hop with empty seeds returns empty", () => {
    const sub = getSubgraph1Hop(db, []);
    assert.equal(sub.nodes.length, 0);
    assert.equal(sub.edges.length, 0);
  });
});

// ─── Path finding ──────────────────────────────────────────

describe("Path finding", () => {
  let idA: string, idB: string, idC: string;

  beforeEach(() => {
    idA = upsertNode(db, { name: "Start", type: "concept", summary: "", domain: "d1" }).node.id;
    idB = upsertNode(db, { name: "Middle", type: "concept", summary: "", domain: "d1" }).node.id;
    idC = upsertNode(db, { name: "End", type: "concept", summary: "", domain: "d2" }).node.id;

    addEdge(db, { source_id: idA, target_id: idB, relation: "supports", confidence: 0.9, evidence: "" });
    addEdge(db, { source_id: idB, target_id: idC, relation: "references", confidence: 0.8, evidence: "" });
  });

  it("findPaths: finds path from Start to End through Middle", () => {
    const paths = findPaths(db, idA, idC, 3);
    assert.ok(paths.length >= 1);
    assert.equal(paths[0].path.length, 3); // Start -> Middle -> End
    assert.equal(paths[0].path[0].name, "Start");
    assert.equal(paths[0].path[2].name, "End");
  });

  it("findPaths: no path to isolated node", () => {
    const idIso = upsertNode(db, { name: "Isolated", type: "concept", summary: "", domain: "d3" }).node.id;
    const paths = findPaths(db, idA, idIso, 3);
    assert.equal(paths.length, 0);
  });
});

// ─── Cross-domain paths ───────────────────────────────────

describe("Cross-domain paths", () => {
  it("findCrossDomainPaths: finds bridge nodes between domains", () => {
    // d1: A, B
    // d2: C
    // A -> B -> C (B is the bridge)
    const idA = upsertNode(db, { name: "A", type: "concept", summary: "", domain: "d1" }).node.id;
    const idB = upsertNode(db, { name: "B", type: "concept", summary: "", domain: "d1" }).node.id;
    const idC = upsertNode(db, { name: "C", type: "concept", summary: "", domain: "d2" }).node.id;

    addEdge(db, { source_id: idA, target_id: idB, relation: "supports", confidence: 0.9, evidence: "" });
    addEdge(db, { source_id: idB, target_id: idC, relation: "references", confidence: 0.8, evidence: "" });

    const crossPaths = findCrossDomainPaths(db);
    assert.ok(crossPaths.length >= 1);
    // B should be identified as a bridge
    const bridgeNames = crossPaths.map((p) => p.bridge.name);
    assert.ok(bridgeNames.includes("B"));
  });
});

// ─── Topology analysis ─────────────────────────────────────

describe("Topology analysis", () => {
  it("analyzeTopology: correct components and density", () => {
    // Component 1: A-B-C (d1, d2)
    const idA = upsertNode(db, { name: "A", type: "concept", summary: "", domain: "d1" }).node.id;
    const idB = upsertNode(db, { name: "B", type: "concept", summary: "", domain: "d1" }).node.id;
    const idC = upsertNode(db, { name: "C", type: "concept", summary: "", domain: "d2" }).node.id;
    // Component 2: D (isolated, d3)
    upsertNode(db, { name: "D", type: "concept", summary: "", domain: "d3" }).node.id;

    addEdge(db, { source_id: idA, target_id: idB, relation: "supports", confidence: 0.9, evidence: "" });
    addEdge(db, { source_id: idB, target_id: idC, relation: "references", confidence: 0.8, evidence: "" });

    const topo = analyzeTopology(db);

    // 2 connected components
    assert.equal(topo.components.length, 2);

    // Density: d1=2, d2=1, d3=1
    assert.equal(topo.density["d1"], 2);
    assert.equal(topo.density["d2"], 1);
    assert.equal(topo.density["d3"], 1);

    // Stats
    assert.equal(topo.stats.totalNodes, 4);
    assert.equal(topo.stats.totalEdges, 2);
    assert.equal(topo.stats.totalDomains, 3);
    assert.ok(topo.stats.avgDegree > 0);

    // Bridge: B connects d1->d2
    assert.ok(topo.bridges.length >= 1);
  });

  it("analyzeTopology: empty graph", () => {
    const topo = analyzeTopology(db);
    assert.equal(topo.components.length, 0);
    assert.equal(topo.stats.totalNodes, 0);
  });
});

// ─── Keyword search → node IDs ─────────────────────────────

describe("searchNodeIds", () => {
  it("should find nodes matching keywords", () => {
    upsertNode(db, { name: "CAP Theorem", type: "concept", summary: "tradeoff", domain: "ds" });
    upsertNode(db, { name: "Raft", type: "concept", summary: "consensus algorithm", domain: "ds" });
    upsertNode(db, { name: "Neural Net", type: "concept", summary: "ML model", domain: "ml" });

    const ids = searchNodeIds(db, ["consensus"]);
    assert.equal(ids.length, 1);

    const ids2 = searchNodeIds(db, ["theorem", "raft"]);
    assert.equal(ids2.length, 2);
  });

  it("empty keywords returns empty", () => {
    const ids = searchNodeIds(db, []);
    assert.equal(ids.length, 0);
  });
});

// ─── Database persistence ──────────────────────────────────

describe("Database persistence", () => {
  it("saveDatabase writes file, initDatabase loads it back", async () => {
    upsertNode(db, { name: "Persistent", type: "concept", summary: "will survive", domain: "test" });
    saveDatabase(db, TEST_DB_PATH);
    db.close();

    const db2 = await initDatabase(TEST_DB_PATH);
    const node = getNodeByName(db2, "Persistent");
    assert.ok(node);
    assert.equal(node!.summary, "will survive");
    db2.close();
  });
});

// ─── Schema migration: edges CHECK 扩展 ────────────────────

describe("Schema migration (relation CHECK expansion)", () => {
  const MIGRATE_DB = "./test-migrate.db";
  const OLD_CHECK = `CHECK(relation IN ('supports','contradicts','evolves_from','references','related_to','co_occurs','part_of','instance_of'))`;

  async function buildOldSchemaDb(): Promise<Database> {
    if (fs.existsSync(MIGRATE_DB)) fs.unlinkSync(MIGRATE_DB);
    const SQL = await initSqlJs();
    const old = new SQL.Database();
    old.run(`CREATE TABLE edges (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation TEXT NOT NULL ${OLD_CHECK},
      confidence REAL NOT NULL DEFAULT 0.5,
      evidence TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    old.run(`INSERT INTO edges (id, source_id, target_id, relation) VALUES ('e1', 'n1', 'n2', 'supports')`);
    saveDatabase(old, MIGRATE_DB);
    old.close();
    return initDatabase(MIGRATE_DB);
  }

  it("keeps legacy data and accepts new relation enums after migration", async () => {
    const migrated = await buildOldSchemaDb();
    try {
      // 新枚举关系可写入（旧 CHECK 会拒绝，迁移后必须通过）
      migrated.run(
        `INSERT INTO edges (id, source_id, target_id, relation) VALUES ('e2', 'n1', 'n3', 'influences')`,
      );
      // 旧数据保留
      const rows = migrated.exec(`SELECT relation FROM edges WHERE id = 'e1'`);
      assert.equal(rows[0].values[0][0], "supports");
      const count = migrated.exec(`SELECT COUNT(*) FROM edges`);
      assert.equal(count[0].values[0][0], 2);
      // 索引已重建（迁移时 DROP TABLE 会连带删除）
      const idx = migrated.exec(
        `SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_edges_source','idx_edges_target')`,
      );
      assert.equal(idx[0].values.length, 2);
    } finally {
      migrated.close();
      if (fs.existsSync(MIGRATE_DB)) fs.unlinkSync(MIGRATE_DB);
    }
  });

  it("is a no-op for databases already on the new schema", async () => {
    const fresh = await initDatabase(MIGRATE_DB);
    try {
      fresh.run(
        `INSERT INTO edges (id, source_id, target_id, relation) VALUES ('e3', 'n1', 'n2', 'enables')`,
      );
      assert.equal(fresh.exec(`SELECT COUNT(*) FROM edges`)[0].values[0][0], 1);
    } finally {
      fresh.close();
      if (fs.existsSync(MIGRATE_DB)) fs.unlinkSync(MIGRATE_DB);
    }
  });
});

// ─── Node aliases（多语言检索支持）────────────────────────────

describe("Node aliases", () => {
  it("stores and reads aliases", () => {
    const { node } = upsertNode(db, {
      name: "共识算法",
      type: "concept",
      summary: "分布式系统一致性核心",
      domain: "distributed-systems",
      aliases: ["Consensus Algorithm", "共识"],
    });
    assert.deepEqual(node.aliases, ["Consensus Algorithm", "共识"]);
    assert.deepEqual(getNodeByName(db, "共识算法")!.aliases, ["Consensus Algorithm", "共识"]);
  });

  it("merges aliases on re-upsert without duplicates", () => {
    upsertNode(db, {
      name: "Raft", type: "concept", summary: "v1", domain: "ds",
      aliases: ["Raft共识", "共识算法"],
    });
    const { node } = upsertNode(db, {
      name: "Raft", type: "concept", summary: "v2", domain: "ds",
      aliases: ["共识算法", "Raft protocol"],
    });
    assert.deepEqual(node.aliases, ["Raft共识", "共识算法", "Raft protocol"]);
  });

  it("defaults to empty aliases when not provided", () => {
    const { node } = upsertNode(db, { name: "Paxos", type: "concept", summary: "", domain: "ds" });
    assert.deepEqual(node.aliases, []);
  });

  it("ExtractionResultSchema defaults aliases to []", async () => {
    const { ExtractionResultSchema } = await import("../src/graph/extraction-schema.js");
    const parsed = ExtractionResultSchema.safeParse({
      nodes: [{ type: "concept", name: "A", summary: "s", domain: "d" }],
      edges: [],
    });
    assert.ok(parsed.success);
    assert.deepEqual(parsed.data.nodes[0].aliases, []);
  });

  it("searchNodeIds matches aliases (cross-language retrieval)", () => {
    // 中文笔记抽取的节点，英文译名可命中；英文节点不受影响
    upsertNode(db, {
      name: "共识算法", type: "concept", summary: "分布式一致", domain: "ds",
      aliases: ["Consensus Algorithm"],
    });
    upsertNode(db, { name: "Raft", type: "concept", summary: "log replication", domain: "ds" });

    const byZh = searchNodeIds(db, ["共识"]);
    assert.equal(byZh.length, 1);
    const byEn = searchNodeIds(db, ["Consensus"]);
    assert.equal(byEn.length, 1);
  });

  it("searchNodes matches aliases too", () => {
    upsertNode(db, {
      name: "拜占庭问题", type: "concept", summary: "容错问题", domain: "ds",
      aliases: ["Byzantine Generals Problem"],
    });
    const results = searchNodes(db, "Byzantine");
    assert.equal(results.length, 1);
    assert.equal(results[0].name, "拜占庭问题");
  });

  it("ingestExtraction persists aliases from LLM extraction", () => {
    const extraction: ExtractionResult = {
      nodes: [
        {
          type: "concept", name: "拜占庭问题", summary: "容错", domain: "ds",
          aliases: ["Byzantine Generals Problem", "BGP"],
        },
      ],
      edges: [],
    };
    ingestExtraction(db, extraction, "note.md");
    const node = getNodeByName(db, "拜占庭问题")!;
    assert.deepEqual(node.aliases, ["Byzantine Generals Problem", "BGP"]);
  });
});

// ─── Schema migration: nodes aliases 列 ─────────────────────

describe("Schema migration (nodes aliases column)", () => {
  const OLD_NODES_DB = "./test-migrate-nodes.db";

  it("adds aliases column to legacy nodes table, keeping existing data", async () => {
    if (fs.existsSync(OLD_NODES_DB)) fs.unlinkSync(OLD_NODES_DB);
    const SQL = await initSqlJs();
    const old = new SQL.Database();
    old.run(`CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      domain TEXT NOT NULL DEFAULT 'general',
      source_file TEXT DEFAULT '',
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      mention_count INTEGER NOT NULL DEFAULT 1
    )`);
    old.run(`INSERT INTO nodes (id, type, name, domain) VALUES ('n1', 'concept', 'CAP Theorem', 'ds')`);
    saveDatabase(old, OLD_NODES_DB);
    old.close();

    const migrated = await initDatabase(OLD_NODES_DB);
    try {
      // 旧数据保留，aliases 回退空数组
      const node = getNodeByName(migrated, "CAP Theorem")!;
      assert.equal(node.domain, "ds");
      assert.deepEqual(node.aliases, []);
      // 新写入带 aliases 正常
      upsertNode(migrated, {
        name: "新节点", type: "concept", summary: "", domain: "ds",
        aliases: ["New Node"],
      });
      assert.deepEqual(getNodeByName(migrated, "新节点")!.aliases, ["New Node"]);
    } finally {
      migrated.close();
      if (fs.existsSync(OLD_NODES_DB)) fs.unlinkSync(OLD_NODES_DB);
    }
  });
});