import type { Agent, ItemCatalog } from "@village/shared";
import { z } from "zod";
import { config } from "../config";
import type { HeldKnowledge } from "../decision/context";
import type { ReplySchemas } from "../decision/reply-schema";
import { nullableJsonObject, strictJsonObject } from "../decision/schema-fields";
import { renderTemplate } from "../llm/templates";
import {
  LONG_TERM_GOAL_LIST_JSON,
  buildPassContext,
  longTermGoalListSchema,
} from "../passes/pass-prompts";
import { describeWorldKnowledge } from "../passes/world-knowledge";
import { replaceAgenda } from "./agenda";
import { PLANNED_ITEM_JSON, plannedItemSchema } from "./agenda-schema";

const DAY_PLAN_TEMPLATE = "day-plan";

const dayPlanReplySchema = z.object({
  agenda: z.array(plannedItemSchema).transform((items) => items.slice(0, config.agenda.maxItems)),
  longTermGoals: longTermGoalListSchema.nullable(),
});

export type DayPlanReply = z.infer<typeof dayPlanReplySchema>;

export function buildDayPlanReplySchema(): ReplySchemas<DayPlanReply> {
  return {
    schema: dayPlanReplySchema,
    jsonSchema: strictJsonObject({
      agenda: { type: "array", items: PLANNED_ITEM_JSON },
      longTermGoals: nullableJsonObject(LONG_TERM_GOAL_LIST_JSON),
    }),
    schemaName: "day_plan_reply",
  };
}

export interface DayPlanInput {
  agent: Agent;
  held: HeldKnowledge;
  items: ItemCatalog;
  /** Where the agent is and who is around, already described. */
  situation: string;
}

/** The day plan's prompt: the world, everything the agent holds, where it is, then the question. */
export function buildDayPlanPrompt(input: DayPlanInput, promptsDirectory?: string): string {
  return renderTemplate(
    DAY_PLAN_TEMPLATE,
    {
      name: input.agent.name,
      worldKnowledge: describeWorldKnowledge(input.items, promptsDirectory),
      context: buildPassContext(input.agent, input.held, promptsDirectory),
      situation: input.situation,
      maxItems: String(config.agenda.maxItems),
      maxChars: String(config.agenda.itemMaxChars),
      maxGoals: String(config.goals.maxLongTerm),
      goalMaxChars: String(config.goals.longTermFieldMaxChars),
    },
    promptsDirectory,
  );
}

/** The agent with its new agenda, and its long-term goals when the plan rewrote them. */
export function applyDayPlan(agent: Agent, reply: DayPlanReply): Agent {
  const planned = replaceAgenda(agent, reply.agenda);
  if (reply.longTermGoals === null) return planned;
  return { ...planned, longTermGoals: reply.longTermGoals.map((goal) => ({ ...goal })) };
}
