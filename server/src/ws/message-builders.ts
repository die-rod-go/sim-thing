import type {
  AgentDetailMessage,
  SettingsMessage,
  SimStats,
  SnapshotMessage,
} from "@village/shared";
import { config } from "../config";
import type { Database } from "../db/database";
import {
  formatCalendarDay,
  getTokenUsage,
  listLlmCalls,
  listPersonalityHistory,
  listRecentEvents,
} from "../db/log-repository";
import type { SimLoop } from "../sim/loop";
import type { SimSettings } from "../sim/world-state";

/** What the WebSocket layer reads to describe the sim. */
export interface SimServerContext {
  loop: SimLoop;
  database: Database;
  settings: SimSettings;
  /** Live LLM calls in flight; integration supplies the real count. */
  countInFlightLlmCalls: () => number;
}

export function buildStats(context: SimServerContext): SimStats {
  const tokensToday = getTokenUsage(context.database, formatCalendarDay(new Date()));
  const { dailyTokenBudget } = context.settings;
  return {
    inFlightLlmCalls: context.countInFlightLlmCalls(),
    tokensToday,
    dailyTokenBudget,
    isOverBudget: tokensToday >= dailyTokenBudget,
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
    objects: state.objects,
    recentEvents: listRecentEvents(context.database, config.server.recentEventsInSnapshot),
  };
}

export function buildSettingsMessage(context: SimServerContext): SettingsMessage {
  return {
    type: "settings",
    speed: context.loop.getSpeed(),
    dailyTokenBudget: context.settings.dailyTokenBudget,
  };
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
    memories: state.memories.filter((memory) => memory.agentId === agentId),
    llmCalls: listLlmCalls(context.database, agentId, config.server.llmCallsInDetail),
    personalityHistory: listPersonalityHistory(context.database, agentId),
    perceptionView: null,
  };
}
