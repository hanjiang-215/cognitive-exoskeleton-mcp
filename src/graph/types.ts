/**
 * Type definitions for the knowledge graph.
 */

// --- Node types ---

export type NodeType = "concept" | "person" | "project" | "event" | "idea";

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  summary: string;
  domain: string;
  /** 别名（含其他语言译名），检索时与 name 一起匹配；DB 中存 JSON 数组字符串。 */
  aliases: string[];
  source_file: string;
  first_seen_at: string;
  last_seen_at: string;
  mention_count: number;
}

// --- Edge types ---

/**
 * 关系枚举（17 种）。
 *
 * 选择原则：语义正交、方向不重复（反向关系走映射而非新词）、
 * LLM 可稳定区分、契合知识图谱/灵感产品定位。
 */
export type RelationType =
  // 原有 8 种
  | "supports"
  | "contradicts"
  | "evolves_from"
  | "references"
  | "related_to"
  | "co_occurs"
  | "part_of"
  | "instance_of"
  // 新增 9 种：因果/功能
  | "causes"
  | "enables"
  | "requires"
  | "uses"
  | "implements"
  // 结构/层次
  | "specializes"
  // 时序
  | "replaces"
  // 来源/启发
  | "inspires"
  | "influences";

/** 合法关系枚举常量（供 schema CHECK、zod 校验、prompt 共用）。 */
export const RELATION_TYPES: readonly RelationType[] = [
  "supports",
  "contradicts",
  "evolves_from",
  "references",
  "related_to",
  "co_occurs",
  "part_of",
  "instance_of",
  "causes",
  "enables",
  "requires",
  "uses",
  "implements",
  "specializes",
  "replaces",
  "inspires",
  "influences",
] as const;

/** 判断字符串是否为合法关系枚举值。 */
export function isRelationType(value: string): value is RelationType {
  return (RELATION_TYPES as readonly string[]).includes(value);
}

export interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relation: RelationType;
  confidence: number;
  evidence: string;
  created_at: string;
}

// --- LLM extraction output ---

export interface ExtractedNode {
  type: NodeType;
  name: string;
  summary: string;
  domain: string;
  /** 常见别名/其他语言译名（如 "共识算法" 的别名为 ["Consensus Algorithm"]）。 */
  aliases?: string[];
}

export interface ExtractedEdge {
  source: string;   // node name (not id)
  target: string;   // node name (not id)
  relation: RelationType;
  confidence: number;
  evidence: string;
}

export interface ExtractionResult {
  nodes: ExtractedNode[];
  edges: ExtractedEdge[];
}

// --- Query result types ---

export interface SubgraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface PathResult {
  path: GraphNode[];
  edges: GraphEdge[];
}

// --- Topology analysis ---

export interface TopologyResult {
  /** Connected components (isolated clusters) */
  components: string[][];
  /** Bridge nodes ranked by betweenness (node id -> score) */
  bridges: Array<{ node_id: string; name: string; score: number }>;
  /** Domain density (domain -> node count) */
  density: Record<string, number>;
  /** Summary stats */
  stats: {
    totalNodes: number;
    totalEdges: number;
    totalDomains: number;
    avgDegree: number;
  };
}

// --- Evolution log ---

export interface EvolutionEntry {
  id: string;
  node_id: string;
  snapshot_at: string;
  belief_summary: string;
  trigger_note: string;
  source_file: string;
}

// --- Notes index ---

export interface NoteIndexEntry {
  file_path: string;
  content_hash: string;
  node_ids: string[];
  last_ingested_at: string;
}