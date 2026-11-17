import type { LlmCallKind } from "@village/shared";
import type { AgendaLine } from "./prompt-reading";

/*
 * What the measurement reads out of a save, reduced to the little each measure needs, so a run's
 * prompts never have to be held in memory at once.
 */

/** One logged LLM call attempt: what it cost. */
export interface CallRecord {
  agentId: string;
  tick: number;
  kind: LlmCallKind;
  model: string;
  /** All input tokens, cache reads and writes included. */
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** One decision that was answered: why it was asked, what it settled on, and its prompt's shape. */
export interface DecisionRecord {
  agentId: string;
  tick: number;
  /** What flagged it, as its prompt says; null when the agent simply had nothing to do. */
  reason: string | null;
  /** Asked while the agent was in the middle of something. */
  isMidAction: boolean;
  /** "continue", "wait", "walk_to", ...: the act it started. */
  outcome: string;
  /** Characters per prompt section, by section title; text before the first title is "(top)". */
  sectionChars: Record<string, number>;
  totalChars: number;
  /** Today's items as the prompt showed them. */
  today: AgendaLine[];
  /** The items the reply marked finished and given up, by number. */
  done: number[];
  dropped: number[];
}

/** A stream entry as some prompt showed it, once per agent, time and text. */
export interface StreamLine {
  agentId: string;
  tick: number;
  text: string;
  /** How many times it happened, for a merged repeat; 1 otherwise. */
  count: number;
}

export interface SpeechRecord {
  speakerId: string;
  tick: number;
  place: string;
  words: string;
}

export interface FailureRecord {
  agentId: string;
  tick: number;
  /** Why it failed, as onlookers learned it. */
  reason: string;
}

export interface DeathRecord {
  agentId: string;
  tick: number;
}

export interface SaveRecords {
  /** Display names by agent id. */
  agentNames: Record<string, string>;
  /** The last tick the save simulated. */
  lastTick: number;
  calls: CallRecord[];
  decisions: DecisionRecord[];
  streamLines: StreamLine[];
  speech: SpeechRecord[];
  failures: FailureRecord[];
  deaths: DeathRecord[];
}
