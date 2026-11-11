import { findDefinitionByName, type Entity } from "@village/shared";
import { normalizeDisplayName, resolveName } from "../decision/resolve-name";
import {
  describeEntityName,
  listHeldEntities,
  listTileEntitiesAt,
  type EntityWorld,
} from "../items/entity-store";
import type { ThingRef } from "../items/things";
import type { InteractRequest } from "./agent-runtime";
import {
  canSeeInto,
  listAllSeenInside,
  listSeenInside,
  type SeenInside,
} from "./reachable-contents";
import { findAgent, listOthersAsSeen } from "./world-access";
import type { WorldState } from "./world-state";

/** An entity the reply might mean as the verb's item, and what it would be taken from. */
export interface ItemCandidate {
  entity: Entity;
  from: ThingRef | null;
}

/** Whether the entity answers to the name: its label or name, or (unlabelled) its definition's. */
export function isEntityNamed(world: EntityWorld, entity: Entity, name: string): boolean {
  const wanted = normalizeDisplayName(name);
  if (normalizeDisplayName(describeEntityName(world, entity)) === wanted) return true;
  if (entity.label !== null) return false;
  return findDefinitionByName(world.items, wanted)?.id === entity.definitionId;
}

function listHeld(state: WorldState, agentId: string, name: string | undefined): Entity[] {
  return listHeldEntities(state, agentId).filter(
    (entity) => name === undefined || isEntityNamed(state, entity, name),
  );
}

/** Entities at the agent's place that answer to the name, or all of them without one. */
export function listHere(state: WorldState, agentId: string, name?: string): Entity[] {
  const { place } = findAgent(state, agentId);
  return listTileEntitiesAt(state, place).filter(
    (entity) => name === undefined || isEntityNamed(state, entity, name),
  );
}

/** The holder the reply's `target` names: a body in sight, a thing here, or a thing carried. */
export function findNamedHolder(state: WorldState, agentId: string, name: string): ThingRef | null {
  const holderAgentId = resolveName(name, listOthersAsSeen(state, agentId));
  if (holderAgentId !== null) return { kind: "agent", agentId: holderAgentId };
  const [entity] = [...listHere(state, agentId, name), ...listHeld(state, agentId, name)];
  return entity ? { kind: "entity", entityId: entity.id } : null;
}

function listInside(
  state: WorldState,
  agentId: string,
  itemName: string,
  targetName: string | undefined,
): SeenInside[] {
  const holder = targetName === undefined ? null : findNamedHolder(state, agentId, targetName);
  const seen =
    holder === null ? listAllSeenInside(state, agentId) : listSeenInside(state, agentId, holder);
  return seen.filter(({ entity }) => isEntityNamed(state, entity, itemName));
}

/** The holder the reply's `target` names when nobody can see what it holds, or null. */
export function findHiddenHolder(
  state: WorldState,
  agentId: string,
  request: InteractRequest,
): ThingRef | null {
  if (request.itemName === undefined || request.targetName === undefined) return null;
  const holder = findNamedHolder(state, agentId, request.targetName);
  return holder !== null && !canSeeInto(state, agentId, holder) ? holder : null;
}

/**
 * Everything the reply might mean as the verb's item, best first: what is carried (oldest first),
 * then the thing the `target` names here (a placed oven), then what is inside things the agent can
 * see into. With no `item`, the thing here comes first and then whatever is carried.
 */
export function listItemCandidates(
  state: WorldState,
  agentId: string,
  request: InteractRequest,
): ItemCandidate[] {
  const { itemName, targetName } = request;
  const toCandidate = (entity: Entity): ItemCandidate => ({ entity, from: null });
  if (itemName !== undefined) {
    const placed = targetName === undefined ? [] : listHere(state, agentId, targetName);
    return [
      ...[...listHeld(state, agentId, itemName), ...placed].map(toCandidate),
      ...listInside(state, agentId, itemName, targetName).map(({ entity, holder }) => ({
        entity,
        from: holder,
      })),
    ];
  }
  if (targetName !== undefined) {
    return [...listHere(state, agentId, targetName), ...listHeld(state, agentId, undefined)].map(
      toCandidate,
    );
  }
  return [...listHeld(state, agentId, undefined), ...listHere(state, agentId)].map(toCandidate);
}
