import type {
  Agent,
  AgentMemory,
  Entity,
  ItemCatalog,
  Moment,
  Position,
  WorldEvent,
} from "@village/shared";
import { config } from "../config";
import { SeededRandom } from "../random";
import type { SavedWorld } from "../db/world-repository";
import { findOrphanedEntities } from "../items/entity-store";
import { createConversationLog, type ConversationLog } from "../memory/conversation";
import type { SeededWorld } from "../seeds";
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
  /** The counter the next `newId` value comes from (a lock and its key's shared id). */
  nextFreshId: number;
  /** The item definitions and verbs from `items.json`. */
  items: ItemCatalog;
  map: WorldMap;
  random: SeededRandom;
  nextEventId: number;
  nextMomentId: number;
  /** What each agent remembers, by agent id. */
  agentMemories: Record<string, AgentMemory>;
  /**
   * Per agent, how many stream entries (oldest first) a running episode summary was sent. Those
   * take no further merges. Not saved: a restart starts the summary again.
   */
  streamEntriesInSummary: Record<string, number>;
  /** Recent speech, kept only to tell who is taking part in a conversation. */
  conversationLog: ConversationLog;
  agentRuntimes: Record<string, AgentRuntime>;
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
  return Object.fromEntries(agents.map((agent) => [agent.id, createAgentRuntime()]));
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
    nextFreshId: 1,
    items,
    map,
    random: new SeededRandom(config.seed),
    nextEventId: 1,
    nextMomentId: 1,
    agentMemories: {},
    streamEntriesInSummary: {},
    conversationLog: createConversationLog(),
    agentRuntimes: createAgentRuntimes(seededWorld.agents),
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

/** A text id no earlier `newId` in this world gave: "id-7". */
export function takeFreshId(state: WorldState): string {
  const freshId = config.steps.newIdFormat.split("{number}").join(String(state.nextFreshId));
  state.nextFreshId += 1;
  return freshId;
}

export function takeNextMomentId(state: WorldState): number {
  const momentId = state.nextMomentId;
  state.nextMomentId += 1;
  return momentId;
}

function toSimRuntime(state: WorldState): SimRuntime {
  return {
    agentRuntimes: state.agentRuntimes,
    conversationLog: state.conversationLog,
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
    nextFreshId: state.nextFreshId,
    agentMemories: state.agentMemories,
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
  const runtime = saved.runtime;
  const { agentRuntimes } = runtime;
  const agents = dropStaleVerbRuns(saved.agents, agentRuntimes, items);
  return {
    state: {
      tick: saved.tick,
      agents,
      entities: saved.entities,
      nextEntityId: saved.nextEntityId,
      nextFreshId: saved.nextFreshId,
      items,
      map,
      random,
      nextEventId: saved.nextEventId,
      nextMomentId: runtime.nextMomentId,
      agentMemories: saved.agentMemories,
      streamEntriesInSummary: {},
      conversationLog: runtime.conversationLog,
      agentRuntimes,
    },
    settings: { speed: saved.speed, dailyTokenBudget: saved.dailyTokenBudget },
  };
}
