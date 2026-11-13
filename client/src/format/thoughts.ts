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
  /** The main line: the decision's thought, the night summary, the morning plan. */
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

function part(label: string, text: string | null): ThoughtPart[] {
  return text === null ? [] : [{ label, text }];
}

function dossierParts(fields: ReplyFields): ThoughtPart[] {
  return readRecords(fields, "dossiers").flatMap((entry) =>
    part(`on ${readText(entry, "person") ?? "someone"}`, readText(entry, "text")),
  );
}

/** "Win Malin over: next, bring her the axe; then ask her to the tavern". */
function describePlan(plan: ReplyFields): string | null {
  const aim = readText(plan, "aim");
  if (aim === null) return null;
  const steps = Array.isArray(plan.steps)
    ? plan.steps.filter((step): step is string => typeof step === "string")
    : [];
  const [nextStep, ...laterSteps] = steps;
  const next = nextStep === undefined ? "" : `: next, ${nextStep}`;
  const later = laterSteps.length === 0 ? "" : `; then ${laterSteps.join("; ")}`;
  const keepFrom = readText(plan, "keepFrom");
  const secret = keepFrom === null ? "" : ` (kept from ${keepFrom})`;
  return `${aim}${next}${later}${secret}`;
}

/** A reply's `plans` list; a null list means the plans were kept, so it shows nothing. */
function planParts(fields: ReplyFields): ThoughtPart[] {
  return readRecords(fields, "plans").flatMap((plan) => part("plans", describePlan(plan)));
}

function goalParts(fields: ReplyFields): ThoughtPart[] {
  return readRecords(fields, "goals").flatMap((goal) =>
    part(`${readText(goal, "kind") ?? ""} goal`.trim(), readText(goal, "text")),
  );
}

function goalProgressParts(fields: ReplyFields): ThoughtPart[] {
  return readRecords(fields, "goalProgress").flatMap((entry) => {
    const goalNumber = readNumber(entry, "goal");
    return part(`goal ${goalNumber ?? "?"}`, readText(entry, "progress"));
  });
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
    case "recall":
      return `try to recall "${readText(fields, "query") ?? ""}"`;
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
      ...part("finished a step of", stepDoneText(fields)),
    ],
  };
}

function stepDoneText(fields: ReplyFields): string | null {
  const planNumber = readNumber(fields, "stepDone");
  return planNumber === null ? null : `plan ${planNumber}`;
}

function summarizeNight(fields: ReplyFields): Pick<ThoughtEntry, "headline" | "parts"> {
  return {
    headline: readText(fields, "summary"),
    parts: [
      ...part("feels", readText(fields, "moodEntry")),
      ...readRecords(fields, "insights").flatMap((insight) =>
        part("realized", readText(insight, "text")),
      ),
      ...goalParts(fields),
      ...planParts(fields),
      ...dossierParts(fields),
    ],
  };
}

function summarizeWeekly(fields: ReplyFields): Pick<ThoughtEntry, "headline" | "parts"> {
  const traitChanges = readRecords(fields, "traitChanges").flatMap((change) => {
    const delta = readNumber(change, "delta");
    const sign = delta !== null && delta >= 0 ? "+" : "";
    const amount = delta === null ? "" : ` ${sign}${delta.toFixed(2)}`;
    return part(`${readText(change, "trait") ?? "trait"}${amount}`, readText(change, "reason"));
  });
  const goals = goalParts(fields);
  return {
    headline: readText(fields, "selfImage") ?? readText(fields, "core"),
    parts: [
      ...part("work", readText(fields, "profession")),
      ...part("core", readText(fields, "core")),
      ...traitChanges,
      ...goals,
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
    case "morning":
      return {
        headline: readText(fields, "dailyPlan"),
        parts: [...planParts(fields), ...part("feels", readText(fields, "mood"))],
      };
    case "daytime":
      return {
        headline: readText(fields, "thinking"),
        parts: [
          ...readRecords(fields, "insights").flatMap((insight) =>
            part("realized", readText(insight, "text")),
          ),
          ...goalProgressParts(fields),
          ...planParts(fields),
          ...dossierParts(fields),
          ...part("feels", readText(fields, "mood")),
        ],
      };
    case "night":
      return summarizeNight(fields);
    case "weekly":
      return summarizeWeekly(fields);
    case "conversation_summary":
      return { headline: readText(fields, "summary"), parts: dossierParts(fields) };
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
