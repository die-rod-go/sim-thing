import type { LlmCallKind } from "@village/shared";
import { config } from "../config";
import type { CallRecord } from "./records";

export type Price = (typeof config.llm.prices)[number];

const TOKENS_PER_MILLION = 1_000_000;

/** The list price of a model: the first entry whose name appears in its id, dots read as dashes. */
export function findPrice(
  model: string,
  prices: readonly Price[] = config.llm.prices,
): Price | null {
  const normalized = model.toLowerCase().replace(/\./g, "-");
  return prices.find((price) => normalized.includes(price.model)) ?? null;
}

/** Input tokens billed at the full input price: neither read from the cache nor written to it. */
export function countUncachedTokens(call: CallRecord): number {
  return Math.max(0, call.promptTokens - call.cacheReadTokens - call.cacheWriteTokens);
}

/** What one call cost at list price; 0 for a model with no price. */
export function estimateDollars(call: CallRecord, prices?: readonly Price[]): number {
  const price = findPrice(call.model, prices);
  if (price === null) return 0;
  const cost =
    countUncachedTokens(call) * price.input +
    call.cacheReadTokens * price.cacheRead +
    call.cacheWriteTokens * price.cacheWrite +
    call.completionTokens * price.output;
  return cost / TOKENS_PER_MILLION;
}

export interface CostRow {
  kind: LlmCallKind;
  calls: number;
  uncachedTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  completionTokens: number;
  dollars: number;
}

/** Calls, tokens and estimated dollars per call kind, the costliest first. */
export function summarizeCostsByKind(calls: readonly CallRecord[]): CostRow[] {
  const rows = new Map<LlmCallKind, CostRow>();
  for (const call of calls) {
    const row = rows.get(call.kind) ?? {
      kind: call.kind,
      calls: 0,
      uncachedTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      completionTokens: 0,
      dollars: 0,
    };
    row.calls += 1;
    row.uncachedTokens += countUncachedTokens(call);
    row.cacheReadTokens += call.cacheReadTokens;
    row.cacheWriteTokens += call.cacheWriteTokens;
    row.completionTokens += call.completionTokens;
    row.dollars += estimateDollars(call);
    rows.set(call.kind, row);
  }
  return [...rows.values()].sort((first, second) => second.dollars - first.dollars);
}

/** Models that have no price, so their calls count as free. */
export function listUnpricedModels(calls: readonly CallRecord[]): string[] {
  return [...new Set(calls.map((call) => call.model))].filter((model) => findPrice(model) === null);
}
