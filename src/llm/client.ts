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
      system: `${options.system}\n\nIMPORTANT: Respond with valid JSON only. No markdown, no explanation outside JSON.`,
    });
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();
    return JSON.parse(jsonStr) as T;
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
      system: `${options.system}\n\nIMPORTANT: Respond with valid JSON only. No markdown, no explanation outside JSON.`,
    });
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();
    return JSON.parse(jsonStr) as T;
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