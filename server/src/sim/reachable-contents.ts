import {
  resolveEntityComponents,
  type Agent,
  type Entity,
  type Position,
  type ResolvedComponents,
  type Verb,
} from "@village/shared";
import { computeChebyshevDistance } from "../economy/give";
import { readContainerCapacity } from "../items/capacity";
import {
  isHeldBy,
  listContents,
  listHeldEntities,
  resolveEntityPosition,
} from "../items/entity-store";
import { listVerbsForBody, listVerbsForEntity } from "../items/verb-offers";
import { isDead } from "../status/health";
import { getAgentRuntime } from "./agent-runtime";
import { computeVerbReach } from "./verb-aim";
import { hasChosenEffects } from "./verb-chosen";
import { findAgent } from "./world-access";
import type { WorldState } from "./world-state";

/** The longest reach among verbs that take from or put into the thing (`take`, `put`). */
function findChoosingReach(verbs: readonly Verb[], used: ResolvedComponents | null): number | null {
  const reaches = verbs.filter(hasChosenEffects).map((verb) => computeVerbReach(verb, used));
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
  if (!isHeldBy(entity, agentId)) {
    const position = resolveEntityPosition(state, entity);
    const reach = findChoosingReach(
      listVerbsForEntity(state, agentId, entity),
      resolveEntityComponents(state.items, entity),
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
  const viewer = findAgent(state, agentId);
  return new Map(
    listVisibleBodies(state, agentId)
      .filter((body) =>
        isWithin(viewer.pos, body.pos, findChoosingReach(listVerbsForBody(state, body), null)),
      )
      .map((body) => [body.id, listHeldEntities(state, body.id)]),
  );
}
