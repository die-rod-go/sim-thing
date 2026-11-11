import type { Awareness, AwarenessVia, Position, WorldEvent } from "@village/shared";
import { config } from "../config";
import { canSee } from "./sight";
import type { PerceivedEvent, PerceiverAwareness, PerceptionWorld, Perceiver } from "./types";

export interface ObservedAgent {
  agentId: string;
  pos: Position;
  place: string;
  doing: string;
}

/** Breaks same-tick ties: seeing someone says more than hearing them. */
const VIA_RANK: Record<AwarenessVia, number> = { saw: 2, heard: 1, heard_muffled: 0 };

/** Awareness entries for every other agent the observer can see this tick. */
export function observeAgents(
  world: PerceptionWorld,
  observer: Perceiver,
  others: ObservedAgent[],
  tick: number,
): Awareness[] {
  if (observer.isAsleep) return [];
  return others
    .filter((other) => other.agentId !== observer.agentId)
    .filter((other) => canSee(world, observer.pos, other.pos, config.perception.sightRangeTiles))
    .map((other) => ({
      agentId: other.agentId,
      tick,
      via: "saw",
      place: other.place,
      doing: other.doing,
    }));
}

function describeHeardActivity(event: WorldEvent): string {
  return event.speech === undefined ? event.description : "talking";
}

/** Awareness of the actor for each perceiver who heard the event without seeing it. */
export function awarenessFromPerceptions(perceivedEvent: PerceivedEvent): PerceiverAwareness[] {
  const { event, perceptions } = perceivedEvent;
  if (event.isActorThing === true) return [];
  return perceptions
    .filter((perception) => perception.agentId !== event.actorId)
    .flatMap((perception) => {
      if (perception.via !== "heard" && perception.via !== "heard_muffled") return [];
      const awareness: Awareness = {
        agentId: event.actorId,
        tick: event.tick,
        via: perception.via,
        place: event.place,
        doing: describeHeardActivity(event),
      };
      return [{ perceiverId: perception.agentId, awareness }];
    });
}

function isNewerAwareness(candidate: Awareness, existing: Awareness | undefined): boolean {
  if (existing === undefined || candidate.tick > existing.tick) return true;
  return candidate.tick === existing.tick && VIA_RANK[candidate.via] >= VIA_RANK[existing.via];
}

/** Returns a new record where, per agent, the newest entry wins. */
export function mergeAwareness(
  record: Readonly<Record<string, Awareness>>,
  entries: readonly Awareness[],
): Record<string, Awareness> {
  const merged: Record<string, Awareness> = { ...record };
  for (const entry of entries) {
    if (isNewerAwareness(entry, merged[entry.agentId])) merged[entry.agentId] = entry;
  }
  return merged;
}

/** Entries perceived within the window, newest first; older entries stay in the record. */
export function selectRecentAwareness(
  record: Readonly<Record<string, Awareness>>,
  tick: number,
  windowMinutes: number,
  minutesPerTick: number,
): Awareness[] {
  return Object.values(record)
    .filter((entry) => (tick - entry.tick) * minutesPerTick <= windowMinutes)
    .sort((first, second) => second.tick - first.tick);
}
