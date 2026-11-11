import type { Agent, Entity } from "@village/shared";
import { config } from "../config";
import { computeChebyshevDistance } from "../economy/give";
import {
  findEntityIfPresent,
  isHeldBy,
  listContents,
  listHeldEntities,
  listTileEntitiesAt,
} from "../items/entity-store";
import { locateThing, readThingId, refThingById, type ThingRef } from "../items/things";
import { hidesContents } from "../items/world-physics";
import { isDead } from "../status/health";
import { getAgentRuntime } from "./agent-runtime";
import { findAgent } from "./world-access";
import type { WorldState } from "./world-state";

/** Something found inside a holder the agent can see into. */
export interface SeenInside {
  entity: Entity;
  holder: ThingRef;
}

function isWithinContentsReach(state: WorldState, agentId: string, thing: ThingRef): boolean {
  const position = locateThing(state, thing);
  if (position === null) return false;
  const distance = computeChebyshevDistance(findAgent(state, agentId).pos, position.pos);
  return distance <= config.perception.contentsReachTiles;
}

/**
 * Whether the agent sees what is directly inside the thing: it is the agent's own body, or the
 * agent holds it or stands close to it, and the world's `contentsHiddenBy` doesn't match it. Every
 * holder on the way down must pass the same test.
 */
export function canSeeInto(state: WorldState, agentId: string, thing: ThingRef): boolean {
  if (thing.kind === "agent" && thing.agentId === agentId) return true;
  if (hidesContents(state, thing)) return false;
  if (thing.kind === "entity") {
    const entity = findEntityIfPresent(state, thing.entityId);
    if (!entity) return false;
    if (isHeldBy(entity, agentId)) return true;
    if (entity.location.kind === "inside") {
      const outer = refThingById(entity.location.holderId);
      if (!canSeeInto(state, agentId, outer)) return false;
    }
  }
  return isWithinContentsReach(state, agentId, thing);
}

/** What is directly inside the thing, when the agent can see in; empty otherwise. */
export function listVisibleContents(state: WorldState, agentId: string, thing: ThingRef): Entity[] {
  return canSeeInto(state, agentId, thing) ? listContents(state, readThingId(thing)) : [];
}

/** Everything the agent can see inside the thing, nested holders included. */
export function listSeenInside(state: WorldState, agentId: string, holder: ThingRef): SeenInside[] {
  return listVisibleContents(state, agentId, holder).flatMap((entity) => [
    { entity, holder },
    ...listSeenInside(state, agentId, { kind: "entity", entityId: entity.id }),
  ]);
}

/** Dead agents the agent can see. */
export function listVisibleBodies(state: WorldState, agentId: string): Agent[] {
  const visibleIds = new Set(getAgentRuntime(state, agentId).visibleAgentIds);
  return state.agents.filter((other) => visibleIds.has(other.id) && isDead(other));
}

function listSeenHolders(state: WorldState, agentId: string): ThingRef[] {
  const agent = findAgent(state, agentId);
  return [...listHeldEntities(state, agentId), ...listTileEntitiesAt(state, agent.place)]
    .map((entity): ThingRef => ({ kind: "entity", entityId: entity.id }))
    .concat(
      listVisibleBodies(state, agentId).map((body): ThingRef => ({
        kind: "agent",
        agentId: body.id,
      })),
    );
}

function computeDistanceTo(state: WorldState, agentId: string, thing: ThingRef): number {
  const position = locateThing(state, thing);
  if (position === null) return Number.POSITIVE_INFINITY;
  return computeChebyshevDistance(findAgent(state, agentId).pos, position.pos);
}

/**
 * Everything the agent can see inside things around it (held, here, bodies in sight), nearest
 * holder first.
 */
export function listAllSeenInside(state: WorldState, agentId: string): SeenInside[] {
  return listSeenHolders(state, agentId)
    .map((holder) => ({ holder, distance: computeDistanceTo(state, agentId, holder) }))
    .sort((first, second) => first.distance - second.distance)
    .flatMap(({ holder }) => listSeenInside(state, agentId, holder));
}
