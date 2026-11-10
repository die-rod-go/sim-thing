import { TRAIT_NAMES } from "@village/shared";
import type { GoalKind, TraitName } from "@village/shared";
import { z } from "zod";
import { config } from "../config";
import type { ReplySchemas } from "../decision/reply-schema";
import {
  dropEmptyFields,
  looseEnum,
  nullableJsonString,
  strictJsonObject,
} from "../decision/schema-fields";
import type { JsonSchema } from "../llm/types";

const GOAL_KINDS: readonly [GoalKind, ...GoalKind[]] = ["world", "social", "self"];
const [FIRST_TRAIT = "extraversion", ...OTHER_TRAITS] = TRAIT_NAMES;
const TRAIT_ENUM: readonly [TraitName, ...TraitName[]] = [FIRST_TRAIT, ...OTHER_TRAITS];

const requiredText = () => z.string().trim().min(1);

function jsonArray(items: JsonSchema, limits: { minItems?: number; maxItems?: number } = {}) {
  return { type: "array", items, ...limits };
}

export interface MorningReply {
  dailyPlan: string;
  mood?: string;
}

export function buildMorningReplySchema(): ReplySchemas<MorningReply> {
  const replyObject = z.object({ dailyPlan: requiredText(), mood: requiredText().optional() });
  return {
    schema: z.preprocess(dropEmptyFields, replyObject),
    jsonSchema: strictJsonObject({
      dailyPlan: { type: "string", description: "Your plan for today in a few sentences." },
      mood: nullableJsonString("Your mood this morning in a few words, or null."),
    }),
    schemaName: "morning_reply",
  };
}

export interface NightReply {
  summary: string;
  moodEntry: string;
  insights: { text: string }[];
  peopleNotes: { person: string; text: string }[];
}

export function buildNightReplySchema(): ReplySchemas<NightReply> {
  const { maxInsights } = config.reflection;
  const replyObject = z.object({
    summary: requiredText(),
    moodEntry: requiredText(),
    // A model that writes too many insights is trimmed rather than rejected.
    insights: z
      .array(z.object({ text: requiredText() }))
      .min(1)
      .transform((insights) => insights.slice(0, maxInsights)),
    peopleNotes: z
      .array(z.object({ person: requiredText(), text: requiredText() }))
      .optional()
      .transform((notes) => notes ?? []),
  });
  return {
    schema: z.preprocess(dropEmptyFields, replyObject),
    jsonSchema: strictJsonObject({
      summary: { type: "string" },
      moodEntry: { type: "string" },
      insights: jsonArray(strictJsonObject({ text: { type: "string" } }), {
        minItems: 1,
        maxItems: maxInsights,
      }),
      peopleNotes: jsonArray(
        strictJsonObject({ person: { type: "string" }, text: { type: "string" } }),
      ),
    }),
    schemaName: "night_reply",
  };
}

export interface WeeklyReply {
  traitChanges: { trait: TraitName; delta: number; reason: string }[];
  core?: string;
  selfImage?: string;
  goals: { text: string; why: string; progress: string; kind: GoalKind }[];
}

export function buildWeeklyReplySchema(): ReplySchemas<WeeklyReply> {
  const replyObject = z.object({
    traitChanges: z
      .array(z.object({ trait: looseEnum(TRAIT_ENUM), delta: z.number(), reason: requiredText() }))
      .optional()
      .transform((changes) => changes ?? []),
    core: requiredText().optional(),
    selfImage: requiredText().optional(),
    goals: z
      .array(
        z.object({
          text: requiredText(),
          why: z.string().trim(),
          progress: z.string().trim(),
          kind: looseEnum(GOAL_KINDS),
        }),
      )
      .optional()
      .transform((goals) => goals ?? []),
  });
  return {
    schema: z.preprocess(dropEmptyFields, replyObject),
    jsonSchema: strictJsonObject({
      traitChanges: jsonArray(
        strictJsonObject({
          trait: { type: "string", enum: [...TRAIT_ENUM] },
          delta: { type: "number" },
          reason: { type: "string" },
        }),
      ),
      core: nullableJsonString(),
      selfImage: nullableJsonString(),
      goals: jsonArray(
        strictJsonObject({
          text: { type: "string" },
          why: { type: "string" },
          progress: { type: "string" },
          kind: { type: "string", enum: [...GOAL_KINDS] },
        }),
      ),
    }),
    schemaName: "weekly_reply",
  };
}
