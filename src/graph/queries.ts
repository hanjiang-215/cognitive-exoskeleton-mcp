/**
 * Graph queries: subgraph extraction, path finding, topology analysis.
 */

import type { Database } from "sql.js";
import { selectAll, selectNodes } from "./sql.js";
import type {
  GraphNode,
  GraphEdge,
  SubgraphResult,
  PathResult,
  TopologyResult,
} from "./types.js";

// ─── Subgraph extraction ───────────────────────────────────

/**
 * Extract the 1-hop neighborhood subgraph around a set of seed nodes.
 */
export function getSubgraph1Hop(db: Database, seedNodeIds: string[]): SubgraphResult {
  if (seedNodeIds.length === 0) return { nodes: [], edges: [] };

  const placeholders = seedNodeIds.map(() => "?").join(",");

  // Get seed nodes + their direct neighbors
  const nodes = selectNodes(
    db,
    `SELECT DISTINCT n.* FROM nodes n
     WHERE n.id IN (${placeholders})
        OR n.id IN (
          SELECT e.target_id FROM edges e WHERE e.source_id IN (${placeholders})
          UNION
          SELECT e.source_id FROM edges e WHERE e.target_id IN (${placeholders})
        )`,
    [...seedNodeIds, ...seedNodeIds, ...seedNodeIds],
  );

  const nodeIds = new Set(nodes.map((n) => n.id));
  const allEdges = selectAll<GraphEdge>(
    db,
    `SELECT * FROM edges WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`,
    [...seedNodeIds, ...seedNodeIds],
  );

  // Filter edges to only include those within the subgraph
  const edges = allEdges.filter((e) => nodeIds.has(e.source_id) && nodeIds.has(e.target_id));

  return { nodes, edges };
}

/**
 * Extract the 2-hop neighborhood subgraph around a set of seed nodes.
 */
export function getSubgraph2Hop(db: Database, seedNodeIds: string[]): SubgraphResult {
  if (seedNodeIds.length === 0) return { nodes: [], edges: [] };

  // First get 1-hop
  const hop1 = getSubgraph1Hop(db, seedNodeIds);
  const hop1Ids = hop1.nodes.map((n) => n.id);

  // Then expand by 1 more hop
  const placeholders = hop1Ids.map(() => "?").join(",");

  const nodes = selectNodes(
    db,
    `SELECT DISTINCT n.* FROM nodes n
     WHERE n.id IN (${placeholders})
        OR n.id IN (
          SELECT e.target_id FROM edges e WHERE e.source_id IN (${placeholders})
          UNION
          SELECT e.source_id FROM edges e WHERE e.target_id IN (${placeholders})
        )`,
    [...hop1Ids, ...hop1Ids, ...hop1Ids],
  );

  const nodeIds = new Set(nodes.map((n) => n.id));
  const allEdges = selectAll<GraphEdge>(
    db,
    `SELECT * FROM edges WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`,
    [...hop1Ids, ...hop1Ids],
  );
  const edges = allEdges.filter((e) => nodeIds.has(e.source_id) && nodeIds.has(e.target_id));

  return { nodes, edges };
}

// ─── Path finding ──────────────────────────────────────────

/**
 * Find paths between two nodes up to a maximum length.
 * Uses BFS to find all simple paths up to maxHops.
 */
export function findPaths(
  db: Database,
  fromNodeId: string,
  toNodeId: string,
  maxHops = 3,
): PathResult[] {
  // Load the whole graph into memory once (avoids N+1 node lookups inside DFS)
  const allNodes = selectNodes(db, `SELECT * FROM nodes`);
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  const startNode = nodeMap.get(fromNodeId);
  if (!startNode) return [];

  // Build adjacency list (undirected)
  const allEdges = selectAll<GraphEdge>(db, `SELECT * FROM edges`);
  const adj = new Map<string, Array<{ neighborId: string; edge: GraphEdge }>>();

  for (const e of allEdges) {
    if (!adj.has(e.source_id)) adj.set(e.source_id, []);
    if (!adj.has(e.target_id)) adj.set(e.target_id, []);
    adj.get(e.source_id)!.push({ neighborId: e.target_id, edge: e });
    adj.get(e.target_id)!.push({ neighborId: e.source_id, edge: e });
  }

  const results: PathResult[] = [];
  const visited = new Set<string>();

  function dfs(current: string, path: GraphNode[], pathEdges: GraphEdge[]): void {
    if (current === toNodeId && path.length > 1) {
      results.push({ path: [...path], edges: [...pathEdges] });
      return;
    }
    if (path.length > maxHops + 1) return;

    visited.add(current);

    const neighbors = adj.get(current) ?? [];
    for (const { neighborId, edge } of neighbors) {
      if (visited.has(neighborId)) continue;

      const neighborNode = nodeMap.get(neighborId);
      if (!neighborNode) continue;

      path.push(neighborNode);
      pathEdges.push(edge);
      dfs(neighborId, path, pathEdges);
      path.pop();
      pathEdges.pop();
    }

    visited.delete(current);
  }

  dfs(fromNodeId, [startNode], []);
  return results;
}

/**
 * Find cross-domain paths: paths that connect nodes from different domains.
 * Returns pairs of nodes from different domains connected through bridge nodes.
 */
export function findCrossDomainPaths(
  db: Database,
): Array<{ nodeA: GraphNode; nodeB: GraphNode; bridge: GraphNode; pathEdges: GraphEdge[] }> {
  const results: Array<{ nodeA: GraphNode; nodeB: GraphNode; bridge: GraphNode; pathEdges: GraphEdge[] }> = [];

  // Load nodes + per-node edges once (avoids N+1 per-node edge scans)
  const allNodes = selectNodes(db, `SELECT * FROM nodes`);
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  const edgesByNode = new Map<string, GraphEdge[]>();
  const allEdges = selectAll<GraphEdge>(db, `SELECT * FROM edges`);
  for (const e of allEdges) {
    if (!edgesByNode.has(e.source_id)) edgesByNode.set(e.source_id, []);
    if (!edgesByNode.has(e.target_id)) edgesByNode.set(e.target_id, []);
    edgesByNode.get(e.source_id)!.push(e);
    edgesByNode.get(e.target_id)!.push(e);
  }

  for (const node of allNodes) {
    const edges = edgesByNode.get(node.id) ?? [];

    // Collect domains of neighbors
    const neighborDomains = new Set<string>();
    for (const e of edges) {
      const neighborId = e.source_id === node.id ? e.target_id : e.source_id;
      const neighbor = nodeMap.get(neighborId);
      if (neighbor && neighbor.domain !== node.domain) {
        neighborDomains.add(neighbor.domain);
      }
    }

    // If this node connects multiple domains, it's a bridge
    if (neighborDomains.size >= 2 || (neighborDomains.size >= 1 && neighborDomains.has(node.domain) === false)) {
      // Find two nodes from different domains connected through this bridge
      const domainNodes = new Map<string, GraphNode[]>();

      for (const e of edges) {
        const neighborId = e.source_id === node.id ? e.target_id : e.source_id;
        const neighbor = nodeMap.get(neighborId);
        if (!neighbor || neighbor.id === node.id) continue;
        if (!domainNodes.has(neighbor.domain)) domainNodes.set(neighbor.domain, []);
        domainNodes.get(neighbor.domain)!.push(neighbor);
      }

      const domains = Array.from(domainNodes.keys());
      for (let i = 0; i < domains.length; i++) {
        for (let j = i + 1; j < domains.length; j++) {
          const a = domainNodes.get(domains[i])![0];
          const b = domainNodes.get(domains[j])![0];
          if (a && b) {
            results.push({
              nodeA: a,
              nodeB: b,
              bridge: node,
              pathEdges: edges.slice(0, 2),
            });
          }
        }
      }
    }
  }

  return results;
}

// ─── Topology analysis ─────────────────────────────────────

/**
 * Analyze the graph topology: connected components, bridge nodes, domain density.
 */
export function analyzeTopology(db: Database): TopologyResult {
  const allNodes = selectNodes(db, `SELECT * FROM nodes`);
  const allEdges = selectAll<GraphEdge>(db, `SELECT * FROM edges`);

  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  // Build adjacency list (undirected)
  const adj = new Map<string, Set<string>>();
  for (const n of allNodes) adj.set(n.id, new Set());
  for (const e of allEdges) {
    adj.get(e.source_id)?.add(e.target_id);
    adj.get(e.target_id)?.add(e.source_id);
  }

  // 1. Connected components (BFS)
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const node of allNodes) {
    if (visited.has(node.id)) continue;
    const component: string[] = [];
    const queue = [node.id];
    visited.add(node.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of adj.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  // 2. Approximate betweenness centrality (simplified)
  // For each node, count how many shortest paths pass through it
  const betweenness = new Map<string, number>();
  for (const n of allNodes) betweenness.set(n.id, 0);

  // Sample-based betweenness (for performance)
  const sampleSize = Math.min(allNodes.length, 50);
  const sampleNodes = allNodes.slice(0, sampleSize);

  for (const source of sampleNodes) {
    // BFS from source
    const dist = new Map<string, number>();
    const sigma = new Map<string, number>(); // number of shortest paths
    const predecessors = new Map<string, string[]>();

    dist.set(source.id, 0);
    sigma.set(source.id, 1);
    const queue = [source.id];

    while (queue.length > 0) {
      const v = queue.shift()!;
      for (const w of adj.get(v) ?? []) {
        // First visit?
        if (!dist.has(w)) {
          dist.set(w, (dist.get(v) ?? 0) + 1);
          queue.push(w);
        }
        // Shortest path through v?
        if (dist.get(w) === (dist.get(v) ?? 0) + 1) {
          sigma.set(w, (sigma.get(w) ?? 0) + (sigma.get(v) ?? 0));
          if (!predecessors.has(w)) predecessors.set(w, []);
          predecessors.get(w)!.push(v);
        }
      }
    }

    // Back-propagation
    const delta = new Map<string, number>();
    for (const n of allNodes) delta.set(n.id, 0);

    // Process in reverse BFS order
    const ordered = Array.from(dist.entries()).sort((a, b) => b[1] - a[1]);
    for (const [w] of ordered) {
      if (w === source.id) continue;
      for (const v of predecessors.get(w) ?? []) {
        const d = (sigma.get(v) ?? 1) / (sigma.get(w) ?? 1) * (1 + (delta.get(w) ?? 0));
        delta.set(v, (delta.get(v) ?? 0) + d);
      }
      if (w !== source.id) {
        betweenness.set(w, (betweenness.get(w) ?? 0) + (delta.get(w) ?? 0));
      }
    }
  }

  // Normalize and get top bridges
  const bridgeNodes = Array.from(betweenness.entries())
    .filter(([id]) => betweenness.get(id)! > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([node_id, score]) => ({
      node_id,
      name: nodeMap.get(node_id)?.name ?? node_id,
      score,
    }));

  // 3. Domain density
  const density: Record<string, number> = {};
  for (const n of allNodes) {
    density[n.domain] = (density[n.domain] ?? 0) + 1;
  }

  // 4. Stats
  const totalNodes = allNodes.length;
  const totalEdges = allEdges.length;
  const totalDomains = Object.keys(density).length;
  const avgDegree = totalNodes > 0 ? (2 * totalEdges) / totalNodes : 0;

  return {
    components,
    bridges: bridgeNodes,
    density,
    stats: { totalNodes, totalEdges, totalDomains, avgDegree },
  };
}

// ─── Keyword search → node IDs ─────────────────────────────

/**
 * Search nodes by keyword (name, summary, or aliases) and return their IDs.
 * aliases 支持多语言检索：中文笔记抽取的实体可用其英文译名命中。
 */
export function searchNodeIds(db: Database, keywords: string[], limit = 20): string[] {
  if (keywords.length === 0) return [];

  const conditions = keywords.map(() => `(name LIKE ? OR summary LIKE ? OR aliases LIKE ?)`).join(" OR ");
  const params: string[] = [];
  for (const kw of keywords) {
    params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`);
  }

  const rows = selectAll<GraphNode>(
    db,
    `SELECT * FROM nodes WHERE ${conditions} ORDER BY mention_count DESC LIMIT ?`,
    [...params, limit],
  );

  return rows.map((r) => r.id);
}