import type { Agent, Entity, ItemCatalog, Moment, Position, WorldEvent } from "@village/shared";
import { config } from "../config";
import { SeededRandom } from "../random";
import type { SavedWorld } from "../db/world-repository";
import { findOrphanedEntities } from "../items/entity-store";
import { createConversationLog, type ConversationLog } from "../memory/conversation";
import { MemoryIdGenerator, MemoryStore } from "../memory/memory-store";
import type { SeededWorld } from "../seeds";
import type { ReflectionSchedule } from "../reflection/schedule";
import type { WorldMap } from "../world/types";
import { createAgentRuntime, type AgentRuntime, type SimRuntime } from "./agent-runtime";
import { dropStaleVerbRuns } from "./stale-verb-runs";

/** All mutable sim state. The sim loop is its only writer. */
export interface WorldState {
  /** The tick about to be simulated next. */
  tick: number;
  agents: Agent[];
  /** Every item and object in the world: placed, on the ground, carried or inside something. */
  entities: Entity[];
  /** The counter the next entity id comes from, so runs reproduce. */
  nextEntityId: number;
  /** The item definitions and verbs from `items.json`. */
  items: ItemCatalog;
  map: WorldMap;
  random: SeededRandom;
  nextEventId: number;
  nextMomentId: number;
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

/** A verb that started on an entity this tick, for the viewer's `interacted` message. */
export interface VerbStart {
  agentId: string;
  entityId: string;
  verb: string;
}

/** What one tick produced, for the server to log, persist and broadcast. */
export interface TickResult {
  /** The tick that was simulated. */
  tick: number;
  moves: AgentMove[];
  events: WorldEvent[];
  /** Highlights for the viewer, in the order they happened. */
  moments: Moment[];
  /** Agents whose data changed beyond position (action, needs, inventory, ...). */
  changedAgentIds: string[];
  /** Entities created, moved or changed this tick. */
  changedEntityIds: string[];
  removedEntityIds: string[];
  verbStarts: VerbStart[];
  /** Agents who got a decision this tick. */
  decidedAgentIds: string[];
  /** Rule chains cut off at `rules.maxDepth`, described; a soak run fails on any. */
  ruleDepthCapHits: string[];
}

function createAgentRuntimes(agents: readonly Agent[]): Record<string, AgentRuntime> {
  return Object.fromEntries(agents.map((agent) => [agent.id, createAgentRuntime(agent.place)]));
}

export function createWorldState(
  map: WorldMap,
  seededWorld: SeededWorld,
  items: ItemCatalog,
): WorldState {
  return {
    tick: 0,
    agents: seededWorld.agents,
    entities: seededWorld.entities,
    nextEntityId: seededWorld.nextEntityId,
    items,
    map,
    random: new SeededRandom(config.seed),
    nextEventId: 1,
    nextMomentId: 1,
    memoryStore: new MemoryStore(),
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
    moments: [],
    changedAgentIds: [],
    changedEntityIds: [],
    removedEntityIds: [],
    verbStarts: [],
    decidedAgentIds: [],
    ruleDepthCapHits: [],
  };
}

export function takeNextEventId(state: WorldState): number {
  const eventId = state.nextEventId;
  state.nextEventId += 1;
  return eventId;
}

export function takeNextMomentId(state: WorldState): number {
  const momentId = state.nextMomentId;
  state.nextMomentId += 1;
  return momentId;
}

/** Saves made before `lastThought` existed lack it; an absent field reads as no thought yet. */
function withLastThought(agent: Agent): Agent {
  const saved: Partial<Pick<Agent, "lastThought">> = agent;
  return { ...agent, lastThought: saved.lastThought ?? null };
}

function toSimRuntime(state: WorldState): SimRuntime {
  return {
    agentRuntimes: state.agentRuntimes,
    conversationLog: state.conversationLog,
    memoryIdCounter: state.memoryIds.getState(),
    lastForgettingTick: state.lastForgettingTick,
    reflectionSchedules: state.reflectionSchedules,
    nextMomentId: state.nextMomentId,
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
    entities: state.entities,
    nextEntityId: state.nextEntityId,
    memories: state.memoryStore.all(),
    runtime: toSimRuntime(state),
  };
}

function assertNoOrphanedEntities(saved: SavedWorld, items: ItemCatalog): void {
  const orphans = findOrphanedEntities(saved.entities, items);
  if (orphans.length === 0) return;
  const definitionIds = [...new Set(orphans.map((entity) => entity.definitionId))].join(", ");
  throw new Error(
    `The saved sim has items whose definitions are gone from items.json (${definitionIds}). ` +
      "Run `make reset` to start fresh, or put the definitions back.",
  );
}

/**
 * Rebuilds the world from a save. Entities come from the save, not the map, so map changes need a
 * `make reset`. Refuses a save holding entities `items.json` no longer defines.
 */
export function restoreWorldState(
  saved: SavedWorld,
  map: WorldMap,
  items: ItemCatalog,
): { state: WorldState; settings: SimSettings } {
  assertNoOrphanedEntities(saved, items);
  const random = new SeededRandom(config.seed);
  random.setState(saved.rngState);
  const memoryStore = new MemoryStore();
  memoryStore.addAll(saved.memories);
  const runtime = saved.runtime;
  const agentRuntimes = runtime?.agentRuntimes ?? createAgentRuntimes(saved.agents);
  const agents = dropStaleVerbRuns(saved.agents, agentRuntimes, items);
  return {
    state: {
      tick: saved.tick,
      agents: agents.map(withLastThought),
      entities: saved.entities,
      nextEntityId: saved.nextEntityId,
      items,
      map,
      random,
      nextEventId: saved.nextEventId,
      nextMomentId: runtime?.nextMomentId ?? 1,
      memoryStore,
      memoryIds: new MemoryIdGenerator(runtime?.memoryIdCounter ?? 0),
      conversationLog: runtime?.conversationLog ?? createConversationLog(),
      agentRuntimes,
      lastForgettingTick: runtime?.lastForgettingTick ?? saved.tick,
      reflectionSchedules: runtime?.reflectionSchedules ?? {},
    },
    settings: { speed: saved.speed, dailyTokenBudget: saved.dailyTokenBudget },
  };
}
