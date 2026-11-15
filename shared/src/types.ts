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

/** A goal the agent holds over days; rewritten when a chronicle forms. */
export interface LongTermGoal {
  goal: string;
  reason: string;
  progress: string;
}

/** A goal for the coming hours, with the plan to reach it; rewritten every few episodes. */
export interface ShortTermGoal {
  goal: string;
  reason: string;
  /** The plan, in order. */
  steps: string[];
  progress: string;
}

/** What the agent holds about one person it knows. Each field is the agent's own reading. */
export interface PersonEntry {
  whatIThinkOfThem: string;
  whatTheyThinkOfMe: string;
  whatIWantFromThem: string;
  whatTheyWantFromMe: string;
  misc: string;
}

export const PERSON_ENTRY_FIELDS: readonly (keyof PersonEntry)[] = [
  "whatIThinkOfThem",
  "whatTheyThinkOfMe",
  "whatIWantFromThem",
  "whatTheyWantFromMe",
  "misc",
];

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
  sourceId: string | null;
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
  /**
   * The entity a dead agent's body was transformed into (a grave): the body is gone from the
   * world, though the agent and its death stay. Null while the body is in the world.
   */
  bodyReplacedById: string | null;
  mood: string;
  longTermGoals: LongTermGoal[];
  shortTermGoals: ShortTermGoal[];
  intention: string;
  currentAction: CurrentAction | null;
  awareness: Record<string, Awareness>;
  /** What the agent holds about each person it knows, keyed by their agent id. */
  people: Record<string, PersonEntry>;
  /** The places the agent has seen, in the order it first saw them. */
  seenPlaces: SeenPlace[];
  /** The `thought` from the agent's latest decision, for the viewer; never shown to agents. */
  lastThought: AgentThought | null;
}

/** What was at a place when the agent last saw inside it. */
export interface SeenPlaceEntities {
  /** The last tick the inside of the place was in view. */
  tick: number;
  /** Placed objects and ground items, collapsed for reading: "oven", "3 bread", "tree ×32". */
  names: string[];
}

/** A place the agent has seen. */
export interface SeenPlace {
  name: string;
  firstSeenTick: number;
  /** Null while the agent has only seen the place from outside. */
  entities: SeenPlaceEntities | null;
}

export interface AgentThought {
  text: string;
  tick: number;
}

/** One event in an agent's stream, worded as the agent took it in. */
export interface StreamEntry {
  text: string;
  tick: number;
  /** For a merged repeat: how many times it happened, and the tick of the last time. */
  count?: number;
  endTick?: number;
}

export type SummaryLevel = "episode" | "chronicle" | "daySummary" | "history";

/** A summary the agent wrote of a stretch of its own time, in the first person. */
export interface Summary {
  level: SummaryLevel;
  startTick: number;
  endTick: number;
  text: string;
}

/** How far an agent's midnight steps have got. */
export interface MidnightProgress {
  /** The day that began at this midnight. */
  day: number;
  /** The step that is next; steps with nothing to summarize are skipped. */
  step: SummaryLevel;
  /** The summary of the day that ended, held until the old one has gone into the history. */
  newDaySummary: Summary | null;
  /** How many chronicles, oldest first, the new day summary was made from. */
  chroniclesSummarized: number;
}

/** What an agent remembers. All of it is shown on every decision. */
export interface AgentMemory {
  /** The agent's most recent events, oldest first, word for word. */
  stream: StreamEntry[];
  /** Summaries of the events that left the stream, oldest first. */
  episodes: Summary[];
  /** Summaries of several episodes each, oldest first. All from the current day. */
  chronicles: Summary[];
  /** The last full day, when that day made a summary. */
  daySummary: Summary | null;
  /** Everything before the day summary. */
  history: Summary | null;
  /** The last day whose midnight steps are done. */
  lastMidnightDay: number;
  /** Null except while the midnight steps run. */
  midnight: MidnightProgress | null;
  /** After a summary or pass failed: the tick from which the agent's memory work is tried again. */
  retryAtTick: number | null;
  passes: PassProgress;
}

/** Which passes an agent owes, counted from the episodes and chronicles that have formed. */
export interface PassProgress {
  episodesSincePeople: number;
  episodesSinceShortTermGoals: number;
  /** True until the first short-term goals pass has run. */
  isFirstShortTermGoalsOwed: boolean;
  /** A chronicle has formed since the identity pass last ran. */
  isIdentityOwed: boolean;
  /** A chronicle has formed since the long-term goals pass last ran. */
  isLongTermGoalsOwed: boolean;
}

export type Volume = "whisper" | "normal" | "shout";

export type DecisionAction = "walk_to" | "interact" | "give" | "wait" | "continue";

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
  minutes?: number;
  mood?: string;
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
  /** For a thing an agent carries ("Mara's pickaxe"): that agent, who files it as their own. */
  holderId?: string;
  /** The description as the carrying agent files it ("my pickaxe broke"). */
  holderDescription?: string;
}

export type LlmCallKind =
  | "decision"
  | "interact"
  | "episode"
  | "chronicle"
  | "day_summary"
  | "history"
  | "people"
  | "short_term_goals"
  | "identity"
  | "long_term_goals";

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

/** What a moment is about; `kind` says which fields are present. */
export type MomentDetail =
  | {
      kind: "personality_changed";
      field: PersonalityChange["field"];
      oldValue: string;
      newValue: string;
      reason: string;
    }
  | { kind: "goal_added"; goal: LongTermGoal }
  | { kind: "goal_removed"; goal: LongTermGoal }
  | { kind: "goal_progressed"; goal: LongTermGoal; previousProgress: string }
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
