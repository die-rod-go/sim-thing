import type { LlmCallKind, LlmCallRecord } from "@village/shared";

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
      return summarizeDecision(fields);
    case "episode":
    case "chronicle":
    case "day_summary":
    case "history":
      return { headline: readText(fields, "summary"), parts: [] };
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
