/**
 * SQLite schema definition and database initialization.
 * Uses sql.js (pure JS / WebAssembly) — zero native dependencies.
 */

import initSqlJs, { type Database } from "sql.js";
import fs from "node:fs";
import path from "node:path";

export type DB = Database;

/**
 * Initialize the SQLite database from file (or create a new one).
 * Returns a sql.js Database instance loaded in memory.
 */
export async function initDatabase(dbPath: string): Promise<DB> {
  const SQL = await initSqlJs();

  const resolvedPath = path.resolve(dbPath);
  let db: DB;

  if (fs.existsSync(resolvedPath)) {
    const buffer = fs.readFileSync(resolvedPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(SCHEMA_SQL);

  // name+domain 唯一索引作为 upsertNode SELECT-then-INSERT 的并发防线。
  // 历史脏库若已存在重复 name+domain，索引创建会失败——仅警告，不阻断启动。
  try {
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_unique_name_domain ON nodes(name, domain)`);
  } catch (err) {
    console.error("[db] WARNING: could not create unique index on nodes(name, domain):", err);
  }

  return db;
}

/**
 * Persist the in-memory database to disk.
 * Call this after write operations to ensure durability.
 *
 * 原子写：先写临时文件再 rename，避免写入中途崩溃留下损坏的 db 文件。
 */
export function saveDatabase(db: DB, dbPath: string): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  const resolvedPath = path.resolve(dbPath);
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${resolvedPath}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, resolvedPath);
}

const SCHEMA_SQL = `
-- Core: knowledge entities (nodes)
CREATE TABLE IF NOT EXISTS nodes (
    id            TEXT PRIMARY KEY,
    type          TEXT NOT NULL CHECK(type IN ('concept','person','project','event','idea')),
    name          TEXT NOT NULL,
    summary       TEXT NOT NULL DEFAULT '',
    domain        TEXT NOT NULL DEFAULT 'general',
    source_file   TEXT DEFAULT '',
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
    mention_count INTEGER NOT NULL DEFAULT 1
);

-- Core: relations between entities (edges)
CREATE TABLE IF NOT EXISTS edges (
    id          TEXT PRIMARY KEY,
    source_id   TEXT NOT NULL REFERENCES nodes(id),
    target_id   TEXT NOT NULL REFERENCES nodes(id),
    relation    TEXT NOT NULL CHECK(relation IN (
        'supports','contradicts','evolves_from','references',
        'related_to','co_occurs','part_of','instance_of'
    )),
    confidence  REAL NOT NULL DEFAULT 0.5,
    evidence    TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Notes version index: tracks which notes have been ingested
CREATE TABLE IF NOT EXISTS notes_index (
    file_path       TEXT PRIMARY KEY,
    content_hash    TEXT NOT NULL,
    node_ids        TEXT NOT NULL DEFAULT '[]',
    last_ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Evolution log: tracks how understanding of concepts changes over time
CREATE TABLE IF NOT EXISTS evolution_log (
    id              TEXT PRIMARY KEY,
    node_id         TEXT NOT NULL REFERENCES nodes(id),
    snapshot_at     TEXT NOT NULL DEFAULT (datetime('now')),
    belief_summary  TEXT NOT NULL DEFAULT '',
    trigger_note    TEXT NOT NULL DEFAULT '',
    source_file     TEXT NOT NULL DEFAULT ''
);

-- Topology cache: precomputed graph topology analysis
CREATE TABLE IF NOT EXISTS topology_cache (
    snapshot_at       TEXT PRIMARY KEY DEFAULT (datetime('now')),
    isolated_clusters TEXT NOT NULL DEFAULT '[]',
    bridge_nodes      TEXT NOT NULL DEFAULT '[]',
    density_map       TEXT NOT NULL DEFAULT '{}',
    summary           TEXT NOT NULL DEFAULT ''
);

-- Serendipity log: records cross-domain inspiration sparks
CREATE TABLE IF NOT EXISTS serendipity_log (
    id            TEXT PRIMARY KEY,
    node_a        TEXT NOT NULL REFERENCES nodes(id),
    node_b        TEXT NOT NULL REFERENCES nodes(id),
    hypothesis    TEXT NOT NULL DEFAULT '',
    user_feedback TEXT DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_nodes_domain ON nodes(domain);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_evolution_node ON evolution_log(node_id);
CREATE INDEX IF NOT EXISTS idx_evolution_time ON evolution_log(snapshot_at);
`;