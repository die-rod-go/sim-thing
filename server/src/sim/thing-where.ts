import { isBodyInWorld, type ThingView, type ThingWhere } from "@village/shared";
import { config } from "../config";
import { computeChebyshevDistance } from "../economy/give";
import { findEntityIfPresent, isHeldBy } from "../items/entity-store";
import { locateThing, viewThing, type ThingRef } from "../items/things";
import { canSee } from "../perception/sight";
import { locateUser } from "./verb-user";
import { buildPerceptionWorld } from "./world-access";
import type { WorldState } from "./world-state";

/*
 * Where a thing is relative to whoever does a verb (an agent or a creature), and whether they can
 * see and reach it:
 * what a verb's `appliesTo` and `target` matchers and its roles are checked against.
 */

/**
 * `held` (directly inside the user), `here` (on a tile, or another agent's body that nothing
 * holds), `inside` (inside something other than the user), `self` (the user's own body, or the
 * creature itself); null when gone.
 */
export function findThingWhere(
  state: WorldState,
  userId: string,
  thing: ThingRef,
): ThingWhere | null {
  if (thing.kind === "agent") {
    const agent = state.agents.find((candidate) => candidate.id === thing.agentId);
    if (!agent || !isBodyInWorld(agent)) return null;
    if (agent.id === userId) return "self";
    if (agent.bodyHolderId === null) return "here";
    return agent.bodyHolderId === userId ? "held" : "inside";
  }
  const entity = findEntityIfPresent(state, thing.entityId);
  if (!entity) return null;
  if (entity.id === userId) return "self";
  if (entity.location.kind === "tile") return "here";
  return isHeldBy(entity, userId) ? "held" : "inside";
}

/** The thing as a verb's matchers see it from the user; null when it no longer exists. */
export function viewThingFrom(
  state: WorldState,
  userId: string,
  thing: ThingRef,
): ThingView | null {
  const view = viewThing(state, thing);
  const where = findThingWhere(state, userId, thing);
  return view === null || where === null ? null : { ...view, where };
}

/** Whether the user can see where the thing is; what it holds and its own body always are. */
export function isThingInSight(state: WorldState, userId: string, thing: ThingRef): boolean {
  const where = findThingWhere(state, userId, thing);
  if (where === "held" || where === "self") return true;
  const position = locateThing(state, thing);
  if (position === null) return false;
  return canSee(
    buildPerceptionWorld(state),
    locateUser(state, userId),
    position.pos,
    config.perception.sightRangeTiles,
  );
}

/** Held things and the user's own body are always in reach; anything else within `reachTiles`. */
export function isThingInReach(
  state: WorldState,
  userId: string,
  thing: ThingRef,
  reachTiles: number,
): boolean {
  const where = findThingWhere(state, userId, thing);
  if (where === "held" || where === "self") return true;
  const position = locateThing(state, thing);
  if (position === null) return false;
  return computeChebyshevDistance(locateUser(state, userId), position.pos) <= reachTiles;
}
