import {
  matchesThing,
  type Agent,
  type Entity,
  type PlayerVerbOption,
  type Verb,
  type VerbTake,
} from "@village/shared";
import { config } from "../config";
import { describeEntityName, listHeldEntities } from "../items/entity-store";
import type { ThingRef } from "../items/things";
import { listItemlessVerbs, listVerbsForEntity } from "../items/verb-offers";
import { getAgentRuntime } from "./agent-runtime";
import { viewThingFrom } from "./thing-where";
import { listToolUses } from "./tool-uses";
import { listHereNearestFirst } from "./verb-candidates";
import { describeAgentAsSeen, findAgent } from "./world-access";
import type { WorldState } from "./world-state";

/*
 * What the player can do with each thing, worked out the way a reply's names are resolved, so a
 * clicked option means exactly one verb on one thing and needs no second LLM call to settle it.
 */

/** Something a verb could be aimed at, under the name a target takes. */
interface TargetCandidate {
  name: string;
  thing: ThingRef;
}

/** Everything the agent could aim at: itself, everyone in sight, things here and things carried. */
export function listTargetCandidates(state: WorldState, agent: Agent): TargetCandidate[] {
  const entityCandidate = (entity: Entity): TargetCandidate => ({
    name: describeEntityName(state, entity),
    thing: { kind: "entity", entityId: entity.id },
  });
  const people = getAgentRuntime(state, agent.id).visibleAgentIds.map((otherId) => ({
    name: describeAgentAsSeen(findAgent(state, otherId)),
    thing: { kind: "agent", agentId: otherId } as const,
  }));
  return [
    { name: config.verbs.selfTargetName, thing: { kind: "agent", agentId: agent.id } },
    ...people,
    ...listHereNearestFirst(state, agent.id).map(entityCandidate),
    ...listHeldEntities(state, agent.id).map(entityCandidate),
  ];
}

/** The names any of the verbs can be aimed at, leaving out the item itself; null when none aims. */
function listFittingTargets(
  state: WorldState,
  agentId: string,
  verbs: readonly Verb[],
  candidates: readonly TargetCandidate[],
  itemIds: readonly string[],
): string[] | null {
  const matchers = verbs.flatMap((verb) => (verb.target === undefined ? [] : [verb.target]));
  if (matchers.length === 0) return null;
  const fitting = candidates.filter((candidate) => {
    const { thing } = candidate;
    if (thing.kind === "entity" && itemIds.includes(thing.entityId)) return false;
    const view = viewThingFrom(state, agentId, thing);
    return view !== null && matchers.some((matcher) => matchesThing(matcher, view));
  });
  return [...new Set(fitting.map((candidate) => candidate.name))];
}

function collectTakes(verbs: readonly Verb[]): VerbTake[] {
  return [...new Set(verbs.flatMap((verb) => verb.takes))];
}

/** Verbs by name, in file order: same-named verbs are one choice, settled by what they aim at. */
function groupVerbsByName(verbs: readonly Verb[]): Map<string, Verb[]> {
  const byName = new Map<string, Verb[]>();
  for (const verb of verbs) byName.set(verb.name, [...(byName.get(verb.name) ?? []), verb]);
  return byName;
}

function isCarriedBy(entity: Entity, agentId: string): boolean {
  return entity.location.kind === "inside" && entity.location.holderId === agentId;
}

/** A carried tool's uses on things here: "chop down the tree", done with the tree as the item. */
function listToolOptions(
  state: WorldState,
  agent: Agent,
  tool: Entity,
  candidates: readonly TargetCandidate[],
): PlayerVerbOption[] {
  if (!isCarriedBy(tool, agent.id)) return [];
  return listToolUses(state, agent.id, tool).map((use) => ({
    label: use.phrase,
    verb: use.verb.name,
    item: describeEntityName(state, use.thing),
    from: null,
    targets: listFittingTargets(state, agent.id, [use.verb], candidates, [use.thing.id]),
    takes: [...use.verb.takes],
  }));
}

/**
 * What the agent can do with the entity: each verb it offers, and for a carried tool what it is
 * the tool for. `from` names the holder the entity is inside, when that isn't the agent.
 */
export function listEntityOptions(
  state: WorldState,
  agent: Agent,
  entity: Entity,
  from: string | null,
  candidates: readonly TargetCandidate[],
): PlayerVerbOption[] {
  const item = describeEntityName(state, entity);
  const verbsByName = groupVerbsByName(listVerbsForEntity(state, agent.id, entity));
  const verbOptions = [...verbsByName].map(([name, verbs]) => ({
    label: name,
    verb: name,
    item,
    from,
    targets: listFittingTargets(state, agent.id, verbs, candidates, [entity.id]),
    takes: collectTakes(verbs),
  }));
  return [...verbOptions, ...listToolOptions(state, agent, entity, candidates)];
}

/** Verbs done with no item at all ("punch"), each with what it can be aimed at. */
export function listBareHandedOptions(
  state: WorldState,
  agent: Agent,
  candidates: readonly TargetCandidate[],
): PlayerVerbOption[] {
  return [...groupVerbsByName(listItemlessVerbs(state))].map(([name, verbs]) => ({
    label: name,
    verb: name,
    item: null,
    from: null,
    targets: listFittingTargets(state, agent.id, verbs, candidates, []),
    takes: collectTakes(verbs),
  }));
}
