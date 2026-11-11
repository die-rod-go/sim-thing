import { describeCount, type Agent, type Entity, type Verb } from "@village/shared";
import { config } from "../config";
import type { PromptEntityGroup, ValidItem } from "../decision/context";
import {
  describeEntityName,
  getDefinition,
  listHeldEntities,
  listTileEntitiesAt,
} from "../items/entity-store";
import { describeEntityCondition } from "../items/stock";
import { listConditionWords } from "../status/conditions";
import { listItemlessVerbs, listVerbsForEntity } from "../items/verb-offers";
import type { WorldState } from "./world-state";

/** Nothing tells it apart from others of its definition, so it can be counted with them. */
function isStateless(entity: Entity): boolean {
  const { state } = entity;
  return (
    entity.label === null &&
    (state.durability === undefined || state.durability === 1) &&
    state.stock === undefined &&
    state.isOpen === undefined &&
    state.notes === undefined &&
    (state.userIds ?? []).length === 0 &&
    state.conditions.length === 0
  );
}

function groupKey(entity: Entity): string {
  return isStateless(entity) ? `definition:${entity.definitionId}` : `entity:${entity.id}`;
}

/** "closed, on fire": what shows of its state, then its visible conditions. */
function describeSeenState(state: WorldState, entity: Entity): string | null {
  const parts = [
    describeEntityCondition(state, entity),
    ...listConditionWords(state.items, entity.state.conditions, true),
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(", ") : null;
}

function listVerbNames(state: WorldState, agentId: string, entity: Entity): string[] {
  return [...new Set(listVerbsForEntity(state, agentId, entity).map((verb) => verb.name))];
}

/**
 * Entities as a prompt lists them: identical stateless ones counted together ("3 bread"), each
 * with the verbs it offers this agent and what can be seen of its state.
 */
export function groupEntitiesForPrompt(
  state: WorldState,
  agentId: string,
  entities: readonly Entity[],
): PromptEntityGroup[] {
  const groups = new Map<string, Entity[]>();
  for (const entity of entities) {
    const key = groupKey(entity);
    groups.set(key, [...(groups.get(key) ?? []), entity]);
  }
  return [...groups.values()].flatMap((members) => {
    const [first] = members;
    if (!first) return [];
    const text = first.label ?? describeCount(getDefinition(state, first), members.length);
    return [
      {
        text,
        verbs: listVerbNames(state, agentId, first),
        condition: describeSeenState(state, first),
      },
    ];
  });
}

/** What is at the agent's place: placed objects and items on the ground. */
export function listNearbyEntities(state: WorldState, agent: Agent): Entity[] {
  return listTileEntitiesAt(state, agent.place);
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

/**
 * Targets only an aimed verb takes: "yourself" when a verb can be aimed at oneself, and what the
 * agent carries when a verb can be aimed at a thing.
 */
export function listAimOnlyTargets(state: WorldState, agent: Agent): string[] {
  const verbs = listAvailableVerbs(state, agent);
  const canAimAtSelf = verbs.some((verb) => verb.canTargetSelf && verb.target !== "none");
  const canAimAtThings = verbs.some(
    (verb) => verb.target === "entity" || verb.target === "agent_or_entity",
  );
  const carried = canAimAtThings ? listValidItems(state, agent).map((item) => item.name) : [];
  return [...(canAimAtSelf ? [config.verbs.selfTargetName] : []), ...carried];
}

/** What others see the agent carrying: things whose definition shows when carried ("a knife"). */
export function listVisibleCarried(state: WorldState, agent: Agent): string[] {
  const shown = listHeldEntities(state, agent.id).filter(
    (entity) => getDefinition(state, entity).isVisibleWhenCarried,
  );
  return groupEntitiesForPrompt(state, agent.id, shown).map((group) => group.text);
}

/** What the agent carries, by definition: what `item` may name. */
export function listValidItems(state: WorldState, agent: Agent): ValidItem[] {
  const definitions = new Map(
    listHeldEntities(state, agent.id).map((entity) => {
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
