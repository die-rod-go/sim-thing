import type { AgentMemory } from "@village/shared";
import { z } from "zod";

const tickSchema = z.number().int().nonnegative();

const summaryLevelSchema = z.enum(["episode", "chronicle", "daySummary", "history"]);

const streamEntrySchema = z.object({
  text: z.string(),
  tick: tickSchema,
  count: z.number().int().positive().optional(),
  endTick: tickSchema.optional(),
  speech: z.object({ speakerId: z.string(), words: z.string() }).optional(),
});

const keyMemorySchema = z.object({ tick: tickSchema, text: z.string() });

const summarySchema = z.object({
  level: summaryLevelSchema,
  startTick: tickSchema,
  endTick: tickSchema,
  text: z.string(),
});

const midnightProgressSchema = z.object({
  day: z.number().int(),
  step: summaryLevelSchema,
  newDaySummary: summarySchema.nullable(),
  chroniclesSummarized: z.number().int().nonnegative(),
});

const passProgressSchema = z.object({
  episodesSincePeople: z.number().int().nonnegative(),
  episodesSinceReality: z.number().int().nonnegative(),
  isIdentityOwed: z.boolean(),
  isLongTermGoalsOwed: z.boolean(),
});

export const agentMemorySchema: z.ZodType<AgentMemory> = z.object({
  stream: z.array(streamEntrySchema),
  episodes: z.array(summarySchema),
  chronicles: z.array(summarySchema),
  daySummary: summarySchema.nullable(),
  history: summarySchema.nullable(),
  lastMidnightDay: z.number().int(),
  midnight: midnightProgressSchema.nullable(),
  retryAtTick: tickSchema.nullable(),
  passes: passProgressSchema,
  dayPlanOwedSinceTick: tickSchema.nullable(),
  keyMemories: z.array(keyMemorySchema),
  keyMemoryCandidates: z.array(keyMemorySchema),
  lastAttackReckoningTick: tickSchema.nullable(),
});
