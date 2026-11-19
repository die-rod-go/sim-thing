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
  /** How they talk, in a sentence or two; empty when the seed gives none. */
  voice: string;
  /** A usual day: where they are when; empty when the seed gives none. */
  routine: string;
}

/** A goal the agent holds over days; rewritten by its day plans and reflections. */
export interface LongTermGoal {
  goal: string;
  reason: string;
  progress: string;
}

/** One line of the agent's plan for today: an outcome, with the number it keeps while it lasts. */
export interface AgendaItem {
  number: number;
  text: string;
  /** The hour of day (0–23) it has to happen at, which brings a reminder; null when it has none. */
  hour: number | null;
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
  /** How others refer to them ("she/her"); empty when the seed gives none. */
  pronouns: string;
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
  /**
   * The thing a dead agent's body is inside (whoever carries it): the body is where that holder
   * is. Null while the body lies on its own tile, and always for the living.
   */
  bodyHolderId: string | null;
  mood: string;
  longTermGoals: LongTermGoal[];
  /** Today: the agent's own plan, written on waking and kept by its decisions. */
  agenda: AgendaItem[];
  /** The number the next agenda item gets, so a number is never used twice. */
  nextAgendaNumber: number;
  /** Goes up whenever the agenda changes, so a plan written against an older one can tell. */
  agendaRevision: number;
  intention: string;
  currentAction: CurrentAction | null;
  awareness: Record<string, Awareness>;
  /** What the agent holds about each person it knows, keyed by their agent id. */
  people: Record<string, PersonEntry>;
  /** The places the agent has seen, in the order it first saw them. */
  seenPlaces: SeenPlace[];
  /** The `thought` from the agent's latest decision, for the viewer; never shown to agents. */
  lastThought: AgentThought | null;
  /** The player makes this agent's decisions, not the LLM. */
  isPlayed: boolean;
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
  /** For speech: who spoke and the words, so a near repeat of the same speaker can merge. */
  speech?: { speakerId: string; words: string };
}

/** A moment the agent will never forget, or one waiting for its reflection to decide. */
export interface KeyMemory {
  /** The day it happened on, as the agent remembers it. */
  day: number;
  text: string;
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
  /** When the agent last took stock in a reflection, and what has piled up since. */
  reflection: ReflectionProgress;
  /** Something (a loop of repeats, failures in a row) owes a reality pass. */
  isRealityPassOwed: boolean;
  /** Acts that failed one after another, with none done in between. */
  failedActsInARow: number;
  /** Episodes made since the last reality pass; enough of them owe the next one. */
  episodesSinceRealityPass: number;
  /** Since when the agent has owed a day plan (it woke, or the sim began); null when it owes none. */
  dayPlanOwedSinceTick: number | null;
  /** A few moments that are never compressed, oldest first; written only by the reflection. */
  keyMemories: KeyMemory[];
  /** Moments marked to remember, by a decision or an episode, waiting for the reflection. */
  keyMemoryCandidates: KeyMemory[];
  /** The last tick being attacked gave a reckoning, so a fight is one reckoning, not one a blow. */
  lastAttackReckoningTick: number | null;
}

/** What decides when an agent next reflects: on its own clock, and when something owes it. */
export interface ReflectionProgress {
  /** The tick of the last reflection; null before the first. */
  lastTick: number | null;
  /** Ticks spent awake since then. */
  awakeTicksSince: number;
  /** Stream entries added since then. */
  streamEntriesSince: number;
  /** Falling asleep for the night, a reckoning or a moment to remember owes one. */
  isOwed: boolean;
}

export type Volume = "whisper" | "normal" | "shout";

export type DecisionAction =
  "walk_to" | "say" | "interact" | "give" | "wait" | "follow" | "continue";

/** How an agent answers what someone is offering it. */
export type OfferAnswer = "accept" | "decline";

/** One act of a decision, with the words spoken as it starts. */
export interface DecisionAct {
  action: DecisionAction;
  target?: string;
  verb?: string;
  text?: string;
  item?: string;
  from?: string;
  amount?: number;
  /** For a give: what the giver asks back, by name; it changes hands with the gift or not at all. */
  inReturn?: string;
  inReturnAmount?: number;
  minutes?: number;
  say?: string;
  volume?: Volume;
}

export interface DecisionReply {
  thought: string;
  intention: string;
  /** In order: the first starts now, each later one when the one before ends. */
  acts: DecisionAct[];
  mood?: string;
  offer?: OfferAnswer;
  /** Numbers of agenda items finished. */
  done?: number[];
  /** Numbers of agenda items given up. */
  dropped?: number[];
  /** New agenda items. */
  added?: { text: string; hour: number | null }[];
  /** One sentence the agent marks to remember for the rest of its life. */
  remember?: string;
  /** In a reckoning: the whole new agenda for Today. */
  agenda?: { text: string; hour: number | null }[];
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
  | "offered"
  | "gave"
  | "declined"
  | "fell_asleep"
  | "woke"
  | "died"
  | "attacked"
  | "missed"
  | "hurt"
  | "announced"
  | "sound"
  | "vanished"
  | "appeared";

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
  /** The verb being done, for a verb's start and finish ("pour into"). */
  verb?: string;
}

export type LlmCallKind =
  | "decision"
  | "reckoning"
  | "interact"
  | "episode"
  | "chronicle"
  | "day_summary"
  | "history"
  | "day_plan"
  | "reflection"
  | "reality";

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
  field: TraitName | "core" | "selfImage" | "voice" | "profession";
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
