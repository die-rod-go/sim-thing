import type { AgentBody, AwarenessVia, Goal, Needs, Personality } from "@village/shared";

/** Names the agent may use as an action `target` right now. */
export interface DecisionTargets {
  places: string[];
  /** Agents currently in sight. */
  agents: string[];
  /** Things at the agent's place: placed objects and items on the ground. */
  entities: string[];
  /** Names only an aimed verb can take: "yourself", or something carried to aim at. */
  aimOnly: string[];
}

/** An item the agent may name as `item`: something it carries, by definition name. */
export interface ValidItem {
  name: string;
  /** Also accepted in replies ("coins" for "coin"). */
  plural?: string;
}

/**
 * One entry in Belongings or Here. Unlabelled entities whose whole line is identical are grouped
 * ("3 bread"). Contents the agent can see are nested entries, each with its own verbs.
 */
export interface PromptEntityGroup {
  /** "3 bread", "a knife", "tavern chest". */
  text: string;
  /** What shows of it: component and field words, ground words, what it holds. */
  details: string[];
  /** The verbs it offers this agent, each once. */
  verbs: string[];
  /** For a carried tool, what it lets the agent do to things here: "chop down the tree". */
  toolUses: string[];
  /** What the agent can see inside it. */
  contents: PromptEntityGroup[];
}

/** One awareness record, already joined with the other agent's display name. */
export interface AwarenessEntry {
  agentId: string;
  name: string;
  via: AwarenessVia;
  place: string;
  doing: string;
  minutesAgo: number;
  isInSight: boolean;
  /** In sight and dead: shown as their body. */
  isDead: boolean;
  /** Tiles between the agent and them, when they're in sight; null otherwise. */
  distanceTiles: number | null;
  /** How their health looks, when they're in sight and it shows; null otherwise. */
  healthAsSeen: string | null;
  /** What they carry that shows ("a knife"), when they're in sight. */
  visibleCarried: string[];
  /** The words of their visible conditions, when they're in sight. */
  visibleConditions: string[];
}

export interface AroundYou {
  entries: AwarenessEntry[];
  /** Agents in sight and within normal speech reach: they would obviously hear you. */
  normalHearerIds: string[];
  /** Agents close enough to hear a whisper. */
  whisperHearerIds: string[];
}

/** One entry of "People on your mind": a person's name and what the agent holds about them. */
export interface PersonOnMind {
  name: string;
  text: string;
}

/** One entry of "Places you have seen". */
export interface SeenPlaceLine {
  name: string;
  /** What was there when last seen; null when the agent has not looked into the place yet. */
  entityNames: string[] | null;
  /** When the inside was last seen ("Day 1, 6:30 am"); null while it is in view now. */
  seenAt: string | null;
}

export interface CurrentActionSummary {
  /** e.g. "baking bread at the oven". */
  description: string;
  minutesLeft: number | null;
  /** What is making it take longer than usual ("exhausted"), or null. */
  slowedBy: string | null;
}

/** Everything step 1 of a decision puts in front of the agent. Filled by the tick loop. */
export interface DecisionContext {
  name: string;
  profession: string;
  personality: Personality;
  mood: string;
  needs: Needs;
  health: number;
  /** Going without food has begun to cost health. */
  isStarvationHarming: boolean;
  /** Words for every condition the agent has. */
  conditionWords: string[];
  body: AgentBody;
  goals: Goal[];
  intention: string;
  /** e.g. "Day 1, 6:30 am" from `formatSimTime`. */
  simTime: string;
  place: string;
  /** What is here: placed objects and ground items. */
  nearbyEntities: PromptEntityGroup[];
  aroundYou: AroundYou;
  peopleOnMind: PersonOnMind[];
  belongings: PromptEntityGroup[];
  /** Verbs that need no item (`punch`), listed after belongings. */
  itemlessVerbs: string[];
  /** Everything before the day summary, as it reads; null when there is none yet. */
  history: string | null;
  /** The last full day, as it reads; null when that day made no summary. */
  daySummary: string | null;
  /** The current day's chronicles, oldest first, each as it reads. */
  chronicles: string[];
  /** The episodes, oldest first, each as it reads. */
  episodes: string[];
  /** The agent's stream, oldest first, each entry as it reads ("[Day 1, 6:32 am] I saw ..."). */
  stream: string[];
  seenPlaces: SeenPlaceLine[];
  currentAction: CurrentActionSummary | null;
  /** True for a perception interrupt during an action; only then is `continue` offered. */
  isMidActionInterrupt: boolean;
  /** What flagged this decision, in the agent's own words ("my hunger"), or null. */
  decisionReason: string | null;
  lastFailure: string | null;
  validTargets: DecisionTargets;
  validItems: ValidItem[];
  /** Things the agent can see into that hold something: what `from` may name. */
  validHolders: string[];
}
