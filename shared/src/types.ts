import type { ComponentChanges } from "./items/components";

export interface Position {
  x: number;
  y: number;
}

export type TraitName =
  "extraversion" | "agreeableness" | "conscientiousness" | "neuroticism" | "openness";

export const TRAIT_NAMES: readonly TraitName[] = [
  "extraversion",
  "agreeableness",
  "conscientiousness",
  "neuroticism",
  "openness",
];

export type NeedName = "hunger" | "energy" | "social" | "fun";

export const NEED_NAMES: readonly NeedName[] = ["hunger", "energy", "social", "fun"];

export type Needs = Record<NeedName, number>;

export interface Personality {
  traits: Record<TraitName, number>;
  core: string;
  selfImage: string;
}

export type GoalKind = "world" | "social" | "self";

export interface Goal {
  text: string;
  why: string;
  progress: string;
  kind: GoalKind;
}

/** A scheme the agent is carrying out over hours or days. */
export interface Plan {
  /** One line: what and why. */
  aim: string;
  /** Remaining steps in order; the first is the next one. */
  steps: string[];
  /** Who must not find out, in the agent's words; "" if no one. */
  keepFrom: string;
}

export interface CurrentAction {
  kind: string;
  target?: string;
  /** The running verb's name (e.g. "bake bread") while using something or sleeping. */
  verb?: string;
  endsAtTick: number | null;
}

export type AwarenessVia = "saw" | "heard" | "heard_muffled";

export interface Awareness {
  agentId: string;
  tick: number;
  via: AwarenessVia;
  place: string;
  doing: string;
}

export type StatName = "strength" | "agility";

export const STAT_NAMES: readonly StatName[] = ["strength", "agility"];

/** The agent's physical record. Stats are 0–1, 0.5 is average; only the agent's own prompt sees them. */
export interface AgentBody extends Record<StatName, number> {
  sleepRecoveryPerHour: number;
}

export interface AgentDeath {
  tick: number;
  /** For the viewer only: "starved", "stabbed by Tobias". Agents learn causes only by witnessing. */
  cause: string;
  /** Whoever did the last damage, when someone did. */
  sourceAgentId: string | null;
}

export interface Agent {
  id: string;
  name: string;
  place: string;
  pos: Position;
  personality: Personality;
  body: AgentBody;
  profession: string;
  needs: Needs;
  /** Set when hunger reaches 0, cleared when it rises; starvation damage starts after a grace period. */
  starvingSinceTick: number | null;
  /**
   * Where the agent's body differs from the `agentBody` definition: its health, and components
   * added while the sim runs (conditions).
   */
  bodyChanges: ComponentChanges;
  /** Null while alive. */
  death: AgentDeath | null;
  mood: string;
  goals: Goal[];
  dailyPlan: string;
  plans: Plan[];
  intention: string;
  currentAction: CurrentAction | null;
  workingMemory: string[];
  awareness: Record<string, Awareness>;
  /** What the agent holds about each other person, keyed by their agent id; rewritten whole. */
  dossiers: Record<string, Dossier>;
  /** The `thought` from the agent's latest decision, for the viewer; never shown to agents. */
  lastThought: AgentThought | null;
}

export interface Dossier {
  text: string;
  updatedTick: number;
}

export interface AgentThought {
  text: string;
  tick: number;
}

export type Bucket = "seen" | "conversations" | "overheard" | "did" | "places" | "reflections";

export const BUCKETS: readonly Bucket[] = [
  "seen",
  "conversations",
  "overheard",
  "did",
  "places",
  "reflections",
];

export interface Memory {
  id: string;
  agentId: string;
  bucket: Bucket;
  tick: number;
  text: string;
  tags: string[];
  strength: number;
  /** Tick of the last recall bump; recall bumps at most once per sim-hour. */
  lastRecalledTick: number | null;
}

export type Volume = "whisper" | "normal" | "shout";

export type DecisionAction = "walk_to" | "interact" | "give" | "recall" | "wait" | "continue";

export interface DecisionReply {
  thought: string;
  intention: string;
  say?: string;
  volume?: Volume;
  action: DecisionAction;
  target?: string;
  verb?: string;
  text?: string;
  item?: string;
  from?: string;
  amount?: number;
  query?: string;
  minutes?: number;
  mood?: string;
  /** The number of a plan whose next step is already done. */
  stepDone?: number;
}

export interface EventSpeech {
  words: string;
  volume: Volume;
  /** The speaker's `thought` from the decision that produced the words, for the viewer. */
  thought?: string;
  /** The `llm_calls` row of that decision. */
  llmCallId?: number;
}

export type WorldEventKind =
  | "said"
  | "walk_started"
  | "arrived"
  | "action_started"
  | "action_finished"
  | "action_failed"
  | "gave"
  | "fell_asleep"
  | "woke"
  | "died"
  | "attacked"
  | "missed"
  | "hurt"
  | "announced"
  | "sound";

/**
 * One thing that happened in the world. `description` is a past-tense verb phrase whose subject is
 * the actor ("started baking bread at the oven"), so memory filing can phrase it per perceiver.
 */
export interface WorldEvent {
  id: number;
  tick: number;
  actorId: string;
  actorName: string;
  kind: WorldEventKind;
  targetId: string | null;
  targetName: string | null;
  place: string;
  pos: Position;
  description: string;
  /** Sound reach in tiles; null when the event makes no sound. */
  loudness: number | null;
  speech?: EventSpeech;
  /** The item definition's name, for something that changed hands ("coin"). */
  item?: string;
  amount?: number;
  /** The same, counted for reading: "3 coins", "a knife". */
  itemText?: string;
  /** The description as the actor files it, when it differs ("bandaged myself"). */
  actorDescription?: string;
  /** The description as the target agent files it ("hit me with a knife"). */
  targetDescription?: string;
  /** The actor is a thing ("the chest", "Mara's body"), not an agent who acts or remembers. */
  isActorThing?: boolean;
}

export type LlmCallKind =
  "decision" | "interact" | "morning" | "daytime" | "night" | "weekly" | "conversation_summary";

/** The prompt is plain text; lines starting with "## " open a section the prompt viewer can collapse. */
export interface LlmCallRecord {
  id: number;
  agentId: string;
  tick: number;
  kind: LlmCallKind;
  model: string;
  prompt: string;
  reply: string;
  parsed: unknown;
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  latencyMs: number;
  error: string | null;
}

export interface PersonalityChange {
  id: number;
  agentId: string;
  tick: number;
  field: TraitName | "core" | "selfImage" | "profession";
  oldValue: string;
  newValue: string;
  reason: string;
}

export interface SimStats {
  inFlightLlmCalls: number;
  tokensToday: number;
  dailyTokenBudget: number;
  isOverBudget: boolean;
}

export interface ClockState {
  tick: number;
  isPaused: boolean;
  /** Speed multiplier; 1 means the base ticks per second. */
  speed: number;
}

export type ReflectionPass = "morning" | "night" | "weekly";

/** What a moment is about; `kind` says which fields are present. */
export type MomentDetail =
  | {
      kind: "personality_changed";
      field: PersonalityChange["field"];
      oldValue: string;
      newValue: string;
      reason: string;
    }
  | { kind: "goal_added"; goal: Goal }
  | { kind: "goal_removed"; goal: Goal }
  | { kind: "goal_progressed"; goal: Goal; previousProgress: string }
  | { kind: "daily_plan"; plan: string }
  | {
      kind: "reflection";
      pass: ReflectionPass;
      summary: string;
      moodEntry: string | null;
      insights: string[];
    }
  | { kind: "action_failed"; eventId: number; description: string }
  | { kind: "died"; cause: string };

export type MomentKind = MomentDetail["kind"];

/**
 * A notable change in one agent's inner life or plans, for the viewer's highlights. `text` is a
 * short line whose subject is the agent ("set a new goal: open a tavern").
 */
export type Moment = {
  id: number;
  tick: number;
  agentId: string;
  agentName: string;
  text: string;
} & MomentDetail;
