import { formatTimeOfDay, toSimTime, type AgendaItem, type Agent } from "@village/shared";
import { config } from "../config";

/** An item as a plan or a decision writes it, before it gets a number. */
export interface PlannedItem {
  text: string;
  hour: number | null;
}

/** What one decision did to the agenda, by item number. */
export interface AgendaChanges {
  done: readonly number[];
  dropped: readonly number[];
  added: readonly PlannedItem[];
}

function fillText(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(value),
    template,
  );
}

function describeHour(hour: number): string {
  return formatTimeOfDay({ hour, minute: 0 });
}

/** "3. 7:00 pm: dice at the tavern", or "1. Morning: two batches of bread" with no hour. */
export function describeAgendaItem(item: AgendaItem): string {
  const values = { number: String(item.number), text: item.text };
  return item.hour === null
    ? fillText(config.agenda.itemText, values)
    : fillText(config.agenda.itemWithHourText, { ...values, time: describeHour(item.hour) });
}

/** Today as prompts show it: one numbered line per item, or that nothing is planned. */
export function describeAgenda(agenda: readonly AgendaItem[]): string {
  if (agenda.length === 0) return config.agenda.nothingPlannedText;
  return agenda.map(describeAgendaItem).join("\n");
}

function numberItems(agent: Agent, items: readonly PlannedItem[]): AgendaItem[] {
  return items.map((item, index) => ({
    number: agent.nextAgendaNumber + index,
    text: item.text.trim(),
    hour: item.hour,
  }));
}

/** A new agenda in place of the old, numbered on from where the old one left off. */
export function replaceAgenda(agent: Agent, items: readonly PlannedItem[]): Agent {
  const agenda = numberItems(agent, items.slice(0, config.agenda.maxItems));
  return {
    ...agent,
    agenda,
    nextAgendaNumber: agent.nextAgendaNumber + agenda.length,
    agendaRevision: agent.agendaRevision + 1,
  };
}

/**
 * Marks items finished or given up and adds new ones, at most `agenda.maxAddedPerDecision` and
 * never past `agenda.maxItems`. Numbers the agenda no longer holds are ignored. Returns the agent
 * and what it files in its stream, in its own voice ("I finished: ...").
 */
export function applyAgendaChanges(
  agent: Agent,
  changes: AgendaChanges,
): { agent: Agent; streamTexts: string[] } {
  const finished = agent.agenda.filter((item) => changes.done.includes(item.number));
  const dropped = agent.agenda.filter(
    (item) => changes.dropped.includes(item.number) && !changes.done.includes(item.number),
  );
  const leaving = new Set([...finished, ...dropped].map((item) => item.number));
  const kept = agent.agenda.filter((item) => !leaving.has(item.number));
  const room = Math.max(0, config.agenda.maxItems - kept.length);
  const addedCount = Math.min(room, config.agenda.maxAddedPerDecision, changes.added.length);
  const added = numberItems(agent, changes.added.slice(0, addedCount));
  const streamTexts = [
    ...finished.map((item) => fillText(config.agenda.finishedText, { item: item.text })),
    ...dropped.map((item) => fillText(config.agenda.droppedText, { item: item.text })),
  ];
  if (leaving.size === 0 && added.length === 0) return { agent, streamTexts };
  return {
    agent: {
      ...agent,
      agenda: [...kept, ...added],
      nextAgendaNumber: agent.nextAgendaNumber + added.length,
      agendaRevision: agent.agendaRevision + 1,
    },
    streamTexts,
  };
}

/** Items whose hour begins on this tick and whose reminder hasn't fired yet. */
export function findDueReminders(
  agenda: readonly AgendaItem[],
  tick: number,
  firedNumbers: readonly number[],
): AgendaItem[] {
  const time = toSimTime(tick, config.clock);
  if (time.minute >= config.clock.minutesPerTick) return [];
  return agenda.filter((item) => item.hour === time.hour && !firedNumbers.includes(item.number));
}

/** Why an item's hour gives a decision: "it is 7:00 pm: dice at the tavern". */
export function describeReminderReason(item: AgendaItem): string {
  return fillText(config.agenda.reminderReasonText, {
    time: describeHour(item.hour ?? 0),
    item: item.text,
  });
}

/** What a sleeper finds on waking for an item whose hour came while it slept. */
export function describeMissedReminder(item: AgendaItem): string {
  return fillText(config.agenda.missedText, { item: item.text });
}
