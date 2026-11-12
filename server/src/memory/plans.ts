import type { Plan } from "@village/shared";
import { z } from "zod";
import { config } from "../config";
import { strictJsonObject } from "../decision/schema-fields";
import type { JsonSchema } from "../llm/types";

/**
 * Plans as a reflection reply gives them: the full list from now on. Over-long text is rejected and
 * retried, never cut; too many plans or steps are trimmed. Undefined when the reply leaves them out,
 * which means keep the current plans.
 */
export function plansSchema() {
  const { maxPlans, maxSteps, maxAimChars, maxStepChars, maxKeepFromChars } = config.plans;
  return z
    .array(
      z.object({
        aim: z.string().trim().min(1).max(maxAimChars),
        steps: z
          .array(z.string().trim().min(1).max(maxStepChars))
          .transform((steps) => steps.slice(0, maxSteps)),
        keepFrom: z.string().trim().max(maxKeepFromChars),
      }),
    )
    .optional()
    .transform((plans): Plan[] | undefined => plans?.slice(0, maxPlans));
}

export function plansJsonSchema(): JsonSchema {
  return {
    type: "array",
    items: strictJsonObject({
      aim: { type: "string" },
      steps: { type: "array", items: { type: "string" } },
      keepFrom: { type: "string" },
    }),
  };
}

/** `plans` with the first step of plan `planNumber` (1-based) removed; unchanged for an unknown number. */
export function completeNextStep(plans: readonly Plan[], planNumber: number): Plan[] {
  return plans.map((plan, index) =>
    index === planNumber - 1 ? { ...plan, steps: plan.steps.slice(1) } : plan,
  );
}

/** "Plan 1: aim. Next: a. Then: b; c. Keep it from: x." for each plan; empty parts are left out. */
export function describePlanLines(plans: readonly Plan[]): string[] {
  return plans.map((plan, index) => {
    const [nextStep, ...laterSteps] = plan.steps;
    const parts = [
      `Plan ${index + 1}: ${plan.aim}.`,
      nextStep === undefined ? "" : `Next: ${nextStep}.`,
      laterSteps.length > 0 ? `Then: ${laterSteps.join("; ")}.` : "",
      plan.keepFrom === "" ? "" : `Keep it from: ${plan.keepFrom}.`,
    ];
    return parts.filter((part) => part !== "").join(" ");
  });
}

/** The aims and next steps, as free text for the recall cue and for finding named people. */
export function describePlanFocus(plans: readonly Plan[]): string {
  return plans.map((plan) => [plan.aim, plan.steps[0] ?? ""].join(" ")).join("\n");
}

/** Aims, every step and keepFrom: where a plan can name a person. */
export function describePlanText(plans: readonly Plan[]): string[] {
  return plans.flatMap((plan) => [plan.aim, ...plan.steps, plan.keepFrom]);
}
