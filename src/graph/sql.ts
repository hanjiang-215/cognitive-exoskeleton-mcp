/**
 * sql.js 查询辅助。
 *
 * selectAll / run 在 store.ts 与 queries.ts 中重复实现过，统一收拢到此模块。
 */

import type { Database } from "sql.js";
import type { GraphNode } from "./types.js";

/** 执行 SELECT 并返回所有行（对象形式）。调用方负责 stmt.free 的替代（内部已释放）。 */
export function selectAll<T>(db: Database, sql: string, params: unknown[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params as any);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

/** 解析 aliases 列（JSON 数组字符串 → string[]）；缺失/非法时回退空数组。 */
export function parseAliases(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((a) => typeof a === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** 执行节点查询，并把 aliases 列解析为 string[]（DB 存 JSON 字符串）。 */
export function selectNodes(db: Database, sql: string, params: unknown[] = []): GraphNode[] {
  return selectAll<GraphNode & { aliases?: unknown }>(db, sql, params).map((row) => ({
    ...row,
    aliases: parseAliases(row.aliases),
  }));
}

/** 执行 INSERT/UPDATE/DELETE 等非查询语句。 */
export function run(db: Database, sql: string, params: unknown[] = []): void {
  db.run(sql, params as any);
}