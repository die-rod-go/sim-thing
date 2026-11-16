import type { LlmCallRecord } from "@village/shared";

export type JsonSchema = { [key: string]: unknown };

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LlmRequestOptions {
  /** A JSON schema for the reply; used for strict structured output when the provider supports it. */
  jsonSchema?: JsonSchema;
  schemaName?: string;
  maxTokens: number;
  /** Overrides the client's own model for this call. */
  model?: string;
  /** Keeps the model's thinking on for this call even when the client has thinking disabled. */
  shouldThink?: boolean;
  /** Left out of the request when undefined, so the provider default applies. */
  temperature?: number;
  /** Character offsets into the prompt after which a provider with prompt caching may cache the prefix. */
  cacheBreakpoints?: number[];
}

export type LlmRequest = LlmRequestOptions & ({ prompt: string } | { messages: LlmMessage[] });

export interface LlmResponse {
  text: string;
  /** Total input tokens, cached or not. */
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  latencyMs: number;
  model: string;
  /** The provider stopped because the reply reached `maxTokens`. */
  wasCutOff: boolean;
}

export interface LlmClient {
  readonly model: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

/** Token counts per real calendar day ("YYYY-MM-DD"); the database implements it. */
export interface TokenUsageStore {
  getTokens(day: string): number;
  addTokens(day: string, tokens: number): void;
}

/** Receives every LLM call attempt, so it can be stored in `llm_calls`. */
/** Stores one call and returns its `llm_calls` id, or null when the sink keeps no ids. */
export type LlmCallSink = (record: Omit<LlmCallRecord, "id">) => number | null;

export function toMessages(request: LlmRequest): LlmMessage[] {
  return "messages" in request ? request.messages : [{ role: "user", content: request.prompt }];
}
