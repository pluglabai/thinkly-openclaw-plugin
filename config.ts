export interface ThinklyLlmConfig {
  provider: string;
  model: string;
  apiKey: string;
}

export interface ThinklyConfig {
  apiUrl: string;
  apiKey: string;
  transportMode?: 'legacy_highlights' | 'agent_api_v1';
  llm?: ThinklyLlmConfig;
}

let cached: ThinklyConfig | null = null;

export function loadConfig(pluginConfig: Record<string, unknown>): ThinklyConfig {
  if (cached) return cached;

  if (!pluginConfig || typeof pluginConfig !== "object") {
    throw new Error("[Thinkly] Missing plugin config. Check plugins.entries.thinkly.config in openclaw.json");
  }

  const cfg = pluginConfig;

  // apiUrl — required
  const apiUrl = cfg.apiUrl;
  if (!apiUrl || typeof apiUrl !== "string" || apiUrl.trim().length === 0) {
    throw new Error("[Thinkly] config.yaml: 'thinkly.apiUrl' is required");
  }

  // apiKey — required, apiToken kept as backward-compatible fallback
  const apiKeyRaw = typeof cfg.apiKey === "string" && cfg.apiKey.trim().length > 0
    ? cfg.apiKey
    : cfg.apiToken;
  if (!apiKeyRaw || typeof apiKeyRaw !== "string" || apiKeyRaw.trim().length === 0) {
    throw new Error("[Thinkly] config.yaml: 'thinkly.apiKey' is required");
  }

  const transportMode = cfg.transportMode === 'agent_api_v1'
    ? 'agent_api_v1'
    : 'legacy_highlights';

  // llm — optional
  let llm: ThinklyLlmConfig | undefined;
  let llmProvider: unknown;
  let llmModel: unknown;
  let llmApiKey: unknown;

  if (cfg.llm && typeof cfg.llm === "object") {
    const llmRaw = cfg.llm as Record<string, unknown>;
    llmProvider = llmRaw.provider;
    llmModel = llmRaw.model;
    llmApiKey = llmRaw.apiKey;
  }

  if (typeof cfg["llm.provider"] === "string" && cfg["llm.provider"].trim().length > 0) {
    llmProvider = cfg["llm.provider"];
  }
  if (typeof cfg["llm.model"] === "string" && cfg["llm.model"].trim().length > 0) {
    llmModel = cfg["llm.model"];
  }
  if (typeof cfg["llm.apiKey"] === "string" && cfg["llm.apiKey"].trim().length > 0) {
    llmApiKey = cfg["llm.apiKey"];
  }

  if (
    typeof llmProvider === "string" && llmProvider.trim().length > 0 &&
    typeof llmModel === "string" && llmModel.trim().length > 0 &&
    typeof llmApiKey === "string" && llmApiKey.trim().length > 0
  ) {
    llm = {
      provider: llmProvider.trim(),
      model: llmModel.trim(),
      apiKey: llmApiKey.trim(),
    };
  }

  cached = {
    apiUrl: apiUrl.trim().replace(/\/+$/, ""),
    apiKey: apiKeyRaw.trim(),
    transportMode,
    llm,
  };

  return cached;
}

export function getConfig(): ThinklyConfig {
  if (!cached) {
    throw new Error("[Thinkly] Config not loaded. Call loadConfig() first.");
  }
  return cached;
}

/** Reset internal state for testing only. */
export function _resetConfigForTesting(): void {
  cached = null;
}
