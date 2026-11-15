import {
  findBlockBounds,
  matchesThing,
  type Step,
  type StepOfType,
  type ThingView,
} from "@village/shared";
import { viewThing } from "../../items/things";
import { resolveMatcherReads, scopeOf } from "../../items/values";
import { findStepThings } from "./step-roles";
import { DONE, type StepHandler, type StepRun } from "./step-run";

/** The markers do nothing themselves: the list runner reads them to choose the next step. */
const markerStep = { isVerbOnly: false, run: () => DONE };
export const ifStep: StepHandler<"if"> = markerStep;
export const elseStep: StepHandler<"else"> = markerStep;
export const endIfStep: StepHandler<"end_if"> = markerStep;

/** The live things `on` names; an item already gone (eaten) is judged as it was last seen. */
function listConditionViews(run: StepRun, on: string): ThingView[] {
  const { state } = run.context;
  const live = findStepThings(run, on).flatMap((thing) => viewThing(state, thing) ?? []);
  if (live.length > 0) return live;
  const snapshot = run.verbRun?.snapshots[on];
  return snapshot === undefined ? [] : [snapshot];
}

/**
 * Whether every thing `on` names matches the `if`; false when it names nothing. Null when the
 * matcher reads a name not picked yet, so it can't be judged before the verb runs.
 */
export function judgeCondition(
  run: StepRun,
  step: StepOfType<"if">,
  isJudgedLate: boolean,
): boolean | null {
  const condition = resolveMatcherReads(scopeOf(run), step.if);
  if (!condition.isFullyResolved && !isJudgedLate) return null;
  const views = listConditionViews(run, step.on ?? "self");
  return views.length > 0 && views.every((view) => matchesThing(condition.matcher, view));
}

function requireBounds(steps: readonly Step[], index: number) {
  const bounds = findBlockBounds(steps, index);
  if (bounds === null) throw new Error(`The ${steps[index]?.step} step at ${index} has no end_if`);
  return bounds;
}

/** The index past the block that the `if` or `else` at `index` opens. */
function skipBranch(steps: readonly Step[], index: number, toElse: boolean): number {
  const bounds = requireBounds(steps, index);
  return (toElse ? (bounds.elseIndex ?? bounds.endIndex) : bounds.endIndex) + 1;
}

/**
 * The step to run after the one at `index`: into an `if` that matches, past its branch (to the
 * `else`) when it doesn't, and from the end of a first branch past the `else` branch. A null
 * judgment skips the whole block.
 */
export function findNextStepIndex(
  steps: readonly Step[],
  index: number,
  isMatched: boolean | null,
): number {
  const step = steps[index];
  if (step?.step === "if") {
    if (isMatched === null) return skipBranch(steps, index, false);
    return isMatched ? index + 1 : skipBranch(steps, index, true);
  }
  if (step?.step === "else") return skipBranch(steps, index, false);
  return index + 1;
}

/** Runs from `index` to the next step, judging an `if` on the world as it is now. */
export function advanceStepIndex(
  run: StepRun,
  steps: readonly Step[],
  index: number,
  isJudgedLate: boolean,
): number {
  const step = steps[index];
  const isMatched = step?.step === "if" ? judgeCondition(run, step, isJudgedLate) : null;
  return findNextStepIndex(steps, index, isMatched);
}
