import type { Agent, Entity, Position, Verb } from "@village/shared";
import { computeChebyshevDistance } from "../economy/give";
import { listContents, readContainerCapacity } from "../items/containers";
import { listHeldEntities, resolveEntityPosition } from "../items/entity-store";
import { listVerbsForBody, listVerbsForEntity } from "../items/verb-offers";
import { isDead } from "../status/health";
import { getAgentRuntime } from "./agent-runtime";
import { computeVerbReach } from "./verb-aim";
import { hasChosenEffects } from "./verb-chosen";
import { findAgent } from "./world-access";
import type { WorldState } from "./world-state";

/** The longest reach among verbs that take from or put into the thing (`take`, `put`). */
function findChoosingReach(
  state: WorldState,
  verbs: readonly Verb[],
  definitionId: string | null,
): number | null {
  const reaches = verbs
    .filter(hasChosenEffects)
    .map((verb) => computeVerbReach(state, verb, definitionId));
  return reaches.length > 0 ? Math.max(...reaches) : null;
}

function isWithin(from: Position, to: Position, reach: number | null): boolean {
  return reach !== null && computeChebyshevDistance(from, to) <= reach;
}

/**
 * What a container holds, as the agent can see it: only when the agent carries it or stands within
 * reach of a verb that takes from it. Null for anything else.
 */
export function listReachableContents(
  state: WorldState,
  agentId: string,
  entity: Entity,
): Entity[] | null {
  if (readContainerCapacity(state, entity) === null) return null;
  const { location } = entity;
  const isCarried = location.kind === "inventory" && location.agentId === agentId;
  if (!isCarried) {
    const position = resolveEntityPosition(state, entity);
    const reach = findChoosingReach(
      state,
      listVerbsForEntity(state, agentId, entity),
      entity.definitionId,
    );
    if (!position || !isWithin(findAgent(state, agentId).pos, position.pos, reach)) return null;
  }
  return listContents(state, entity.id);
}

/** Dead agents the agent can see. */
export function listVisibleBodies(state: WorldState, agentId: string): Agent[] {
  const visibleIds = new Set(getAgentRuntime(state, agentId).visibleAgentIds);
  return state.agents.filter((other) => visibleIds.has(other.id) && isDead(other));
}

/** What each body within reach of a verb that takes from it carries, by the body's agent id. */
export function listReachableBodies(state: WorldState, agentId: string): Map<string, Entity[]> {
  const reach = findChoosingReach(state, listVerbsForBody(state), null);
  const viewer = findAgent(state, agentId);
  return new Map(
    listVisibleBodies(state, agentId)
      .filter((body) => isWithin(viewer.pos, body.pos, reach))
      .map((body) => [body.id, listHeldEntities(state, body.id)]),
  );
}
