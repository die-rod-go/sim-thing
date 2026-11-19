import type {
  AgentDetailMessage,
  PlayerViewMessage,
  SettingsMessage,
  SimStats,
  SnapshotMessage,
} from "@village/shared";
import { config } from "../config";
import type { Database } from "../db/database";
import {
  listLlmCalls,
  listPersonalityHistory,
  listRecentEvents,
  listRecentMoments,
} from "../db/log-repository";
import type { TokenBudget } from "../llm/token-budget";
import { computeVisibleTiles } from "../perception/sight";
import { getAgentMemory } from "../sim/world-access";
import { computeSpeechReachTiles } from "../perception/sound";
import type { SimLoop } from "../sim/loop";
import { buildPlayerView } from "../sim/player-view";
import type { SimDependencies } from "../sim/tick-context";
import { buildPerceptionWorld } from "../sim/world-access";
import type { SimSettings, WorldState } from "../sim/world-state";

/** What the WebSocket layer reads to describe the sim. */
export interface SimServerContext {
  loop: SimLoop;
  /** What the sim strategy runs with, for changes made to the world between ticks. */
  simDependencies: SimDependencies;
  database: Database;
  settings: SimSettings;
  /** Live LLM calls in flight, from the concurrency limiter. */
  countInFlightLlmCalls: () => number;
  /** Today's token count and the live daily budget. */
  tokenBudget: TokenBudget;
  /** Why the sim must stay paused (e.g. over budget), or null when it may run. */
  findPauseReason: () => string | null;
}

export function buildStats(context: SimServerContext): SimStats {
  const { tokensToday, dailyTokenBudget } = context.tokenBudget;
  return {
    inFlightLlmCalls: context.countInFlightLlmCalls(),
    tokensToday,
    dailyTokenBudget,
    isOverBudget: context.tokenBudget.isOverBudget(),
  };
}

function buildPerceptionView(state: WorldState, agentId: string) {
  const agent = state.agents.find((candidate) => candidate.id === agentId);
  if (!agent) return null;
  const world = buildPerceptionWorld(state);
  return {
    visibleTiles: computeVisibleTiles(world, agent.pos, config.perception.sightRangeTiles),
    speechReachTiles: computeSpeechReachTiles(world, agent.pos, "normal"),
  };
}

export function buildSnapshot(context: SimServerContext): SnapshotMessage {
  const state = context.loop.getState();
  return {
    type: "snapshot",
    clock: context.loop.getClock(),
    stats: buildStats(context),
    timeSettings: {
      minutesPerTick: config.clock.minutesPerTick,
      startHour: config.clock.startHour,
    },
    baseTicksPerSecond: config.clock.baseTicksPerSecond,
    speedOptions: [...config.clock.speedOptions],
    agents: state.agents,
    entities: state.entities,
    itemDefinitions: state.items.file.definitions,
    componentDeclarations: state.items.declarations,
    world: state.items.world,
    recentEvents: listRecentEvents(context.database, config.server.recentEventsInSnapshot),
    recentMoments: listRecentMoments(context.database, config.server.recentMomentsInSnapshot),
  };
}

export function buildSettingsMessage(context: SimServerContext): SettingsMessage {
  return {
    type: "settings",
    speed: context.loop.getSpeed(),
    dailyTokenBudget: context.settings.dailyTokenBudget,
  };
}

export function buildPlayerViewMessage(context: SimServerContext): PlayerViewMessage {
  const view = buildPlayerView(context.loop.getState(), context.simDependencies.playerInbox);
  return { type: "player_view", view };
}

/** Null when no agent has that id. */
export function buildAgentDetail(
  context: SimServerContext,
  agentId: string,
): AgentDetailMessage | null {
  const state = context.loop.getState();
  const agent = state.agents.find((candidate) => candidate.id === agentId);
  if (!agent) return null;
  return {
    type: "agent_detail",
    agentId,
    agent,
    memory: getAgentMemory(state, agentId),
    llmCalls: listLlmCalls(context.database, agentId, config.server.llmCallsInDetail),
    personalityHistory: listPersonalityHistory(context.database, agentId),
    perceptionView: buildPerceptionView(state, agentId),
  };
}
