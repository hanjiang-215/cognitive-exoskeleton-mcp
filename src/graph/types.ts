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
  source_file: string;
  first_seen_at: string;
  last_seen_at: string;
  mention_count: number;
}

// --- Edge types ---

export type RelationType =
  | "supports"
  | "contradicts"
  | "evolves_from"
  | "references"
  | "related_to"
  | "co_occurs"
  | "part_of"
  | "instance_of";

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