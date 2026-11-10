import type { WorldEvent } from "@village/shared";

export interface EventFilter {
  agentId: string | null;
  place: string | null;
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
      return involvesAgent && isAtPlace;
    })
    .reverse();
}

export function listEventPlaces(events: WorldEvent[]): string[] {
  return [...new Set(events.map((event) => event.place))].sort();
}

/** One feed line: the description already starts with a verb, so prefix the actor's name. */
export function describeEvent(event: WorldEvent): string {
  return `${event.actorName} ${event.description}`;
}
