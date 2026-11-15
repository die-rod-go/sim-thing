import { findBlockBounds, type Step } from "@village/shared";
import { judgeCondition } from "./step-condition";
import { DONE, type StepHandler, type StepRun } from "./step-run";

/** The markers do nothing themselves: the list runner reads them to choose the next step. */
const markerStep = { isVerbOnly: false, run: () => DONE };
export const ifStep: StepHandler<"if"> = markerStep;
export const elseStep: StepHandler<"else"> = markerStep;
export const endIfStep: StepHandler<"end_if"> = markerStep;

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
  const isMatched =
    step?.step === "if" ? judgeCondition(run, step.on ?? "self", step.if, isJudgedLate) : null;
  return findNextStepIndex(steps, index, isMatched);
}
