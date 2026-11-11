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
 * One entry in Belongings or Here. Identical, stateless entities are grouped ("3 bread"), and
 * each lists the verbs it offers.
 */
export interface PromptEntityGroup {
  /** "3 bread", "a knife", "bakery door". */
  text: string;
  verbs: string[];
  /** What can be seen of its state, e.g. "empty" or "closed"; null when nothing shows. */
  condition: string | null;
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
  /** Their visible conditions' words ("bleeding", "on fire"), when they're in sight. */
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
}

/** Everything step 1 of a decision puts in front of the agent. Filled by the tick loop. */
export interface DecisionContext {
  name: string;
  profession: string;
  personality: Personality;
  mood: string;
  needs: Needs;
  health: number;
  /** Words for every condition the agent has ("bleeding", "poisoned"). */
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
  knownPlaces: string[];
  currentAction: CurrentActionSummary | null;
  /** True for a perception interrupt during an action; only then is `continue` offered. */
  isMidActionInterrupt: boolean;
  lastFailure: string | null;
  validTargets: DecisionTargets;
  validItems: ValidItem[];
}
