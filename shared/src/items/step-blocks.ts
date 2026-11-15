import type { Matcher } from "./matcher-schema";
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

/** Whether one run can reach both steps: they aren't in the two branches of one `if`. */
export function canBothRun(steps: readonly Step[], earlier: number, later: number): boolean {
  for (let index = 0; index < earlier; index += 1) {
    if (steps[index]!.step !== "if") continue;
    const bounds = findBlockBounds(steps, index);
    if (bounds === null || bounds.elseIndex === null) continue;
    const isFirstBranch = earlier < bounds.elseIndex;
    const isSecondBranch = bounds.elseIndex < later && later < bounds.endIndex;
    if (isFirstBranch && isSecondBranch) return false;
  }
  return true;
}

/** Whether the step is a `wait` that no other `wait` can come before in a run: the one heard. */
export function isFirstWait(steps: readonly Step[], index: number): boolean {
  if (steps[index]?.step !== "wait") return false;
  return !steps
    .slice(0, index)
    .some(
      (earlier, earlierIndex) => earlier.step === "wait" && canBothRun(steps, earlierIndex, index),
    );
}

/** What a step list knows at a point: the `as` names given and the roles a `transform` changed. */
export interface KnownThings {
  /** Each `as` name given so far, with a matcher every pick of that name meets. */
  givenNames: Map<string, Matcher>;
  /** Roles a `transform` above changed, with a matcher the thing meets from then on. */
  transformedRoles: Map<string, Matcher>;
  /** `as` names given in only some branches of a closed `if` block, so they may not exist after it. */
  blockNames: Set<string>;
}

interface Branch {
  names: Map<string, Matcher>;
  roles: Map<string, Matcher>;
}

interface OpenBlock {
  before: Branch;
  /** What the first branch left, once the `else` came. */
  firstBranch: Branch | null;
}

function replaceEntries(target: Map<string, Matcher>, source: ReadonlyMap<string, Matcher>) {
  target.clear();
  for (const [key, matcher] of source) target.set(key, matcher);
}

function listAllKeys(maps: readonly ReadonlyMap<string, Matcher>[]): Set<string> {
  return new Set(maps.flatMap((map) => [...map.keys()]));
}

/** A thing either branch could have left: one matcher when both left the same. */
function mergeBranchMatchers(matchers: readonly Matcher[]): Matcher {
  const distinct = [...new Set(matchers)];
  return distinct.length === 1 ? distinct[0]! : { anyOf: distinct };
}

/**
 * Follows `if` blocks while a step list is walked in order, so each branch starts from what was
 * known at its `if`, and after `end_if` only what every branch is sure of is known: a name both
 * branches gave, and a thing as either branch could have left it. Without an `else`, the second
 * branch is skipping the block.
 */
export class BlockTracker {
  private readonly open: OpenBlock[] = [];

  /** `findRoleMatcher` gives what a role is before any `transform`, or null when unknown. */
  constructor(
    private readonly known: KnownThings,
    private readonly findRoleMatcher: (role: string) => Matcher | null,
  ) {}

  /** Call once the step's own names and transforms are noted. */
  noteStep(step: Step): void {
    if (step.step === "if") {
      this.open.push({ before: this.takeBranch(), firstBranch: null });
    } else if (step.step === "else") {
      const block = this.open[this.open.length - 1];
      if (block === undefined || block.firstBranch !== null) return;
      block.firstBranch = this.takeBranch();
      this.restore(block.before);
    } else if (step.step === "end_if") {
      const block = this.open.pop();
      if (block !== undefined) this.close(block);
    }
  }

  private takeBranch(): Branch {
    return {
      names: new Map(this.known.givenNames),
      roles: new Map(this.known.transformedRoles),
    };
  }

  private restore(branch: Branch): void {
    replaceEntries(this.known.givenNames, branch.names);
    replaceEntries(this.known.transformedRoles, branch.roles);
  }

  private close(block: OpenBlock): void {
    const lastBranch = this.takeBranch();
    const branches =
      block.firstBranch === null ? [lastBranch, block.before] : [block.firstBranch, lastBranch];
    this.restore(block.before);
    for (const name of listAllKeys(branches.map((branch) => branch.names))) {
      const matchers = branches.flatMap((branch) => branch.names.get(name) ?? []);
      if (matchers.length < branches.length) this.known.blockNames.add(name);
      else this.known.givenNames.set(name, mergeBranchMatchers(matchers));
    }
    for (const role of listAllKeys(branches.map((branch) => branch.roles))) {
      const original = this.findRoleMatcher(role);
      if (original === null) continue;
      const matchers = branches.map((branch) => branch.roles.get(role) ?? original);
      this.known.transformedRoles.set(role, mergeBranchMatchers(matchers));
    }
  }
}
