import {
  compareEntityAge,
  describeCount,
  findDefinition,
  isBareHanded,
  matchesAppliesTo,
  matchesThing,
  type Entity,
  type Verb,
} from "@village/shared";
import { describeEntityName } from "../items/entity-store";
import type { ThingRef } from "../items/things";
import { buildEntityView, listVerbsForEntity } from "../items/verb-offers";
import { describeAttempt, describeHolderName } from "./action-phrases";
import type { InteractRequest } from "./agent-runtime";
import { listToolUses, type ToolUse } from "./tool-uses";
import {
  listVerbsNamed,
  pickVerb,
  repairInteractRequest,
  type NamedVerb,
} from "./interact-request-repair";
import { listItemCandidates, type ItemCandidate } from "./verb-candidates";
import type { VerbStart } from "./verb-runner";
import { viewThingFrom } from "./thing-where";
import { describeTargetName, resolveTarget } from "./verb-target";
import type { WorldState } from "./world-state";

export interface ReadyInteract {
  kind: "ready";
  start: VerbStart;
  verb: Verb;
}

/** One answer to the follow-up: a verb of the item, or a verb the item is the tool for. */
export interface VerbChoice {
  /** What the agent picks: the verb's name, or a tool use's phrase ("chop down the tree"). */
  label: string;
  verbName: string;
  /** For a tool use, the thing that becomes the item; the tool is found when the verb runs. */
  itemName?: string;
}

/** A second question that gives the agent another try in the same tick: which of these verbs. */
export interface VerbFollowUp {
  /** The item the agent named. */
  item: Entity;
  choices: VerbChoice[];
  /** The target the verbs were narrowed to, when the one asked for couldn't aim at it. */
  targetName?: string;
}

export interface FailedInteract {
  kind: "failed";
  /** "bake bread at the oven", for "I tried to ... but ...". */
  attempt: string;
  reason: string;
  followUp?: VerbFollowUp;
}

export type InteractResolution = ReadyInteract | FailedInteract;

function fail(attempt: string, reason: string, followUp?: VerbFollowUp): FailedInteract {
  return { kind: "failed", attempt, reason, ...(followUp ? { followUp } : {}) };
}

function listVerbChoices(verbs: readonly Verb[]): VerbChoice[] {
  return [...new Set(verbs.map((verb) => verb.name))].map((name) => ({
    label: name,
    verbName: name,
  }));
}

function listToolUseChoices(state: WorldState, uses: readonly ToolUse[]): VerbChoice[] {
  return uses.map((use) => ({
    label: use.phrase,
    verbName: use.verb.name,
    itemName: describeEntityName(state, use.thing),
  }));
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

/** Why no verb of that name applies to anything the reply named for the item. */
function describeNotOffered(
  state: WorldState,
  agentId: string,
  verbName: string,
  candidates: readonly ItemCandidate[],
): FailedInteract {
  const first = candidates.find(
    ({ entity }) => listVerbsForEntity(state, agentId, entity).length > 0,
  )?.entity;
  const [firstCandidate] = candidates;
  if (first === undefined && firstCandidate !== undefined) {
    const name = describeEntityName(state, firstCandidate.entity);
    return fail(`use the ${name}`, "there is nothing I can do with it");
  }
  if (first === undefined) return fail(verbName, `I don't know how to '${verbName}'`);
  const name = describeEntityName(state, first);
  const isHeld = buildEntityView(state, agentId, first).where === "held";
  const reason = isHeld ? `I can't '${verbName}' ${name}` : `The ${name} doesn't do '${verbName}'`;
  const choices = [
    ...listVerbChoices(listVerbsForEntity(state, agentId, first)),
    ...listToolUseChoices(state, listToolUses(state, agentId, first)),
  ];
  return fail(`use the ${name}`, reason, { item: first, choices });
}

/**
 * The item's other verbs that can aim at the target the asked-for verb refused, and the verbs the
 * item is the tool for that are done on that target, if any.
 */
function buildTargetFollowUp(
  state: WorldState,
  agentId: string,
  item: Entity | undefined,
  target: ThingRef | undefined,
): VerbFollowUp | undefined {
  if (item === undefined || target === undefined) return undefined;
  const targetView = viewThingFrom(state, agentId, target);
  if (targetView === null) return undefined;
  const fitting = listVerbsForEntity(state, agentId, item).filter(
    (verb) => verb.target !== undefined && matchesThing(verb.target, targetView),
  );
  const toolUses = listToolUses(state, agentId, item).filter(
    (use) => target.kind === "entity" && use.thing.id === target.entityId,
  );
  const choices = [...listVerbChoices(fitting), ...listToolUseChoices(state, toolUses)];
  if (choices.length === 0) return undefined;
  const targetName = describeTargetName(state, agentId, target);
  return { item, choices, targetName };
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

function findBareHandedVerb(named: readonly NamedVerb[]): NamedVerb | undefined {
  return named.find(({ verb }) => isBareHanded(verb));
}

interface ItemChoice {
  entry: NamedVerb;
  candidate: ItemCandidate | null;
}

/** The verb and item the reply means, or why it can't be done. */
function chooseVerbAndItem(
  state: WorldState,
  agentId: string,
  request: InteractRequest,
): ItemChoice | FailedInteract {
  const named = listVerbsNamed(state, request.verb);
  if (request.itemName === undefined) {
    const entry = findBareHandedVerb(named);
    if (entry) return { entry, candidate: null };
    const reason =
      named.length > 0
        ? `I didn't say which thing to ${request.verb}`
        : `I don't know how to '${request.verb}'`;
    return fail(request.verb, reason);
  }
  const listed = listItemCandidates(state, agentId, request.itemName, request.fromName);
  const attempt = describeAttempt(state.items, request.verb, {
    item: request.itemName,
    ...(request.fromName === undefined ? {} : { from: request.fromName }),
  });
  if (listed.kind === "failed") return fail(attempt, listed.reason);
  const { candidates } = listed;
  if (candidates.length === 0) return fail(attempt, `there was no ${request.itemName} here`);
  const picked = pickVerb(state, agentId, named, candidates);
  if (picked) return picked;
  const bareHanded = findBareHandedVerb(named);
  if (bareHanded) return { entry: bareHanded, candidate: null };
  return describeNotOffered(state, agentId, request.verb, candidates);
}

/**
 * Turns a reply's words into the things a verb works on: the verb (the first in file order that
 * applies to some candidate for the item), its item and stack, where the item came from, and its
 * target. Nothing is changed; whether they are in sight and reach is judged separately.
 */
export function resolveInteract(
  state: WorldState,
  agentId: string,
  reply: InteractRequest,
): InteractResolution {
  const request = repairInteractRequest(state, agentId, reply);
  const choice = chooseVerbAndItem(state, agentId, request);
  if ("kind" in choice) return choice;
  const { entry, candidate } = choice;
  const { verb, index } = entry;
  const amount = request.amount ?? 1;
  const items = candidate ? buildStack(state, agentId, verb, candidate.entity, amount) : [];
  const itemName = describeItemName(state, items);
  const from = candidate?.from ?? null;
  let target: ThingRef | null = null;
  let targetName: string | null = null;
  const itemIds = items.map((item) => item.id);
  if (verb.target !== undefined) {
    const resolved = resolveTarget(state, agentId, verb, request.targetName, itemIds);
    if (resolved.kind === "failed") {
      const attempt = describeRequestAttempt(state, verb, itemName, from, request.targetName);
      const followUp = buildTargetFollowUp(state, agentId, items[0], resolved.unfitting);
      return fail(attempt, resolved.reason, followUp);
    }
    target = resolved.target;
    targetName = resolved.name;
  }
  const start = { verbIndex: index, itemIds, itemName, from, target, targetName };
  return { kind: "ready", verb, start: { ...start, choice: buildChoice(request) } };
}
