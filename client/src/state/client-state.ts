import type {
  Agent,
  AgentDetailMessage,
  ClockState,
  Entity,
  ItemDefinition,
  Moment,
  SimStats,
  SimTimeSettings,
  Volume,
  WorldEvent,
} from "@village/shared";

export interface SpeechBubble {
  agentId: string;
  text: string;
  volume: Volume;
  tick: number;
}

/** Everything the client knows, rebuilt only from server messages. */
export interface ClientState {
  hasSnapshot: boolean;
  clock: ClockState;
  stats: SimStats;
  timeSettings: SimTimeSettings;
  baseTicksPerSecond: number;
  speedOptions: number[];
  agents: Agent[];
  /** Every item and object: placed, on the ground, carried or inside something. */
  entities: Entity[];
  itemDefinitions: ItemDefinition[];
  /** Oldest first, capped. */
  events: WorldEvent[];
  /** Highlights for every agent, oldest first, capped. */
  moments: Moment[];
  /** Most recent lines spoken, oldest first, capped per agent. */
  speechBubbles: SpeechBubble[];
  /** Why the sim paused itself; null when it is running or was paused by a user. */
  pausedReason: string | null;
  inspectedAgentId: string | null;
  agentDetail: AgentDetailMessage | null;
}

const DEFAULT_MINUTES_PER_TICK = 1;
const DEFAULT_START_HOUR = 6;

export const initialClientState: ClientState = {
  hasSnapshot: false,
  clock: { tick: 0, isPaused: true, speed: 1 },
  stats: { inFlightLlmCalls: 0, tokensToday: 0, dailyTokenBudget: 0, isOverBudget: false },
  timeSettings: { minutesPerTick: DEFAULT_MINUTES_PER_TICK, startHour: DEFAULT_START_HOUR },
  baseTicksPerSecond: 1,
  speedOptions: [],
  agents: [],
  entities: [],
  itemDefinitions: [],
  events: [],
  moments: [],
  speechBubbles: [],
  pausedReason: null,
  inspectedAgentId: null,
  agentDetail: null,
};

export function findAgent(state: ClientState, agentId: string | null): Agent | null {
  if (agentId === null) return null;
  return state.agents.find((agent) => agent.id === agentId) ?? null;
}
