import { fieldValueSchema } from "@village/shared";
import { z } from "zod";
import type { WorldState } from "./world-state";

const positionSchema = z.object({ x: z.number().int(), y: z.number().int() });

const walkDestinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("place"), placeName: z.string() }),
  z.object({ kind: z.literal("agent"), agentId: z.string() }),
  z.object({ kind: z.literal("entity"), entityId: z.string() }),
]);

/**
 * What a decision asked a verb to do, in the reply's own words. It is resolved to things each time
 * the verb starts, so a walk that leads to one resolves it again on arrival.
 */
const interactRequestSchema = z.object({
  verb: z.string(),
  /** The reply's `item`. */
  itemName: z.string().optional(),
  /** The reply's `target`. */
  targetName: z.string().optional(),
  amount: z.number().int().positive().optional(),
  text: z.string().optional(),
  minutes: z.number().optional(),
});

const walkSchema = z.object({
  destination: walkDestinationSchema,
  remainingSteps: z.array(positionSchema),
  /** Set when the walk leads to a verb that starts once its item and target are in reach. */
  pendingVerb: interactRequestSchema.nullable(),
  /** For a walk after an aimed verb's target: the tick the agent stops following and gives up. */
  giveUpAtTick: z.number().int().optional(),
});

const thingRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("entity"), entityId: z.string() }),
  z.object({ kind: z.literal("agent"), agentId: z.string() }),
]);

/** A thing as it was when last present, so a verb still reads it after a step destroyed it. */
const thingSnapshotSchema = z.object({
  definitionId: z.string(),
  name: z.string(),
  components: z.record(z.string(), z.record(z.string(), fieldValueSchema)),
});

/** What the decision supplied, read by steps as `choice.amount`, `choice.minutes`, `choice.text`. */
const verbChoiceSchema = z.object({
  amount: z.number().int().positive(),
  minutes: z.number().optional(),
  text: z.string().optional(),
});

/** A verb in progress, between its steps. */
const verbRunSchema = z.object({
  agentId: z.string(),
  /** Index into `items.json` verbs, with the name to detect a changed file. */
  verbIndex: z.number().int().nonnegative(),
  verbName: z.string(),
  /** The item and the rest of its stack, oldest first; empty for a bare-handed verb. */
  itemIds: z.array(z.string()),
  itemName: z.string(),
  /** The thing the item was inside, when it was taken from something. */
  from: thingRefSchema.nullable(),
  target: thingRefSchema.nullable(),
  targetName: z.string().nullable(),
  choice: verbChoiceSchema,
  /** The next step to run. */
  stepIndex: z.number().int().nonnegative(),
  /** Null until a `roll_hit` has run. */
  isHit: z.boolean().nullable(),
  /** Last known components of `item`, `target` and each `as` name. */
  snapshots: z.record(z.string(), thingSnapshotSchema),
  /** The entity each `as` name stands for. */
  namedIds: z.record(z.string(), z.string()),
  /** Where each item was when the verb started (its holder; null on a tile), to notice it was taken. */
  itemHolderIds: z.record(z.string(), z.string().nullable()),
  /** Entities this verb moved or destroyed, which needn't be where they were. */
  touchedIds: z.array(z.string()),
  /** What its steps made so far, by definition id, for "finished baking bread, making 4 bread". */
  made: z.record(z.string(), z.number().int().nonnegative()),
  /** Whether a `wait` has been reached, so `action_started` was announced. */
  hasWaited: z.boolean(),
  startedAtTick: z.number().int(),
});

const pendingDecisionSchema = z.object({
  reason: z.string(),
  /** Urgent reasons (own name, conversation, woken, handed something) skip the interrupt cooldown. */
  isUrgent: z.boolean(),
});

const agentRuntimeSchema = z.object({
  walk: walkSchema.nullable(),
  verbRun: verbRunSchema.nullable(),
  lastInterruptTick: z.number().int().nullable(),
  visibleAgentIds: z.array(z.string()),
  lastFailure: z.string().nullable(),
  pendingDecision: pendingDecisionSchema.nullable(),
  visitedPlaces: z.array(z.string()),
});

const spokenLineSchema = z.object({
  speakerId: z.string(),
  speakerName: z.string(),
  tick: z.number().int(),
  words: z.string(),
  volume: z.enum(["whisper", "normal", "shout"]),
  clearListenerIds: z.array(z.string()),
  muffledListenerIds: z.array(z.string()),
});

/** Everything besides agents, entities and memories that the sim needs to resume exactly. */
export const simRuntimeSchema = z.object({
  agentRuntimes: z.record(z.string(), agentRuntimeSchema),
  conversationLog: z.object({ lines: z.array(spokenLineSchema) }),
  memoryIdCounter: z.number().int().nonnegative(),
  lastForgettingTick: z.number().int().nonnegative(),
  /** Per agent: when reflection passes last ran and whether the agent is asleep; see `reflection/schedule`. */
  reflectionSchedules: z.record(
    z.string(),
    z.object({
      lastNightPassTick: z.number().int().nullable(),
      nightPassCount: z.number().int().nonnegative(),
      sleepStartedAtTick: z.number().int().nullable(),
      /** Absent in saves made before the daytime pass existed. */
      lastReflectionTick: z.number().int().nullable().default(null),
    }),
  ),
  /** Absent in saves made before moments existed. */
  nextMomentId: z.number().int().positive().optional(),
});

export type SimRuntime = z.infer<typeof simRuntimeSchema>;
export type AgentRuntime = z.infer<typeof agentRuntimeSchema>;
export type Walk = z.infer<typeof walkSchema>;
export type WalkDestination = z.infer<typeof walkDestinationSchema>;
export type InteractRequest = z.infer<typeof interactRequestSchema>;
export type VerbRun = z.infer<typeof verbRunSchema>;
export type VerbChoice = z.infer<typeof verbChoiceSchema>;
export type ThingSnapshot = z.infer<typeof thingSnapshotSchema>;
export type PendingDecision = z.infer<typeof pendingDecisionSchema>;

export function createAgentRuntime(startPlace: string): AgentRuntime {
  return {
    walk: null,
    verbRun: null,
    lastInterruptTick: null,
    visibleAgentIds: [],
    lastFailure: null,
    pendingDecision: null,
    visitedPlaces: [startPlace],
  };
}

/** The agent's runtime record, created on first use (e.g. for agents added since a save). */
export function getAgentRuntime(state: WorldState, agentId: string): AgentRuntime {
  const existing = state.agentRuntimes[agentId];
  if (existing) return existing;
  const agent = state.agents.find((candidate) => candidate.id === agentId);
  const created = createAgentRuntime(agent?.place ?? "");
  state.agentRuntimes[agentId] = created;
  return created;
}

/** Flags a decision; an urgent reason replaces a non-urgent one, never the other way round. */
export function requestDecision(runtime: AgentRuntime, reason: string, isUrgent: boolean): void {
  if (runtime.pendingDecision?.isUrgent && !isUrgent) return;
  runtime.pendingDecision = { reason, isUrgent };
}
