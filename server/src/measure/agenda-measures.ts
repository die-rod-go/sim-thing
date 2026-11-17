import { toSimTime } from "@village/shared";
import { config } from "../config";
import type { DecisionRecord, SaveRecords } from "./records";
import { MISSED_PREFIX } from "./save-reader";

const MINUTES_PER_HOUR = 60;

function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Reads the item back out of a reminder's decision reason ("it is 7:00 pm: dice"). */
const REMINDER_PATTERN = new RegExp(
  `^${escapeForPattern(config.agenda.reminderReasonText)
    .replace(escapeForPattern("{time}"), ".+?")
    .replace(escapeForPattern("{item}"), "(.+)")}$`,
);

export function readReminderItem(reason: string | null): string | null {
  if (reason === null) return null;
  return REMINDER_PATTERN.exec(reason)?.[1] ?? null;
}

function dayOf(tick: number): number {
  return toSimTime(tick, config.clock).day;
}

function countMarked(decision: DecisionRecord, marked: readonly number[]): number {
  return decision.today.filter((item) => marked.includes(item.number)).length;
}

/** Items still open after the last decision each agent made that day. */
function countLeftStanding(decisions: readonly DecisionRecord[]): number {
  const lastByAgent = new Map<string, DecisionRecord>();
  for (const decision of decisions) lastByAgent.set(decision.agentId, decision);
  return [...lastByAgent.values()].reduce((sum, decision) => {
    const closed = new Set([...decision.done, ...decision.dropped]);
    return sum + decision.today.filter((item) => !closed.has(item.number)).length;
  }, 0);
}

/** Whether the agent marked the reminded item finished within the hour after its reminder. */
function isReminderKept(
  reminder: DecisionRecord,
  item: string,
  decisions: readonly DecisionRecord[],
): boolean {
  const lastTick = reminder.tick + MINUTES_PER_HOUR / config.clock.minutesPerTick;
  return decisions.some(
    (decision) =>
      decision.agentId === reminder.agentId &&
      decision.tick >= reminder.tick &&
      decision.tick <= lastTick &&
      decision.today.some((line) => line.text === item && decision.done.includes(line.number)),
  );
}

export interface AgendaDayRow {
  day: number;
  dayPlans: number;
  finished: number;
  dropped: number;
  leftStanding: number;
  reminders: number;
  remindersKept: number;
  remindersMissed: number;
}

/** Per sim-day: day plans, items finished, dropped and left open, and reminders kept or missed. */
export function summarizeAgendaDays(records: SaveRecords): AgendaDayRow[] {
  const days = [...new Set(records.decisions.map((decision) => dayOf(decision.tick)))].sort();
  return days.map((day) => {
    const decisions = records.decisions.filter((decision) => dayOf(decision.tick) === day);
    const reminders = decisions.flatMap((decision) => {
      const item = readReminderItem(decision.reason);
      return item === null ? [] : [{ decision, item }];
    });
    return {
      day,
      dayPlans: records.calls.filter((call) => call.kind === "day_plan" && dayOf(call.tick) === day)
        .length,
      finished: decisions.reduce((sum, decision) => sum + countMarked(decision, decision.done), 0),
      dropped: decisions.reduce(
        (sum, decision) => sum + countMarked(decision, decision.dropped),
        0,
      ),
      leftStanding: countLeftStanding(decisions),
      reminders: reminders.length,
      remindersKept: reminders.filter(({ decision, item }) =>
        isReminderKept(decision, item, records.decisions),
      ).length,
      remindersMissed: records.streamLines.filter(
        (line) => line.text.startsWith(MISSED_PREFIX) && dayOf(line.tick) === day,
      ).length,
    };
  });
}
