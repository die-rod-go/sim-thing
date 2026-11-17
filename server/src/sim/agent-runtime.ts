import { fieldValueSchema } from "@village/shared";
import { z } from "zod";
import type { WorldState } from "./world-state";

const positionSchema = z.object({ x: z.number().int(), y: z.number().int() });

const walkDestinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("place"), placeName: z.string() }),
  z.object({ kind: z.literal("agent"), agentId: z.string() }),
  z.object({ kind: z.literal("entity"), entityId: z.string() }),
  /** A spot outside every place, by the name it goes by ("the road by the smithy"). */
  z.object({ kind: z.literal("tile"), pos: positionSchema, name: z.string() }),
]);

/**
 * What a decision asked a verb to do, in the reply's own words. It is resolved to things each time
 * the verb starts, so a walk that leads to one resolves it again on arrival.
 */
const interactRequestSchema = z.object({
  verb: z.string(),
  /** The reply's `item`. */
  itemName: z.string().optional(),
  /** The reply's `from`: the holder the item is inside. */
  fromName: z.string().optional(),
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
  /** Consecutive ticks the next step has been blocked by another agent. */
  blockedTicks: z.number().int().optional(),
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
  /** The agent or creature doing it: an agent id or an entity id. */
  userId: z.string(),
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
  /** The first `wait` the run reached, by step index: its loudness is how far the verb is heard. */
  firstWaitIndex: z.number().int().nonnegative().nullable(),
  startedAtTick: z.number().int(),
  /** What made the verb take longer than usual ("exhausted"); absent when nothing did. */
  slowedBy: z.string().optional(),
  /** How much longer each `wait` takes than written (0.5 = half as long again). */
  slowdownShare: z.number().nonnegative().optional(),
});

const pendingDecisionSchema = z.object({
  reason: z.string(),
  /** Urgent reasons (own name, conversation, woken, offered something) skip the interrupt cooldown. */
  isUrgent: z.boolean(),
});

/** Something another agent is offering this one, until it is answered or lapses. */
const pendingOfferSchema = z.object({
  /** The `offered` event's id, so only a decision that saw the offer answers it. */
  eventId: z.number().int(),
  giverId: z.string(),
  /** The giver's reply's `item`, resolved again when the offer is accepted. */
  itemName: z.string(),
  amount: z.number().int().positive(),
  /** "3 coins", "a knife". */
  itemText: z.string(),
  offeredAtTick: z.number().int(),
});

const agentRuntimeSchema = z.object({
  walk: walkSchema.nullable(),
  verbRun: verbRunSchema.nullable(),
  lastInterruptTick: z.number().int().nullable(),
  visibleAgentIds: z.array(z.string()),
  /** Creatures in view at the last sight update, so one coming into view gives a decision. */
  visibleCreatureIds: z.array(z.string()),
  lastFailure: z.string().nullable(),
  pendingDecision: pendingDecisionSchema.nullable(),
  pendingOffer: pendingOfferSchema.nullable(),
  /** Agenda items whose hour has come, by number, so each reminds only once. */
  firedReminderNumbers: z.array(z.number().int()),
  /** Of those, the ones that came while the agent slept, filed when it wakes. */
  missedReminderNumbers: z.array(z.number().int()),
});

/** The verb a creature is in the middle of. Everything else about it is in its components. */
const creatureRuntimeSchema = z.object({
  verbRun: verbRunSchema.nullable(),
  /** The tick its verb's current `wait` runs out; null while it isn't waiting. */
  resumeAtTick: z.number().int().nullable(),
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

/** Everything besides agents, entities and their memories that the sim needs to resume exactly. */
export const simRuntimeSchema = z.object({
  agentRuntimes: z.record(z.string(), agentRuntimeSchema),
  /** Keyed by the creature's entity id. */
  creatureRuntimes: z.record(z.string(), creatureRuntimeSchema),
  conversationLog: z.object({ lines: z.array(spokenLineSchema) }),
  nextMomentId: z.number().int().positive(),
});

export type SimRuntime = z.infer<typeof simRuntimeSchema>;
export type AgentRuntime = z.infer<typeof agentRuntimeSchema>;
export type CreatureRuntime = z.infer<typeof creatureRuntimeSchema>;
export type Walk = z.infer<typeof walkSchema>;
export type WalkDestination = z.infer<typeof walkDestinationSchema>;
export type InteractRequest = z.infer<typeof interactRequestSchema>;
export type VerbRun = z.infer<typeof verbRunSchema>;
export type VerbChoice = z.infer<typeof verbChoiceSchema>;
export type ThingSnapshot = z.infer<typeof thingSnapshotSchema>;
export type PendingDecision = z.infer<typeof pendingDecisionSchema>;
export type PendingOffer = z.infer<typeof pendingOfferSchema>;

export function createAgentRuntime(): AgentRuntime {
  return {
    walk: null,
    verbRun: null,
    lastInterruptTick: null,
    visibleAgentIds: [],
    visibleCreatureIds: [],
    lastFailure: null,
    pendingDecision: null,
    pendingOffer: null,
    firedReminderNumbers: [],
    missedReminderNumbers: [],
  };
}

/** The agent's runtime record, created on first use (e.g. for agents added since a save). */
export function getAgentRuntime(state: WorldState, agentId: string): AgentRuntime {
  const existing = state.agentRuntimes[agentId];
  if (existing) return existing;
  const created = createAgentRuntime();
  state.agentRuntimes[agentId] = created;
  return created;
}

/** The creature's runtime record, created the first time it does a verb. */
export function getCreatureRuntime(state: WorldState, entityId: string): CreatureRuntime {
  const existing = state.creatureRuntimes[entityId];
  if (existing) return existing;
  const created: CreatureRuntime = { verbRun: null, resumeAtTick: null };
  state.creatureRuntimes[entityId] = created;
  return created;
}

/** Flags a decision; an urgent reason replaces a non-urgent one, never the other way round. */
export function requestDecision(runtime: AgentRuntime, reason: string, isUrgent: boolean): void {
  if (runtime.pendingDecision?.isUrgent && !isUrgent) return;
  runtime.pendingDecision = { reason, isUrgent };
}
