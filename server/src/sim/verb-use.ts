import { findDefinition, listPossibleLocations, type Entity, type Verb } from "@village/shared";
import { config } from "../config";
import { describeEntityName, findEntityIfPresent } from "../items/entity-store";
import {
  findVerbByName,
  listItemlessVerbs,
  listVerbsForBody,
  listVerbsForEntity,
  listVerbsForSubject,
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
  return entity.location.kind === "inventory"
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
  const verb = findVerbByName(listVerbsForBody(state), verbName);
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
    const verb = findVerbByName(listItemlessVerbs(state), verbName);
    return verb
      ? { verb, entity: null, name: "" }
      : { failure: `I don't know how to '${verbName}'`, name: "" };
  }
  if (used.kind === "body") return resolveBodyUse(state, used.agentId, verbName);
  const entity = findEntityIfPresent(state, used.entityId);
  if (!entity) return { failure: "it was gone", name: "it" };
  const name = describeEntityName(state, entity);
  const isHeldByOther = entity.location.kind === "inventory" && entity.location.agentId !== agentId;
  if (isHeldByOther) return { failure: "someone got to it first", name };
  const verb = findVerbByName(listVerbsForEntity(state, agentId, entity), verbName);
  return verb
    ? { verb, entity, name }
    : { failure: describeUnknownVerb(state, entity, verbName), name };
}

/**
 * The running verb, found again by name among the verbs that apply to what was used, so two
 * same-named verbs (the general `eat` and a poisoned one) stay apart.
 */
export function findRunVerb(state: WorldState, run: VerbRun): Verb | undefined {
  if (run.usedBodyId !== undefined) return findVerbByName(listVerbsForBody(state), run.verb);
  if (run.usedDefinitionId === null) return findVerbByName(listItemlessVerbs(state), run.verb);
  const definition = findDefinition(state.items, run.usedDefinitionId);
  const candidates = listPossibleLocations(definition.form).flatMap((location) =>
    listVerbsForSubject(state, { kind: "entity", definition, location }),
  );
  return findVerbByName(candidates, run.verb);
}
