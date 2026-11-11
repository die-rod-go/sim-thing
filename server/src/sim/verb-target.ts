import { matchesThing, type Verb } from "@village/shared";
import { config } from "../config";
import { normalizeDisplayName, resolveName } from "../decision/resolve-name";
import { describeEntityName } from "../items/entity-store";
import type { ThingRef } from "../items/things";
import { listHeldEntities } from "../items/entity-store";
import { listHere, isEntityNamed } from "./verb-candidates";
import { viewThingFrom } from "./thing-where";
import { describeAgentAsSeen, findAgent, listOthersAsSeen } from "./world-access";
import type { WorldState } from "./world-state";

export type TargetResolution =
  { kind: "found"; target: ThingRef; name: string } | { kind: "failed"; reason: string };

function isSelfName(state: WorldState, agentId: string, wanted: string): boolean {
  return (
    wanted === normalizeDisplayName(config.verbs.selfTargetName) ||
    wanted === normalizeDisplayName(findAgent(state, agentId).name)
  );
}

/** "Tobias", "the tavern chest"; aimed at oneself, "themselves" as onlookers hear it. */
export function describeTargetName(state: WorldState, agentId: string, target: ThingRef): string {
  if (target.kind === "agent") {
    return target.agentId === agentId
      ? config.verbs.selfTargetWords.others
      : describeAgentAsSeen(findAgent(state, target.agentId));
  }
  const entity = state.entities.find((candidate) => candidate.id === target.entityId);
  return entity ? `the ${describeEntityName(state, entity)}` : "it";
}

/** What the reply's `target` names: the user itself, another agent in sight, a thing here or carried. */
function findNamedTarget(
  state: WorldState,
  agentId: string,
  targetName: string,
  itemIds: readonly string[],
): ThingRef | null {
  if (isSelfName(state, agentId, normalizeDisplayName(targetName))) {
    return { kind: "agent", agentId };
  }
  const otherId = resolveName(targetName, listOthersAsSeen(state, agentId));
  if (otherId !== null) return { kind: "agent", agentId: otherId };
  const carried = listHeldEntities(state, agentId).filter(
    (entity) => !itemIds.includes(entity.id) && isEntityNamed(state, entity, targetName),
  );
  const [entity] = [...listHere(state, agentId, targetName), ...carried];
  return entity ? { kind: "entity", entityId: entity.id } : null;
}

/**
 * The thing the verb is aimed at, which its `target` matcher must accept. With no target named, the
 * user's own body when that fits ("use the bandage"). Whether it is in sight and reach is checked
 * separately.
 */
export function resolveTarget(
  state: WorldState,
  agentId: string,
  verb: Verb,
  targetName: string | undefined,
  itemIds: readonly string[],
): TargetResolution {
  if (verb.target === undefined) throw new Error(`"${verb.name}" has no target to resolve`);
  const user: ThingRef = { kind: "agent", agentId };
  const target =
    targetName === undefined ? user : findNamedTarget(state, agentId, targetName, itemIds);
  if (target === null) return { kind: "failed", reason: `there was no ${targetName} here` };
  const view = viewThingFrom(state, agentId, target);
  const name = describeTargetName(state, agentId, target);
  if (view === null || !matchesThing(verb.target, view)) {
    if (targetName === undefined) {
      return { kind: "failed", reason: `I didn't say who or what to ${verb.name}` };
    }
    const reason =
      target.kind === "agent" && target.agentId === agentId
        ? `I can't ${verb.name} myself`
        : `I can't ${verb.name} ${name}`;
    return { kind: "failed", reason };
  }
  return { kind: "found", target, name };
}
