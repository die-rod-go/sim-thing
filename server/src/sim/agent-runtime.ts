import { z } from "zod";
import type { WorldState } from "./world-state";

const positionSchema = z.object({ x: z.number().int(), y: z.number().int() });

const walkDestinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("place"), placeName: z.string() }),
  z.object({ kind: z.literal("agent"), agentId: z.string() }),
  z.object({ kind: z.literal("object"), objectId: z.string() }),
]);

const pendingInteractSchema = z.object({
  interaction: z.string(),
  text: z.string().optional(),
  minutes: z.number().optional(),
});

const walkSchema = z.object({
  destination: walkDestinationSchema,
  remainingSteps: z.array(positionSchema),
  /** Set when the walk leads to an interaction that starts on arrival. */
  pendingInteract: pendingInteractSchema.nullable(),
});

const interactionRecordSchema = z.object({
  agentId: z.string(),
  interaction: z.string(),
  targetName: z.string(),
  objectId: z.string().nullable(),
  startedAtTick: z.number().int(),
});

const pendingDecisionSchema = z.object({
  reason: z.string(),
  /** Urgent reasons (own name, conversation, woken, handed something) skip the interrupt cooldown. */
  isUrgent: z.boolean(),
});

const agentRuntimeSchema = z.object({
  walk: walkSchema.nullable(),
  interaction: interactionRecordSchema.nullable(),
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

/** Everything besides agents, objects and memories that the sim needs to resume exactly. */
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
    }),
  ),
  /** Absent in saves made before moments existed. */
  nextMomentId: z.number().int().positive().optional(),
});

export type SimRuntime = z.infer<typeof simRuntimeSchema>;
export type AgentRuntime = z.infer<typeof agentRuntimeSchema>;
export type Walk = z.infer<typeof walkSchema>;
export type WalkDestination = z.infer<typeof walkDestinationSchema>;
export type PendingInteract = z.infer<typeof pendingInteractSchema>;
export type PendingDecision = z.infer<typeof pendingDecisionSchema>;

export function createAgentRuntime(startPlace: string): AgentRuntime {
  return {
    walk: null,
    interaction: null,
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
