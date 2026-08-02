/**
 * extractKeywords 测试 —— 覆盖中文 / 英文 / 混合文本的关键词提取。
 *
 * 回归背景：旧实现用 \w 分词，只匹配 [A-Za-z0-9_]，
 * 中文关键词（如"分布式系统"）被全部丢弃，导致中文检索失效。
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractKeywords } from "../src/text.js";

describe("extractKeywords", () => {
  it("extracts continuous Chinese text as single words", () => {
    assert.deepEqual(extractKeywords("分布式系统与共识算法"), ["分布式系统与共识算法"]);
  });

  it("extracts English words", () => {
    assert.deepEqual(
      extractKeywords("CAP theorem and Raft consensus"),
      ["CAP", "theorem", "and", "Raft", "consensus"],
    );
  });

  it("extracts mixed Chinese-English text", () => {
    // 中文片段按连续 \p{L} 序列整体保留，英文按词保留
    assert.deepEqual(extractKeywords("我对 CAP 定理了解多少"), ["我对", "CAP", "定理了解多少"]);
  });

  it("Chinese two-char words are kept (minLen=2)", () => {
    assert.deepEqual(extractKeywords("共识与一致性"), ["共识与一致性"]);
  });

  it("filters words shorter than minLen", () => {
    assert.deepEqual(extractKeywords("a b cc ddd", 3), ["ddd"]);
    assert.deepEqual(extractKeywords("a b c", 2), []);
  });

  it("deduplicates while preserving order", () => {
    assert.deepEqual(extractKeywords("CAP theorem and CAP"), ["CAP", "theorem", "and"]);
  });

  it("respects maxKeywords limit", () => {
    assert.deepEqual(extractKeywords("one two three four five", 2, 3), ["one", "two", "three"]);
  });

  it("handles empty and symbol-only text", () => {
    assert.deepEqual(extractKeywords(""), []);
    assert.deepEqual(extractKeywords("!!!---==="), []);
  });

  it("handles numbers and version-like tokens", () => {
    // 数字/短 token（长度 < minLen）被过滤，中英文单词保留
    assert.deepEqual(extractKeywords("GPT-4 与 qwen2.5"), ["GPT", "qwen2"]);
  });
});