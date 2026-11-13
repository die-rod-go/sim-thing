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
import { describeEntityName, listContents, listHeldEntities } from "../items/entity-store";
import type { ThingRef } from "../items/things";
import { buildEntityView, listVerbsForEntity } from "../items/verb-offers";
import { judgeInsideView } from "../items/world-physics";
import { describeAttempt, describeHolderName } from "./action-phrases";
import type { InteractRequest } from "./agent-runtime";
import { listToolUses, type ToolUse } from "./tool-uses";
import {
  listVerbsNamed,
  pickVerb,
  repairInteractRequest,
  type NamedVerb,
} from "./interact-request-repair";
import { listHereNearestFirst, listItemCandidates, type ItemCandidate } from "./verb-candidates";
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

/** Why a verb that isn't in `items.json` at all can't be done, and what can. */
function describeUnknownVerb(verbName: string): string {
  if (verbName.trim() === "") {
    return "I named no verb: interact needs one of the verbs shown in brackets beside a thing";
  }
  return `'${verbName}' isn't something I can do: only the verbs shown in brackets beside things work`;
}

function entityThing(entity: Entity): ThingRef {
  return { kind: "entity", entityId: entity.id };
}

/**
 * Why a thing that offers no verb at all can't be used, with what the agent can tell of its
 * insides: an empty chest reads as empty, not as shut.
 */
function describeNoUse(state: WorldState, agentId: string, entity: Entity): string {
  const name = describeEntityName(state, entity);
  const insideView = judgeInsideView(state, agentId, entityThing(entity));
  if (insideView === "hidden") {
    return `I can't see inside the ${name}, and there is nothing else I can do with it`;
  }
  if (insideView === "too_far") {
    return `I am too far from the ${name} to see inside it, and there is nothing else I can do with it from here`;
  }
  if (listContents(state, entity.id).length > 0) {
    return `the ${name} itself has no uses: to take something out of it, I name that thing as the item`;
  }
  return `the ${name} has nothing in it, and there is nothing else I can do with it`;
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
    return fail(`use the ${name}`, describeNoUse(state, agentId, firstCandidate.entity));
  }
  if (first === undefined) return fail(verbName, describeUnknownVerb(verbName));
  const name = describeEntityName(state, first);
  const isHeld = buildEntityView(state, agentId, first).where === "held";
  const choices = [
    ...listVerbChoices(listVerbsForEntity(state, agentId, first)),
    ...listToolUseChoices(state, listToolUses(state, agentId, first)),
  ];
  const offered = choices.map((choice) => choice.label).join(", ");
  const reason = isHeld
    ? `I can't '${verbName}' ${name}: what I can do with it is ${offered}`
    : `The ${name} doesn't do '${verbName}': what it does is ${offered}`;
  return fail(`use the ${name}`, reason, { item: first, choices });
}

/** How many things a refusal names as ones the verb could have meant. */
const SUGGESTED_THING_COUNT = 3;

/** Why a verb that needs an item can't run without one, naming things here it could be done with. */
function describeMissingItem(
  state: WorldState,
  agentId: string,
  verbName: string,
  named: readonly NamedVerb[],
): string {
  const around = [...listHeldEntities(state, agentId), ...listHereNearestFirst(state, agentId)];
  const usable = around.filter((entity) => {
    const view = buildEntityView(state, agentId, entity);
    return named.some(({ verb }) => matchesAppliesTo(verb, view));
  });
  const names = [...new Set(usable.map((entity) => describeEntityName(state, entity)))];
  if (names.length === 0) {
    return `I didn't name the thing to ${verbName}, and nothing here or on me can be used for that`;
  }
  const suggested = names.slice(0, SUGGESTED_THING_COUNT).join(", ");
  return `I didn't name the thing to ${verbName}: the item could be ${suggested}`;
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
        ? describeMissingItem(state, agentId, request.verb, named)
        : describeUnknownVerb(request.verb);
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

/** The verb's stack, where the item came from and its target, or why the target won't do. */
function resolveWithVerb(
  state: WorldState,
  agentId: string,
  request: InteractRequest,
  { entry, candidate }: ItemChoice,
): InteractResolution {
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

/**
 * Turns a reply's words into the things a verb works on: the verb (the first in file order that
 * applies to some candidate for the item), its item and stack, where the item came from, and its
 * target. When that verb can't be aimed at the target named, a later verb of the same name that
 * applies to the same item and can be is meant ("put" a note in a chest, not on the notice board).
 * Nothing is changed; whether they are in sight and reach is judged separately.
 */
export function resolveInteract(
  state: WorldState,
  agentId: string,
  reply: InteractRequest,
): InteractResolution {
  const request = repairInteractRequest(state, agentId, reply);
  const choice = chooseVerbAndItem(state, agentId, request);
  if ("kind" in choice) return choice;
  const first = resolveWithVerb(state, agentId, request, choice);
  const { candidate } = choice;
  if (first.kind === "ready" || candidate === null) return first;
  const itemView = buildEntityView(state, agentId, candidate.entity);
  const others = listVerbsNamed(state, request.verb).filter(
    (entry) =>
      entry.index !== choice.entry.index &&
      entry.verb.target !== undefined &&
      matchesAppliesTo(entry.verb, itemView),
  );
  for (const entry of others) {
    const other = resolveWithVerb(state, agentId, request, { entry, candidate });
    if (other.kind === "ready") return other;
  }
  return first;
}
