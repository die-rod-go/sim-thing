import type { Step, StepType } from "./step-schema";

/*
 * An `if` block lives in the flat step list as markers: `if`, an optional `else`, then `end_if`.
 * Keeping the list flat lets a paused verb resume by one step index.
 */

export const BLOCK_STEPS: ReadonlySet<StepType> = new Set<StepType>(["if", "else", "end_if"]);

export function isBlockStep(step: Step): boolean {
  return BLOCK_STEPS.has(step.step);
}

/** Where an `if` block's `else` (null without one) and `end_if` are. */
export interface BlockBounds {
  elseIndex: number | null;
  endIndex: number;
}

/**
 * The `else` and `end_if` that belong to the `if` or `else` at `index`. Null when the block is
 * never closed, which validation reports.
 */
export function findBlockBounds(steps: readonly Step[], index: number): BlockBounds | null {
  let depth = 0;
  let elseIndex: number | null = null;
  for (let scanIndex = index + 1; scanIndex < steps.length; scanIndex += 1) {
    const type = steps[scanIndex]!.step;
    if (type === "if") depth += 1;
    else if (type === "end_if") {
      if (depth === 0) return { elseIndex, endIndex: scanIndex };
      depth -= 1;
    } else if (type === "else" && depth === 0) elseIndex = scanIndex;
  }
  return null;
}

/** How many `if` blocks each step sits inside; `else` and `end_if` sit level with their `if`. */
export function listBlockDepths(steps: readonly Step[]): number[] {
  let depth = 0;
  return steps.map((step) => {
    if (step.step === "if") return (depth += 1) - 1;
    if (step.step === "end_if") {
      depth = Math.max(depth - 1, 0);
      return depth;
    }
    if (step.step === "else") return Math.max(depth - 1, 0);
    return depth;
  });
}

/** A mismatched marker: an `else` or `end_if` with no open `if`, a second `else`, an unclosed `if`. */
export interface BlockProblem {
  index: number;
  message: string;
}

export function findBlockProblems(steps: readonly Step[]): BlockProblem[] {
  const problems: BlockProblem[] = [];
  const open: { index: number; hasElse: boolean }[] = [];
  steps.forEach((step, index) => {
    if (step.step === "if") open.push({ index, hasElse: false });
    if (step.step === "else") {
      const block = open[open.length - 1];
      if (block === undefined) problems.push({ index, message: "`else` needs an `if` above it." });
      else if (block.hasElse)
        problems.push({ index, message: "An `if` can have only one `else`." });
      else block.hasElse = true;
    }
    if (step.step === "end_if" && open.pop() === undefined) {
      problems.push({ index, message: "`end_if` needs an `if` above it." });
    }
  });
  for (const block of open) {
    problems.push({ index: block.index, message: "This `if` needs an `end_if` below it." });
  }
  return problems;
}

/** Whether the step at `index` sits inside an `if` block. */
export function isInsideBlock(steps: readonly Step[], index: number): boolean {
  return (listBlockDepths(steps)[index] ?? 0) > 0;
}
