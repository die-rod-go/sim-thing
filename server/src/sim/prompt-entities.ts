import { matchesThing, type Agent, type Entity, type Verb } from "@village/shared";
import { config } from "../config";
import type { PromptEntityGroup, ValidItem } from "../decision/context";
import { describeEntityName, getDefinition, listHeldEntities } from "../items/entity-store";
import type { ThingRef } from "../items/things";
import { canSeeInto, isShownWhenCarried } from "../items/world-physics";
import { listItemlessVerbs, listVerbsForEntity } from "../items/verb-offers";
import { listHereEntities } from "./here-entities";
import { describeBodyForPrompt, groupEntitiesForPrompt } from "./prompt-lines";
import { listAllSeenInside, listVisibleBodies, listVisibleContents } from "./reachable-contents";
import { viewThingFrom } from "./thing-where";
import { describeAgentAsSeen } from "./world-access";
import type { WorldState } from "./world-state";

function entityThing(entity: Entity): ThingRef {
  return { kind: "entity", entityId: entity.id };
}

/** What is at the agent's place, as `listHereEntities` sees it. */
export function listNearbyEntities(state: WorldState, agent: Agent): Entity[] {
  return listHereEntities(state, agent);
}

/** Here: what is at the agent's place, then every dead body in sight. */
export function buildHere(state: WorldState, agent: Agent): PromptEntityGroup[] {
  return [
    ...groupEntitiesForPrompt(state, agent.id, listNearbyEntities(state, agent)),
    ...listVisibleBodies(state, agent.id).map((body) =>
      describeBodyForPrompt(state, agent.id, body),
    ),
  ];
}

export function buildBelongings(state: WorldState, agent: Agent): PromptEntityGroup[] {
  return groupEntitiesForPrompt(state, agent.id, listHeldEntities(state, agent.id));
}

export function listItemlessVerbNames(state: WorldState): string[] {
  return [...new Set(listItemlessVerbs(state).map((verb) => verb.name))];
}

/** The names prompts use for nearby entities, each once: what `target` may name. */
export function listNearbyEntityNames(state: WorldState, agent: Agent): string[] {
  return [
    ...new Set(listNearbyEntities(state, agent).map((entity) => describeEntityName(state, entity))),
  ];
}

/** Every verb the agent could use right now: with what it carries, here, or bare-handed. */
function listAvailableVerbs(state: WorldState, agent: Agent): Verb[] {
  const things = [...listHeldEntities(state, agent.id), ...listNearbyEntities(state, agent)];
  return [
    ...things.flatMap((entity) => listVerbsForEntity(state, agent.id, entity)),
    ...listItemlessVerbs(state),
  ];
}

function toValidItems(state: WorldState, entities: readonly Entity[]): ValidItem[] {
  const definitions = new Map(
    entities.map((entity) => {
      const definition = getDefinition(state, entity);
      return [definition.id, definition] as const;
    }),
  );
  return [...definitions.values()].map((definition) =>
    definition.plural === undefined
      ? { name: definition.name }
      : { name: definition.name, plural: definition.plural },
  );
}

/**
 * Targets only an aimed verb takes: "yourself" when some verb's target fits the user's own body,
 * and the carried things some verb's target fits.
 */
export function listAimOnlyTargets(state: WorldState, agent: Agent): string[] {
  const matchers = listAvailableVerbs(state, agent).flatMap((verb) =>
    verb.target === undefined ? [] : [verb.target],
  );
  const isSelfAimable = matchers.some((matcher) => {
    const view = viewThingFrom(state, agent.id, { kind: "agent", agentId: agent.id });
    return view !== null && matchesThing(matcher, view);
  });
  const aimable = listHeldEntities(state, agent.id).filter((entity) => {
    const view = viewThingFrom(state, agent.id, entityThing(entity));
    return view !== null && matchers.some((matcher) => matchesThing(matcher, view));
  });
  const carried = toValidItems(state, aimable).map((item) => item.name);
  return [...(isSelfAimable ? [config.verbs.selfTargetName] : []), ...carried];
}

/** What others see the agent carrying: things whose definition shows when carried ("a knife"). */
export function listVisibleCarried(state: WorldState, agent: Agent): string[] {
  const shown = listHeldEntities(state, agent.id).filter((entity) =>
    isShownWhenCarried(state, entity),
  );
  return groupEntitiesForPrompt(state, agent.id, shown).map((group) => group.text);
}

/**
 * What `item` may name: what the agent carries, what is here, and what is inside things it can see
 * into. A labelled thing goes by its label, any other by its definition's name.
 */
export function listValidItems(state: WorldState, agent: Agent): ValidItem[] {
  const entities = [
    ...listHeldEntities(state, agent.id),
    ...listNearbyEntities(state, agent),
    ...listAllSeenInside(state, agent.id).map(({ entity }) => entity),
  ];
  const unlabelled = toValidItems(
    state,
    entities.filter((entity) => entity.label === null),
  );
  const labelled = entities.flatMap((entity) => (entity.label === null ? [] : [entity.label]));
  const names = new Set<string>();
  return [...unlabelled, ...labelled.map((name) => ({ name }))].filter((item) => {
    if (names.has(item.name)) return false;
    names.add(item.name);
    return true;
  });
}

function hasVisibleContents(state: WorldState, agentId: string, holder: ThingRef): boolean {
  return (
    canSeeInto(state, agentId, holder) && listVisibleContents(state, agentId, holder).length > 0
  );
}

/**
 * What `from` may name: things other than the agent's own body that it can see into and that hold
 * something: carried things, things here, bodies in sight, and holders seen inside those.
 */
export function listValidHolders(state: WorldState, agent: Agent): string[] {
  const entities = [
    ...listHeldEntities(state, agent.id),
    ...listNearbyEntities(state, agent),
    ...listAllSeenInside(state, agent.id).map(({ entity }) => entity),
  ];
  const entityNames = entities
    .filter((entity) => hasVisibleContents(state, agent.id, entityThing(entity)))
    .map((entity) => describeEntityName(state, entity));
  const bodyNames = listVisibleBodies(state, agent.id)
    .filter((body) => hasVisibleContents(state, agent.id, { kind: "agent", agentId: body.id }))
    .map((body) => describeAgentAsSeen(body));
  return [...new Set([...entityNames, ...bodyNames])];
}
