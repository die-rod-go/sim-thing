import type { Goal, GoalKind } from "@village/shared";
import { z } from "zod";
import { looseEnum, strictJsonObject } from "../decision/schema-fields";
import type { JsonSchema } from "../llm/types";

const GOAL_KINDS: readonly [GoalKind, ...GoalKind[]] = ["world", "social", "self"];

/** The full goal list as a reflection reply gives it; undefined or empty means keep the current goals. */
export function goalsSchema() {
  return z
    .array(
      z.object({
        text: z.string().trim().min(1),
        why: z.string().trim(),
        progress: z.string().trim(),
        kind: looseEnum(GOAL_KINDS),
      }),
    )
    .optional()
    .transform((goals): Goal[] => goals ?? []);
}

export function goalsJsonSchema(): JsonSchema {
  return {
    type: "array",
    items: strictJsonObject({
      text: { type: "string" },
      why: { type: "string" },
      progress: { type: "string" },
      kind: { type: "string", enum: [...GOAL_KINDS] },
    }),
  };
}

export interface GoalProgressEntry {
  goal: number;
  progress: string;
}

/** Goal numbers are 1-based, as listed in the prompt. */
export function goalProgressSchema() {
  return z
    .array(z.object({ goal: z.number().int(), progress: z.string().trim().min(1) }))
    .optional()
    .transform((entries): GoalProgressEntry[] => entries ?? []);
}

export function goalProgressJsonSchema(): JsonSchema {
  return {
    type: "array",
    items: strictJsonObject({ goal: { type: "integer" }, progress: { type: "string" } }),
  };
}

/** The goals with each listed goal's progress replaced; numbers that match no goal are ignored. */
export function applyGoalProgress(goals: readonly Goal[], entries: readonly GoalProgressEntry[]) {
  return goals.map((goal, index) => {
    const entry = entries.findLast((candidate) => candidate.goal === index + 1);
    return entry === undefined ? goal : { ...goal, progress: entry.progress };
  });
}
