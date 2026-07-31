/**
 * Configuration module - reads all environment variables with defaults.
 */

export interface Config {
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
  return {
    llmApiBase: process.env.LLM_API_BASE ?? "http://127.0.0.1:8000/v1",
    llmApiKey: process.env.LLM_API_KEY ?? "EMPTY",
    llmModelName: process.env.LLM_MODEL_NAME ?? "hy3",
    cognitiveDbPath: process.env.COGNITIVE_DB_PATH ?? "./cognitive.db",
  };
}