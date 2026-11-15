import { isBodyInWorld, type Agent, type Entity, type Position } from "@village/shared";
import { config } from "../../config";
import { computeChebyshevDistance } from "../../economy/give";
import { locateThing, type ThingRef } from "../../items/things";
import { canSee } from "../../perception/sight";
import type { PerceptionWorld } from "../../perception/types";
import { isAsleep } from "../../economy/sleep";
import { isDead } from "../../status/health";
import type { WorldState } from "../world-state";

/** A thing a creature sees, and how far off it is. */
export interface SeenThing {
  thing: ThingRef;
  pos: Position;
  distance: number;
}

/** Bodies and things on tiles, each where it is; what is carried or put away can't be seen. */
function listThingsInTheOpen(state: WorldState): { thing: ThingRef; pos: Position }[] {
  const bodies = state.agents
    .filter(isBodyInWorld)
    .map((agent) => ({ thing: { kind: "agent", agentId: agent.id } as const, pos: agent.pos }));
  const onTiles = state.entities.flatMap((entity) =>
    entity.location.kind === "tile"
      ? [{ thing: { kind: "entity", entityId: entity.id } as const, pos: entity.location.pos }]
      : [],
  );
  return [...bodies, ...onTiles];
}

/** What the creature can see within `range` tiles of where it stands, nearest first, not counting itself. */
export function listSeenThings(
  state: WorldState,
  world: PerceptionWorld,
  creature: Entity,
  range: number,
): SeenThing[] {
  if (creature.location.kind !== "tile") return [];
  const origin = creature.location.pos;
  const seen: SeenThing[] = [];
  for (const { thing, pos } of listThingsInTheOpen(state)) {
    if (thing.kind === "entity" && thing.entityId === creature.id) continue;
    const distance = computeChebyshevDistance(origin, pos);
    if (distance > range || !canSee(world, origin, pos, range)) continue;
    seen.push({ thing, pos, distance });
  }
  return seen.sort((first, second) => first.distance - second.distance);
}

/** The creatures the agent can see right now, in entity order; a sleeper or the dead see none. */
export function listVisibleCreatureIds(
  state: WorldState,
  world: PerceptionWorld,
  viewer: Agent,
  creatures: readonly Entity[],
): string[] {
  if (isAsleep(viewer) || isDead(viewer)) return [];
  const range = config.perception.sightRangeTiles;
  return creatures
    .filter((creature) => {
      const position = locateThing(state, { kind: "entity", entityId: creature.id });
      return position !== null && canSee(world, viewer.pos, position.pos, range);
    })
    .map((creature) => creature.id);
}
