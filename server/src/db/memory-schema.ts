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

const keyMemorySchema = z.object({ day: z.number().int().positive(), text: z.string() });

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

const reflectionProgressSchema = z.object({
  lastTick: tickSchema.nullable(),
  awakeTicksSince: z.number().int().nonnegative(),
  streamEntriesSince: z.number().int().nonnegative(),
  isOwed: z.boolean(),
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
  reflection: reflectionProgressSchema,
  isRealityPassOwed: z.boolean(),
  failedActsInARow: z.number().int().nonnegative(),
  episodesSinceRealityPass: z.number().int().nonnegative(),
  dayPlanOwedSinceTick: tickSchema.nullable(),
  keyMemories: z.array(keyMemorySchema),
  keyMemoryCandidates: z.array(keyMemorySchema),
  lastAttackReckoningTick: tickSchema.nullable(),
});
