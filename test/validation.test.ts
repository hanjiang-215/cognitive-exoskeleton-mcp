/**
 * 本次修复的校验层测试：
 *   - ExtractionResultSchema：LLM 输出的宽容解析与非法值拒绝
 *   - guard：工具 handler 的错误兜底行为
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExtractionResultSchema, describeExtractionIssues } from "../src/graph/extraction-schema.js";
import { guard } from "../src/tools/guard.js";

// ─── ExtractionResultSchema ────────────────────────────────

describe("ExtractionResultSchema", () => {
  it("accepts a valid extraction", () => {
    const r = ExtractionResultSchema.safeParse({
      nodes: [{ type: "concept", name: "CAP Theorem", summary: "tradeoff", domain: "ds" }],
      edges: [{ source: "CAP Theorem", target: "X", relation: "related_to", confidence: 0.8, evidence: "e" }],
    });
    assert.ok(r.success);
  });

  it("fills missing optional fields with defaults", () => {
    const r = ExtractionResultSchema.safeParse({
      nodes: [{ type: "concept", name: "A" }],
      edges: [{ source: "A", target: "B", relation: "related_to" }],
    });
    assert.ok(r.success);
    assert.equal(r.data.nodes[0].summary, "");
    assert.equal(r.data.nodes[0].domain, "general");
    assert.equal(r.data.edges[0].confidence, 0.5);
    assert.equal(r.data.edges[0].evidence, "");
  });

  it("rejects invalid node type (would violate DB CHECK constraint)", () => {
    const r = ExtractionResultSchema.safeParse({
      nodes: [{ type: "invalid", name: "A" }],
      edges: [],
    });
    assert.ok(!r.success);
  });

  it("rejects invalid relation type (would violate DB CHECK constraint)", () => {
    const r = ExtractionResultSchema.safeParse({
      nodes: [],
      edges: [{ source: "A", target: "B", relation: "bogus" }],
    });
    assert.ok(!r.success);
  });

  it("rejects empty node name", () => {
    const r = ExtractionResultSchema.safeParse({
      nodes: [{ type: "concept", name: "" }],
      edges: [],
    });
    assert.ok(!r.success);
  });

  it("rejects confidence outside [0,1]", () => {
    const r = ExtractionResultSchema.safeParse({
      nodes: [{ type: "concept", name: "A" }],
      edges: [{ source: "A", target: "B", relation: "related_to", confidence: 1.5 }],
    });
    assert.ok(!r.success);
  });

  it("describeExtractionIssues returns a readable summary", () => {
    const r = ExtractionResultSchema.safeParse({
      nodes: [{ type: "bogus", name: "" }],
      edges: [{ source: "A", target: "B", relation: "nope" }],
    });
    assert.ok(!r.success);
    const summary = describeExtractionIssues(r);
    assert.ok(summary.includes("nodes"));
    assert.ok(summary.includes("edges"));
  });
});

// ─── guard ─────────────────────────────────────────────────

describe("guard", () => {
  it("passes through successful results", async () => {
    const wrapped = guard(async () => ({ content: [{ type: "text" as const, text: "ok" }] }));
    const res = await wrapped({});
    assert.equal(res.content[0].text, "ok");
  });

  it("converts thrown errors into user-readable error responses", async () => {
    const wrapped = guard(async () => {
      throw new Error("LLM call failed");
    });
    const res = await wrapped({});
    assert.equal(res.content[0].text, "Error: LLM call failed");
  });

  it("preserves handler arguments", async () => {
    const wrapped = guard(async (args: any) => ({ content: [{ type: "text" as const, text: args.x }] }));
    const res = await wrapped({ x: "hello" });
    assert.equal(res.content[0].text, "hello");
  });
});