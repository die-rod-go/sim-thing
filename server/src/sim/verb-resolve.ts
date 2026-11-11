import {
  compareEntityAge,
  describeCount,
  findDefinition,
  isBareHanded,
  matchesAppliesTo,
  type Entity,
  type Verb,
} from "@village/shared";
import { describeEntityName } from "../items/entity-store";
import type { ThingRef } from "../items/things";
import { buildEntityView, listVerbsForEntity, normalizeVerbName } from "../items/verb-offers";
import { describeAttempt, describeHolderName } from "./action-phrases";
import type { InteractRequest } from "./agent-runtime";
import { resolveName } from "../decision/resolve-name";
import {
  findHiddenHolder,
  isEntityNamed,
  listItemCandidates,
  type ItemCandidate,
} from "./verb-candidates";
import type { VerbStart } from "./verb-runner";
import { describeTargetName, resolveTarget } from "./verb-target";
import { listOthersAsSeen } from "./world-access";
import type { WorldState } from "./world-state";

export interface ReadyInteract {
  kind: "ready";
  start: VerbStart;
  verb: Verb;
}

export interface FailedInteract {
  kind: "failed";
  /** "bake bread at the oven", for "I tried to ... but ...". */
  attempt: string;
  reason: string;
  /** The first thing the reply could mean, when it offers some verbs but not the one asked for. */
  unofferedBy?: Entity;
}

export type InteractResolution = ReadyInteract | FailedInteract;

interface NamedVerb {
  verb: Verb;
  index: number;
}

function fail(attempt: string, reason: string, unofferedBy?: Entity): FailedInteract {
  return { kind: "failed", attempt, reason, ...(unofferedBy ? { unofferedBy } : {}) };
}

function listVerbsNamed(state: WorldState, verbName: string): NamedVerb[] {
  const wanted = normalizeVerbName(verbName);
  return state.items.verbs
    .map((verb, index) => ({ verb, index }))
    .filter(({ verb }) => normalizeVerbName(verb.name) === wanted);
}

/** The first candidate some verb applies to, with the first such verb in file order. */
function pickCandidate(
  state: WorldState,
  agentId: string,
  named: readonly NamedVerb[],
  candidates: readonly ItemCandidate[],
): { entry: NamedVerb; candidate: ItemCandidate } | null {
  for (const candidate of candidates) {
    const view = buildEntityView(state, agentId, candidate.entity);
    const entry = named.find(({ verb }) => matchesAppliesTo(verb, view));
    if (entry) return { entry, candidate };
  }
  return null;
}

function isInSamePlace(first: Entity, second: Entity): boolean {
  const [firstAt, secondAt] = [first.location, second.location];
  if (firstAt.kind === "inside") {
    return secondAt.kind === "inside" && firstAt.holderId === secondAt.holderId;
  }
  return (
    secondAt.kind === "tile" &&
    firstAt.place === secondAt.place &&
    firstAt.pos.x === secondAt.pos.x &&
    firstAt.pos.y === secondAt.pos.y
  );
}

/**
 * The item and the rest of its stack: with `amount` in the verb's `takes`, up to that many of the
 * same definition from the same place that the verb also applies to, oldest first.
 */
function buildStack(
  state: WorldState,
  agentId: string,
  verb: Verb,
  chosen: Entity,
  amount: number,
): Entity[] {
  if (!verb.takes.includes("amount")) return [chosen];
  const peers = state.entities
    .filter(
      (entity) =>
        entity.id !== chosen.id &&
        entity.definitionId === chosen.definitionId &&
        isInSamePlace(entity, chosen) &&
        matchesAppliesTo(verb, buildEntityView(state, agentId, entity)),
    )
    .sort(compareEntityAge);
  return [chosen, ...peers].slice(0, amount);
}

function describeItemName(state: WorldState, stack: readonly Entity[]): string {
  const [first] = stack;
  if (first === undefined) return "";
  if (stack.length === 1) return describeEntityName(state, first);
  return describeCount(findDefinition(state.items, first.definitionId), stack.length);
}

/** The first candidate that answers to the name the reply gave for the item, else for the target. */
function findNamedCandidate(
  state: WorldState,
  request: InteractRequest,
  candidates: readonly ItemCandidate[],
): Entity | undefined {
  const name = request.itemName ?? request.targetName;
  if (name === undefined) return undefined;
  return candidates.find(({ entity }) => isEntityNamed(state, entity, name))?.entity;
}

/** Why no verb of that name could be done with what the reply named. */
function describeNotOffered(
  state: WorldState,
  agentId: string,
  request: InteractRequest,
  candidates: readonly ItemCandidate[],
): FailedInteract {
  const verbName = request.verb;
  const named = request.itemName ?? request.targetName;
  if (named === undefined) return fail(verbName, `I don't know how to '${verbName}'`);
  const hiddenHolder = findHiddenHolder(state, agentId, request);
  if (hiddenHolder !== null) {
    const holderName = describeTargetName(state, agentId, hiddenHolder);
    const attempt = describeAttempt(state.items, verbName, {
      item: request.itemName ?? "",
      from: holderName,
    });
    return fail(attempt, `I can't see what ${holderName} carries`);
  }
  const first = findNamedCandidate(state, request, candidates);
  if (first === undefined) {
    const isPerson = resolveName(named, listOthersAsSeen(state, agentId)) !== null;
    if (isPerson)
      return fail(`${verbName} ${named}`, `I have nothing to ${verbName} ${named} with`);
    return fail(`use the ${named}`, `there is no ${named} here for me to use`);
  }
  const name = describeEntityName(state, first);
  if (listVerbsForEntity(state, agentId, first).length === 0) {
    return fail(`use the ${name}`, "there is nothing I can do with it");
  }
  const isHeld = buildEntityView(state, agentId, first).where === "held";
  const reason = isHeld ? `I can't '${verbName}' ${name}` : `The ${name} doesn't do '${verbName}'`;
  return fail(`use the ${name}`, reason, first);
}

/** The attempt phrase with the names the reply used, before its target is settled. */
function describeRequestAttempt(
  state: WorldState,
  verb: Verb,
  itemName: string,
  from: ThingRef | null,
  targetName: string | undefined,
): string {
  return describeAttempt(state.items, verb.name, {
    item: itemName,
    from: describeHolderName(state, from),
    ...(targetName === undefined ? {} : { target: targetName }),
  });
}

/** The attempt phrase of a resolved verb, for failures while walking to it. */
export function describeStartAttempt(state: WorldState, ready: ReadyInteract): string {
  const { start, verb } = ready;
  return describeAttempt(state.items, verb.name, {
    item: start.itemName,
    from: describeHolderName(state, start.from),
    ...(start.targetName === null ? {} : { target: start.targetName }),
  });
}

function buildChoice(request: InteractRequest): VerbStart["choice"] {
  return {
    amount: request.amount ?? 1,
    ...(request.minutes === undefined ? {} : { minutes: request.minutes }),
    ...(request.text === undefined ? {} : { text: request.text }),
  };
}

/**
 * Turns a reply's words into the things a verb works on: the verb (the first in file order that
 * applies), its item and stack, where the item came from, and its target. Nothing is changed;
 * whether they are in sight and reach is judged separately.
 */
export function resolveInteract(
  state: WorldState,
  agentId: string,
  request: InteractRequest,
): InteractResolution {
  const named = listVerbsNamed(state, request.verb);
  const candidates = listItemCandidates(state, agentId, request);
  const picked = pickCandidate(state, agentId, named, candidates);
  const entry = picked?.entry ?? named.find(({ verb }) => isBareHanded(verb));
  if (entry === undefined) {
    return describeNotOffered(state, agentId, request, candidates);
  }
  const { verb, index } = entry;
  const amount = request.amount ?? 1;
  const items = picked ? buildStack(state, agentId, verb, picked.candidate.entity, amount) : [];
  const itemName = describeItemName(state, items);
  const from = picked?.candidate.from ?? null;
  let target: ThingRef | null = null;
  let targetName: string | null = null;
  if (verb.target !== undefined) {
    const itemIds = items.map((item) => item.id);
    const resolved = resolveTarget(state, agentId, verb, request.targetName, itemIds);
    if (resolved.kind === "failed") {
      const attempt = describeRequestAttempt(state, verb, itemName, from, request.targetName);
      return fail(attempt, resolved.reason);
    }
    target = resolved.target;
    targetName = resolved.name;
  }
  const itemIds = items.map((item) => item.id);
  const start = { verbIndex: index, itemIds, itemName, from, target, targetName };
  return { kind: "ready", verb, start: { ...start, choice: buildChoice(request) } };
}
