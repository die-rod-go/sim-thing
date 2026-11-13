import { compareEntityAge, type Entity } from "@village/shared";
import { computeChebyshevDistance } from "../economy/give";
import { resolveName } from "../decision/resolve-name";
import { isEntityNamed, listContents, listHeldEntities } from "../items/entity-store";
import { readThingId, type ThingRef } from "../items/things";
import { canSeeInto } from "../items/world-physics";
import { listHereEntities } from "./here-entities";
import { listAllSeenInside } from "./reachable-contents";
import { describeTargetName } from "./verb-target";
import { findAgent, listOthersAsSeen } from "./world-access";
import type { WorldState } from "./world-state";

/** An entity the reply might mean as the verb's item, and what it would be taken from. */
export interface ItemCandidate {
  entity: Entity;
  from: ThingRef | null;
}

export type ItemCandidates =
  { kind: "found"; candidates: ItemCandidate[] } | { kind: "failed"; reason: string };

function listHeld(state: WorldState, agentId: string, name: string | undefined): Entity[] {
  return listHeldEntities(state, agentId)
    .filter((entity) => name === undefined || isEntityNamed(state, entity, name))
    .sort(compareEntityAge);
}

/** Entities at the agent's place that answer to the name (or all of them), nearest first. */
export function listHereNearestFirst(state: WorldState, agentId: string, name?: string): Entity[] {
  const agent = findAgent(state, agentId);
  const { pos } = agent;
  return listHereEntities(state, agent)
    .filter((entity) => name === undefined || isEntityNamed(state, entity, name))
    .map((entity) => ({
      entity,
      distance:
        entity.location.kind === "tile"
          ? computeChebyshevDistance(pos, entity.location.pos)
          : Number.POSITIVE_INFINITY,
    }))
    .sort(
      (first, second) =>
        first.distance - second.distance || compareEntityAge(first.entity, second.entity),
    )
    .map(({ entity }) => entity);
}

function findHolderByName(state: WorldState, agentId: string, fromName: string): ThingRef | null {
  const holderAgentId = resolveName(fromName, listOthersAsSeen(state, agentId));
  if (holderAgentId !== null) return { kind: "agent", agentId: holderAgentId };
  const nested = listAllSeenInside(state, agentId)
    .map(({ entity }) => entity)
    .filter((entity) => isEntityNamed(state, entity, fromName));
  const [entity] = [
    ...listHeld(state, agentId, fromName),
    ...listHereNearestFirst(state, agentId, fromName),
    ...nested,
  ];
  return entity ? { kind: "entity", entityId: entity.id } : null;
}

function listFromHolder(
  state: WorldState,
  agentId: string,
  itemName: string,
  fromName: string,
): ItemCandidates {
  const holder = findHolderByName(state, agentId, fromName);
  if (holder === null) return { kind: "failed", reason: `there was no ${fromName} here` };
  if (!canSeeInto(state, agentId, holder)) {
    const holderName = describeTargetName(state, agentId, holder);
    return { kind: "failed", reason: `I can't see what ${holderName} carries` };
  }
  const candidates = listContents(state, readThingId(holder))
    .filter((entity) => isEntityNamed(state, entity, itemName))
    .sort(compareEntityAge)
    .map((entity) => ({ entity, from: holder }));
  return { kind: "found", candidates };
}

/**
 * Everything the reply might mean as the verb's item, best first: what is carried (oldest first),
 * what is at the agent's place (nearest first), then what is inside things the agent can see into
 * (nearest holder first). With `fromName`, only what is directly inside that holder.
 */
export function listItemCandidates(
  state: WorldState,
  agentId: string,
  itemName: string,
  fromName?: string,
): ItemCandidates {
  if (fromName !== undefined) return listFromHolder(state, agentId, itemName, fromName);
  const toCandidate = (entity: Entity): ItemCandidate => ({ entity, from: null });
  const inside = listAllSeenInside(state, agentId)
    .filter(({ entity }) => isEntityNamed(state, entity, itemName))
    .map(({ entity, holder }) => ({ entity, from: holder }));
  return {
    kind: "found",
    candidates: [
      ...listHeld(state, agentId, itemName).map(toCandidate),
      ...listHereNearestFirst(state, agentId, itemName).map(toCandidate),
      ...inside,
    ],
  };
}
