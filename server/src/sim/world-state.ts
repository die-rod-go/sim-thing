import type { Agent, Position, WorldEvent, WorldObject } from "@village/shared";
import { config } from "../config";
import { SeededRandom } from "../random";
import type { SavedWorld } from "../db/world-repository";
import { createConversationLog, type ConversationLog } from "../memory/conversation";
import { MemoryIdGenerator, MemoryStore } from "../memory/memory-store";
import type { SeededWorld } from "../seeds";
import type { ReflectionSchedule } from "../reflection/schedule";
import type { WorldMap } from "../world/types";
import { createAgentRuntime, type AgentRuntime, type SimRuntime } from "./agent-runtime";

/** All mutable sim state. The sim loop is its only writer. */
export interface WorldState {
  /** The tick about to be simulated next. */
  tick: number;
  agents: Agent[];
  objects: WorldObject[];
  map: WorldMap;
  random: SeededRandom;
  nextEventId: number;
  memoryStore: MemoryStore;
  memoryIds: MemoryIdGenerator;
  conversationLog: ConversationLog;
  agentRuntimes: Record<string, AgentRuntime>;
  lastForgettingTick: number;
  /** Reflection bookkeeping per agent, owned by the reflection hook. */
  reflectionSchedules: Record<string, ReflectionSchedule>;
}

/** Settings that persist with the world and can change at runtime. */
export interface SimSettings {
  speed: number;
  dailyTokenBudget: number;
}

export interface AgentMove {
  agentId: string;
  pos: Position;
  place: string;
}

/** An interaction that started this tick, for the viewer's `interacted` message. */
export interface InteractionStart {
  agentId: string;
  objectId: string;
  interaction: string;
}

/** What one tick produced, for the server to log, persist and broadcast. */
export interface TickResult {
  /** The tick that was simulated. */
  tick: number;
  moves: AgentMove[];
  events: WorldEvent[];
  /** Agents whose data changed beyond position (action, needs, inventory, ...). */
  changedAgentIds: string[];
  changedObjectIds: string[];
  interactionStarts: InteractionStart[];
  /** Agents who got a decision this tick. */
  decidedAgentIds: string[];
}

function createAgentRuntimes(agents: readonly Agent[]): Record<string, AgentRuntime> {
  return Object.fromEntries(agents.map((agent) => [agent.id, createAgentRuntime(agent.place)]));
}

export function createWorldState(map: WorldMap, seededWorld: SeededWorld): WorldState {
  const memoryStore = new MemoryStore();
  memoryStore.addAll(seededWorld.memories);
  return {
    tick: 0,
    agents: seededWorld.agents,
    objects: structuredClone(map.objects),
    map,
    random: new SeededRandom(config.seed),
    nextEventId: 1,
    memoryStore,
    memoryIds: new MemoryIdGenerator(),
    conversationLog: createConversationLog(),
    agentRuntimes: createAgentRuntimes(seededWorld.agents),
    lastForgettingTick: 0,
    reflectionSchedules: {},
  };
}

export function createDefaultSettings(): SimSettings {
  return { speed: 1, dailyTokenBudget: config.llm.dailyTokenBudget };
}

export function createEmptyTickResult(tick: number): TickResult {
  return {
    tick,
    moves: [],
    events: [],
    changedAgentIds: [],
    changedObjectIds: [],
    interactionStarts: [],
    decidedAgentIds: [],
  };
}

export function takeNextEventId(state: WorldState): number {
  const eventId = state.nextEventId;
  state.nextEventId += 1;
  return eventId;
}

function toSimRuntime(state: WorldState): SimRuntime {
  return {
    agentRuntimes: state.agentRuntimes,
    conversationLog: state.conversationLog,
    memoryIdCounter: state.memoryIds.getState(),
    lastForgettingTick: state.lastForgettingTick,
    reflectionSchedules: state.reflectionSchedules,
  };
}

export function toSavedWorld(state: WorldState, settings: SimSettings): SavedWorld {
  return {
    tick: state.tick,
    rngState: state.random.getState(),
    nextEventId: state.nextEventId,
    speed: settings.speed,
    dailyTokenBudget: settings.dailyTokenBudget,
    agents: state.agents,
    objects: state.objects,
    memories: state.memoryStore.all(),
    runtime: toSimRuntime(state),
  };
}

/** Rebuilds the world from a save. Objects added to the map since the save start fresh. */
export function restoreWorldState(
  saved: SavedWorld,
  map: WorldMap,
): { state: WorldState; settings: SimSettings } {
  const savedObjects = new Map(saved.objects.map((object) => [object.id, object]));
  const random = new SeededRandom(config.seed);
  random.setState(saved.rngState);
  const memoryStore = new MemoryStore();
  memoryStore.addAll(saved.memories);
  const runtime = saved.runtime;
  return {
    state: {
      tick: saved.tick,
      agents: saved.agents,
      objects: map.objects.map((object) => savedObjects.get(object.id) ?? structuredClone(object)),
      map,
      random,
      nextEventId: saved.nextEventId,
      memoryStore,
      memoryIds: new MemoryIdGenerator(runtime?.memoryIdCounter ?? 0),
      conversationLog: runtime?.conversationLog ?? createConversationLog(),
      agentRuntimes: runtime?.agentRuntimes ?? createAgentRuntimes(saved.agents),
      lastForgettingTick: runtime?.lastForgettingTick ?? saved.tick,
      reflectionSchedules: runtime?.reflectionSchedules ?? {},
    },
    settings: { speed: saved.speed, dailyTokenBudget: saved.dailyTokenBudget },
  };
}
