/**
 * Config & LLM client tests.
 *
 * Run:  npx tsx --test test/config-llm.test.ts
 */

import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

// ─── Config ────────────────────────────────────────────────

describe("Config – loadConfig", () => {
  const ORIG_ENV = { ...process.env };

  afterEach(() => {
    // Restore env after each test
    for (const key of ["LLM_API_BASE", "LLM_API_KEY", "LLM_MODEL_NAME", "COGNITIVE_DB_PATH"]) {
      if (ORIG_ENV[key] === undefined) delete process.env[key];
      else process.env[key] = ORIG_ENV[key];
    }
  });

  it("returns defaults when no env vars are set", async () => {
    delete process.env.LLM_API_BASE;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL_NAME;
    delete process.env.COGNITIVE_DB_PATH;

    const { loadConfig } = await import("../src/config.js");
    const cfg = loadConfig();
    assert.equal(cfg.llmApiBase, "http://127.0.0.1:8000/v1");
    assert.equal(cfg.llmApiKey, "EMPTY");
    assert.equal(cfg.llmModelName, "hy3");
    assert.equal(cfg.cognitiveDbPath, "./cognitive.db");
  });

  it("reads LLM_API_BASE from env", async () => {
    process.env.LLM_API_BASE = "https://api.openai.com/v1";
    const { loadConfig } = await import("../src/config.js");
    const cfg = loadConfig();
    assert.equal(cfg.llmApiBase, "https://api.openai.com/v1");
  });

  it("reads LLM_API_KEY from env", async () => {
    process.env.LLM_API_KEY = "sk-test-1234";
    const { loadConfig } = await import("../src/config.js");
    const cfg = loadConfig();
    assert.equal(cfg.llmApiKey, "sk-test-1234");
  });

  it("reads LLM_MODEL_NAME from env", async () => {
    process.env.LLM_MODEL_NAME = "gpt-4o";
    const { loadConfig } = await import("../src/config.js");
    const cfg = loadConfig();
    assert.equal(cfg.llmModelName, "gpt-4o");
  });

  it("reads COGNITIVE_DB_PATH from env", async () => {
    process.env.COGNITIVE_DB_PATH = "/tmp/my-graph.db";
    const { loadConfig } = await import("../src/config.js");
    const cfg = loadConfig();
    assert.equal(cfg.cognitiveDbPath, "/tmp/my-graph.db");
  });

  it("Config interface has exactly 4 fields", async () => {
    process.env.LLM_API_BASE = "http://localhost/v1";
    process.env.LLM_API_KEY = "test";
    process.env.LLM_MODEL_NAME = "m";
    process.env.COGNITIVE_DB_PATH = "./x.db";
    const { loadConfig } = await import("../src/config.js");
    const cfg = loadConfig();
    const keys = Object.keys(cfg).sort();
    assert.deepEqual(keys, ["cognitiveDbPath", "llmApiBase", "llmApiKey", "llmModelName"]);
  });
});

// ─── LLM Client (mocked OpenAI) ────────────────────────────

describe("LLMClient", () => {
  it("can be constructed with config", async () => {
    const { LLMClient } = await import("../src/llm/client.js");
    const client = new LLMClient({
      llmApiBase: "http://localhost:11434/v1",
      llmApiKey: "EMPTY",
      llmModelName: "qwen2.5:32b",
      cognitiveDbPath: "./test.db",
    });
    assert.ok(client instanceof LLMClient);
  });

  it("chat() calls OpenAI SDK and returns string", async () => {
    // We mock the underlying OpenAI client by intercepting the completion call
    const { LLMClient } = await import("../src/llm/client.js");
    const client = new LLMClient({
      llmApiBase: "http://fake:9999/v1",
      llmApiKey: "test",
      llmModelName: "fake-model",
      cognitiveDbPath: "./test.db",
    });

    // Override the internal OpenAI client
    (client as any).client = {
      chat: {
        completions: {
          create: async (params: any) => {
            // Verify correct params were passed
            assert.equal(params.model, "fake-model");
            assert.equal(params.temperature, 0.5);
            assert.equal(params.max_tokens, 1024);
            assert.ok(params.messages.length >= 1);
            return {
              choices: [{ message: { content: "Hello from fake LLM" } }],
            };
          },
        },
      },
    };

    const result = await client.chat({
      system: "You are a test assistant",
      user: "Say hello",
      temperature: 0.5,
      maxTokens: 1024,
    });
    assert.equal(result, "Hello from fake LLM");
  });

  it("chat() uses defaults for temperature and maxTokens", async () => {
    const { LLMClient } = await import("../src/llm/client.js");
    const client = new LLMClient({
      llmApiBase: "http://fake:9999/v1",
      llmApiKey: "test",
      llmModelName: "model",
      cognitiveDbPath: "./test.db",
    });

    let capturedParams: any;
    (client as any).client = {
      chat: {
        completions: {
          create: async (params: any) => {
            capturedParams = params;
            return { choices: [{ message: { content: "ok" } }] };
          },
        },
      },
    };

    await client.chat({ user: "test" });
    assert.equal(capturedParams.temperature, 0.7); // default
    assert.equal(capturedParams.max_tokens, 4096); // default
  });

  it("chat() returns empty string when response has no content", async () => {
    const { LLMClient } = await import("../src/llm/client.js");
    const client = new LLMClient({
      llmApiBase: "http://fake:9999/v1",
      llmApiKey: "test",
      llmModelName: "model",
      cognitiveDbPath: "./test.db",
    });

    (client as any).client = {
      chat: {
        completions: {
          create: async () => ({ choices: [{ message: {} }] }),
        },
      },
    };

    const result = await client.chat({ user: "test" });
    assert.equal(result, "");
  });

  it("chatJSON() parses JSON response", async () => {
    const { LLMClient } = await import("../src/llm/client.js");
    const client = new LLMClient({
      llmApiBase: "http://fake:9999/v1",
      llmApiKey: "test",
      llmModelName: "model",
      cognitiveDbPath: "./test.db",
    });

    (client as any).client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: '{"nodes":[],"edges":[]}' } }],
          }),
        },
      },
    };

    const result = await client.chatJSON({
      system: "Extract knowledge",
      user: "test",
    });
    assert.deepEqual(result, { nodes: [], edges: [] });
  });

  it("chatJSON() extracts JSON from markdown code block", async () => {
    const { LLMClient } = await import("../src/llm/client.js");
    const client = new LLMClient({
      llmApiBase: "http://fake:9999/v1",
      llmApiKey: "test",
      llmModelName: "model",
      cognitiveDbPath: "./test.db",
    });

    (client as any).client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{
              message: {
                content: '```json\n{"nodes":[{"type":"concept","name":"A","summary":"test","domain":"x"}],"edges":[]}\n```',
              },
            }],
          }),
        },
      },
    };

    const result = await client.chatJSON({ system: "test", user: "test" });
    assert.equal((result as any).nodes[0].name, "A");
  });

  it("chatJSON() throws on invalid JSON", async () => {
    const { LLMClient } = await import("../src/llm/client.js");
    const client = new LLMClient({
      llmApiBase: "http://fake:9999/v1",
      llmApiKey: "test",
      llmModelName: "model",
      cognitiveDbPath: "./test.db",
    });

    (client as any).client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: "this is not json" } }],
          }),
        },
      },
    };

    await assert.rejects(
      () => client.chatJSON({ system: "test", user: "test" }),
      (err: Error) => err instanceof SyntaxError,
    );
  });
});

// ─── Prompts module ────────────────────────────────────────

describe("Prompts", () => {
  it("extract prompts are non-empty strings", async () => {
    const { EXTRACT_SYSTEM_PROMPT, buildExtractUserPrompt } = await import("../src/prompts/extract.js");
    assert.ok(EXTRACT_SYSTEM_PROMPT.length > 100);
    const userPrompt = buildExtractUserPrompt("Hello world");
    assert.ok(userPrompt.includes("Hello world"));
  });

  it("analyze prompts accept topic and data", async () => {
    const { buildBlindspotPrompt, buildTopologyPrompt, buildEvolutionPrompt } = await import("../src/prompts/analyze.js");
    const blindspot = buildBlindspotPrompt("distributed systems", "CAP theorem");
    assert.ok(blindspot.includes("distributed systems"));
    assert.ok(blindspot.includes("CAP theorem"));

    const topo = buildTopologyPrompt("4 nodes, 2 edges");
    assert.ok(topo.includes("4 nodes"));

    const evo = buildEvolutionPrompt("CAP", "v1 → v2 → v3");
    assert.ok(evo.includes("CAP"));
    assert.ok(evo.includes("v1 → v2 → v3"));
  });

  it("associate prompts accept concept names and domains", async () => {
    const { buildConnectionPrompt, buildSerendipityPrompt, buildQueryPrompt } = await import("../src/prompts/associate.js");

    const conn = buildConnectionPrompt("Paxos", "Neural Net", "consensus", "ML model", "via Bridge");
    assert.ok(conn.includes("Paxos"));
    assert.ok(conn.includes("Neural Net"));
    assert.ok(conn.includes("via Bridge"));

    const connNoBridge = buildConnectionPrompt("A", "B", "ctx_a", "ctx_b");
    assert.ok(!connNoBridge.includes("Bridge context"));

    const serendipity = buildSerendipityPrompt("ds", "ml", "Raft", "consensus", "GPT", "language model");
    assert.ok(serendipity.includes("Raft"));
    assert.ok(serendipity.includes("GPT"));
    assert.ok(serendipity.includes("ds"));

    const query = buildQueryPrompt("What is CAP?", "CAP Theorem: tradeoff");
    assert.ok(query.includes("What is CAP?"));
    assert.ok(query.includes("CAP Theorem"));
  });
});