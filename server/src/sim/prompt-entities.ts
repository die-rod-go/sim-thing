import {
  describeCount,
  listComponentWords,
  matchesThing,
  resolveEntityComponents,
  type Agent,
  type Entity,
  type Verb,
} from "@village/shared";
import { config } from "../config";
import type { PromptEntityGroup, ValidItem } from "../decision/context";
import {
  describeEntityName,
  getDefinition,
  listHeldEntities,
  listTileEntitiesAt,
} from "../items/entity-store";
import type { ThingRef } from "../items/things";
import { isLyingWhenOnTile, isShownWhenCarried } from "../items/world-physics";
import { listItemlessVerbs, listVerbsForEntity } from "../items/verb-offers";
import { describeItemCounts } from "./action-phrases";
import { listAllSeenInside, listVisibleBodies, listVisibleContents } from "./reachable-contents";
import { viewThingFrom } from "./thing-where";
import { describeAgentAsSeen } from "./world-access";
import type { WorldState } from "./world-state";

/** What shows of the entity: the words of its visible components, then of its number fields. */
function listSeenWords(state: WorldState, entity: Entity): string[] {
  return listComponentWords(
    state.items.declarations,
    resolveEntityComponents(state.items, entity),
    true,
  );
}

/** Things with no label, no visible contents and the same words read as one line, counted. */
function groupKey(state: WorldState, agentId: string, entity: Entity): string {
  const hasContents = listVisibleContents(state, agentId, entityThing(entity)).length > 0;
  return entity.label === null && !hasContents
    ? `definition:${entity.definitionId}:${listSeenWords(state, entity).join("|")}`
    : `entity:${entity.id}`;
}

/** What shows of the entity: the words of its visible components. */
function describeSeenState(state: WorldState, entity: Entity): string | null {
  const words = listSeenWords(state, entity);
  return words.length > 0 ? words.join(", ") : null;
}

function entityThing(entity: Entity): ThingRef {
  return { kind: "entity", entityId: entity.id };
}

/** The verbs the contents offer, as things inside the holder ("take"). */
function listContentsVerbs(state: WorldState, agentId: string, contents: readonly Entity[]) {
  return contents.flatMap((content) => listVerbsForEntity(state, agentId, content));
}

/** What the entity offers: its own verbs, then those of what can be seen inside it. */
function listVerbNames(state: WorldState, agentId: string, entity: Entity): string[] {
  const contents = listVisibleContents(state, agentId, entityThing(entity));
  const verbs = [
    ...listVerbsForEntity(state, agentId, entity),
    ...listContentsVerbs(state, agentId, contents),
  ];
  return [...new Set(verbs.map((verb) => verb.name))];
}

/** "holding 3 bread, 2 coins"; null when nothing can be seen inside. */
function describeContents(state: WorldState, contents: readonly Entity[]): string | null {
  if (contents.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const entity of contents) {
    counts[entity.definitionId] = (counts[entity.definitionId] ?? 0) + 1;
  }
  const items = describeItemCounts(state.items, counts);
  return config.perception.contentsWords.holding.split("{items}").join(items);
}

function describeGroundWords(state: WorldState, entity: Entity): string | null {
  const { location } = entity;
  if (location.kind !== "tile" || !isLyingWhenOnTile(state, entity)) return null;
  const place = state.map.places.find((area) => area.name === location.place);
  const words = config.perception.groundWords;
  return place?.isIndoor ? words.indoor : words.outdoor;
}

function describeEntityDetails(state: WorldState, agentId: string, entity: Entity): string | null {
  const details = [
    describeSeenState(state, entity),
    describeGroundWords(state, entity),
    describeContents(state, listVisibleContents(state, agentId, entityThing(entity))),
  ].filter((detail): detail is string => detail !== null);
  return details.length > 0 ? details.join(", ") : null;
}

/**
 * Entities as a prompt lists them: identical stateless ones counted together ("3 bread"), each
 * with the verbs it offers this agent and what can be seen of it: its state, that it lies on the
 * floor, and what it holds when the agent is close enough to take from it.
 */
export function groupEntitiesForPrompt(
  state: WorldState,
  agentId: string,
  entities: readonly Entity[],
): PromptEntityGroup[] {
  const groups = new Map<string, Entity[]>();
  for (const entity of entities) {
    const key = groupKey(state, agentId, entity);
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
        condition: describeEntityDetails(state, agentId, first),
      },
    ];
  });
}

/** Bodies in sight that offer something (`take`), with what they carry once within reach. */
function groupBodiesForPrompt(state: WorldState, agent: Agent): PromptEntityGroup[] {
  return listVisibleBodies(state, agent.id).flatMap((body) => {
    const contents = listVisibleContents(state, agent.id, { kind: "agent", agentId: body.id });
    const verbs = [
      ...new Set(listContentsVerbs(state, agent.id, contents).map((verb) => verb.name)),
    ];
    if (verbs.length === 0) return [];
    return [
      { text: describeAgentAsSeen(body), verbs, condition: describeContents(state, contents) },
    ];
  });
}

/** What is at the agent's place: placed objects and items on the ground. */
export function listNearbyEntities(state: WorldState, agent: Agent): Entity[] {
  return listTileEntitiesAt(state, agent.place);
}

/** Here: what is at the agent's place, then bodies in sight. */
export function buildHere(state: WorldState, agent: Agent): PromptEntityGroup[] {
  return [
    ...groupEntitiesForPrompt(state, agent.id, listNearbyEntities(state, agent)),
    ...groupBodiesForPrompt(state, agent),
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

/**
 * The recall cue's nearby things: entities here (items on the ground included) and what the agent
 * can see inside containers and bodies.
 */
export function listNearbyThingNames(state: WorldState, agent: Agent): string[] {
  const contents = listAllSeenInside(state, agent.id).map(
    ({ entity }) => getDefinition(state, entity).name,
  );
  return [...new Set([...listNearbyEntityNames(state, agent), ...contents])];
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
 * What `item` may name, by definition: what the agent carries, and what is inside containers and
 * bodies it is close enough to take from.
 */
export function listValidItems(state: WorldState, agent: Agent): ValidItem[] {
  return toValidItems(state, [
    ...listHeldEntities(state, agent.id),
    ...listAllSeenInside(state, agent.id).map(({ entity }) => entity),
  ]);
}
