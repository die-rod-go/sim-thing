import { parseSimTime } from "@village/shared";
import { config } from "../config";
import { CURRENT_ACTION_PREFIX, DECISION_REASON_PREFIX } from "../decision/sections";

/** What a logged decision prompt shows, as the measurement reads it back. */
export interface DecisionPromptFacts {
  reason: string | null;
  isMidAction: boolean;
  sectionChars: Record<string, number>;
  totalChars: number;
  /** The stream as the prompt showed it. */
  streamLines: { tick: number; text: string; count: number }[];
  /** Today's items as the prompt showed them. */
  today: AgendaLine[];
}

export interface AgendaLine {
  number: number;
  text: string;
}

const SECTION_PREFIX = "## ";
/** The title of the section that holds the stream in `decision.txt`. */
const STREAM_SECTION_TITLE = "Just now";
export const TOP_SECTION = "(top)";
const STREAM_LINE_PATTERN = /^- \[(Day \d+, \d{1,2}:\d{2} [ap]m)(?: to [^\]]+)?\] (.*)$/;
/** A merged repeat's count, after the text or before the words of speech. */
const REPEAT_COUNT_PATTERN = / \(×(\d+)\)/;
/** The title of the section that holds the agenda in `decision.txt`. */
const TODAY_SECTION_TITLE = "Today";
const AGENDA_LINE_PATTERN = /^(\d+)\. (?:\d{1,2}:\d{2} [ap]m: )?(.*)$/;

function readToday(lines: readonly string[]): AgendaLine[] {
  const start = lines.indexOf(`${SECTION_PREFIX}${TODAY_SECTION_TITLE}`);
  if (start === -1) return [];
  const today: AgendaLine[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = AGENDA_LINE_PATTERN.exec(line);
    if (match === null) break;
    today.push({ number: Number(match[1]), text: match[2] ?? "" });
  }
  return today;
}

function readSectionChars(lines: readonly string[], nameTitle: (title: string) => string) {
  const sectionChars: Record<string, number> = {};
  let title = TOP_SECTION;
  for (const line of lines) {
    if (line.startsWith(SECTION_PREFIX)) title = nameTitle(line.slice(SECTION_PREFIX.length));
    sectionChars[title] = (sectionChars[title] ?? 0) + line.length + 1;
  }
  return sectionChars;
}

function readStreamLines(lines: readonly string[]): DecisionPromptFacts["streamLines"] {
  const start = lines.indexOf(`${SECTION_PREFIX}${STREAM_SECTION_TITLE}`);
  if (start === -1) return [];
  const streamLines: DecisionPromptFacts["streamLines"] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith(SECTION_PREFIX)) break;
    const match = STREAM_LINE_PATTERN.exec(line);
    const tick = match?.[1] === undefined ? null : parseSimTime(match[1], config.clock);
    if (match === null || tick === null) continue;
    const shown = match[2] ?? "";
    const count = REPEAT_COUNT_PATTERN.exec(shown)?.[1];
    const text = shown.replace(REPEAT_COUNT_PATTERN, "");
    streamLines.push({ tick, text, count: count === undefined ? 1 : Number(count) });
  }
  return streamLines;
}

function readReason(lines: readonly string[]): string | null {
  const line = lines.find((candidate) => candidate.startsWith(DECISION_REASON_PREFIX));
  return line === undefined ? null : line.slice(DECISION_REASON_PREFIX.length).replace(/\.$/, "");
}

/** Reads a decision prompt; `nameTitle` lets titles that hold a name group together. */
export function readDecisionPrompt(
  prompt: string,
  nameTitle: (title: string) => string = (title) => title,
): DecisionPromptFacts {
  const lines = prompt.split("\n");
  return {
    reason: readReason(lines),
    isMidAction: lines.some((line) => line.startsWith(CURRENT_ACTION_PREFIX)),
    sectionChars: readSectionChars(lines, nameTitle),
    totalChars: prompt.length,
    streamLines: readStreamLines(lines),
    today: readToday(lines),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumbers(parsed: Record<string, unknown>, key: string): number[] {
  const value = parsed[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is number => typeof entry === "number")
    : [];
}

/** The agenda items a decision reply marked finished and given up, by number. */
export function readAgendaMarks(parsed: unknown): { done: number[]; dropped: number[] } {
  if (!isRecord(parsed)) return { done: [], dropped: [] };
  return { done: readNumbers(parsed, "done"), dropped: readNumbers(parsed, "dropped") };
}

/** The act a decision reply settled on ("wait", "walk_to"); "unreadable" when it has none. */
export function readDecisionOutcome(parsed: unknown): string {
  if (!isRecord(parsed) || typeof parsed.action !== "string") return "unreadable";
  return parsed.action;
}
