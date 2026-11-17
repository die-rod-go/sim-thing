import { toSimTime, type LlmCallKind } from "@village/shared";
import { config } from "../config";
import { estimateDollars } from "./costs";
import { buildNameGrouper } from "./grouping";
import type { CallRecord, DecisionRecord, SaveRecords } from "./records";

const MINUTES_PER_HOUR = 60;
const DECISION_KINDS: readonly LlmCallKind[] = ["decision", "interact"];
const SUMMARY_KINDS: readonly LlmCallKind[] = ["episode", "chronicle", "day_summary", "history"];
/** The reason shown for a decision nothing flagged: the agent had nothing left to do. */
export const NO_REASON = "(nothing to do)";

/** Passes and plans: every call that is neither a decision nor a summary. */
export function isPassOrPlanKind(kind: LlmCallKind): boolean {
  return !DECISION_KINDS.includes(kind) && !SUMMARY_KINDS.includes(kind);
}

export type OutcomeClass = "continue" | "wait" | "act" | "unreadable";

export function classifyOutcome(outcome: string): OutcomeClass {
  if (outcome === "continue" || outcome === "wait" || outcome === "unreadable") return outcome;
  return "act";
}

export interface OutcomeShares {
  continue: number;
  wait: number;
  act: number;
}

function shareOutcomes(decisions: readonly DecisionRecord[]): OutcomeShares {
  const count = (outcomeClass: OutcomeClass) =>
    decisions.filter((decision) => classifyOutcome(decision.outcome) === outcomeClass).length;
  const total = Math.max(1, decisions.length);
  return {
    continue: count("continue") / total,
    wait: count("wait") / total,
    act: count("act") / total,
  };
}

function dayOf(tick: number): number {
  return toSimTime(tick, config.clock).day;
}

function countHoursByDay(lastTick: number): Map<number, number> {
  const hours = new Map<number, number>();
  for (let tick = 0; tick <= lastTick; tick += 1) {
    const day = dayOf(tick);
    hours.set(day, (hours.get(day) ?? 0) + config.clock.minutesPerTick / MINUTES_PER_HOUR);
  }
  return hours;
}

export interface DayRow extends OutcomeShares {
  day: number;
  hours: number;
  /** Agents who made a decision that day. */
  agentCount: number;
  decisions: number;
  decisionsPerAgentHour: number;
  passCallsPerAgent: number;
  /** Every token at face value, cache reads included. */
  tokens: number;
  dollars: number;
}

function sumTokens(calls: readonly CallRecord[]): number {
  return calls.reduce((sum, call) => sum + call.promptTokens + call.completionTokens, 0);
}

/** Per sim-day: how often agents decided, what they settled on, and what it all cost. */
export function summarizeDays(records: SaveRecords): DayRow[] {
  return [...countHoursByDay(records.lastTick)].map(([day, hours]) => {
    const decisions = records.decisions.filter((decision) => dayOf(decision.tick) === day);
    const calls = records.calls.filter((call) => dayOf(call.tick) === day);
    const agentCount = new Set(decisions.map((decision) => decision.agentId)).size;
    const perAgent = Math.max(1, agentCount);
    return {
      day,
      hours,
      agentCount,
      decisions: decisions.length,
      decisionsPerAgentHour: decisions.length / perAgent / Math.max(hours, Number.EPSILON),
      passCallsPerAgent: calls.filter((call) => isPassOrPlanKind(call.kind)).length / perAgent,
      tokens: sumTokens(calls),
      dollars: calls.reduce((sum, call) => sum + estimateDollars(call), 0),
      ...shareOutcomes(decisions),
    };
  });
}

export interface AgentRow extends OutcomeShares {
  name: string;
  hoursAlive: number;
  decisions: number;
  decisionsPerHour: number;
  passCalls: number;
  dollars: number;
}

/** Per agent, over the time it was alive. */
export function summarizeAgents(records: SaveRecords): AgentRow[] {
  return Object.entries(records.agentNames).map(([agentId, name]) => {
    const death = records.deaths.find((candidate) => candidate.agentId === agentId);
    const lastTick = death?.tick ?? records.lastTick;
    const hoursAlive = (lastTick * config.clock.minutesPerTick) / MINUTES_PER_HOUR;
    const decisions = records.decisions.filter((decision) => decision.agentId === agentId);
    const calls = records.calls.filter((call) => call.agentId === agentId);
    return {
      name,
      hoursAlive,
      decisions: decisions.length,
      decisionsPerHour: decisions.length / Math.max(hoursAlive, Number.EPSILON),
      passCalls: calls.filter((call) => isPassOrPlanKind(call.kind)).length,
      dollars: calls.reduce((sum, call) => sum + estimateDollars(call), 0),
      ...shareOutcomes(decisions),
    };
  });
}

export interface ReasonRow {
  reason: string;
  count: number;
  share: number;
  /** How many came while the agent was in the middle of something. */
  midActionCount: number;
  /** How many of them were answered `continue`. */
  continueCount: number;
}

/** The commonest reasons decisions were asked for, names and numbers grouped. */
export function summarizeReasons(records: SaveRecords): ReasonRow[] {
  const group = buildNameGrouper(Object.values(records.agentNames));
  const rows = new Map<string, ReasonRow>();
  for (const decision of records.decisions) {
    const reason = decision.reason === null ? NO_REASON : group(decision.reason);
    const row = rows.get(reason) ?? {
      reason,
      count: 0,
      share: 0,
      midActionCount: 0,
      continueCount: 0,
    };
    row.count += 1;
    if (decision.isMidAction) row.midActionCount += 1;
    if (decision.outcome === "continue") row.continueCount += 1;
    rows.set(reason, row);
  }
  const total = Math.max(1, records.decisions.length);
  return [...rows.values()]
    .map((row) => ({ ...row, share: row.count / total }))
    .sort((first, second) => second.count - first.count)
    .slice(0, config.measure.topReasonCount);
}

export interface SectionRow {
  title: string;
  meanChars: number;
  share: number;
}

/** How a decision prompt divides between its sections, on average. */
export function summarizePromptSections(decisions: readonly DecisionRecord[]): SectionRow[] {
  const totals = new Map<string, number>();
  for (const decision of decisions) {
    for (const [title, chars] of Object.entries(decision.sectionChars)) {
      totals.set(title, (totals.get(title) ?? 0) + chars);
    }
  }
  const allChars = Math.max(
    1,
    decisions.reduce((sum, decision) => sum + decision.totalChars, 0),
  );
  const count = Math.max(1, decisions.length);
  return [...totals]
    .map(([title, chars]) => ({ title, meanChars: chars / count, share: chars / allChars }))
    .sort((first, second) => second.share - first.share);
}

/** The mean decision prompt, in characters. */
export function measureMeanPromptChars(decisions: readonly DecisionRecord[]): number {
  return (
    decisions.reduce((sum, decision) => sum + decision.totalChars, 0) /
    Math.max(1, decisions.length)
  );
}
