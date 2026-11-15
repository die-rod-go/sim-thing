import { findBlockProblems, isBlockStep, isInsideBlock } from "./step-blocks";
import type { Step } from "./step-schema";
import type { StepScope } from "./step-scope";

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
