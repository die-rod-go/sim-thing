import type { Verb } from "@village/shared";
import { computeChebyshevDistance } from "../economy/give";
import {
  describeEntityName,
  findEntityIfPresent,
  resolveEntityPosition,
} from "../items/entity-store";
import { findVerbByName, listItemlessVerbs, listVerbsForEntity } from "../items/verb-offers";
import { describeAttempt } from "./action-phrases";
import type { PendingVerb, UsedThing, VerbAim, WalkDestination } from "./agent-runtime";
import { failAction } from "./failure";
import type { TickContext } from "./tick-context";
import { computeVerbReach, findAimProblem, isAimInReach, resolveAim } from "./verb-aim";
import { startVerbNow } from "./verb-runner";
import { startWalk } from "./walking";
import { findAgent } from "./world-access";
import type { WorldState } from "./world-state";

interface UsedVerb {
  verb: Verb;
  usedName: string;
  usedEntityId: string | null;
  usedDefinitionId: string | null;
}

/** The verb as what is used offers it; null when it doesn't, which the verb runner reports. */
function findUsedVerb(
  state: WorldState,
  agentId: string,
  used: UsedThing,
  verbName: string,
): UsedVerb | null {
  if (used.kind === "user") {
    const verb = findVerbByName(listItemlessVerbs(state), verbName);
    return verb ? { verb, usedName: "", usedEntityId: null, usedDefinitionId: null } : null;
  }
  const entity = findEntityIfPresent(state, used.entityId);
  if (!entity) return null;
  const verb = findVerbByName(listVerbsForEntity(state, agentId, entity), verbName);
  if (!verb) return null;
  return {
    verb,
    usedName: describeEntityName(state, entity),
    usedEntityId: entity.id,
    usedDefinitionId: entity.definitionId,
  };
}

function describeAimDestination(aim: VerbAim): WalkDestination {
  return aim.kind === "agent"
    ? { kind: "agent", agentId: aim.agentId }
    : { kind: "entity", entityId: aim.entityId };
}

/** A verb with no target is used where its thing is: at once if in reach, after a walk otherwise. */
function startOrWalkToUsed(
  context: TickContext,
  agentId: string,
  found: UsedVerb,
  request: PendingVerb,
): void {
  const { state } = context;
  const entity =
    found.usedEntityId === null ? undefined : findEntityIfPresent(state, found.usedEntityId);
  const position = entity ? resolveEntityPosition(state, entity) : null;
  const used: UsedThing =
    found.usedEntityId === null
      ? { kind: "user" }
      : { kind: "entity", entityId: found.usedEntityId };
  const reach = computeVerbReach(state, found.verb, found.usedDefinitionId);
  const agent = findAgent(state, agentId);
  const isInReach =
    !entity ||
    !position ||
    entity.location.kind !== "tile" ||
    computeChebyshevDistance(agent.pos, position.pos) <= reach;
  if (isInReach || !entity) {
    startVerbNow(context, agentId, used, request);
    return;
  }
  startWalk(context, agentId, { kind: "entity", entityId: entity.id }, request);
}

/**
 * Applies an interact once what is used is known: everything is checked again, since the reply
 * was asked for a few ticks ago. An aimed verb starts at once when its target is alive, in sight
 * and in reach; out of reach, the agent walks there first (following someone who moves).
 */
export function startOrApproachVerb(
  context: TickContext,
  agentId: string,
  used: UsedThing,
  request: PendingVerb,
  targetName: string | undefined,
): void {
  const { state, result } = context;
  const found = findUsedVerb(state, agentId, used, request.verb);
  if (!found) {
    startVerbNow(context, agentId, used, request);
    return;
  }
  const { verb } = found;
  if (verb.target === "none") {
    startOrWalkToUsed(context, agentId, found, request);
    return;
  }
  const attempt = describeAttempt(state.items, verb.name, {
    item: found.usedName,
    target: targetName,
  });
  const resolution = resolveAim(state, agentId, verb, targetName ?? "", found.usedEntityId);
  if ("failure" in resolution) {
    failAction(state, result, agentId, attempt, resolution.failure);
    return;
  }
  const { aim } = resolution;
  const problem = findAimProblem(state, agentId, aim);
  if (problem !== null) {
    failAction(state, result, agentId, attempt, problem);
    return;
  }
  const aimedRequest: PendingVerb = { ...request, used, aim };
  const reach = computeVerbReach(state, verb, found.usedDefinitionId);
  if (isAimInReach(state, agentId, aim, reach)) {
    startVerbNow(context, agentId, used, aimedRequest);
    return;
  }
  startWalk(context, agentId, describeAimDestination(aim), aimedRequest);
}
