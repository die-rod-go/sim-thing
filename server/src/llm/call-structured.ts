import type { LlmCallKind, LlmCallRecord } from "@village/shared";
import { z } from "zod";
import { config } from "../config";
import { createLogger } from "../logger";
import type { ConcurrencyLimiter } from "./concurrency-limiter";
import { renderTemplate } from "./templates";
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
  /** Offsets into `prompt` where the provider may cache the prefix. */
  cacheBreakpoints?: number[];
}

export type LlmCallDraft = Omit<LlmCallRecord, "id">;

/** A reply that parsed as JSON but failed validation: what it said, and which fields were wrong. */
export interface RejectedReply {
  value: unknown;
  fields: string[];
}

export type StructuredCallResult<Value> =
  | {
      ok: true;
      value: Value;
      record: LlmCallDraft;
      callId: number | null;
      /** Replies rejected before this one was accepted. */
      rejectedReplies?: RejectedReply[];
    }
  | { ok: false; error: string; rejectedReplies?: RejectedReply[] };

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
  /** Used instead of the client's model for the kinds in `config.llm.reflectionKinds`. */
  reflectionModel?: string;
  /** Used for the reality pass instead of either; it falls back to the reflection model. */
  realityModel?: string;
}

/** The model a call of this kind is sent to; undefined means the client's own. */
function chooseModel(
  dependencies: StructuredCallerDependencies,
  kind: LlmCallKind,
): string | undefined {
  if (kind === "reality") return dependencies.realityModel ?? dependencies.reflectionModel;
  return config.llm.reflectionKinds.includes(kind) ? dependencies.reflectionModel : undefined;
}

type AttemptOutcome<Value> =
  | { ok: true; value: Value; record: LlmCallDraft }
  | {
      ok: false;
      error: string;
      record: LlmCallDraft;
      isReplyRejected: boolean;
      rejectedReply: RejectedReply | null;
    };

const REJECTED_REPLY_TEMPLATE = "rejected-reply";

/** The prompt for the next attempt: after a rejected reply the model is told what was wrong. */
function buildRetryPrompt(
  request: StructuredCallRequest<unknown>,
  rejection: string | null,
): string {
  if (rejection === null) return request.prompt;
  return `${request.prompt}\n\n${renderTemplate(REJECTED_REPLY_TEMPLATE, { error: rejection })}`;
}

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
):
  | { ok: true; value: Value; parsed: unknown }
  | { ok: false; error: string; parsed: unknown; fields: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(text));
  } catch (error) {
    return { ok: false, error: `invalid JSON: ${describeError(error)}`, parsed: null, fields: [] };
  }
  const validation = schema.safeParse(parsed);
  if (!validation.success) {
    const fields = validation.error.issues.map((issue) => issue.path.map(String).join("."));
    return {
      ok: false,
      error: `invalid reply: ${z.prettifyError(validation.error)}`,
      parsed,
      fields: [...new Set(fields)],
    };
  }
  return { ok: true, value: validation.data, parsed: validation.data };
}

function shouldThink(kind: LlmCallKind): boolean {
  return config.llm.thinkingKinds.includes(kind);
}

/** The reply's token ceiling, with room for thinking on calls that keep it, since it counts too. */
function findMaxTokens(request: StructuredCallRequest<unknown>): number {
  const replyTokens = request.maxTokens ?? config.llm.maxReplyTokens[request.kind];
  return shouldThink(request.kind) ? replyTokens + config.llm.thinkingTokenAllowance : replyTokens;
}

/** A cut-off reply fails as broken JSON; say why, so the cap can be raised instead of guessed at. */
function describeCutOff<Result extends { ok: boolean; error?: string }>(
  parseResult: Result,
  wasCutOff: boolean,
  request: StructuredCallRequest<unknown>,
): Result {
  if (parseResult.ok || !wasCutOff) return parseResult;
  const error = `reply cut off at the ${findMaxTokens(request)}-token limit (config.llm.maxReplyTokens.${request.kind})`;
  return { ...parseResult, error };
}

async function attemptCall<Value>(
  client: LlmClient,
  request: StructuredCallRequest<Value>,
  prompt: string,
  model: string | undefined,
): Promise<AttemptOutcome<Value>> {
  const baseRecord = {
    agentId: request.agentId,
    tick: request.tick,
    kind: request.kind,
    prompt,
  };
  const startedAt = performance.now();
  try {
    const response = await client.complete({
      prompt,
      jsonSchema: request.jsonSchema,
      schemaName: request.schemaName,
      maxTokens: findMaxTokens(request),
      model,
      shouldThink: shouldThink(request.kind),
      effort: config.llm.effortByKind[request.kind],
      temperature: request.temperature ?? config.llm.temperature ?? undefined,
      cacheBreakpoints: request.cacheBreakpoints,
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
      cacheReadTokens: response.cacheReadTokens ?? null,
      cacheWriteTokens: response.cacheWriteTokens ?? null,
      latencyMs: response.latencyMs,
      error: parseResult.ok ? null : parseResult.error,
    };
    return parseResult.ok
      ? { ok: true, value: parseResult.value, record }
      : {
          ok: false,
          error: parseResult.error,
          record,
          isReplyRejected: true,
          rejectedReply:
            parseResult.parsed !== null
              ? { value: parseResult.parsed, fields: parseResult.fields }
              : null,
        };
  } catch (error) {
    const message = `API error: ${describeError(error)}`;
    const record: LlmCallDraft = {
      ...baseRecord,
      model: model ?? client.model,
      reply: "",
      parsed: null,
      promptTokens: 0,
      completionTokens: 0,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      latencyMs: Math.round(performance.now() - startedAt),
      error: message,
    };
    return { ok: false, error: message, record, isReplyRejected: false, rejectedReply: null };
  }
}

/**
 * Builds the one entry point for structured LLM calls: limiter, client, JSON parse, zod validation,
 * retries after a backoff (a rejected reply is retried with the error added to the prompt), and
 * every attempt reported to the call log and the token budget. Callers fall back when not ok.
 */
export function createStructuredCaller(
  dependencies: StructuredCallerDependencies,
): StructuredCaller {
  const pause = dependencies.pause ?? pauseFor;
  return async <Value>(request: StructuredCallRequest<Value>) => {
    const model = chooseModel(dependencies, request.kind);
    let lastError = BUDGET_REACHED_ERROR;
    let rejection: string | null = null;
    const rejectedReplies: RejectedReply[] = [];
    for (let attempt = 1; attempt <= config.llm.attemptsPerCall; attempt += 1) {
      if (attempt > 1) await pause(config.llm.retryBackoffMs);
      if (dependencies.budget.isOverBudget()) {
        logger.warn(`Skipped ${request.kind} call for ${request.agentId}: ${BUDGET_REACHED_ERROR}`);
        return { ok: false, error: BUDGET_REACHED_ERROR, rejectedReplies };
      }
      const prompt = buildRetryPrompt(request, rejection);
      const outcome = await dependencies.limiter.run(() =>
        attemptCall(dependencies.client, request, prompt, model),
      );
      const callId = dependencies.recordLlmCall(outcome.record);
      dependencies.budget.addTokens(outcome.record.promptTokens + outcome.record.completionTokens);
      if (outcome.ok) {
        logger.debug(`${request.kind} call for ${request.agentId} ok`, {
          attempt,
          latencyMs: outcome.record.latencyMs,
        });
        return { ok: true, value: outcome.value, record: outcome.record, callId, rejectedReplies };
      }
      lastError = outcome.error;
      rejection = outcome.isReplyRejected ? outcome.error : null;
      if (outcome.rejectedReply) rejectedReplies.push(outcome.rejectedReply);
      logger.warn(`${request.kind} call for ${request.agentId} failed (attempt ${attempt})`, {
        error: outcome.error,
      });
    }
    return { ok: false, error: lastError, rejectedReplies };
  };
}
