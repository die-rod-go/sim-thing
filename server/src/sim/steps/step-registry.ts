import {
  VERB_ONLY_STEPS,
  isFanOutName,
  type FanOutName,
  type Step,
  type StepOfType,
  type StepType,
} from "@village/shared";
import { isSameThing, listThingsWithin, locateThing, type ThingRef } from "../../items/things";
import { findMissingChoice, resolveNumber, scopeOf } from "../../items/values";
import { listClearHearers } from "../../perception/perceive-event";
import { buildPerceptionWorld, listLivingAgents, toPerceiver } from "../world-access";
import { addStep, changeStep, damageStep, removeStep, setStep } from "./data-steps";
import { checkStep, requireStep, useUpStep } from "./need-steps";
import { inspectStep } from "./inspect-step";
import { readStep } from "./read-step";
import { advanceStepIndex, elseStep, endIfStep, ifStep } from "./step-flow";
import { findRoleThing } from "./step-roles";
import {
  DONE,
  type StepHandler,
  type StepOutcome,
  type StepRegistry,
  type StepRun,
} from "./step-run";
import { createStep, destroyStep, moveStep, transformStep } from "./thing-steps";
import { rollHitStep, sleepStep, waitStep } from "./time-steps";
import { announceStep, changeNeedStep, sendStep, soundStep } from "./world-steps";

/**
 * Step types are code; which ones a verb or rule runs, in what order and with what settings is
 * data in `items.json`. A type missing here parses and validates but can't run, and the server
 * refuses an `items.json` that uses it.
 */
export const STEP_REGISTRY: StepRegistry = {
  require: requireStep,
  use_up: useUpStep,
  check: checkStep,
  if: ifStep,
  else: elseStep,
  end_if: endIfStep,
  wait: waitStep,
  sleep: sleepStep,
  roll_hit: rollHitStep,
  change: changeStep,
  damage: damageStep,
  set: setStep,
  add: addStep,
  remove: removeStep,
  move: moveStep,
  create: createStep,
  transform: transformStep,
  destroy: destroyStep,
  send: sendStep,
  sound: soundStep,
  announce: announceStep,
  change_need: changeNeedStep,
  read: readStep,
  inspect: inspectStep,
};

export function isStepBuilt(type: StepType): boolean {
  return Object.hasOwn(STEP_REGISTRY, type);
}

function findHandler(step: Step): StepHandler<StepType> {
  return STEP_REGISTRY[step.step] as StepHandler<StepType>;
}

function describeOwner(run: StepRun): string {
  return run.verbRun === null ? "a rule" : `"${run.verbRun.verbName}"`;
}

function requireAgentForVerbOnly(run: StepRun, step: Step): void {
  if (run.verbRun === null && VERB_ONLY_STEPS.has(step.step)) {
    throw new Error(`The ${step.step} step only works in verbs, not in ${describeOwner(run)}`);
  }
}

function findOn(step: Step): string | undefined {
  return "on" in step ? step.on : undefined;
}

/**
 * Why the step can't run now, or null: a `choice` the decision didn't give, then the step's own
 * check. Nothing changes. A thing named by an `as` that hasn't been picked yet can't be judged.
 */
export function findStepRefusal(run: StepRun, step: Step): string | null {
  requireAgentForVerbOnly(run, step);
  const missing = findMissingChoice(scopeOf(run), step);
  if (missing !== null) return missing;
  if (isFanOutName(findOn(step))) return null;
  return findHandler(step).findRefusal?.(run, step as StepOfType<StepType>) ?? null;
}

/** What the step will surely destroy; one left to `chance` might not, so it sets nothing aside. */
function listSurelyTakenIds(run: StepRun, step: Step): string[] {
  if (step.chance !== undefined && step.step !== "roll_hit") return [];
  return findHandler(step).listTakenIds?.(run, step as StepOfType<StepType>) ?? [];
}

/**
 * The first reason any of the steps from `fromIndex` on can't run now, or null. Each is judged as
 * if the steps before it had run: what an earlier `use_up` takes no longer counts (flour used up
 * frees oven space). Only the branch of each `if` that matches now is checked.
 */
export function findStepListRefusal(
  run: StepRun,
  steps: readonly Step[],
  fromIndex = 0,
): string | null {
  const setAsideIds = new Set<string>();
  const checkRun: StepRun = { ...run, setAsideIds };
  let index = fromIndex;
  while (index < steps.length) {
    const step = steps[index]!;
    const refusal = findStepRefusal(checkRun, step);
    if (refusal !== null) return refusal;
    for (const entityId of listSurelyTakenIds(checkRun, step)) setAsideIds.add(entityId);
    index = advanceStepIndex(checkRun, steps, index, false);
  }
  return null;
}

/** Runs a rule's steps in order, following its `if` blocks. Returns each refusal, in order. */
export function runStepList(
  run: StepRun,
  steps: readonly Step[],
): { step: Step; reason: string }[] {
  const refusals: { step: Step; reason: string }[] = [];
  let index = 0;
  while (index < steps.length) {
    const step = steps[index]!;
    const outcome = applyStep(run, step);
    if (outcome.kind === "refused") refusals.push({ step, reason: outcome.reason });
    index = advanceStepIndex(run, steps, index, true);
  }
  return refusals;
}

/**
 * A `choice` the decision didn't give refuses here too: the check before the verb only saw the
 * branches that matched then, and an earlier step can change which one runs.
 */
function applyOnce(run: StepRun, step: Step): StepOutcome {
  const chance = step.step === "roll_hit" ? undefined : step.chance;
  if (chance !== undefined && run.context.state.random.next() >= chance) return DONE;
  const missing = findMissingChoice(scopeOf(run), step);
  if (missing !== null) return { kind: "refused", reason: missing };
  return findHandler(step).run(run, step as StepOfType<StepType>);
}

/** The thing a fan-out counts from, and where it is; null when it isn't anywhere. */
function locateFanOutCenter(run: StepRun, step: Step) {
  const around = "around" in step ? step.around : undefined;
  if (around === undefined && run.verbRun !== null) {
    throw new Error(`A ${findOn(step)} step in ${describeOwner(run)} needs \`around\``);
  }
  const center = findRoleThing(run, around ?? "self");
  const position = center === null ? null : locateThing(run.context.state, center);
  return center === null || position === null ? null : { center, position };
}

/** Every agent and entity within `radius` tiles of `around`, not counting `around` itself. */
function listNearbyThings(run: StepRun, step: Step): ThingRef[] {
  const found = locateFanOutCenter(run, step);
  if (found === null) return [];
  const radius = "radius" in step ? (step.radius ?? 0) : 0;
  return listThingsWithin(run.context.state, found.position, radius).filter(
    (thing) => !isSameThing(thing, found.center),
  );
}

/**
 * The body of every living agent who would clearly hear a sound of `loudness` made where `around`
 * is, not counting `around` itself.
 */
function listEarshotBodies(run: StepRun, step: Step): ThingRef[] {
  const found = locateFanOutCenter(run, step);
  if (found === null) return [];
  if (!("loudness" in step) || step.loudness === undefined) {
    throw new Error(`An earshot step in ${describeOwner(run)} needs \`loudness\``);
  }
  const { state } = run.context;
  const loudness = resolveNumber(scopeOf(run), step.loudness);
  const listeners = listLivingAgents(state)
    .filter((agent) => !isSameThing({ kind: "agent", agentId: agent.id }, found.center))
    .map(toPerceiver);
  return listClearHearers(buildPerceptionWorld(state), found.position.pos, loudness, listeners).map(
    (listener): ThingRef => ({ kind: "agent", agentId: listener.agentId }),
  );
}

/** Runs the step once on each thing as that thing's `self`, each with its own `chance` roll. */
function applyToEach(run: StepRun, step: Step, things: readonly ThingRef[]): StepOutcome {
  const onSelf = { ...step, on: "self" } as Step;
  for (const thing of things) {
    const outcome = applyOnce({ ...run, self: thing }, onSelf);
    if (outcome.kind === "refused") return outcome;
  }
  return DONE;
}

function applyFanOut(run: StepRun, step: Step, fanOut: FanOutName): StepOutcome {
  const things = fanOut === "nearby" ? listNearbyThings(run, step) : listEarshotBodies(run, step);
  return applyToEach(run, step, things);
}

/**
 * Runs one step after the common settings: skipped after a missed `roll_hit` unless `evenOnMiss`,
 * and after a failed `chance` roll. `on: nearby` runs it on each thing in `radius` of `around`,
 * and `on: earshot` on each living agent's body that would hear a sound of `loudness` made where
 * `around` is; each with its own roll, as that thing's `self`.
 */
export function applyStep(run: StepRun, step: Step): StepOutcome {
  requireAgentForVerbOnly(run, step);
  if (run.verbRun?.isHit === false && step.evenOnMiss !== true) return DONE;
  const on = findOn(step);
  return isFanOutName(on) ? applyFanOut(run, step, on) : applyOnce(run, step);
}
