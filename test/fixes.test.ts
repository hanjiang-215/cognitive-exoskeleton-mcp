/**
 * 本次修复的回归测试：
 *   1. 中文/英文关键词提取（text.ts）
 *   2. LLM 抽取结果的 zod 校验（extraction-schema.ts）
 *   3. 工具 handler 错误兜底（guard.ts）
 *
 * Run: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractKeywords } from "../src/text.js";
import { ExtractionResultSchema, describeExtractionIssues } from "../src/graph/extraction-schema.js";
import { guard } from "../src/tools/guard.js";

// ─── 关键词提取（中英文） ─────────────────────────────────

describe("extractKeywords — Chinese & English support", () => {
  it("extracts Chinese keywords (previously dropped by \\w)", () => {
    const kws = extractKeywords("我对 CAP 定理了解多少");
    assert.ok(kws.includes("CAP"), `expected CAP in ${JSON.stringify(kws)}`);
    assert.ok(kws.some((w) => /[\u4e00-\u9fff]/.test(w)), "should keep CJK words");
  });

  it("extracts English keywords", () => {
    const kws = extractKeywords("consensus algorithms in distributed systems");
    assert.ok(kws.includes("consensus"));
    assert.ok(kws.includes("distributed"));
  });

  it("drops words below minLen", () => {
    const kws = extractKeywords("a bc def", 2);
    assert.ok(!kws.includes("a"));
    assert.ok(kws.includes("bc"));
    assert.ok(kws.includes("def"));
  });

  it("deduplicates while preserving order", () => {
    const kws = extractKeywords("consensus consensus raft");
    assert.deepEqual(kws, ["consensus", "raft"]);
  });

  it("respects maxKeywords cap", () => {
    const kws = extractKeywords("one two three four five six seven eight nine ten eleven", 2, 5);
    assert.equal(kws.length, 5);
  });

  it("returns empty array for empty / punctuation-only text", () => {
    assert.deepEqual(extractKeywords(""), []);
    assert.deepEqual(extractKeywords("!!! --- ???"), []);
  });
});

// ─── LLM 抽取结果校验 ─────────────────────────────────────

describe("ExtractionResultSchema — LLM output validation", () => {
  it("accepts a well-formed extraction", () => {
    const r = ExtractionResultSchema.safeParse({
      nodes: [{ type: "concept", name: "CAP Theorem", summary: "tradeoff", domain: "ds" }],
      edges: [{ source: "CAP Theorem", target: "Raft", relation: "related_to", confidence: 0.7, evidence: "x" }],
    });
    assert.equal(r.success, true);
  });

  it("fills missing optional fields with defaults", () => {
    const r = ExtractionResultSchema.safeParse({
      nodes: [{ type: "concept", name: "A" }],
      edges: [{ source: "A", target: "B", relation: "supports" }],
    });
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.nodes[0].domain, "general");
      assert.equal(r.data.nodes[0].summary, "");
      assert.equal(r.data.edges[0].confidence, 0.5);
      assert.equal(r.data.edges[0].evidence, "");
    }
  });

  it("rejects invalid node type (DB CHECK would throw otherwise)", () => {
    const r = ExtractionResultSchema.safeParse({
      nodes: [{ type: "alien", name: "X" }],
      edges: [],
    });
    assert.equal(r.success, false);
  });

  it("rejects invalid relation type", () => {
    const r = ExtractionResultSchema.safeParse({
      nodes: [],
      edges: [{ source: "A", target: "B", relation: "loves" }],
    });
    assert.equal(r.success, false);
  });

  it("rejects empty node name", () => {
    const r = ExtractionResultSchema.safeParse({
      nodes: [{ type: "concept", name: "" }],
      edges: [],
    });
    assert.equal(r.success, false);
  });

  it("describeExtractionIssues renders a readable summary", () => {
    const r = ExtractionResultSchema.safeParse({ nodes: [{ type: "alien", name: "" }], edges: [] });
    assert.equal(r.success, false);
    if (!r.success) {
      const summary = describeExtractionIssues(r);
      assert.ok(summary.includes("nodes"), `should mention path, got: ${summary}`);
    }
  });
});

// ─── 工具 handler 错误兜底 ────────────────────────────────

describe("guard — tool handler error fallback", () => {
  it("returns the handler result when it succeeds", async () => {
    const handler = guard(async () => ({ content: [{ type: "text" as const, text: "ok" }] }));
    const result = await handler({});
    assert.equal(result.content[0].text, "ok");
  });

  it("converts thrown errors into a readable text response", async () => {
    const handler = guard(async () => {
      throw new Error("LLM request failed");
    });
    const result = await handler({});
    assert.ok(result.content[0].text.includes("LLM request failed"));
    assert.ok(result.content[0].text.startsWith("Error:"));
  });

  it("converts non-Error throws to a string message", async () => {
    const handler = guard(async () => {
      // eslint-disable-next-line no-throw-literal
      throw "boom";
    });
    const result = await handler({});
    assert.ok(result.content[0].text.includes("boom"));
  });
});