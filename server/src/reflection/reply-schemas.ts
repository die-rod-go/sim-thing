import { TRAIT_NAMES } from "@village/shared";
import type { Goal, Plan, TraitName } from "@village/shared";
import { z } from "zod";
import { config } from "../config";
import type { ReplySchemas } from "../decision/reply-schema";
import {
  dropEmptyFields,
  looseEnum,
  nullableJsonObject,
  nullableJsonString,
  strictJsonObject,
} from "../decision/schema-fields";
import type { JsonSchema } from "../llm/types";
import { dossierEntriesJsonSchema, dossierEntriesSchema } from "../memory/dossiers";
import type { DossierEntry } from "../memory/dossiers";
import { plansJsonSchema, plansSchema } from "../memory/plans";
import {
  goalProgressJsonSchema,
  goalProgressSchema,
  goalsJsonSchema,
  goalsSchema,
  type GoalProgressEntry,
} from "./goals-schema";

const [FIRST_TRAIT = "extraversion", ...OTHER_TRAITS] = TRAIT_NAMES;
const TRAIT_ENUM: readonly [TraitName, ...TraitName[]] = [FIRST_TRAIT, ...OTHER_TRAITS];

const requiredText = () => z.string().trim().min(1);
/** Text kept as a memory: over-long replies are rejected and retried, never cut. */
const memoryText = () => requiredText().max(config.memory.maxMemoryChars);

/** Strict structured output (Anthropic) rejects `maxItems` and any `minItems` above 1. */
function jsonArray(items: JsonSchema, limits: { minItems?: 0 | 1 } = {}) {
  return { type: "array", items, ...limits };
}

export interface MorningReply {
  dailyPlan: string;
  /** The full list from now on; undefined keeps the current plans. */
  plans?: Plan[];
  mood?: string;
}

export function buildMorningReplySchema(): ReplySchemas<MorningReply> {
  const replyObject = z.object({
    dailyPlan: requiredText(),
    plans: plansSchema(),
    mood: requiredText().optional(),
  });
  return {
    schema: z.preprocess(dropEmptyFields, replyObject),
    jsonSchema: strictJsonObject({
      dailyPlan: { type: "string", description: "Your plan for today in a few sentences." },
      plans: plansJsonSchema(),
      mood: nullableJsonString("Your mood this morning in a few words, or null."),
    }),
    schemaName: "morning_reply",
  };
}

export interface DaytimeReply {
  /** Private; only the call log keeps it. */
  thinking: string;
  insights: { text: string }[];
  goalProgress: GoalProgressEntry[];
  /** The full list from now on; undefined keeps the current plans. */
  plans?: Plan[];
  dossiers: DossierEntry[];
  mood?: string;
}

export function buildDaytimeReplySchema(): ReplySchemas<DaytimeReply> {
  const { daytimeMaxInsights } = config.reflection;
  const replyObject = z.object({
    thinking: requiredText(),
    insights: z
      .array(z.object({ text: memoryText() }))
      .optional()
      .transform((insights) => (insights ?? []).slice(0, daytimeMaxInsights)),
    goalProgress: goalProgressSchema(),
    plans: plansSchema(),
    dossiers: dossierEntriesSchema(),
    mood: requiredText().optional(),
  });
  return {
    schema: z.preprocess(dropEmptyFields, replyObject),
    jsonSchema: strictJsonObject({
      thinking: { type: "string" },
      insights: jsonArray(strictJsonObject({ text: { type: "string" } })),
      goalProgress: goalProgressJsonSchema(),
      plans: nullableJsonObject(plansJsonSchema()),
      dossiers: dossierEntriesJsonSchema(),
      mood: nullableJsonString("Your mood now in a few words, or null."),
    }),
    schemaName: "daytime_reply",
  };
}

export interface NightReply {
  summary: string;
  moodEntry: string;
  insights: { text: string }[];
  dossiers: DossierEntry[];
  /** The full list from now on; empty keeps the current goals. */
  goals: Goal[];
  /** The full list from now on; undefined keeps the current plans. */
  plans?: Plan[];
}

export function buildNightReplySchema(): ReplySchemas<NightReply> {
  const { maxInsights } = config.reflection;
  const replyObject = z.object({
    summary: memoryText(),
    moodEntry: memoryText(),
    // A model that writes too many insights is trimmed rather than rejected.
    insights: z
      .array(z.object({ text: memoryText() }))
      .min(1)
      .transform((insights) => insights.slice(0, maxInsights)),
    dossiers: dossierEntriesSchema(),
    goals: goalsSchema(),
    plans: plansSchema(),
  });
  return {
    schema: z.preprocess(dropEmptyFields, replyObject),
    jsonSchema: strictJsonObject({
      summary: { type: "string" },
      moodEntry: { type: "string" },
      insights: jsonArray(strictJsonObject({ text: { type: "string" } }), { minItems: 1 }),
      dossiers: dossierEntriesJsonSchema(),
      goals: goalsJsonSchema(),
      plans: nullableJsonObject(plansJsonSchema()),
    }),
    schemaName: "night_reply",
  };
}

export interface WeeklyReply {
  traitChanges: { trait: TraitName; delta: number; reason: string }[];
  profession?: string;
  core?: string;
  selfImage?: string;
}

export function buildWeeklyReplySchema(): ReplySchemas<WeeklyReply> {
  const replyObject = z.object({
    traitChanges: z
      .array(z.object({ trait: looseEnum(TRAIT_ENUM), delta: z.number(), reason: requiredText() }))
      .optional()
      .transform((changes) => changes ?? []),
    profession: requiredText().optional(),
    core: requiredText().optional(),
    selfImage: requiredText().optional(),
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
      profession: nullableJsonString(),
      core: nullableJsonString(),
      selfImage: nullableJsonString(),
    }),
    schemaName: "weekly_reply",
  };
}
