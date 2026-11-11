import type { LlmCallKind, LlmCallRecord } from "@village/shared";
import { z } from "zod";
import { config } from "../config";
import { createLogger } from "../logger";
import type { ConcurrencyLimiter } from "./concurrency-limiter";
import type { TokenBudget } from "./token-budget";
import type { JsonSchema, LlmCallSink, LlmClient } from "./types";

const logger = createLogger("llm");

export interface StructuredCallRequest<Value> {
  kind: LlmCallKind;
  agentId: string;
  tick: number;
  prompt: string;
  schema: z.ZodType<Value>;
  jsonSchema?: JsonSchema;
  schemaName?: string;
  /** Defaults to `config.llm.maxReplyTokens[kind]`. */
  maxTokens?: number;
  temperature?: number;
}

export type LlmCallDraft = Omit<LlmCallRecord, "id">;

export type StructuredCallResult<Value> =
  | { ok: true; value: Value; record: LlmCallDraft; callId: number | null }
  | { ok: false; error: string };

export type StructuredCaller = <Value>(
  request: StructuredCallRequest<Value>,
) => Promise<StructuredCallResult<Value>>;

export interface StructuredCallerDependencies {
  client: LlmClient;
  limiter: ConcurrencyLimiter;
  budget: TokenBudget;
  recordLlmCall: LlmCallSink;
  /** Waits between attempts; injectable so tests don't sleep. */
  pause?: (milliseconds: number) => Promise<void>;
}

type AttemptOutcome<Value> =
  | { ok: true; value: Value; record: LlmCallDraft }
  | { ok: false; error: string; record: LlmCallDraft };

export const BUDGET_REACHED_ERROR = "daily token budget reached";

function pauseFor(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Cheap models sometimes wrap JSON in a markdown code fence; unwrap it before parsing. */
function extractJsonText(text: string): string {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text.trim());
  return fenced?.[1] ?? text.trim();
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseReply<Value>(
  text: string,
  schema: z.ZodType<Value>,
): { ok: true; value: Value; parsed: unknown } | { ok: false; error: string; parsed: unknown } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(text));
  } catch (error) {
    return { ok: false, error: `invalid JSON: ${describeError(error)}`, parsed: null };
  }
  const validation = schema.safeParse(parsed);
  if (!validation.success) {
    return { ok: false, error: `invalid reply: ${z.prettifyError(validation.error)}`, parsed };
  }
  return { ok: true, value: validation.data, parsed: validation.data };
}

/** A cut-off reply fails as broken JSON; say why, so the cap can be raised instead of guessed at. */
function describeCutOff<Result extends { ok: boolean; error?: string }>(
  parseResult: Result,
  wasCutOff: boolean,
  request: StructuredCallRequest<unknown>,
): Result {
  if (parseResult.ok || !wasCutOff) return parseResult;
  const limit = request.maxTokens ?? config.llm.maxReplyTokens[request.kind];
  const error = `reply cut off at the ${limit}-token limit (config.llm.maxReplyTokens.${request.kind})`;
  return { ...parseResult, error };
}

async function attemptCall<Value>(
  client: LlmClient,
  request: StructuredCallRequest<Value>,
): Promise<AttemptOutcome<Value>> {
  const baseRecord = {
    agentId: request.agentId,
    tick: request.tick,
    kind: request.kind,
    prompt: request.prompt,
  };
  const startedAt = performance.now();
  try {
    const response = await client.complete({
      prompt: request.prompt,
      jsonSchema: request.jsonSchema,
      schemaName: request.schemaName,
      maxTokens: request.maxTokens ?? config.llm.maxReplyTokens[request.kind],
      temperature: request.temperature ?? config.llm.temperature ?? undefined,
    });
    const parseResult = describeCutOff(
      parseReply(response.text, request.schema),
      response.wasCutOff,
      request,
    );
    const record: LlmCallDraft = {
      ...baseRecord,
      model: response.model,
      reply: response.text,
      parsed: parseResult.parsed,
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      latencyMs: response.latencyMs,
      error: parseResult.ok ? null : parseResult.error,
    };
    return parseResult.ok
      ? { ok: true, value: parseResult.value, record }
      : { ok: false, error: parseResult.error, record };
  } catch (error) {
    const message = `API error: ${describeError(error)}`;
    const record: LlmCallDraft = {
      ...baseRecord,
      model: client.model,
      reply: "",
      parsed: null,
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: Math.round(performance.now() - startedAt),
      error: message,
    };
    return { ok: false, error: message, record };
  }
}

/**
 * Builds the one entry point for structured LLM calls: limiter, client, JSON parse, zod validation,
 * one retry after a backoff, and every attempt reported to the call log and the token budget.
 * Callers fall back to `wait` when the result is not ok.
 */
export function createStructuredCaller(
  dependencies: StructuredCallerDependencies,
): StructuredCaller {
  const pause = dependencies.pause ?? pauseFor;
  return async <Value>(request: StructuredCallRequest<Value>) => {
    let lastError = BUDGET_REACHED_ERROR;
    for (let attempt = 1; attempt <= config.llm.attemptsPerCall; attempt += 1) {
      if (attempt > 1) await pause(config.llm.retryBackoffMs);
      if (dependencies.budget.isOverBudget()) {
        logger.warn(`Skipped ${request.kind} call for ${request.agentId}: ${BUDGET_REACHED_ERROR}`);
        return { ok: false, error: BUDGET_REACHED_ERROR };
      }
      const outcome = await dependencies.limiter.run(() =>
        attemptCall(dependencies.client, request),
      );
      const callId = dependencies.recordLlmCall(outcome.record);
      dependencies.budget.addTokens(outcome.record.promptTokens + outcome.record.completionTokens);
      if (outcome.ok) {
        logger.debug(`${request.kind} call for ${request.agentId} ok`, {
          attempt,
          latencyMs: outcome.record.latencyMs,
        });
        return { ok: true, value: outcome.value, record: outcome.record, callId };
      }
      lastError = outcome.error;
      logger.warn(`${request.kind} call for ${request.agentId} failed (attempt ${attempt})`, {
        error: outcome.error,
      });
    }
    return { ok: false, error: lastError };
  };
}
