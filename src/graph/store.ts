/**
 * Graph database CRUD operations.
 * All functions operate on a sql.js Database instance.
 */

import type { Database } from "sql.js";
import crypto from "node:crypto";
import { selectAll, run } from "./sql.js";
import type {
  GraphNode,
  GraphEdge,
  ExtractionResult,
  EvolutionEntry,
  NoteIndexEntry,
} from "./types.js";

// ─── helpers ───────────────────────────────────────────────

function genId(): string {
  return crypto.randomUUID();
}

// ─── Nodes ─────────────────────────────────────────────────

export function upsertNode(
  db: Database,
  data: { name: string; type: string; summary: string; domain: string; source_file?: string },
): { node: GraphNode; isNew: boolean } {
  // 规范化：name/domain 去首尾空白，避免 LLM 抽取的 "CAP Theorem " 与 "CAP Theorem" 分裂成两个实体
  const name = data.name.trim();
  const domain = data.domain.trim() || "general";

  // Check if node with same name + domain already exists
  const existing = selectAll<GraphNode>(
    db,
    `SELECT * FROM nodes WHERE name = ? AND domain = ? LIMIT 1`,
    [name, domain],
  );

  if (existing.length > 0) {
    const node = existing[0];
    const newSummary = data.summary || node.summary;
    run(
      db,
      `UPDATE nodes SET mention_count = mention_count + 1, last_seen_at = datetime('now'), summary = ? WHERE id = ?`,
      [newSummary, node.id],
    );
    const updated = selectAll<GraphNode>(db, `SELECT * FROM nodes WHERE id = ?`, [node.id])[0];
    return { node: updated, isNew: false };
  }

  const id = genId();
  run(
    db,
    `INSERT INTO nodes (id, type, name, summary, domain, source_file)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, data.type, name, data.summary, domain, data.source_file ?? ""],
  );

  const created = selectAll<GraphNode>(db, `SELECT * FROM nodes WHERE id = ?`, [id])[0];
  return { node: created, isNew: true };
}

export function getNodeById(db: Database, id: string): GraphNode | undefined {
  const rows = selectAll<GraphNode>(db, `SELECT * FROM nodes WHERE id = ?`, [id]);
  return rows[0];
}

export function getNodeByName(db: Database, name: string): GraphNode | undefined {
  const rows = selectAll<GraphNode>(db, `SELECT * FROM nodes WHERE name = ? LIMIT 1`, [name]);
  return rows[0];
}

/** 按 name+domain 精确匹配节点（与 upsertNode 的判重口径一致）。 */
export function getNodeByNameAndDomain(db: Database, name: string, domain: string): GraphNode | undefined {
  const rows = selectAll<GraphNode>(
    db,
    `SELECT * FROM nodes WHERE name = ? AND domain = ? LIMIT 1`,
    [name.trim(), domain.trim()],
  );
  return rows[0];
}

export function searchNodes(db: Database, query: string, limit = 20): GraphNode[] {
  const pattern = `%${query}%`;
  return selectAll<GraphNode>(
    db,
    `SELECT * FROM nodes WHERE name LIKE ? OR summary LIKE ? ORDER BY mention_count DESC LIMIT ?`,
    [pattern, pattern, limit],
  );
}

export function getNodesByDomain(db: Database, domain: string): GraphNode[] {
  return selectAll<GraphNode>(db, `SELECT * FROM nodes WHERE domain = ? ORDER BY name`, [domain]);
}

export function getAllNodes(db: Database): GraphNode[] {
  return selectAll<GraphNode>(db, `SELECT * FROM nodes ORDER BY last_seen_at DESC`);
}

export function getAllDomains(db: Database): string[] {
  const rows = selectAll<{ domain: string }>(db, `SELECT DISTINCT domain FROM nodes ORDER BY domain`);
  return rows.map((r) => r.domain);
}

export function getSampleNodesByDomain(db: Database, domain: string, limit = 5): GraphNode[] {
  return selectAll<GraphNode>(
    db,
    `SELECT * FROM nodes WHERE domain = ? ORDER BY RANDOM() LIMIT ?`,
    [domain, limit],
  );
}

// ─── Edges ─────────────────────────────────────────────────

export function addEdge(
  db: Database,
  data: { source_id: string; target_id: string; relation: string; confidence: number; evidence: string },
): GraphEdge {
  const id = genId();
  run(
    db,
    `INSERT INTO edges (id, source_id, target_id, relation, confidence, evidence)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, data.source_id, data.target_id, data.relation, data.confidence, data.evidence],
  );
  return selectAll<GraphEdge>(db, `SELECT * FROM edges WHERE id = ?`, [id])[0];
}

export function getEdgesForNode(db: Database, nodeId: string): GraphEdge[] {
  return selectAll<GraphEdge>(
    db,
    `SELECT * FROM edges WHERE source_id = ? OR target_id = ?`,
    [nodeId, nodeId],
  );
}

export function getOutgoingEdges(db: Database, nodeId: string): GraphEdge[] {
  return selectAll<GraphEdge>(db, `SELECT * FROM edges WHERE source_id = ?`, [nodeId]);
}

export function getIncomingEdges(db: Database, nodeId: string): GraphEdge[] {
  return selectAll<GraphEdge>(db, `SELECT * FROM edges WHERE target_id = ?`, [nodeId]);
}

// ─── Batch ingestion (from LLM extraction) ────────────────

export function ingestExtraction(
  db: Database,
  extraction: ExtractionResult,
  sourceFile: string,
  content?: string,
): { nodesAdded: number; edgesAdded: number; nodesUpdated: number } {
  const nameToNode = new Map<string, GraphNode>();
  let nodesAdded = 0;
  let nodesUpdated = 0;

  // 1. Upsert all nodes
  for (const n of extraction.nodes) {
    const { node, isNew } = upsertNode(db, { ...n, source_file: sourceFile });
    nameToNode.set(n.name, node);
    if (isNew) nodesAdded++;
    else nodesUpdated++;
  }

  // 2. Add edges (resolve names -> ids)
  let edgesAdded = 0;
  for (const e of extraction.edges) {
    const sourceNode = nameToNode.get(e.source);
    const targetNode = nameToNode.get(e.target);
    if (!sourceNode || !targetNode) continue;

    // Avoid self-loops
    if (sourceNode.id === targetNode.id) continue;

    addEdge(db, {
      source_id: sourceNode.id,
      target_id: targetNode.id,
      relation: e.relation,
      confidence: e.confidence,
      evidence: e.evidence,
    });
    edgesAdded++;
  }

  // 3. Update notes_index
  const hashInput = content ?? sourceFile;
  const contentHash = crypto.createHash("md5").update(hashInput).digest("hex");
  const nodeIds = Array.from(nameToNode.values()).map((n) => n.id);
  run(
    db,
    `INSERT OR REPLACE INTO notes_index (file_path, content_hash, node_ids, last_ingested_at)
     VALUES (?, ?, ?, datetime('now'))`,
    [sourceFile, contentHash, JSON.stringify(nodeIds)],
  );

  return { nodesAdded, edgesAdded, nodesUpdated };
}

// ─── Evolution log ─────────────────────────────────────────

export function addEvolutionEntry(
  db: Database,
  data: { node_id: string; belief_summary: string; trigger_note: string; source_file: string },
): void {
  const id = genId();
  run(
    db,
    `INSERT INTO evolution_log (id, node_id, belief_summary, trigger_note, source_file)
     VALUES (?, ?, ?, ?, ?)`,
    [id, data.node_id, data.belief_summary, data.trigger_note, data.source_file],
  );
}

export function getEvolutionLog(db: Database, nodeId: string): EvolutionEntry[] {
  return selectAll<EvolutionEntry>(
    db,
    `SELECT * FROM evolution_log WHERE node_id = ? ORDER BY snapshot_at ASC`,
    [nodeId],
  );
}

// ─── Notes index ───────────────────────────────────────────

export function getNoteIndex(db: Database, filePath: string): NoteIndexEntry | undefined {
  const rows = selectAll<NoteIndexEntry & { node_ids: string }>(
    db,
    `SELECT * FROM notes_index WHERE file_path = ?`,
    [filePath],
  );
  if (rows.length === 0) return undefined;
  return { ...rows[0], node_ids: JSON.parse(rows[0].node_ids) };
}

export function isNoteChanged(db: Database, filePath: string, content: string): boolean {
  const existing = getNoteIndex(db, filePath);
  if (!existing) return true;
  const hash = crypto.createHash("md5").update(content).digest("hex");
  return existing.content_hash !== hash;
}

// ─── Stats ─────────────────────────────────────────────────

export function getGraphStats(db: Database): {
  totalNodes: number;
  totalEdges: number;
  totalDomains: number;
} {
  const nodeCount = selectAll<{ c: number }>(db, `SELECT COUNT(*) as c FROM nodes`)[0].c;
  const edgeCount = selectAll<{ c: number }>(db, `SELECT COUNT(*) as c FROM edges`)[0].c;
  const domainCount = selectAll<{ c: number }>(db, `SELECT COUNT(DISTINCT domain) as c FROM nodes`)[0].c;
  return { totalNodes: nodeCount, totalEdges: edgeCount, totalDomains: domainCount };
}