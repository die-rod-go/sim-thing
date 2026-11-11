import {
  findDefinition,
  listPossibleLocations,
  type Agent,
  type Effect,
  type Entity,
  type Verb,
} from "@village/shared";
import { config } from "../config";
import {
  describeEntityName,
  findEntityIfPresent,
  listHeldOfDefinition,
  removeEntity,
  replaceEntity,
} from "../items/entity-store";
import { addEntityUser, removeEntityUser } from "../items/entity-users";
import { resolveNumber } from "../items/verb-numbers";
import {
  findVerbByName,
  listItemlessVerbs,
  listVerbsForEntity,
  listVerbsForSubject,
} from "../items/verb-offers";
import { isDead } from "../status/health";
import { describeAttempt, describeItemCounts, describeOngoingVerb } from "./action-phrases";
import {
  getAgentRuntime,
  type PendingVerb,
  type UsedThing,
  type VerbAim,
  type VerbRun,
} from "./agent-runtime";
import { applyEffect, findEffectBlocker } from "./effects/effect-registry";
import type { EffectOutcome, EffectRun } from "./effects/effect-run";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import { failAction } from "./failure";
import type { TickContext } from "./tick-context";
import { computeVerbReach, describeAimName, findAimProblem, isAimInReach } from "./verb-aim";
import { describeMissingTools, describeShortfall } from "./verb-checks";
import {
  announceHitRoll,
  computeLoudness,
  describeAimedPhrases,
  describeRunTarget,
  prefixPhrases,
  rollForHit,
} from "./verb-hits";
import {
  findAgent,
  markAgentChanged,
  markEntityChanged,
  markEntityRemoved,
  replaceAgent,
} from "./world-access";
import type { WorldState } from "./world-state";

export type { UsedThing } from "./agent-runtime";

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

function effectsAt(verb: Verb, when: "start" | "finish"): Effect[] {
  return verb.effects.filter((effect) => (effect.when ?? "finish") === when);
}

function computeEndTick(state: WorldState, verb: Verb, definitionId: string | null): number | null {
  if (verb.minutes === null) return null;
  const definition = definitionId === null ? null : findDefinition(state.items, definitionId);
  const minutes = resolveNumber(verb.minutes, definition);
  return state.tick + Math.max(1, Math.ceil(minutes / minutesPerTick));
}

function changeUsers(context: TickContext, run: VerbRun, change: typeof addEntityUser) {
  if (run.usedEntityId === null) return;
  const entity = findEntityIfPresent(context.state, run.usedEntityId);
  if (!entity || entity.location.kind !== "tile") return;
  replaceEntity(context.state, change(entity, run.agentId));
  markEntityChanged(context.result, entity.id);
}

function buildRun(
  state: WorldState,
  agentId: string,
  use: ResolvedUse,
  aim: VerbAim | undefined,
): VerbRun {
  const run: VerbRun = {
    agentId,
    verb: use.verb.name,
    usedEntityId: use.entity?.id ?? null,
    usedDefinitionId: use.entity?.definitionId ?? null,
    usedName: use.name,
    startedAtTick: state.tick,
  };
  return aim ? { ...run, aim, aimName: describeAimName(state, agentId, aim) } : run;
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
  const phrases = describeAimedPhrases(state, run, (names) =>
    describeOngoingVerb(state.items, run.verb, names),
  );
  broadcastEvent(
    state,
    createEvent(state, findAgent(state, run.agentId), {
      kind: "action_started",
      ...prefixPhrases(phrases, "started "),
      ...describeRunTarget(run),
      loudness: computeLoudness(state, verb, run),
    }),
    result,
  );
}

/** Why an aimed verb can't go on at its target: no target, not alive or in sight, out of reach. */
function findAimedBlocker(state: WorldState, verb: Verb, run: VerbRun): string | null {
  if (verb.target === "none") return null;
  if (!run.aim) return `I didn't say what to ${verb.name}`;
  const problem = findAimProblem(state, run.agentId, run.aim);
  if (problem !== null) return problem;
  const reach = computeVerbReach(state, verb, run.usedDefinitionId);
  return isAimInReach(state, run.agentId, run.aim, reach)
    ? null
    : `${run.aimName} was out of reach`;
}

/**
 * Starts a verb where the agent stands. Everything is checked first (the thing is still there and
 * offers the verb, its target is alive, in sight and in reach, tools and inputs are held, no
 * `start` effect is blocked); then inputs are spent and `start` effects run. A failure is filed in
 * the world.
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
    const attempt = describeAttempt(state.items, request.verb, { item: use.name });
    failAction(state, result, agentId, attempt, use.failure);
    return;
  }
  const run = buildRun(state, agentId, use, request.aim);
  const attempt = describeAttempt(state.items, use.verb.name, {
    item: use.name,
    target: run.aimName,
  });
  const effectRun: EffectRun = {
    context,
    verb: use.verb,
    run,
    text: request.text ?? "",
    minutes: request.minutes,
  };
  const blocker =
    findAimedBlocker(state, use.verb, run) ??
    describeMissingTools(state, agentId, use.verb, run.usedEntityId) ??
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

/**
 * The running verb, found again by name among the verbs that apply to what was used, so two
 * same-named verbs (the general `eat` and a poisoned one) stay apart.
 */
function findRunVerb(state: WorldState, run: VerbRun): Verb | undefined {
  if (run.usedDefinitionId === null) return findVerbByName(listItemlessVerbs(state), run.verb);
  const definition = findDefinition(state.items, run.usedDefinitionId);
  const candidates = listPossibleLocations(definition.form).flatMap((location) =>
    listVerbsForSubject(state, { kind: "entity", definition, location }),
  );
  return findVerbByName(candidates, run.verb);
}

/** Someone else took what the verb was used with while it ran (both reached for the knife). */
function isTakenByOther(state: WorldState, run: VerbRun): boolean {
  const used = run.usedEntityId === null ? undefined : findEntityIfPresent(state, run.usedEntityId);
  return used?.location.kind === "inventory" && used.location.agentId !== run.agentId;
}

/** A `start` effect used up or changed the thing itself (eating the bread), so it may be gone. */
function isUsedUpAtStart(verb: Verb): boolean {
  return effectsAt(verb, "start").some(
    (effect) => effect.on === "item" && (effect.type === "destroy" || effect.type === "transform"),
  );
}

/** Why an aimed verb can't finish: the thing used is no longer held, or the target is gone. */
function findFinishBlocker(state: WorldState, run: VerbRun, verb: Verb): string | null {
  if (isTakenByOther(state, run)) return "someone got to it first";
  if (verb.target === "none") return null;
  const isUsedGone =
    run.usedEntityId !== null && findEntityIfPresent(state, run.usedEntityId) === undefined;
  if (isUsedGone && !isUsedUpAtStart(verb)) return `I no longer had the ${run.usedName}`;
  if (!run.aim) return `I didn't say what to ${verb.name}`;
  return findAimProblem(state, run.agentId, run.aim);
}

/** Whether the effect runs: one that requires a hit (the default with a hit roll) waits for one. */
function isEffectRunning(verb: Verb, effect: Effect, isHit: boolean): boolean {
  const isStart = (effect.when ?? "finish") === "start";
  const requiresHit = !isStart && (effect.requiresHit ?? verb.hitRoll !== undefined);
  return isHit || !requiresHit;
}

function failRun(context: TickContext, run: VerbRun, reason: string): void {
  const { state, result } = context;
  endRun(context, run.agentId, run);
  const attempt = describeAttempt(state.items, run.verb, {
    item: run.usedName,
    target: run.aimName,
  });
  failAction(state, result, run.agentId, attempt, reason);
}

function announceFinish(context: TickContext, run: VerbRun, outcomes: EffectOutcome[]): void {
  const { state, result } = context;
  const made = sumMade(outcomes);
  const making =
    Object.keys(made).length > 0 ? `, making ${describeItemCounts(state.items, made)}` : "";
  const phrases = describeAimedPhrases(
    state,
    run,
    (names) => `${describeOngoingVerb(state.items, run.verb, names)}${making}`,
  );
  broadcastEvent(
    state,
    createEvent(state, findAgent(state, run.agentId), {
      kind: "action_finished",
      ...prefixPhrases(phrases, "finished "),
      ...describeRunTarget(run),
    }),
    result,
  );
}

/**
 * Finishes the agent's verb. An aimed verb checks again that the thing used is still held and the
 * target still alive and in sight. A hit roll is made (a target out of reach by now is missed) and
 * announced; then the `finish` effects run, those that require a hit only on a hit.
 */
export function finishRunningVerb(context: TickContext, agentId: string): void {
  const { state } = context;
  const run = getAgentRuntime(state, agentId).verbRun;
  const verb = run ? findRunVerb(state, run) : undefined;
  if (!run || !verb) {
    endRun(context, agentId, run);
    return;
  }
  const blocker = findFinishBlocker(state, run, verb);
  if (blocker !== null) {
    failRun(context, run, blocker);
    return;
  }
  const reach = computeVerbReach(state, verb, run.usedDefinitionId);
  const isInReach = !run.aim || isAimInReach(state, agentId, run.aim, reach);
  if (!isInReach && verb.hitRoll === undefined) {
    failRun(context, run, `${run.aimName} was out of reach`);
    return;
  }
  const isHit = verb.hitRoll === undefined || (isInReach && rollForHit(state, run, verb));
  if (verb.hitRoll !== undefined) announceHitRoll(context, run, verb, isHit);
  const effectRun: EffectRun = {
    context,
    verb,
    run,
    text: "",
    isAttackAnnounced: verb.hitRoll !== undefined,
  };
  const outcomes = effectsAt(verb, "finish")
    .filter((effect) => isEffectRunning(verb, effect, isHit))
    .map((effect) => applyEffect(effectRun, effect));
  if (isDead(findAgent(state, agentId))) return;
  endRun(context, agentId, run);
  if (verb.hitRoll === undefined) announceFinish(context, run, outcomes);
}

/**
 * Stops a verb early. What its `start` effects did stays done (inputs stay spent) and its
 * `finish` effects never run: the work was spent.
 */
export function cancelRunningVerb(context: TickContext, agentId: string): void {
  endRun(context, agentId, getAgentRuntime(context.state, agentId).verbRun);
}
