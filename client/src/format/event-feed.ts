import {
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
  gave: "exchange",
  posted_note: "exchange",
  fell_asleep: "sleep",
  woke: "sleep",
  died: "action",
  attacked: "action",
  missed: "action",
  hurt: "action",
  broke: "action",
  caught_fire: "action",
  stopped_burning: "action",
  condition_started: "action",
  condition_ended: "action",
  sound: "action",
};

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
    const label = `Day ${time.day} · ${String(time.hour).padStart(2, "0")}:00`;
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
