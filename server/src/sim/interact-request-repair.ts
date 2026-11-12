import { isBareHanded, matchesAppliesTo, type Verb } from "@village/shared";
import { describeEntityName } from "../items/entity-store";
import { buildEntityView, normalizeVerbName } from "../items/verb-offers";
import type { InteractRequest } from "./agent-runtime";
import { listToolUses } from "./tool-uses";
import { listItemCandidates, type ItemCandidate } from "./verb-candidates";
import type { WorldState } from "./world-state";

export interface NamedVerb {
  verb: Verb;
  index: number;
}

export function listVerbsNamed(state: WorldState, verbName: string): NamedVerb[] {
  const wanted = normalizeVerbName(verbName);
  return state.items.verbs
    .map((verb, index) => ({ verb, index }))
    .filter(({ verb }) => normalizeVerbName(verb.name) === wanted);
}

/** The first verb in file order that applies to some candidate, with the first such candidate. */
export function pickVerb(
  state: WorldState,
  agentId: string,
  named: readonly NamedVerb[],
  candidates: readonly ItemCandidate[],
): { entry: NamedVerb; candidate: ItemCandidate } | null {
  for (const entry of named) {
    const candidate = candidates.find(({ entity }) =>
      matchesAppliesTo(entry.verb, buildEntityView(state, agentId, entity)),
    );
    if (candidate) return { entry, candidate };
  }
  return null;
}

function namesThingHere(state: WorldState, agentId: string, name: string): boolean {
  const listed = listItemCandidates(state, agentId, name);
  return listed.kind === "found" && listed.candidates.length > 0;
}

/**
 * A reply that names only a target, for verbs that take an item and are never aimed ("read" with
 * target "notice board"), means that thing as the item: the reply put it in the wrong field. Only
 * when the name is a thing here or carried, so "play cards" with "Beckett" still fails honestly.
 */
function moveLoneTargetToItem(
  state: WorldState,
  agentId: string,
  request: InteractRequest,
): InteractRequest {
  const { targetName, ...rest } = request;
  if (request.itemName !== undefined || targetName === undefined) return request;
  const named = listVerbsNamed(state, request.verb);
  const isUnaimedWithItem =
    named.length > 0 && named.every(({ verb }) => verb.target === undefined && !isBareHanded(verb));
  if (!isUnaimedWithItem || !namesThingHere(state, agentId, targetName)) return request;
  return { ...rest, itemName: targetName };
}

/** The things here the tool could be used on with the verb, nearest first. */
function findToolUseThingName(
  state: WorldState,
  agentId: string,
  verbName: string,
  tools: readonly ItemCandidate[],
): string | undefined {
  const [use] = tools.flatMap(({ entity }) => listToolUses(state, agentId, entity, verbName));
  return use === undefined ? undefined : describeEntityName(state, use.thing);
}

/** Whether some verb of that name, one never aimed, applies to a thing here or carried so named. */
function offersUnaimedVerb(
  state: WorldState,
  agentId: string,
  named: readonly NamedVerb[],
  thingName: string,
): boolean {
  const listed = listItemCandidates(state, agentId, thingName);
  if (listed.kind === "failed") return false;
  const picked = pickVerb(state, agentId, named, listed.candidates);
  return picked !== null && picked.entry.verb.target === undefined;
}

/**
 * A reply that names the tool as the item ("chop down" with item "axe" and target "tree") means
 * the thing the verb is done on as the item: such verbs find the tool in what the user carries.
 * Only when the named item offers no verb of that name. Without a target, only when the item is
 * the verb's tool, and then the nearest thing here it can be used on is meant.
 */
function moveToolItemToThing(
  state: WorldState,
  agentId: string,
  request: InteractRequest,
): InteractRequest {
  const { targetName, fromName, ...rest } = request;
  if (request.itemName === undefined) return request;
  const named = listVerbsNamed(state, request.verb);
  if (named.length === 0) return request;
  const listed = listItemCandidates(state, agentId, request.itemName, fromName);
  if (listed.kind === "failed" || listed.candidates.length === 0) return request;
  if (pickVerb(state, agentId, named, listed.candidates) !== null) return request;
  const thingName =
    targetName ?? findToolUseThingName(state, agentId, request.verb, listed.candidates);
  if (thingName === undefined || !offersUnaimedVerb(state, agentId, named, thingName)) {
    return request;
  }
  return { ...rest, itemName: thingName };
}

/** The reply's words with fields put where the verb wants them, when the reply misplaced them. */
export function repairInteractRequest(
  state: WorldState,
  agentId: string,
  request: InteractRequest,
): InteractRequest {
  return moveToolItemToThing(state, agentId, moveLoneTargetToItem(state, agentId, request));
}
