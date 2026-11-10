import type { Agent, Memory, Position, WorldEvent, WorldObject } from "@village/shared";
import { config } from "../config";
import { SeededRandom } from "../random";
import type { SavedWorld } from "../db/world-repository";
import type { SeededWorld } from "../seeds";
import type { WorldMap } from "../world/types";

/** All mutable sim state. The sim loop is its only writer. */
export interface WorldState {
  /** The tick about to be simulated next. */
  tick: number;
  agents: Agent[];
  objects: WorldObject[];
  map: WorldMap;
  random: SeededRandom;
  nextEventId: number;
  memories: Memory[];
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

/** What one tick produced, for the server to log, persist and broadcast. */
export interface TickResult {
  /** The tick that was simulated. */
  tick: number;
  moves: AgentMove[];
  events: WorldEvent[];
  /** Agents whose data changed beyond position (action, needs, inventory, ...). */
  changedAgentIds: string[];
  changedObjectIds: string[];
}

export function createWorldState(map: WorldMap, seededWorld: SeededWorld): WorldState {
  return {
    tick: 0,
    agents: seededWorld.agents,
    objects: structuredClone(map.objects),
    map,
    random: new SeededRandom(config.seed),
    nextEventId: 1,
    memories: seededWorld.memories,
  };
}

export function createDefaultSettings(): SimSettings {
  return { speed: 1, dailyTokenBudget: config.llm.dailyTokenBudget };
}

export function createEmptyTickResult(tick: number): TickResult {
  return { tick, moves: [], events: [], changedAgentIds: [], changedObjectIds: [] };
}

export function takeNextEventId(state: WorldState): number {
  const eventId = state.nextEventId;
  state.nextEventId += 1;
  return eventId;
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
    memories: state.memories,
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
  return {
    state: {
      tick: saved.tick,
      agents: saved.agents,
      objects: map.objects.map((object) => savedObjects.get(object.id) ?? structuredClone(object)),
      map,
      random,
      nextEventId: saved.nextEventId,
      memories: saved.memories,
    },
    settings: { speed: saved.speed, dailyTokenBudget: saved.dailyTokenBudget },
  };
}
