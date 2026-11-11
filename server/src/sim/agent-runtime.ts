import { z } from "zod";
import type { WorldState } from "./world-state";

const positionSchema = z.object({ x: z.number().int(), y: z.number().int() });

const walkDestinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("place"), placeName: z.string() }),
  z.object({ kind: z.literal("agent"), agentId: z.string() }),
  z.object({ kind: z.literal("entity"), entityId: z.string() }),
]);

/** What an aimed verb is aimed at: an agent (the user itself included) or an entity. */
const verbAimSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("agent"), agentId: z.string() }),
  z.object({ kind: z.literal("entity"), entityId: z.string() }),
]);

/**
 * What a verb is used with: an entity (held bread, the oven), a dead agent's body (to take from)
 * or nothing (a bare-handed verb).
 */
const usedThingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("entity"), entityId: z.string() }),
  z.object({ kind: z.literal("body"), agentId: z.string() }),
  z.object({ kind: z.literal("user") }),
]);

/** What the decision's `item` and `amount` name for a verb that moves things (`put`, `take`). */
const chosenRequestSchema = z.object({ name: z.string(), amount: z.number().int().positive() });

/** A verb to start once the agent gets where it is going. */
const pendingVerbSchema = z.object({
  verb: z.string(),
  text: z.string().optional(),
  minutes: z.number().optional(),
  /** What it is used with, when that isn't the walk's destination (a held knife). */
  used: usedThingSchema.optional(),
  aim: verbAimSchema.optional(),
  chosen: chosenRequestSchema.optional(),
});

const walkSchema = z.object({
  destination: walkDestinationSchema,
  remainingSteps: z.array(positionSchema),
  /** Set when the walk leads to a verb that starts on arrival. */
  pendingVerb: pendingVerbSchema.nullable(),
  /** For a walk after an aimed verb's target: the tick the agent stops following and gives up. */
  giveUpAtTick: z.number().int().optional(),
});

/** A verb in progress: what is used, and what its `finish` effects need to know. */
const verbRunSchema = z.object({
  agentId: z.string(),
  verb: z.string(),
  /** The entity used; null for a verb that needs no item. */
  usedEntityId: z.string().nullable(),
  /** The dead agent whose body the verb is used on (taking from it). */
  usedBodyId: z.string().optional(),
  /** Kept so the verb still reads and names it after a `start` effect used it up. */
  usedDefinitionId: z.string().nullable(),
  usedName: z.string(),
  startedAtTick: z.number().int(),
  /** What the verb is aimed at; absent for a verb with no target. */
  aim: verbAimSchema.optional(),
  /** How the target reads in phrases ("Tobias", "the bakery door", "themselves"). */
  aimName: z.string().optional(),
  /** What made the verb take longer than usual ("exhausted"); absent when nothing did. */
  slowedBy: z.string().optional(),
  /** The entities `on: chosen` refers to, oldest first: what the verb moves. */
  chosenEntityIds: z.array(z.string()).optional(),
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
export type PendingVerb = z.infer<typeof pendingVerbSchema>;
export type ChosenRequest = z.infer<typeof chosenRequestSchema>;
export type VerbAim = z.infer<typeof verbAimSchema>;
export type UsedThing = z.infer<typeof usedThingSchema>;
export type VerbRun = z.infer<typeof verbRunSchema>;
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
