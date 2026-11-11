import { toSimTime, type Agent, type Entity } from "@village/shared";
import { config } from "../config";
import type { NamedCandidate } from "../decision/resolve-name";
import { isAsleep } from "../economy/sleep";
import { isPassableInPassing } from "../items/verb-offers";
import { blocksMovement, blocksSight, mufflesSound } from "../items/world-physics";
import { pushWorkingMemory } from "../memory/working-memory";
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

/** Walls plus what the world settings let placed entities add: closed doors and the like. */
export function buildPerceptionWorld(state: WorldState): PerceptionWorld {
  return {
    grid: state.map.grid,
    sightBlockingTiles: collectTiles(state, (entity) => blocksSight(state, entity)),
    muffledTiles: collectTiles(state, (entity) => mufflesSound(state, entity)),
  };
}

/**
 * The map's grid with tiles under movement-blocking entities walled off, for pathfinding. One a
 * walker can deal with in passing (a closed door it opens) stays walkable.
 */
export function buildWalkingGrid(state: WorldState): TileGrid {
  const blocked = collectTiles(
    state,
    (entity) => blocksMovement(state, entity) && !isPassableInPassing(state, entity),
  );
  return withBlockedTiles(state.map.grid, blocked);
}

export function listLivingAgents(state: WorldState): Agent[] {
  return state.agents.filter((agent) => !isDead(agent));
}

/** The name others use for the agent: their own name, or "Mara's body" once dead. */
export function describeAgentAsSeen(agent: Agent): string {
  return isDead(agent) ? describeBodyName(agent.name) : agent.name;
}

/** Other agents under the names this agent would use for them: the dead as "Mara's body". */
export function listOthersAsSeen(state: WorldState, agentId: string): NamedCandidate[] {
  return state.agents
    .filter((other) => other.id !== agentId)
    .map((other) => ({ id: other.id, name: describeAgentAsSeen(other) }));
}

export function toPerceiver(agent: Agent): Perceiver {
  return { agentId: agent.id, name: agent.name, pos: agent.pos, isAsleep: isAsleep(agent) };
}

/** Ids of the other agents this agent can see right now; sleepers see no one. */
export function listVisibleAgentIds(
  state: WorldState,
  world: PerceptionWorld,
  viewer: Agent,
): string[] {
  if (isAsleep(viewer) || isDead(viewer)) return [];
  return state.agents
    .filter((other) => other.id !== viewer.id)
    .filter((other) => canSee(world, viewer.pos, other.pos, config.perception.sightRangeTiles))
    .map((other) => other.id);
}

/**
 * All agent, place and item names (definition names and map labels): what tags and recall queries
 * are matched against.
 */
export function listKnownNames(state: WorldState): string[] {
  const labels = state.entities.flatMap((entity) => (entity.label === null ? [] : [entity.label]));
  return [
    ...new Set([
      ...state.agents.map((agent) => agent.name),
      ...labels,
      ...state.items.file.definitions.map((definition) => definition.name),
      ...state.map.places.map((place) => place.name),
    ]),
  ];
}

function formatClock(tick: number): string {
  const time = toSimTime(tick, config.clock);
  return `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

/** A raw working-memory entry, stamped with the sim clock: "[06:32] I saw that ...". */
export function formatWorkingMemoryEntry(tick: number, text: string): string {
  return `[${formatClock(tick)}] ${text}`;
}

/** Adds a raw, time-stamped entry to the agent's working memory (the last few events). */
export function rememberBriefly(state: WorldState, agentId: string, text: string): void {
  const agent = findAgent(state, agentId);
  const entry = formatWorkingMemoryEntry(state.tick, text);
  replaceAgent(state, { ...agent, workingMemory: pushWorkingMemory(agent.workingMemory, entry) });
}
