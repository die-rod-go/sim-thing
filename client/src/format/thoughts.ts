import { formatTimeOfDay, type LlmCallKind, type LlmCallRecord } from "@village/shared";

/** One labeled piece of a reply, e.g. { label: "said", text: "Morning, Bob!" }. */
export interface ThoughtPart {
  label: string;
  text: string;
}

export interface ThoughtEntry {
  callId: number;
  tick: number;
  kind: LlmCallKind;
  /** The main line: the decision's thought. */
  headline: string | null;
  parts: ThoughtPart[];
  error: string | null;
}

type ReplyFields = Record<string, unknown>;

function isRecord(value: unknown): value is ReplyFields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(fields: ReplyFields, key: string): string | null {
  const value = fields[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNumber(fields: ReplyFields, key: string): number | null {
  const value = fields[key];
  return typeof value === "number" ? value : null;
}

function readRecords(fields: ReplyFields, key: string): ReplyFields[] {
  const value = fields[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readTexts(fields: ReplyFields, key: string): string[] {
  const value = fields[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function part(label: string, text: string | null): ThoughtPart[] {
  return text === null ? [] : [{ label, text }];
}

function describeDecisionAction(fields: ReplyFields): string | null {
  const action = readText(fields, "action");
  if (action === null || action === "continue") return null;
  const target = readText(fields, "target");
  const verb = readText(fields, "verb");
  const item = readText(fields, "item");
  switch (action) {
    case "walk_to":
      return `walk to ${target ?? "?"}`;
    case "interact":
      return [verb ?? "use", item, target ? `at ${target}` : null].filter(Boolean).join(" ");
    case "give": {
      const amount = readNumber(fields, "amount");
      const item = readText(fields, "item") ?? "?";
      return `give ${amount ?? ""}${amount === null ? "" : " "}${item} to ${target ?? "?"}`;
    }
    case "wait": {
      const minutes = readNumber(fields, "minutes");
      return minutes === null ? "wait" : `wait ${minutes} min`;
    }
    default:
      return target ? `${action} → ${target}` : action;
  }
}

function summarizeDecision(fields: ReplyFields): Pick<ThoughtEntry, "headline" | "parts"> {
  const volume = readText(fields, "volume");
  const saidLabel = volume === "whisper" ? "whispered" : volume === "shout" ? "shouted" : "said";
  return {
    headline: readText(fields, "thought"),
    parts: [
      ...part(saidLabel, readText(fields, "say")),
      ...part("does", describeDecisionAction(fields)),
      ...part("intends", readText(fields, "intention")),
      ...part("feels", readText(fields, "mood")),
      ...part("offer", readText(fields, "offer")),
    ],
  };
}

const PERSON_FIELD_WORDS: Record<string, string> = {
  whatIThinkOfThem: "thinks",
  whatTheyThinkOfMe: "they think",
  whatIWantFromThem: "wants",
  whatTheyWantFromMe: "they want",
  misc: "notes",
};

function summarizePeople(fields: ReplyFields): Pick<ThoughtEntry, "headline" | "parts"> {
  const parts = readRecords(fields, "people").flatMap((person) => {
    const name = readText(person, "person") ?? "someone";
    return Object.entries(PERSON_FIELD_WORDS).flatMap(([field, words]) =>
      part(`${name}: ${words}`, readText(person, field)),
    );
  });
  return { headline: null, parts };
}

function describeGoal(goal: ReplyFields): string | null {
  const text = readText(goal, "goal");
  if (text === null) return null;
  const steps = readTexts(goal, "steps");
  return steps.length === 0 ? text : `${text}: ${steps.join("; ")}`;
}

/** A reflection: what it rewrote of who the agent is, its goals, the people it knows, its key memories. */
function summarizeReflection(fields: ReplyFields): Pick<ThoughtEntry, "headline" | "parts"> {
  const identity = summarizeIdentity(fields);
  const goals = readRecords(fields, "longTermGoals").flatMap((goal) =>
    part("goal", describeGoal(goal)),
  );
  const keyMemories = readRecords(fields, "keyMemories").flatMap((keyMemory) =>
    part("never forget", readText(keyMemory, "text")),
  );
  return {
    headline: identity.headline,
    parts: [...identity.parts, ...goals, ...summarizePeople(fields).parts, ...keyMemories],
  };
}

/** A day plan: each item of Today, with its hour when it has one, then any rewritten goals. */
function summarizeDayPlan(fields: ReplyFields): Pick<ThoughtEntry, "headline" | "parts"> {
  const items = readRecords(fields, "agenda").flatMap((item) => {
    const hour = readNumber(item, "hour");
    const label = hour === null ? "today" : `at ${formatTimeOfDay({ hour, minute: 0 })}`;
    return part(label, readText(item, "text"));
  });
  const goals = readRecords(fields, "longTermGoals").flatMap((goal) =>
    part("goal", describeGoal(goal)),
  );
  return { headline: null, parts: [...items, ...goals] };
}

function summarizeIdentity(fields: ReplyFields): Pick<ThoughtEntry, "headline" | "parts"> {
  const traitChanges = readRecords(fields, "traitChanges").flatMap((change) => {
    const delta = readNumber(change, "delta");
    const sign = delta !== null && delta >= 0 ? "+" : "";
    const amount = delta === null ? "" : ` ${sign}${delta.toFixed(3)}`;
    return part(`${readText(change, "trait") ?? "trait"}${amount}`, readText(change, "reason"));
  });
  return {
    headline: readText(fields, "selfImage") ?? readText(fields, "core"),
    parts: [
      ...part("work", readText(fields, "profession")),
      ...part("core", readText(fields, "core")),
      ...traitChanges,
    ],
  };
}

function summarizeOther(fields: ReplyFields): Pick<ThoughtEntry, "headline" | "parts"> {
  const textParts = Object.entries(fields).flatMap(([key, value]) =>
    typeof value === "string" && value.trim().length > 0 ? [{ label: key, text: value }] : [],
  );
  return { headline: null, parts: textParts };
}

function summarizeReply(
  kind: LlmCallKind,
  fields: ReplyFields,
): Pick<ThoughtEntry, "headline" | "parts"> {
  switch (kind) {
    case "decision":
    case "reckoning":
      return summarizeDecision(fields);
    case "episode":
    case "chronicle":
    case "day_summary":
    case "history":
      return { headline: readText(fields, "summary"), parts: [] };
    case "day_plan":
      return summarizeDayPlan(fields);
    case "reflection":
      return summarizeReflection(fields);
    case "reality":
      return {
        headline: readText(fields, "thought"),
        parts: part("noticed", readText(fields, "noticed")),
      };
    case "interact":
      return summarizeOther(fields);
  }
}

/** Reads an LLM call's parsed reply as a short, labeled account of what the agent thought. */
export function summarizeLlmCall(call: LlmCallRecord): ThoughtEntry {
  const summary = isRecord(call.parsed)
    ? summarizeReply(call.kind, call.parsed)
    : { headline: null, parts: [] };
  return { callId: call.id, tick: call.tick, kind: call.kind, error: call.error, ...summary };
}
