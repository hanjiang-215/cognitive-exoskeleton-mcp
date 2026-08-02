/**
 * LLM 抽取结果的 zod 校验 schema。
 *
 * 策略（宽容解析 + 归一化，而非整体拒绝）：
 * - type（节点类型）：非法枚举拒绝——结构性问题，无法合理降级
 * - relation（关系）：合法枚举直通；常见同义词/中文动词经映射表归一化；
 *   无法识别的值降级为 related_to——保证 ingest 永不因单个关系失败
 * - 缺失的可选字段用默认值补全（default）
 */

import { z } from "zod";
import {
  RELATION_TYPES,
  isRelationType,
  type ExtractionResult,
  type RelationType,
} from "./types.js";

export const NodeTypeSchema = z.enum(["concept", "person", "project", "event", "idea"]);

// zod v4 的 z.enum 要求可变元组；RELATION_TYPES 是 readonly，此处做一次性断言
export const RelationTypeSchema = z.enum(RELATION_TYPES as [RelationType, ...RelationType[]]);

/* ------------------------------------------------------------------ */
/*  关系归一化：同义词 / 中文动词 → 规范枚举；未知 → related_to           */
/* ------------------------------------------------------------------ */

/**
 * 常见近义关系 / 中文动词到规范枚举的映射。
 *
 * 设计原则：
 * - 语义近义（cites→references、derives_from→evolves_from）：直接映射
 * - 反向关系（contains/generalizes/created_by 是 part_of/specializes/creates 的
 *   反向）：不硬映射（会颠倒 source/target 语义），降级 related_to
 * - 中文动词：为中文笔记场景保留（用户面向中文内容）
 */
const RELATION_SYNONYMS: Record<string, RelationType> = {
  // 来源 / 引用
  cites: "references",
  cite: "references",
  "cites_as_source": "references",
  "references_as_source": "references",
  derived_from: "evolves_from",
  derives_from: "evolves_from",
  based_on: "evolves_from",
  // 结构（方向不可逆 → 保守降级）
  contains: "related_to",
  contain: "related_to",
  generalizes: "related_to",
  generalize: "related_to",
  extends: "evolves_from",
  extend: "evolves_from",
  // 逻辑 / 论证
  implies: "supports",
  imply: "supports",
  justify: "supports",
  justifies: "supports",
  refutes: "contradicts",
  refute: "contradicts",
  contrasts_with: "contradicts",
  // 比较
  similar_to: "related_to",
  analogous_to: "related_to",
  resembles: "related_to",
  // 功能
  prevents: "related_to",
  prevent: "related_to",
  blocks: "related_to",
  optimizes: "influences",
  optimize: "influences",
  improves: "influences",
  // 时序
  precedes: "related_to",
  follows: "related_to",
  supersedes: "replaces",
  // 统计
  correlates_with: "co_occurs",
  correlate_with: "co_occurs",
  // 应用 / 归属
  created_by: "related_to",
  applies_to: "related_to",
  applicable_to: "related_to",
  // 方向反向
  used_by: "related_to",
  // 常见形态
  partof: "part_of",
  is_a: "instance_of",
  kind_of: "instance_of",
  "is_a_kind_of": "instance_of",
  // 中文动词
  导致: "causes",
  引发: "causes",
  使用: "uses",
  应用: "uses",
  需要: "requires",
  依赖: "requires",
  实现: "implements",
  使能: "enables",
  支持: "supports",
  引用: "references",
  基于: "evolves_from",
  源自: "evolves_from",
  派生自: "evolves_from",
  包含: "related_to",
  特化: "specializes",
  细分: "specializes",
  取代: "replaces",
  替代: "replaces",
  启发: "inspires",
  影响: "influences",
  反对: "contradicts",
  反驳: "contradicts",
  蕴含: "supports",
  共现: "co_occurs",
  相关: "related_to",
  类似: "related_to",
  属于: "part_of",
  是一种: "instance_of",
  一部分: "part_of",
};

/** 把任意关系字符串归一化为合法枚举（未知 → related_to）。 */
export function normalizeRelation(value: string): RelationType {
  const raw = value.trim();
  if (!raw) return "related_to";
  const key = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (isRelationType(key)) return key;
  return RELATION_SYNONYMS[key] ?? "related_to";
}

/** 宽容关系字段：合法枚举直通，其余经 normalizeRelation 归一化。 */
export const RelationNormalizedSchema = z.union([
  RelationTypeSchema,
  z.string().transform(normalizeRelation),
]);

export const ExtractedNodeSchema = z.object({
  type: NodeTypeSchema,
  name: z.string().min(1),
  summary: z.string().default(""),
  domain: z.string().default("general"),
  aliases: z.array(z.string()).default([]),
});

export const ExtractedEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  relation: RelationNormalizedSchema,
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