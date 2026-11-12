import { listMentionedComponents, type Step } from "@village/shared";
import { moveWithin, removeAt, replaceAt } from "./list-edits";

export function insertStep(steps: readonly Step[], index: number, step: Step): Step[] {
  const position = Math.min(Math.max(index, 0), steps.length);
  return [...steps.slice(0, position), step, ...steps.slice(position)];
}

export function removeStep(steps: readonly Step[], index: number): Step[] {
  return removeAt(steps, index);
}

export function replaceStep(steps: readonly Step[], index: number, step: Step): Step[] {
  return replaceAt(steps, index, step);
}

export function moveStep(steps: readonly Step[], fromIndex: number, toIndex: number): Step[] {
  return moveWithin(steps, fromIndex, toIndex);
}

/** Sets one setting of a step, or removes it when `value` is undefined. */
export function withStepSetting<StepValue extends Step, Key extends keyof StepValue>(
  step: StepValue,
  key: Key,
  value: StepValue[Key] | undefined,
): StepValue {
  if (value !== undefined) return { ...step, [key]: value };
  return Object.fromEntries(Object.entries(step).filter(([name]) => name !== key)) as StepValue;
}

export function hasRollHitBefore(steps: readonly Step[], index: number): boolean {
  return steps.slice(0, index).some((step) => step.step === "roll_hit");
}

/** True for steps that only run on a hit: any `roll_hit` above them. */
export function isAfterRollHit(steps: readonly Step[], index: number): boolean {
  return hasRollHitBefore(steps, index);
}

/** Loudness only belongs on a verb's first `wait`. */
export function isFirstWait(steps: readonly Step[], index: number): boolean {
  return (
    steps[index]?.step === "wait" &&
    !steps.slice(0, index).some((earlier) => earlier.step === "wait")
  );
}

/** A heading the list draws just above the step at `beforeIndex` (steps.length: below the last). */
export interface StepDivider {
  beforeIndex: number;
  label: string;
}

/**
 * Headings that explain when steps run, in list order. A verb with a `wait` gets "when it starts"
 * at index 0 and, below each wait, "when it finishes" (the first) or "after the next wait" (later
 * ones); each `roll_hit` gets "on a hit" below it. Rules get none.
 */
export function listStepDividers(
  steps: readonly Step[],
  ownerKind: "verb" | "rule",
): StepDivider[] {
  if (ownerKind === "rule") return [];
  const dividers: StepDivider[] = [];
  let waitCount = 0;
  steps.forEach((step, index) => {
    if (step.step === "wait") {
      if (waitCount === 0) dividers.push({ beforeIndex: 0, label: "when it starts" });
      dividers.push({
        beforeIndex: index + 1,
        label: waitCount === 0 ? "when it finishes" : "after the next wait",
      });
      waitCount += 1;
    }
    if (step.step === "roll_hit") dividers.push({ beforeIndex: index + 1, label: "on a hit" });
  });
  return dividers.sort((first, second) => first.beforeIndex - second.beforeIndex);
}

function findComponentOfPath(path: string): string {
  return path.split(".")[0] ?? path;
}

/** Components a step names: added or removed, in a field path, or in a matcher it carries. */
export function listStepComponents(step: Step): string[] {
  const components: string[] = [];
  if ("component" in step) components.push(step.component);
  if ("field" in step) components.push(findComponentOfPath(step.field));
  if ("author" in step && step.author !== undefined) {
    components.push(findComponentOfPath(step.author));
  }
  if ("rule" in step) components.push(...listMentionedComponents(step.rule));
  if ("if" in step) components.push(...listMentionedComponents(step.if));
  if (step.step === "create" && step.fields !== undefined) {
    components.push(...Object.keys(step.fields).map(findComponentOfPath));
  }
  return components;
}

/** Stimuli named literally by `send` steps. */
export function listStepStimuli(step: Step): string[] {
  return step.step === "send" && typeof step.stimulus === "string" ? [step.stimulus] : [];
}
