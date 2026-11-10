import type { LlmCallRecord, PersonalityChange, WorldEvent } from "@village/shared";
import type { TokenUsageStore } from "../llm/types";
import type { Database } from "./database";

interface LlmCallRow {
  id: number;
  agent_id: string;
  tick: number;
  kind: LlmCallRecord["kind"];
  model: string;
  prompt: string;
  reply: string;
  parsed: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  error: string | null;
}

interface PersonalityChangeRow {
  id: number;
  agent_id: string;
  tick: number;
  field: PersonalityChange["field"];
  old_value: string;
  new_value: string;
  reason: string;
}

export function appendEvent(database: Database, event: WorldEvent): void {
  database
    .prepare(
      `INSERT INTO events (id, tick, actor, kind, target, place, text, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      event.id,
      event.tick,
      event.actorId,
      event.kind,
      event.targetId ?? event.targetName,
      event.place,
      event.description,
      JSON.stringify(event),
    );
}

/** The latest `limit` events, oldest first. */
export function listRecentEvents(database: Database, limit: number): WorldEvent[] {
  const rows = database.prepare("SELECT data FROM events ORDER BY id DESC LIMIT ?").all(limit) as {
    data: string;
  }[];
  return rows.reverse().map((row) => JSON.parse(row.data) as WorldEvent);
}

/** Stores one LLM call and returns its id. */
export function appendLlmCall(database: Database, call: Omit<LlmCallRecord, "id">): number {
  const result = database
    .prepare(
      `INSERT INTO llm_calls (agent_id, tick, kind, model, prompt, reply, parsed, prompt_tokens,
         completion_tokens, latency_ms, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      call.agentId,
      call.tick,
      call.kind,
      call.model,
      call.prompt,
      call.reply,
      call.parsed === undefined ? null : JSON.stringify(call.parsed),
      call.promptTokens,
      call.completionTokens,
      call.latencyMs,
      call.error,
      new Date().toISOString(),
    );
  return Number(result.lastInsertRowid);
}

function toLlmCallRecord(row: LlmCallRow): LlmCallRecord {
  return {
    id: row.id,
    agentId: row.agent_id,
    tick: row.tick,
    kind: row.kind,
    model: row.model,
    prompt: row.prompt,
    reply: row.reply,
    parsed: row.parsed === null ? null : (JSON.parse(row.parsed) as unknown),
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    latencyMs: row.latency_ms,
    error: row.error,
  };
}

/** The agent's latest `limit` LLM calls, newest first. */
export function listLlmCalls(database: Database, agentId: string, limit: number): LlmCallRecord[] {
  const rows = database
    .prepare("SELECT * FROM llm_calls WHERE agent_id = ? ORDER BY id DESC LIMIT ?")
    .all(agentId, limit) as LlmCallRow[];
  return rows.map(toLlmCallRecord);
}

/** Adds tokens to a calendar day's total (`day` as YYYY-MM-DD) and returns the new total. */
export function addTokenUsage(database: Database, day: string, tokens: number): number {
  database
    .prepare(
      `INSERT INTO token_usage (day, tokens) VALUES (?, ?)
       ON CONFLICT (day) DO UPDATE SET tokens = tokens + excluded.tokens`,
    )
    .run(day, tokens);
  return getTokenUsage(database, day);
}

export function getTokenUsage(database: Database, day: string): number {
  const row = database.prepare("SELECT tokens FROM token_usage WHERE day = ?").get(day) as
    { tokens: number } | undefined;
  return row?.tokens ?? 0;
}

/** The local calendar day for token budgeting, as YYYY-MM-DD. */
export function formatCalendarDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function appendPersonalityChange(
  database: Database,
  change: Omit<PersonalityChange, "id">,
): number {
  const result = database
    .prepare(
      `INSERT INTO personality_history (agent_id, tick, field, old_value, new_value, reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      change.agentId,
      change.tick,
      change.field,
      change.oldValue,
      change.newValue,
      change.reason,
    );
  return Number(result.lastInsertRowid);
}

/** The agent's personality changes, oldest first. */
export function listPersonalityHistory(database: Database, agentId: string): PersonalityChange[] {
  const rows = database
    .prepare("SELECT * FROM personality_history WHERE agent_id = ? ORDER BY id")
    .all(agentId) as PersonalityChangeRow[];
  return rows.map((row) => ({
    id: row.id,
    agentId: row.agent_id,
    tick: row.tick,
    field: row.field,
    oldValue: row.old_value,
    newValue: row.new_value,
    reason: row.reason,
  }));
}

/** The `token_usage` table as the LLM budget's store. */
export function createTokenUsageStore(database: Database): TokenUsageStore {
  return {
    getTokens: (day) => getTokenUsage(database, day),
    addTokens: (day, tokens) => {
      addTokenUsage(database, day, tokens);
    },
  };
}
