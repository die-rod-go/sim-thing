import {
  isBodyInWorld,
  toSimTime,
  type Agent,
  type AgentMemory,
  type Entity,
  type Position,
} from "@village/shared";
import { config } from "../config";
import type { NamedCandidate } from "../decision/resolve-name";
import { isAsleep } from "../economy/sleep";
import { isPassableInPassing } from "../items/verb-offers";
import { blocksMovement, blocksSight, mufflesSound } from "../items/world-physics";
import { appendStreamEntry } from "../memory/stream";
import { createAgentMemory } from "../memory/summaries";
import { canSee } from "../perception/sight";
import { describeBodyName, isDead } from "../status/health";
import type { PerceptionWorld, Perceiver } from "../perception/types";
import { withBlockedTiles } from "../world/pathfinding";
import { tileIndex, type TileGrid } from "../world/types";
import type { TickResult, WorldState } from "./world-state";

export function findAgent(state: WorldState, agentId: string): Agent {
  const agent = state.agents.find((candidate) => candidate.id === agentId);
  if (!agent) throw new Error(`Unknown agent "${agentId}"`);
  return agent;
}

export function replaceAgent(state: WorldState, updated: Agent): void {
  const index = state.agents.findIndex((candidate) => candidate.id === updated.id);
  if (index === -1) throw new Error(`Unknown agent "${updated.id}"`);
  state.agents[index] = updated;
}

export function markAgentChanged(result: TickResult, agentId: string): void {
  if (!result.changedAgentIds.includes(agentId)) result.changedAgentIds.push(agentId);
}

export function markEntityChanged(result: TickResult, entityId: string): void {
  if (!result.changedEntityIds.includes(entityId)) result.changedEntityIds.push(entityId);
}

/** Takes the entity off the changed list, for a change viewers don't need to hear about. */
export function unmarkEntityChanged(result: TickResult, entityId: string): void {
  result.changedEntityIds = result.changedEntityIds.filter((changedId) => changedId !== entityId);
}

export function markEntityRemoved(result: TickResult, entityId: string): void {
  result.changedEntityIds = result.changedEntityIds.filter((changedId) => changedId !== entityId);
  if (!result.removedEntityIds.includes(entityId)) result.removedEntityIds.push(entityId);
}

function collectTiles(state: WorldState, isIncluded: (entity: Entity) => boolean): Set<number> {
  const tiles = new Set<number>();
  for (const entity of state.entities) {
    if (entity.location.kind !== "tile" || !isIncluded(entity)) continue;
    tiles.add(tileIndex(state.map.grid, entity.location.pos));
  }
  return tiles;
}

/** Walls plus what the world settings let placed entities add. */
export function buildPerceptionWorld(state: WorldState): PerceptionWorld {
  return {
    grid: state.map.grid,
    sightBlockingTiles: collectTiles(state, (entity) => blocksSight(state, entity)),
    muffledTiles: collectTiles(state, (entity) => mufflesSound(state, entity)),
  };
}

/**
 * The map's grid with tiles under movement-blocking entities walled off, for pathfinding. One a
 * walker can deal with in passing (one it clears on the way) stays walkable.
 */
export function buildWalkingGrid(state: WorldState): TileGrid {
  return withBlockedTiles(state.map.grid, collectMovementBlockingTiles(state));
}

function collectMovementBlockingTiles(state: WorldState): Set<number> {
  return collectTiles(
    state,
    (entity) => blocksMovement(state, entity) && !isPassableInPassing(state, entity),
  );
}

/** The living agent other than this one standing on the tile, if any. Bodies don't block. */
export function findAgentBlockingTile(
  state: WorldState,
  agentId: string,
  tile: Position,
): Agent | undefined {
  return listLivingAgents(state).find(
    (other) => other.id !== agentId && other.pos.x === tile.x && other.pos.y === tile.y,
  );
}

/** The walking grid with the tiles of the other living agents walled off as well. */
export function buildWalkingGridFor(state: WorldState, agentId: string): TileGrid {
  const blocked = collectMovementBlockingTiles(state);
  for (const other of listLivingAgents(state)) {
    if (other.id !== agentId) blocked.add(tileIndex(state.map.grid, other.pos));
  }
  return withBlockedTiles(state.map.grid, blocked);
}

export function listLivingAgents(state: WorldState): Agent[] {
  return state.agents.filter((agent) => !isDead(agent));
}

/** The name others use for the agent: their own name, or "Mara's body" once dead. */
export function describeAgentAsSeen(agent: Agent): string {
  return isDead(agent) ? describeBodyName(agent.name) : agent.name;
}

/**
 * Other agents under the names this agent would use for them: the dead as "Mara's body". A body
 * that is no longer in the world (buried) can't be named.
 */
export function listOthersAsSeen(state: WorldState, agentId: string): NamedCandidate[] {
  return state.agents
    .filter((other) => other.id !== agentId && isBodyInWorld(other))
    .map((other) => ({ id: other.id, name: describeAgentAsSeen(other) }));
}

export function toPerceiver(agent: Agent): Perceiver {
  return { agentId: agent.id, name: agent.name, pos: agent.pos, isAsleep: isAsleep(agent) };
}

/** Ids of the other agents (living, or bodies still in the world) this agent can see right now; sleepers see no one. */
export function listVisibleAgentIds(
  state: WorldState,
  world: PerceptionWorld,
  viewer: Agent,
): string[] {
  if (isAsleep(viewer) || isDead(viewer)) return [];
  return state.agents
    .filter((other) => other.id !== viewer.id && isBodyInWorld(other))
    .filter((other) => canSee(world, viewer.pos, other.pos, config.perception.sightRangeTiles))
    .map((other) => other.id);
}

/** What the agent remembers; empty for an agent that has taken nothing in yet. */
export function getAgentMemory(state: WorldState, agentId: string): AgentMemory {
  return state.agentMemories[agentId] ?? createAgentMemory(toSimTime(state.tick, config.clock).day);
}

/** Appends one event, in the agent's own words, to its stream at the current tick. */
export function appendToStream(
  state: WorldState,
  agentId: string,
  text: string,
  maxChars?: number,
): void {
  const memory = getAgentMemory(state, agentId);
  const sentCount = state.streamEntriesInSummary[agentId] ?? 0;
  const canMergeIntoLast = memory.stream.length > sentCount;
  const stream = appendStreamEntry(memory.stream, text, state.tick, canMergeIntoLast, maxChars);
  state.agentMemories[agentId] = { ...memory, stream };
}
