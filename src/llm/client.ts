/**
 * Model-agnostic LLM client.
 * Uses the OpenAI SDK with configurable baseURL, so any
 * OpenAI-compatible API (Hy3, OpenAI, Ollama, vLLM, etc.) works.
 */

import OpenAI from "openai";
import { type Config } from "../config.js";

export class LLMClient {
  private client: OpenAI;
  private model: string;

  constructor(config: Config) {
    this.client = new OpenAI({
      baseURL: config.llmApiBase,
      apiKey: config.llmApiKey,
    });
    this.model = config.llmModelName;
  }

  /**
   * Send a chat completion request and return the assistant's message content.
   */
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

  /**
   * Send a chat completion request expecting JSON output.
   * Parses the response and returns the parsed object.
   */
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

    // Extract JSON from potential markdown code blocks
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();

    return JSON.parse(jsonStr) as T;
  }
}