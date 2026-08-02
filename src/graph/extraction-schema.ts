/**
 * LLM 抽取结果的 zod 校验 schema。
 *
 * 目的：LLM 返回的 JSON 结构不可信，直接写入 DB 会导致
 * CHECK 约束抛错（非法 type/relation）或静默写入脏数据。
 * 在此做宽容解析：缺失的可选字段用默认值补全（default），
 * 非法枚举值则判定校验失败，由调用方返回友好错误。
 */

import { z } from "zod";
import type { ExtractionResult } from "./types.js";

export const NodeTypeSchema = z.enum(["concept", "person", "project", "event", "idea"]);

export const RelationTypeSchema = z.enum([
  "supports",
  "contradicts",
  "evolves_from",
  "references",
  "related_to",
  "co_occurs",
  "part_of",
  "instance_of",
]);

export const ExtractedNodeSchema = z.object({
  type: NodeTypeSchema,
  name: z.string().min(1),
  summary: z.string().default(""),
  domain: z.string().default("general"),
});

export const ExtractedEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  relation: RelationTypeSchema,
  confidence: z.number().min(0).max(1).default(0.5),
  evidence: z.string().default(""),
});

export const ExtractionResultSchema = z.object({
  nodes: z.array(ExtractedNodeSchema).default([]),
  edges: z.array(ExtractedEdgeSchema).default([]),
});

/** 校验失败时给出可读的错误摘要（字段路径 + 原因）。 */
export function describeExtractionIssues(result: z.SafeParseError<ExtractionResult>): string {
  return result.error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}