import type { Agent, Entity } from "@village/shared";
import { computeChebyshevDistance } from "../economy/give";
import { listContents, listHeldEntities, listTileEntitiesAt } from "../items/entity-store";
import { locateThing, readThingId, type ThingRef } from "../items/things";
import { canSeeInto } from "../items/world-physics";
import { isDead } from "../status/health";
import { getAgentRuntime } from "./agent-runtime";
import { findAgent } from "./world-access";
import type { WorldState } from "./world-state";

/** Something found inside a holder the agent can see into. */
export interface SeenInside {
  entity: Entity;
  holder: ThingRef;
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
