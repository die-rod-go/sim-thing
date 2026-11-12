import { z } from "zod";
import { createStructuredCaller, type StructuredCaller } from "./call-structured";
import { ConcurrencyLimiter } from "./concurrency-limiter";
import { readLlmEnv } from "./env";
import { FakeLlmClient } from "./fake-llm-client";
import { createFakeResponder, type FakeResponderOptions } from "./fake-responder";
import { AnthropicClient } from "./anthropic-client";
import { OpenAiCompatibleClient } from "./open-ai-compatible-client";
import { TokenBudget } from "./token-budget";
import type { LlmCallSink, LlmClient, TokenUsageStore } from "./types";

export const llmProviderSchema = z.enum(["openai", "anthropic", "fake"]).default("openai");

export type LlmProvider = z.infer<typeof llmProviderSchema>;

export interface LlmStackOptions {
  provider: LlmProvider;
  tokenUsageStore: TokenUsageStore;
  dailyTokenBudget: number;
  recordLlmCall: LlmCallSink;
  /** Model for the reflection passes; decisions, interactions and summaries use the client's own. */
  reflectionModel?: string;
  /** For the `fake` provider: what the offline responder needs to know about the items. */
  fakeResponderOptions?: FakeResponderOptions;
  /** Supplies the client directly (tests); otherwise built from the provider. */
  client?: LlmClient;
  pause?: (milliseconds: number) => Promise<void>;
}

/** The one LLM pipeline everything calls through: client, limiter, budget and call log. */
export interface LlmStack {
  client: LlmClient;
  limiter: ConcurrencyLimiter;
  budget: TokenBudget;
  callStructured: StructuredCaller;
}

/** `fake` runs offline with a seeded responder; `openai` and `anthropic` read LLM_* from the environment. */
export function createLlmClient(
  provider: LlmProvider,
  fakeResponderOptions: FakeResponderOptions = {},
): LlmClient {
  return provider === "fake"
    ? new FakeLlmClient(createFakeResponder({}, undefined, fakeResponderOptions), {
        isKeepingRequests: false,
      })
    : provider === "anthropic"
      ? new AnthropicClient(readLlmEnv())
      : new OpenAiCompatibleClient(readLlmEnv());
}

export function buildLlmStack(options: LlmStackOptions): LlmStack {
  const client = options.client ?? createLlmClient(options.provider, options.fakeResponderOptions);
  const limiter = new ConcurrencyLimiter();
  const budget = new TokenBudget(options.tokenUsageStore, {
    dailyTokenBudget: options.dailyTokenBudget,
  });
  const callStructured = createStructuredCaller({
    client,
    limiter,
    budget,
    recordLlmCall: options.recordLlmCall,
    pause: options.pause,
    reflectionModel: options.reflectionModel,
  });
  return { client, limiter, budget, callStructured };
}
