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
  temperature: number;
}

export type LlmRequest = LlmRequestOptions & ({ prompt: string } | { messages: LlmMessage[] });

export interface LlmResponse {
  text: string;
  promptTokens: number;
  completionTokens: number;
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
export type LlmCallSink = (record: Omit<LlmCallRecord, "id">) => void;

export function toMessages(request: LlmRequest): LlmMessage[] {
  return "messages" in request ? request.messages : [{ role: "user", content: request.prompt }];
}
