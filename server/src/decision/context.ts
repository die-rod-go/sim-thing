import type { AwarenessVia, Bucket, Goal, Needs, Personality } from "@village/shared";

/** Names the agent may use as an action `target` right now. */
export interface DecisionTargets {
  places: string[];
  /** Agents currently in sight. */
  agents: string[];
  /** Objects at the agent's place. */
  objects: string[];
  /** Items the agent carries. */
  heldItems: string[];
}

export interface NearbyObject {
  name: string;
  interactions: string[];
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
  goals: Goal[];
  dailyPlan: string;
  intention: string;
  /** e.g. "Day 1, 06:30" from `formatSimTime`. */
  simTime: string;
  place: string;
  nearbyObjects: NearbyObject[];
  aroundYou: AroundYou;
  coins: number;
  inventory: Record<string, number>;
  workingMemory: string[];
  conversation: ConversationLine[];
  recalledMemories: Partial<Record<Bucket, RecalledMemory[]>>;
  knownPlaces: string[];
  currentAction: CurrentActionSummary | null;
  /** True for a perception interrupt during an action; only then is `continue` offered. */
  isMidActionInterrupt: boolean;
  lastFailure: string | null;
  validTargets: DecisionTargets;
}
