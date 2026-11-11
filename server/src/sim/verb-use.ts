import {
  findCarrierId,
  findDefinition,
  listDefinitionSubjects,
  matchesRule,
  type Entity,
  type RuleSubject,
  type Verb,
} from "@village/shared";
import { config } from "../config";
import { describeEntityName, findEntityIfPresent, isHeldByOther } from "../items/entity-store";
import {
  buildEntitySubject,
  findVerbByName,
  listItemlessVerbs,
  listVerbsForBody,
  listVerbsForEntity,
  normalizeVerbName,
} from "../items/verb-offers";
import { isDead } from "../status/health";
import type { UsedThing, VerbRun } from "./agent-runtime";
import { describeAgentAsSeen, findAgent } from "./world-access";
import type { WorldState } from "./world-state";

export interface ResolvedUse {
  verb: Verb;
  entity: Entity | null;
  /** The dead agent whose body is used, for taking from it. */
  bodyId?: string;
  name: string;
}

function describeUnknownVerb(state: WorldState, entity: Entity | null, verbName: string): string {
  if (entity === null) return `I don't know how to '${verbName}'`;
  const name = describeEntityName(state, entity);
  return findCarrierId(entity) !== null
    ? `I can't '${verbName}' ${name}`
    : `The ${name} doesn't do '${verbName}'`;
}

/** A body offers what its rule gives a dead agent; nobody can take from someone alive. */
function resolveBodyUse(
  state: WorldState,
  bodyId: string,
  verbName: string,
): ResolvedUse | { failure: string; name: string } {
  const holder = findAgent(state, bodyId);
  const name = describeAgentAsSeen(holder);
  if (!isDead(holder)) {
    return { failure: config.verbs.livingHolderReason.split("{name}").join(holder.name), name };
  }
  const verb = findVerbByName(listVerbsForBody(state, holder), verbName);
  return verb
    ? { verb, entity: null, bodyId, name }
    : { failure: `I can't '${verbName}' ${name}`, name };
}

export function resolveUse(
  state: WorldState,
  agentId: string,
  used: UsedThing,
  verbName: string,
): ResolvedUse | { failure: string; name: string } {
  if (used.kind === "user") {
    const verb = findVerbByName(listItemlessVerbs(state, findAgent(state, agentId)), verbName);
    return verb
      ? { verb, entity: null, name: "" }
      : { failure: `I don't know how to '${verbName}'`, name: "" };
  }
  if (used.kind === "body") return resolveBodyUse(state, used.agentId, verbName);
  const entity = findEntityIfPresent(state, used.entityId);
  if (!entity) return { failure: "it was gone", name: "it" };
  const name = describeEntityName(state, entity);
  if (isHeldByOther(entity, agentId)) return { failure: "someone got to it first", name };
  const verb = findVerbByName(listVerbsForEntity(state, agentId, entity), verbName);
  return verb
    ? { verb, entity, name }
    : { failure: describeUnknownVerb(state, entity, verbName), name };
}

/**
 * The running verb, found again by name. When several verbs share the name (the general `eat` and
 * a poisoned one), the one whose rule matches what was used wins: the thing as it is now, or an
 * untouched one of its definition, since a `start` effect may have changed or used it up.
 */
export function findRunVerb(state: WorldState, run: VerbRun): Verb | undefined {
  const sameName = state.items.verbs.filter(
    (verb) => normalizeVerbName(verb.name) === normalizeVerbName(run.verb),
  );
  if (sameName.length <= 1) return sameName[0];
  const offered = listOfferedVerbs(state, run);
  return sameName.find((verb) => offered.includes(verb)) ?? sameName[0];
}

function listOfferedVerbs(state: WorldState, run: VerbRun): Verb[] {
  if (run.usedBodyId !== undefined)
    return listVerbsForBody(state, findAgent(state, run.usedBodyId));
  if (run.usedDefinitionId === null) {
    return listItemlessVerbs(state, findAgent(state, run.agentId));
  }
  const entity =
    run.usedEntityId === null ? undefined : findEntityIfPresent(state, run.usedEntityId);
  const subjects: RuleSubject[] = [
    ...(entity ? [buildEntitySubject(state, run.agentId, entity)] : []),
    ...listDefinitionSubjects(state.items.file, findDefinition(state.items, run.usedDefinitionId)),
  ].filter((subject): subject is RuleSubject => subject !== null);
  return state.items.verbs.filter((verb) =>
    subjects.some((subject) => matchesRule(verb.appliesTo, subject)),
  );
}
