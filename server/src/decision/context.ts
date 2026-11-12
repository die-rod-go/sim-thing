import type { AgentBody, AwarenessVia, Bucket, Goal, Needs, Personality } from "@village/shared";

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

export interface ConversationLine {
  /** "You" for the agent's own lines. */
  speakerName: string;
  words: string;
  minutesAgo: number;
}

export interface RecalledMemory {
  text: string;
  minutesAgo: number;
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
  /** Words for every condition the agent has. */
  conditionWords: string[];
  body: AgentBody;
  goals: Goal[];
  dailyPlan: string;
  intention: string;
  /** e.g. "Day 1, 06:30" from `formatSimTime`. */
  simTime: string;
  place: string;
  /** What is here: placed objects and ground items. */
  nearbyEntities: PromptEntityGroup[];
  aroundYou: AroundYou;
  belongings: PromptEntityGroup[];
  /** Verbs that need no item (`punch`), listed after belongings. */
  itemlessVerbs: string[];
  workingMemory: string[];
  conversation: ConversationLine[];
  recalledMemories: Partial<Record<Bucket, RecalledMemory[]>>;
  /** What kept memories from coming to mind this decision ("exhausted"), or null. */
  foggedBy: string | null;
  knownPlaces: string[];
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
