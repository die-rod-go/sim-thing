import type { Matcher } from "./matcher-schema";
import { findBlockProblems, isBlockStep, isInsideBlock } from "./step-blocks";
import type { Step } from "./step-schema";
import { resolveThing, type StepScope } from "./step-scope";

/** What was known when an `if` opened, and what its first branch left once the `else` came. */
interface OpenBlock {
  names: Map<string, Matcher>;
  roles: Map<string, Matcher>;
  thenNames: Map<string, Matcher> | null;
  thenRoles: Map<string, Matcher> | null;
}

/**
 * Tracks `if` blocks while a step list is checked in order, so each branch starts from what was
 * known at its `if`, and after `end_if` only what both branches are sure of is known.
 */
export class BlockTracker {
  private readonly open: OpenBlock[] = [];

  constructor(private readonly scope: StepScope) {}

  /** Call once a step's own checks are done. */
  noteStep(step: Step): void {
    const { scope } = this;
    if (step.step === "if") {
      this.open.push({
        names: new Map(scope.givenNames),
        roles: new Map(scope.transformedRoles),
        thenNames: null,
        thenRoles: null,
      });
    } else if (step.step === "else") {
      const block = this.open[this.open.length - 1];
      if (block === undefined || block.thenNames !== null) return;
      block.thenNames = new Map(scope.givenNames);
      block.thenRoles = new Map(scope.transformedRoles);
      this.restore(block);
    } else if (step.step === "end_if") {
      const block = this.open.pop();
      if (block !== undefined) this.close(block);
    }
  }

  private restore(block: OpenBlock): void {
    this.scope.givenNames.clear();
    for (const [name, matcher] of block.names) this.scope.givenNames.set(name, matcher);
    this.scope.transformedRoles.clear();
    for (const [role, matcher] of block.roles) this.scope.transformedRoles.set(role, matcher);
  }

  private close(block: OpenBlock): void {
    const { scope } = this;
    const currentRoles = new Map(scope.transformedRoles);
    const hasElse = block.thenRoles !== null;
    for (const names of [block.thenNames ?? new Map(), scope.givenNames]) {
      for (const name of names.keys()) if (!block.names.has(name)) scope.blockNames.add(name);
    }
    const branchRoles = [block.thenRoles ?? currentRoles, hasElse ? currentRoles : block.roles];
    this.restore(block);
    const changedRoles = new Set(branchRoles.flatMap((roles) => [...roles.keys()]));
    for (const role of changedRoles) {
      const before = resolveThing(scope, role);
      if (!before.ok || before.matcher === null) continue;
      const beforeMatcher = before.matcher;
      const options = branchRoles.map((roles) => roles.get(role) ?? beforeMatcher);
      scope.transformedRoles.set(role, { anyOf: options });
    }
  }
}

/** Mismatched block markers, settings that mean nothing on one, and a `roll_hit` inside a block. */
export function checkBlockSteps(steps: readonly Step[], ownerPath: string, scope: StepScope) {
  const { problems } = scope.context;
  for (const problem of findBlockProblems(steps)) {
    problems.error(`${ownerPath}.steps.${problem.index}`, problem.message);
  }
  steps.forEach((step, index) => {
    const path = `${ownerPath}.steps.${index}`;
    if (isBlockStep(step) && (step.chance !== undefined || step.evenOnMiss !== undefined)) {
      problems.error(path, `\`chance\` and \`evenOnMiss\` don't work on \`${step.step}\`.`);
    }
    if (step.step === "if" && (step.on === "nearby" || step.on === "earshot")) {
      problems.error(`${path}.on`, `\`if\` works on one thing, not on \`${step.on}\`.`);
    }
    if (step.step === "roll_hit" && isInsideBlock(steps, index)) {
      problems.error(path, "`roll_hit` can't go inside an `if` block.");
    }
  });
}
