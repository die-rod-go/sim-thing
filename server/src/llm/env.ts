export interface LlmEnv {
  baseUrl: string;
  apiKey: string;
  model: string;
  isStructuredOutputEnabled: boolean;
  /** Sends `thinking: {type: "disabled"}`; only for providers that accept Anthropic's field. */
  isThinkingDisabled: boolean;
}

const REQUIRED_VARIABLES = ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"] as const;

/** Reads the LLM settings from the environment; throws naming every missing variable. */
export function readLlmEnv(environment: NodeJS.ProcessEnv = process.env): LlmEnv {
  const missingVariables = REQUIRED_VARIABLES.filter((name) => !environment[name]?.trim());
  if (missingVariables.length > 0) {
    throw new Error(
      `Missing LLM settings: ${missingVariables.join(", ")}. Copy .env.example to .env and fill them in.`,
    );
  }
  return {
    baseUrl: (environment.LLM_BASE_URL ?? "").trim().replace(/\/+$/, ""),
    apiKey: (environment.LLM_API_KEY ?? "").trim(),
    model: (environment.LLM_MODEL ?? "").trim(),
    isStructuredOutputEnabled: environment.LLM_STRUCTURED_OUTPUT?.trim().toLowerCase() !== "false",
    isThinkingDisabled: environment.LLM_DISABLE_THINKING?.trim().toLowerCase() === "true",
  };
}
