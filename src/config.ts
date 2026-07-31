/**
 * Configuration module — reads all environment variables with defaults.
 *
 * LLM 模式自动检测逻辑:
 *   1. 显式设置 LLM_MODE=sampling  → 使用 MCP Sampling（无需 API key）
 *   2. 显式设置 LLM_MODE=direct    → 使用直连 API
 *   3. 未设置 LLM_MODE 时:
 *      - 如果 LLM_API_BASE 和 LLM_API_KEY 都已配置（且 key 不是 EMPTY） → direct
 *      - 否则 → sampling（推荐零配置体验）
 */

export type LLMMode = "direct" | "sampling";

export interface Config {
  /** LLM 调用模式: "direct" (OpenAI SDK) 或 "sampling" (MCP 协议委托客户端) */
  llmMode: LLMMode;
  /** OpenAI-compatible API base URL */
  llmApiBase: string;
  /** API key for the LLM provider */
  llmApiKey: string;
  /** Model name to use for inference */
  llmModelName: string;
  /** Path to the SQLite database file */
  cognitiveDbPath: string;
}

export function loadConfig(): Config {
  const apiBase = process.env.LLM_API_BASE ?? "";
  const apiKey = process.env.LLM_API_KEY ?? "";
  const modelName = process.env.LLM_MODEL_NAME ?? "";
  const explicitMode = process.env.LLM_MODE as LLMMode | undefined;

  let llmMode: LLMMode;
  if (explicitMode === "sampling" || explicitMode === "direct") {
    llmMode = explicitMode;
  } else {
    // 自动检测: 有完整的 API 配置则 direct，否则 sampling
    const hasDirectConfig = apiBase && apiKey && apiKey !== "EMPTY";
    llmMode = hasDirectConfig ? "direct" : "sampling";
  }

  return {
    llmMode,
    llmApiBase: apiBase || "http://127.0.0.1:8000/v1",
    llmApiKey: apiKey || "EMPTY",
    llmModelName: modelName || "gpt-4o-mini",
    cognitiveDbPath: process.env.COGNITIVE_DB_PATH ?? "./cognitive.db",
  };
}