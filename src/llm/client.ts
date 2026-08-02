/**
 * Dual-mode LLM client.
 *
 * - DirectLLMClient:  通过 OpenAI SDK 直接调用外部 API（需要 LLM_API_KEY）
 * - SamplingLLMClient: 通过 MCP Sampling 协议委托客户端（Cursor/WorkBuddy 等）
 *                       代为调用 LLM，无需配置任何 API key
 *
 * 两种实现共享相同的 LLMProvider 接口，上层 tool 代码无需关心底层使用哪种模式。
 */

import OpenAI from "openai";
import type { Config } from "../config.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/* ------------------------------------------------------------------ */
/*  公共接口                                                            */
/* ------------------------------------------------------------------ */

export interface LLMProvider {
  chat(options: {
    system?: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string>;

  chatJSON<T>(options: {
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<T>;
}

/* ------------------------------------------------------------------ */
/*  JSON 响应解析（容忍 markdown 代码块包裹 + 截断修复）                 */
/* ------------------------------------------------------------------ */

const JSON_PROMPT_SUFFIX = `\n\nIMPORTANT: Respond with valid JSON only. No markdown, no explanation outside JSON.`;

/** 扫描 JSON 前缀，跟踪字符串/括号状态；括号失衡（无法安全修复）时 broken=true。 */
function scanJson(raw: string): {
  inString: boolean;
  stack: Array<"[" | "{">;
  broken: boolean;
} {
  const stack: Array<"[" | "{"> = [];
  let inString = false;
  let escaped = false;
  for (const ch of raw) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[" || ch === "{") stack.push(ch);
    else if (ch === "]" || ch === "}") {
      if (stack.length === 0) return { inString, stack, broken: true };
      stack.pop();
    }
  }
  return { inString, stack, broken: false };
}

/**
 * 判断文本是否疑似被截断（未闭合字符串或未闭合括号）。
 * 用于区分「输出预算不足导致截断」与「模型返回了非 JSON 文本」。
 */
export function looksTruncated(raw: string): boolean {
  const s = scanJson(raw);
  return !s.broken && (s.inString || s.stack.length > 0);
}

/**
 * 修复被截断的 JSON：关闭未闭合字符串，并按栈补全右括号。
 * 结构完整（无需修复）或括号失衡（无法安全修复）时返回 null。
 */
export function repairTruncatedJson(raw: string): string | null {
  const s = scanJson(raw);
  if (s.broken) return null;
  if (!s.inString && s.stack.length === 0) return null;
  let repaired = raw;
  if (s.inString) repaired += '"'; // 字符串被截断：补闭合引号
  for (let i = s.stack.length - 1; i >= 0; i--) {
    repaired += s.stack[i] === "[" ? "]" : "}";
  }
  return repaired;
}

/** 从 LLM 文本中提取 JSON；失败时先尝试截断修复，再抛出带成因的错误。 */
function parseJSONResponse<T>(raw: string): T {
  const rawStr = raw.trim();
  // 剥离 markdown 代码块：优先取闭合块内内容；块未闭合（截断场景）时取标记之后的部分
  let jsonStr: string;
  const closedFence = rawStr.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (closedFence) {
    jsonStr = closedFence[1].trim();
  } else {
    const openFence = rawStr.match(/^```(?:json)?\s*\n?([\s\S]*)$/);
    jsonStr = openFence ? openFence[1].trim() : rawStr;
  }
  try {
    return JSON.parse(jsonStr) as T;
  } catch (parseErr) {
    const repaired = repairTruncatedJson(jsonStr);
    if (repaired !== null) {
      try {
        return JSON.parse(repaired) as T;
      } catch {
        /* 补全后仍非法：按原始错误处理 */
      }
    }
    const hint = looksTruncated(jsonStr)
      ? "response appears truncated (output token limit); consider splitting long notes"
      : "response is not valid JSON";
    throw new Error(
      `LLM returned invalid JSON (first 200 chars): ${jsonStr.slice(0, 200)} — ${hint}`,
      { cause: parseErr },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  模式一：直连 OpenAI 兼容 API                                        */
/* ------------------------------------------------------------------ */

export class DirectLLMClient implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(config: Config) {
    this.client = new OpenAI({
      baseURL: config.llmApiBase,
      apiKey: config.llmApiKey,
    });
    this.model = config.llmModelName;
  }

  async chat(options: {
    system?: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    if (options.system) {
      messages.push({ role: "system", content: options.system });
    }
    messages.push({ role: "user", content: options.user });

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
    });

    return response.choices[0]?.message?.content ?? "";
  }

  async chatJSON<T>(options: {
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<T> {
    const raw = await this.chat({
      ...options,
      system: `${options.system}${JSON_PROMPT_SUFFIX}`,
    });
    return parseJSONResponse<T>(raw);
  }
}

/* ------------------------------------------------------------------ */
/*  模式二：通过 MCP Sampling 委托客户端 LLM                            */
/* ------------------------------------------------------------------ */

export class SamplingLLMClient implements LLMProvider {
  private server: McpServer;

  constructor(server: McpServer) {
    this.server = server;
  }

  async chat(options: {
    system?: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const result = await this.server.server.createMessage({
      messages: [
        { role: "user", content: { type: "text", text: options.user } },
      ],
      systemPrompt: options.system,
      maxTokens: options.maxTokens ?? 4096,
      temperature: options.temperature,
      metadata: { source: "cognitive-exoskeleton" },
    });

    // 提取文本内容（可能是单 block 或多 block）
    const content = result.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n");
    }
    if (content && typeof content === "object" && "text" in content) {
      return (content as any).text;
    }
    return "";
  }

  async chatJSON<T>(options: {
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<T> {
    const raw = await this.chat({
      ...options,
      system: `${options.system}${JSON_PROMPT_SUFFIX}`,
    });
    return parseJSONResponse<T>(raw);
  }
}

/* 向后兼容: 旧代码 import { LLMClient } 仍然可用 */
/** @deprecated Use LLMProvider (interface) or DirectLLMClient (class) instead */
export { DirectLLMClient as LLMClient };

/* ------------------------------------------------------------------ */
/*  工厂函数                                                            */
/* ------------------------------------------------------------------ */

export function createLLMClient(config: Config, server?: McpServer): LLMProvider {
  if (config.llmMode === "sampling") {
    if (!server) {
      throw new Error("Sampling mode requires McpServer instance");
    }
    console.error("[llm] Mode: sampling — delegating to MCP client");
    return new SamplingLLMClient(server);
  }
  console.error(`[llm] Mode: direct — ${config.llmApiBase} / ${config.llmModelName}`);
  return new DirectLLMClient(config);
}