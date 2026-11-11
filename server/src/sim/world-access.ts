import { toSimTime, type Agent, type WorldObject } from "@village/shared";
import { config } from "../config";
import { isAsleep } from "../economy/sleep";
import { pushWorkingMemory } from "../memory/working-memory";
import { canSee } from "../perception/sight";
import { describeBodyName, isDead } from "../status/health";
import type { PerceptionWorld, Perceiver } from "../perception/types";
import { tileIndex } from "../world/types";
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

export function findObjectById(state: WorldState, objectId: string): WorldObject | undefined {
  return state.objects.find((candidate) => candidate.id === objectId);
}

export function replaceObject(state: WorldState, updated: WorldObject): void {
  const index = state.objects.findIndex((candidate) => candidate.id === updated.id);
  if (index === -1) throw new Error(`Unknown object "${updated.id}"`);
  state.objects[index] = updated;
}

export function markAgentChanged(result: TickResult, agentId: string): void {
  if (!result.changedAgentIds.includes(agentId)) result.changedAgentIds.push(agentId);
}

export function markObjectChanged(result: TickResult, objectId: string): void {
  if (!result.changedObjectIds.includes(objectId)) result.changedObjectIds.push(objectId);
}

export function buildPerceptionWorld(state: WorldState): PerceptionWorld {
  const closedDoorTiles = new Set(
    state.objects
      .filter((object) => object.kind === "door" && object.state.isOpen === false)
      .map((object) => tileIndex(state.map.grid, object.pos)),
  );
  return { grid: state.map.grid, closedDoorTiles };
}

export function listLivingAgents(state: WorldState): Agent[] {
  return state.agents.filter((agent) => !isDead(agent));
}

/** The name others use for the agent: their own name, or "Mara's body" once dead. */
export function describeAgentAsSeen(agent: Agent): string {
  return isDead(agent) ? describeBodyName(agent.name) : agent.name;
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

/** All agent, object and place names: what tags and recall queries are matched against. */
export function listKnownNames(state: WorldState): string[] {
  return [
    ...state.agents.map((agent) => agent.name),
    ...state.objects.map((object) => object.name),
    ...state.map.places.map((place) => place.name),
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
