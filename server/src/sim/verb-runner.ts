import { describeCount, findDefinition, type Agent, type Entity, type Verb } from "@village/shared";
import { config } from "../config";
import {
  countHeld,
  describeEntityName,
  findEntityIfPresent,
  listHeldOfDefinition,
  removeEntity,
  replaceEntity,
} from "../items/entity-store";
import { addEntityUser, removeEntityUser } from "../items/entity-users";
import { resolveNumber } from "../items/verb-numbers";
import { findVerbByName, listItemlessVerbs, listVerbsForEntity } from "../items/verb-offers";
import { describeAttempt, describeItemCounts, describeOngoingVerb } from "./action-phrases";
import { getAgentRuntime, type PendingVerb, type VerbRun } from "./agent-runtime";
import { applyEffect, findEffectBlocker } from "./effects/effect-registry";
import type { EffectOutcome, EffectRun } from "./effects/effect-run";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import { failAction } from "./failure";
import type { TickContext } from "./tick-context";
import {
  findAgent,
  markAgentChanged,
  markEntityChanged,
  markEntityRemoved,
  replaceAgent,
} from "./world-access";
import type { WorldState } from "./world-state";

/** What a verb is used with: an entity (held bread, the oven) or nothing (a bare-handed verb). */
export type UsedThing = { kind: "entity"; entityId: string } | { kind: "user" };

const { minutesPerTick } = config.clock;

interface ResolvedUse {
  verb: Verb;
  entity: Entity | null;
  name: string;
}

function describeUnknownVerb(state: WorldState, entity: Entity | null, verbName: string): string {
  if (entity === null) return `I don't know how to '${verbName}'`;
  const name = describeEntityName(state, entity);
  return entity.location.kind === "inventory"
    ? `I can't '${verbName}' ${name}`
    : `The ${name} doesn't do '${verbName}'`;
}

function resolveUse(
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

function describeShortfall(state: WorldState, agentId: string, verb: Verb): string | null {
  const reasons = Object.entries(verb.inputs).flatMap(([definitionId, needed]) => {
    const held = countHeld(state, agentId, definitionId);
    if (held >= needed) return [];
    const definition = findDefinition(state.items, definitionId);
    const neededText = describeCount(definition, needed);
    return [
      held === 0
        ? `I don't have any ${definition.plural ?? definition.name}: I need ${neededText}`
        : `I don't have enough ${definition.plural ?? definition.name}: I need ${neededText} and have ${held}`,
    ];
  });
  return reasons.length === 0 ? null : reasons.join("; ");
}

/** Inputs are used up oldest first, never the thing the verb is used with. */
function consumeInputs(
  context: TickContext,
  agentId: string,
  verb: Verb,
  usedEntityId: string | null,
) {
  const { state, result } = context;
  for (const [definitionId, count] of Object.entries(verb.inputs)) {
    const spent = listHeldOfDefinition(state, agentId, definitionId)
      .filter((entity) => entity.id !== usedEntityId)
      .slice(0, count);
    for (const entity of spent) {
      removeEntity(state, entity.id);
      markEntityRemoved(result, entity.id);
    }
  }
}

function effectsAt(verb: Verb, when: "start" | "finish") {
  return verb.effects.filter((effect) => (effect.when ?? "finish") === when);
}

function computeEndTick(state: WorldState, verb: Verb, definitionId: string | null): number | null {
  if (verb.minutes === null) return null;
  const definition = definitionId === null ? null : findDefinition(state.items, definitionId);
  const minutes = resolveNumber(verb.minutes, definition);
  return state.tick + Math.max(1, Math.ceil(minutes / minutesPerTick));
}

function computeLoudness(state: WorldState, verb: Verb, run: VerbRun): number | null {
  if (verb.loudness === null) return null;
  const definition =
    run.usedDefinitionId === null ? null : findDefinition(state.items, run.usedDefinitionId);
  return resolveNumber(verb.loudness, definition);
}

function changeUsers(context: TickContext, run: VerbRun, change: typeof addEntityUser) {
  if (run.usedEntityId === null) return;
  const entity = findEntityIfPresent(context.state, run.usedEntityId);
  if (!entity || entity.location.kind !== "tile") return;
  replaceEntity(context.state, change(entity, run.agentId));
  markEntityChanged(context.result, entity.id);
}

function buildRun(state: WorldState, agentId: string, use: ResolvedUse): VerbRun {
  return {
    agentId,
    verb: use.verb.name,
    usedEntityId: use.entity?.id ?? null,
    usedDefinitionId: use.entity?.definitionId ?? null,
    usedName: use.name,
    startedAtTick: state.tick,
  };
}

function beginRun(context: TickContext, run: VerbRun, use: ResolvedUse): void {
  const { state, result } = context;
  const { agentId } = run;
  const agent = findAgent(state, agentId);
  replaceAgent(state, {
    ...agent,
    currentAction: {
      kind: "interact",
      target: use.name,
      verb: use.verb.name,
      endsAtTick: computeEndTick(state, use.verb, run.usedDefinitionId),
    },
  });
  const runtime = getAgentRuntime(state, agentId);
  runtime.walk = null;
  runtime.verbRun = run;
  markAgentChanged(result, agentId);
  changeUsers(context, run, addEntityUser);
  if (use.entity) result.verbStarts.push({ agentId, entityId: use.entity.id, verb: run.verb });
}

function announceStart(context: TickContext, run: VerbRun, verb: Verb) {
  const { state, result } = context;
  broadcastEvent(
    state,
    createEvent(state, findAgent(state, run.agentId), {
      kind: "action_started",
      description: `started ${describeOngoingVerb(state.items, run.verb, run.usedName)}`,
      targetId: run.usedEntityId,
      targetName: run.usedName,
      loudness: computeLoudness(state, verb, run),
    }),
    result,
  );
}

/**
 * Starts a verb where the agent stands. Everything is checked first (the thing is still there and
 * offers the verb, the inputs are held, no `start` effect is blocked); then inputs are spent and
 * `start` effects run. A failure is filed in the world.
 */
export function startVerbNow(
  context: TickContext,
  agentId: string,
  used: UsedThing,
  request: PendingVerb,
): void {
  const { state, result } = context;
  const use = resolveUse(state, agentId, used, request.verb);
  if ("failure" in use) {
    failAction(
      state,
      result,
      agentId,
      describeAttempt(state.items, request.verb, use.name),
      use.failure,
    );
    return;
  }
  const attempt = describeAttempt(state.items, use.verb.name, use.name);
  const run = buildRun(state, agentId, use);
  const effectRun: EffectRun = {
    context,
    verb: use.verb,
    run,
    text: request.text ?? "",
    minutes: request.minutes,
  };
  const blocker =
    describeShortfall(state, agentId, use.verb) ??
    effectsAt(use.verb, "start")
      .map((effect) => findEffectBlocker(effectRun, effect))
      .find((reason) => reason !== null) ??
    null;
  if (blocker !== null) {
    failAction(state, result, agentId, attempt, blocker);
    return;
  }
  beginRun(context, run, use);
  consumeInputs(context, agentId, use.verb, run.usedEntityId);
  const outcomes = effectsAt(use.verb, "start").map((effect) => applyEffect(effectRun, effect));
  if (!outcomes.some((outcome) => outcome.isStartAnnounced)) announceStart(context, run, use.verb);
}

function sumMade(outcomes: EffectOutcome[]): Record<string, number> {
  const made: Record<string, number> = {};
  for (const outcome of outcomes) {
    if (!outcome.made || outcome.made.count === 0) continue;
    made[outcome.made.definitionId] = (made[outcome.made.definitionId] ?? 0) + outcome.made.count;
  }
  return made;
}

function endRun(context: TickContext, agentId: string, run: VerbRun | null): Agent {
  const { state, result } = context;
  if (run) changeUsers(context, run, removeEntityUser);
  getAgentRuntime(state, agentId).verbRun = null;
  const stopped = { ...findAgent(state, agentId), currentAction: null };
  replaceAgent(state, stopped);
  markAgentChanged(result, agentId);
  return stopped;
}

/** Finishes the agent's verb: its `finish` effects run, then an `action_finished` event. */
export function finishRunningVerb(context: TickContext, agentId: string): void {
  const { state, result } = context;
  const run = getAgentRuntime(state, agentId).verbRun;
  const verb = run ? findVerbByName(state.items.verbs, run.verb) : undefined;
  if (!run || !verb) {
    endRun(context, agentId, run);
    return;
  }
  const effectRun: EffectRun = { context, verb, run, text: "" };
  const outcomes = effectsAt(verb, "finish").map((effect) => applyEffect(effectRun, effect));
  const finished = endRun(context, agentId, run);
  const made = sumMade(outcomes);
  const making =
    Object.keys(made).length > 0 ? `, making ${describeItemCounts(state.items, made)}` : "";
  broadcastEvent(
    state,
    createEvent(state, finished, {
      kind: "action_finished",
      description: `finished ${describeOngoingVerb(state.items, run.verb, run.usedName)}${making}`,
      targetId: run.usedEntityId,
      targetName: run.usedName,
    }),
    result,
  );
}

/**
 * Stops a verb early. What its `start` effects did stays done (inputs stay spent) and its
 * `finish` effects never run: the work was spent.
 */
export function cancelRunningVerb(context: TickContext, agentId: string): void {
  endRun(context, agentId, getAgentRuntime(context.state, agentId).verbRun);
}
