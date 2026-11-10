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

export interface CurrentAction {
  kind: string;
  target?: string;
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

export interface Agent {
  id: string;
  name: string;
  place: string;
  pos: Position;
  personality: Personality;
  body: { sleepRecoveryPerHour: number };
  profession: string;
  coins: number;
  inventory: Record<string, number>;
  needs: Needs;
  mood: string;
  goals: Goal[];
  dailyPlan: string;
  intention: string;
  currentAction: CurrentAction | null;
  workingMemory: string[];
  awareness: Record<string, Awareness>;
}

export type Bucket =
  "seen" | "conversations" | "overheard" | "did" | "people" | "places" | "reflections";

export const BUCKETS: readonly Bucket[] = [
  "seen",
  "conversations",
  "overheard",
  "did",
  "people",
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
  interaction?: string;
  text?: string;
  item?: string;
  amount?: number;
  query?: string;
  minutes?: number;
  note?: { person: string; text: string };
  mood?: string;
}

export interface Note {
  authorId: string;
  authorName: string;
  text: string;
  tick: number;
}

export type ObjectKind =
  | "bed"
  | "notice_board"
  | "bench"
  | "wheat_field"
  | "trees"
  | "oven"
  | "brew_kettle"
  | "card_table"
  | "door";

export interface ObjectState {
  stock?: number;
  isOpen?: boolean;
  notes?: Note[];
  /** Agent ids currently using the object, e.g. players at the card table. */
  userIds?: string[];
}

export interface WorldObject {
  id: string;
  name: string;
  kind: ObjectKind;
  place: string;
  pos: Position;
  interactions: string[];
  state: ObjectState;
}

export type WorldEventKind =
  | "said"
  | "walk_started"
  | "arrived"
  | "action_started"
  | "action_finished"
  | "action_failed"
  | "gave"
  | "posted_note"
  | "fell_asleep"
  | "woke";

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
  speech?: { words: string; volume: Volume };
  item?: string;
  amount?: number;
}

export type LlmCallKind = "decision" | "interact" | "morning" | "night" | "weekly";

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
  latencyMs: number;
  error: string | null;
}

export interface PersonalityChange {
  id: number;
  agentId: string;
  tick: number;
  field: TraitName | "core" | "selfImage";
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
