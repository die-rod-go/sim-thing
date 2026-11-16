import {
  formatTimeOfDay,
  toSimTime,
  type SimTimeSettings,
  type WorldEvent,
  type WorldEventKind,
} from "@village/shared";

export type EventCategory = "speech" | "action" | "movement" | "sleep" | "exchange";

export const EVENT_CATEGORIES: readonly EventCategory[] = [
  "speech",
  "action",
  "exchange",
  "movement",
  "sleep",
];

const CATEGORY_BY_KIND: Record<WorldEventKind, EventCategory> = {
  said: "speech",
  walk_started: "movement",
  arrived: "movement",
  action_started: "action",
  action_finished: "action",
  action_failed: "action",
  offered: "exchange",
  gave: "exchange",
  declined: "exchange",
  fell_asleep: "sleep",
  woke: "sleep",
  died: "action",
  attacked: "action",
  missed: "action",
  hurt: "action",
  announced: "action",
  sound: "action",
  vanished: "movement",
  appeared: "movement",
};

/** The viewer sees everything, so a failed action reads with the actor's real reason. */
export function describeEventForViewer(event: WorldEvent): string {
  if (event.kind === "action_failed") return event.actorDescription ?? event.description;
  return event.description;
}

export function categorizeEvent(event: WorldEvent): EventCategory {
  return CATEGORY_BY_KIND[event.kind];
}

export interface EventFilter {
  agentId: string | null;
  place: string | null;
  /** Categories to show; null shows all. */
  categories?: ReadonlySet<EventCategory> | null;
}

/** Events involving the agent (as actor or target) at the place, newest first. */
export function filterEvents(events: WorldEvent[], filter: EventFilter): WorldEvent[] {
  return events
    .filter((event) => {
      const involvesAgent =
        filter.agentId === null ||
        event.actorId === filter.agentId ||
        event.targetId === filter.agentId;
      const isAtPlace = filter.place === null || event.place === filter.place;
      const isShownCategory = !filter.categories || filter.categories.has(categorizeEvent(event));
      return involvesAgent && isAtPlace && isShownCategory;
    })
    .reverse();
}

export function listEventPlaces(events: WorldEvent[]): string[] {
  return [...new Set(events.map((event) => event.place))].sort();
}

export interface EventHourGroup {
  /** e.g. "Day 2 · 14:00" */
  label: string;
  events: WorldEvent[];
}

/** Splits an already-ordered list into runs that share a sim day and hour. */
export function groupEventsByHour(
  events: WorldEvent[],
  timeSettings: SimTimeSettings,
): EventHourGroup[] {
  const groups: EventHourGroup[] = [];
  for (const event of events) {
    const time = toSimTime(event.tick, timeSettings);
    const label = `Day ${time.day} · ${formatTimeOfDay({ hour: time.hour, minute: 0 })}`;
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.label === label) lastGroup.events.push(event);
    else groups.push({ label, events: [event] });
  }
  return groups;
}

export const CATEGORY_GLYPHS: Record<EventCategory, string> = {
  speech: "“",
  action: "⚒",
  exchange: "⇄",
  movement: "→",
  sleep: "☾",
};
