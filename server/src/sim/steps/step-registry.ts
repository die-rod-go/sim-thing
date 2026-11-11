import { VERB_ONLY_STEPS, type Step, type StepOfType, type StepType } from "@village/shared";
import { isSameThing, listThingsWithin, locateThing } from "../../items/things";
import { findMissingChoice, scopeOf } from "../../items/values";
import { addStep, changeStep, damageStep, removeStep, setStep } from "./data-steps";
import { checkStep, requireStep, useUpStep } from "./need-steps";
import { readStep } from "./read-step";
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
  if (findOn(step) === "nearby") return null;
  return findHandler(step).findRefusal?.(run, step as StepOfType<StepType>) ?? null;
}

function applyOnce(run: StepRun, step: Step): StepOutcome {
  const chance = step.step === "roll_hit" ? undefined : step.chance;
  if (chance !== undefined && run.context.state.random.next() >= chance) return DONE;
  return findHandler(step).run(run, step as StepOfType<StepType>);
}

/** Every agent and entity within `radius` tiles of `around`, not counting `around` itself. */
function listNearbyThings(run: StepRun, step: Step) {
  const { state } = run.context;
  const around = "around" in step ? step.around : undefined;
  if (around === undefined && run.verbRun !== null) {
    throw new Error(`A nearby step in ${describeOwner(run)} needs \`around\``);
  }
  const center = findRoleThing(run, around ?? "self");
  const position = center === null ? null : locateThing(state, center);
  if (center === null || position === null) return [];
  const radius = "radius" in step ? (step.radius ?? 0) : 0;
  return listThingsWithin(state, position, radius).filter((thing) => !isSameThing(thing, center));
}

function applyNearby(run: StepRun, step: Step): StepOutcome {
  const onSelf = { ...step, on: "self" } as Step;
  for (const thing of listNearbyThings(run, step)) {
    const outcome = applyOnce({ ...run, self: thing }, onSelf);
    if (outcome.kind === "refused") return outcome;
  }
  return DONE;
}

/**
 * Runs one step after the common settings: skipped after a missed `roll_hit` unless `evenOnMiss`,
 * and after a failed `chance` roll. `on: nearby` runs it on each thing in `radius` of `around`,
 * each with its own roll, as that thing's `self`.
 */
export function applyStep(run: StepRun, step: Step): StepOutcome {
  requireAgentForVerbOnly(run, step);
  if (run.verbRun?.isHit === false && step.evenOnMiss !== true) return DONE;
  return findOn(step) === "nearby" ? applyNearby(run, step) : applyOnce(run, step);
}
