/**
 * sql.js 查询辅助。
 *
 * selectAll / run 在 store.ts 与 queries.ts 中重复实现过，统一收拢到此模块。
 */

import type { Database } from "sql.js";

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

/** 执行 INSERT/UPDATE/DELETE 等非查询语句。 */
export function run(db: Database, sql: string, params: unknown[] = []): void {
  db.run(sql, params as any);
}