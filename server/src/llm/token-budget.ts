import { config } from "../config";
import type { TokenUsageStore } from "./types";

/** Local calendar date as "YYYY-MM-DD". The budget is a money cap, so it uses the real date. */
export function formatCalendarDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A call's tokens weighted by how they bill: cache reads and writes at `llm.tokenWeights`. */
export function computeWeightedTokens(usage: {
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
}): number {
  const weights = config.llm.tokenWeights;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const freshInput = Math.max(0, usage.promptTokens - cacheRead - cacheWrite);
  const weighted =
    freshInput +
    cacheRead * weights.cacheRead +
    cacheWrite * weights.cacheWrite +
    usage.completionTokens;
  return Math.round(weighted);
}

export interface TokenBudgetOptions {
  dailyTokenBudget?: number;
  now?: () => Date;
}

/** Counts tokens per real calendar day and reports when the daily budget is reached. */
export class TokenBudget {
  /** Changed live from the UI settings. */
  dailyTokenBudget: number;
  private readonly now: () => Date;

  constructor(
    private readonly store: TokenUsageStore,
    options: TokenBudgetOptions = {},
  ) {
    this.dailyTokenBudget = options.dailyTokenBudget ?? config.llm.dailyTokenBudget;
    this.now = options.now ?? (() => new Date());
  }

  get tokensToday(): number {
    return this.store.getTokens(this.today());
  }

  addTokens(tokens: number): void {
    if (tokens > 0) this.store.addTokens(this.today(), tokens);
  }

  isOverBudget(): boolean {
    return this.tokensToday >= this.dailyTokenBudget;
  }

  private today(): string {
    return formatCalendarDay(this.now());
  }
}

/** An in-memory store for tests and runs without a database. */
export class InMemoryTokenUsageStore implements TokenUsageStore {
  private readonly tokensByDay = new Map<string, number>();

  getTokens(day: string): number {
    return this.tokensByDay.get(day) ?? 0;
  }

  addTokens(day: string, tokens: number): void {
    this.tokensByDay.set(day, this.getTokens(day) + tokens);
  }
}
