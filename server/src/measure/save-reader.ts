import BetterSqlite3 from "better-sqlite3";
import { z } from "zod";
import type { LlmCallKind } from "@village/shared";
import { config } from "../config";
import { readAgendaMarks, readDecisionOutcome, readDecisionPrompt } from "./prompt-reading";
import type {
  CallRecord,
  DecisionRecord,
  DeathRecord,
  FailureRecord,
  SaveRecords,
  SpeechRecord,
  StreamLine,
} from "./records";
import { buildNameGrouper } from "./grouping";

type Database = BetterSqlite3.Database;

const agentRowSchema = z.object({ id: z.string(), name: z.string() });

const eventSchema = z.object({
  tick: z.number(),
  actorId: z.string(),
  kind: z.string(),
  place: z.string(),
  description: z.string(),
  speech: z.object({ words: z.string() }).optional(),
});

const callRowSchema = z.object({
  agent_id: z.string(),
  tick: z.number(),
  kind: z.string(),
  model: z.string(),
  prompt: z.string(),
  parsed: z.string().nullable(),
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  cache_read_tokens: z.number().nullable(),
  cache_write_tokens: z.number().nullable(),
  error: z.string().nullable(),
});

/** How a missed reminder starts in the stream: "I slept through: ". */
export const MISSED_PREFIX = config.agenda.missedText.split("{item}")[0] ?? "";

/** What sits between `{attempt}` and `{reason}` in a failure onlookers see: ", but ". */
const FAILURE_SEPARATOR = (() => {
  const template = config.combat.failedAttemptDescription;
  const start = template.indexOf("{attempt}") + "{attempt}".length;
  return template.slice(start, template.indexOf("{reason}"));
})();

function readAgentNames(database: Database): Record<string, string> {
  const rows = database.prepare("SELECT data FROM agents").all() as { data: string }[];
  return Object.fromEntries(
    rows.map((row) => {
      const agent = agentRowSchema.parse(JSON.parse(row.data));
      return [agent.id, agent.name];
    }),
  );
}

function readLastTick(database: Database): number {
  const row = database.prepare("SELECT value FROM meta WHERE key = 'tick'").get() as
    { value: string } | undefined;
  return row === undefined ? 0 : Number(row.value);
}

interface EventRecords {
  speech: SpeechRecord[];
  failures: FailureRecord[];
  deaths: DeathRecord[];
}

function readEventRecords(database: Database): EventRecords {
  const records: EventRecords = { speech: [], failures: [], deaths: [] };
  const statement = database.prepare("SELECT data FROM events ORDER BY id");
  for (const row of statement.iterate() as Iterable<{ data: string }>) {
    const event = eventSchema.parse(JSON.parse(row.data));
    if (event.kind === "said" && event.speech !== undefined) {
      const { actorId, tick, place } = event;
      records.speech.push({ speakerId: actorId, tick, place, words: event.speech.words });
    } else if (event.kind === "action_failed") {
      const separatorIndex = event.description.indexOf(FAILURE_SEPARATOR);
      const reason =
        separatorIndex === -1
          ? event.description
          : event.description.slice(separatorIndex + FAILURE_SEPARATOR.length);
      records.failures.push({ agentId: event.actorId, tick: event.tick, reason });
    } else if (event.kind === "died") {
      records.deaths.push({ agentId: event.actorId, tick: event.tick });
    }
  }
  return records;
}

function parseJsonOrNull(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    // A reply that was never valid JSON was logged as text; it has no act to read.
    return null;
  }
}

interface CallRecords {
  calls: CallRecord[];
  decisions: DecisionRecord[];
  streamLines: StreamLine[];
}

/**
 * Every call's cost, every answered decision's facts, and the stream lines worth keeping (merged
 * repeats, overheard talk, anything naming one of the dead), each once.
 */
function readCallRecords(
  database: Database,
  agentNames: Record<string, string>,
  deadNames: readonly string[],
): CallRecords {
  const nameTitle = buildNameGrouper(Object.values(agentNames));
  const records: CallRecords = { calls: [], decisions: [], streamLines: [] };
  const linesByKey = new Map<string, StreamLine>();
  const isLineKept = (text: string, count: number) =>
    count > 1 ||
    text.startsWith("I overheard ") ||
    text.startsWith(MISSED_PREFIX) ||
    deadNames.some((name) => text.includes(name));
  const statement = database.prepare(
    `SELECT agent_id, tick, kind, model, prompt, parsed, prompt_tokens, completion_tokens,
       cache_read_tokens, cache_write_tokens, error FROM llm_calls ORDER BY id`,
  );
  for (const raw of statement.iterate()) {
    const row = callRowSchema.parse(raw);
    records.calls.push({
      agentId: row.agent_id,
      tick: row.tick,
      kind: row.kind as LlmCallKind,
      model: row.model,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      cacheReadTokens: row.cache_read_tokens ?? 0,
      cacheWriteTokens: row.cache_write_tokens ?? 0,
    });
    const isDecision = row.kind === "decision" || row.kind === "reckoning";
    if (!isDecision || row.error !== null) continue;
    const facts = readDecisionPrompt(row.prompt, nameTitle);
    const parsed = parseJsonOrNull(row.parsed);
    records.decisions.push({
      agentId: row.agent_id,
      tick: row.tick,
      reason: facts.reason,
      isMidAction: facts.isMidAction,
      outcome: readDecisionOutcome(parsed),
      sectionChars: facts.sectionChars,
      totalChars: facts.totalChars,
      today: facts.today,
      ...readAgendaMarks(parsed),
    });
    for (const line of facts.streamLines) {
      if (!isLineKept(line.text, line.count)) continue;
      const key = `${row.agent_id}|${line.tick}|${line.text}`;
      const existing = linesByKey.get(key);
      if (existing === undefined || existing.count < line.count) {
        linesByKey.set(key, { agentId: row.agent_id, ...line });
      }
    }
  }
  records.streamLines = [...linesByKey.values()].sort((first, second) => first.tick - second.tick);
  return records;
}

/** Reads a saved sim, opened read-only, into the records the measures need. */
export function readSaveRecords(databasePath: string): SaveRecords {
  const database = new BetterSqlite3(databasePath, { readonly: true, fileMustExist: true });
  try {
    const agentNames = readAgentNames(database);
    const events = readEventRecords(database);
    const deadNames = events.deaths.flatMap((death) => agentNames[death.agentId] ?? []);
    return {
      agentNames,
      lastTick: readLastTick(database),
      ...events,
      ...readCallRecords(database, agentNames, deadNames),
    };
  } finally {
    database.close();
  }
}
