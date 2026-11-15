import { isBodyInWorld, type Agent, type Entity, type Position } from "@village/shared";
import { config } from "../../config";
import { computeChebyshevDistance } from "../../economy/give";
import { findEntityIfPresent } from "../../items/entity-store";
import { listThingsWithin, locateThing, type ThingRef } from "../../items/things";
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

/** Bodies and things on tiles; what is carried or put away can't be seen. */
function isOutInTheOpen(state: WorldState, thing: ThingRef): boolean {
  if (thing.kind === "agent") {
    return state.agents.some((agent) => agent.id === thing.agentId && isBodyInWorld(agent));
  }
  return findEntityIfPresent(state, thing.entityId)?.location.kind === "tile";
}

/** What the creature can see from where it stands, nearest first, not counting itself. */
export function listSeenThings(
  state: WorldState,
  world: PerceptionWorld,
  creature: Entity,
): SeenThing[] {
  if (creature.location.kind !== "tile") return [];
  const origin = { place: creature.location.place, pos: creature.location.pos };
  const range = config.creatures.sightRangeTiles;
  const seen: SeenThing[] = [];
  for (const thing of listThingsWithin(state, origin, range)) {
    if (thing.kind === "entity" && thing.entityId === creature.id) continue;
    if (!isOutInTheOpen(state, thing)) continue;
    const position = locateThing(state, thing);
    if (position === null || !canSee(world, origin.pos, position.pos, range)) continue;
    const distance = computeChebyshevDistance(origin.pos, position.pos);
    seen.push({ thing, pos: position.pos, distance });
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
