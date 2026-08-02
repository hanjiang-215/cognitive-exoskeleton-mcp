/**
 * Truncated-JSON repair & dynamic token budget tests.
 *
 * 背景：长笔记抽取时 LLM 输出常在固定 4096 token 处被截断，导致 JSON.parse
 * 失败。本测试覆盖 client.ts 的截断修复（括号补全/字符串闭合）、错误分类，
 * 以及 text.ts 的动态 token 预算估算。
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── repairTruncatedJson / looksTruncated ─────────────────────

describe("repairTruncatedJson", () => {
  it("repairs missing closing brackets", async () => {
    const { repairTruncatedJson } = await import("../src/llm/client.js");
    const repaired = repairTruncatedJson('{"nodes":[{"type":"concept","name":"A"}');
    assert.equal(repaired, '{"nodes":[{"type":"concept","name":"A"}]}');
    assert.deepEqual(JSON.parse(repaired!), { nodes: [{ type: "concept", name: "A" }] });
  });

  it("repairs multiple levels of missing brackets", async () => {
    const { repairTruncatedJson } = await import("../src/llm/client.js");
    const repaired = repairTruncatedJson('{"nodes":[{"name":"A"},{"name":"B"');
    const parsed = JSON.parse(repaired!);
    assert.equal(parsed.nodes.length, 2);
  });

  it("closes a string truncated mid-value", async () => {
    const { repairTruncatedJson } = await import("../src/llm/client.js");
    const repaired = repairTruncatedJson('{"nodes":[{"name":"CAP Theorem and cons');
    assert.ok(repaired!.endsWith('"}]}'));
    const parsed = JSON.parse(repaired!);
    assert.equal(parsed.nodes[0].name, "CAP Theorem and cons");
  });

  it("returns null for complete JSON (nothing to repair)", async () => {
    const { repairTruncatedJson } = await import("../src/llm/client.js");
    assert.equal(repairTruncatedJson('{"a":1}'), null);
    assert.equal(repairTruncatedJson("plain text"), null);
  });

  it("returns null for unbalanced brackets (unsafe to repair)", async () => {
    const { repairTruncatedJson } = await import("../src/llm/client.js");
    assert.equal(repairTruncatedJson('{"a":1}}'), null);
  });
});

describe("looksTruncated", () => {
  it("flags unclosed brackets and strings", async () => {
    const { looksTruncated } = await import("../src/llm/client.js");
    assert.equal(looksTruncated('{"a":'), true);
    assert.equal(looksTruncated('{"a":"unfinished'), true);
  });

  it("does not flag complete or non-JSON text", async () => {
    const { looksTruncated } = await import("../src/llm/client.js");
    assert.equal(looksTruncated('{"a":1}'), false);
    assert.equal(looksTruncated("this is not json"), false);
    assert.equal(looksTruncated(""), false);
  });
});

// ─── chatJSON recovery through the client ─────────────────────

function createMockClient(content: string) {
  return import("../src/llm/client.js").then(({ LLMClient }) => {
    const client = new LLMClient({
      llmApiBase: "http://fake:9999/v1",
      llmApiKey: "test",
      llmModelName: "model",
      cognitiveDbPath: "./test.db",
    });
    (client as any).client = {
      chat: {
        completions: {
          create: async () => ({ choices: [{ message: { content } }] }),
        },
      },
    };
    return client;
  });
}

describe("chatJSON truncated-response recovery", () => {
  it("recovers a truncated JSON response", async () => {
    const client = await createMockClient('{"nodes":[{"type":"concept","name":"A"}');
    const result = await client.chatJSON({ system: "test", user: "test" });
    assert.deepEqual(result, { nodes: [{ type: "concept", name: "A" }] });
  });

  it("recovers a markdown-wrapped truncated response", async () => {
    const client = await createMockClient('```json\n{"nodes":[{"name":"A"}');
    const result = await client.chatJSON({ system: "test", user: "test" });
    assert.deepEqual(result, { nodes: [{ name: "A" }] });
  });

  it("reports a truncation hint when repair still fails", async () => {
    // 字符串内以转义符结尾：补引号后转义符使其失效，修复无法救回
    const client = await createMockClient('{"nodes":[{"name":"AB\\');
    await assert.rejects(
      () => client.chatJSON({ system: "test", user: "test" }),
      (err: Error) => err.message.includes("invalid JSON") && err.message.includes("truncated"),
    );
  });

  it("keeps the generic error for non-JSON text", async () => {
    const client = await createMockClient("this is not json");
    await assert.rejects(
      () => client.chatJSON({ system: "test", user: "test" }),
      (err: Error) => err.message.includes("invalid JSON") && err.message.includes("not valid JSON"),
    );
  });
});

// ─── dynamic token budget ─────────────────────────────────────

describe("estimateExtractMaxTokens", () => {
  it("clamps short texts to the 4096 floor", async () => {
    const { estimateExtractMaxTokens } = await import("../src/text.js");
    assert.equal(estimateExtractMaxTokens(0), 4096);
    assert.equal(estimateExtractMaxTokens(1000), 4096);
  });

  it("scales with text length above the floor", async () => {
    const { estimateExtractMaxTokens } = await import("../src/text.js");
    const long = estimateExtractMaxTokens(20000); // ≈ 12.4k tokens
    assert.ok(long > 4096);
    assert.ok(long > estimateExtractMaxTokens(8000));
  });

  it("caps at 16384 for very long texts", async () => {
    const { estimateExtractMaxTokens } = await import("../src/text.js");
    assert.equal(estimateExtractMaxTokens(1_000_000), 16384);
  });
});