import type { Agent, Position } from "@village/shared";
import { config } from "../config";
import {
  describeEntityName,
  findEntityIfPresent,
  resolveEntityPosition,
} from "../items/entity-store";
import { describePlace } from "../memory/filing";
import { findPathToAny, findPathToPlace, findPathToTile } from "../world/pathfinding";
import { WALK_ACTION } from "./action-phrases";
import { getAgentRuntime, type InteractRequest, type WalkDestination } from "./agent-runtime";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import { failAction } from "./failure";
import type { TickContext } from "./tick-context";
import { buildWalkingGrid, findAgent, markAgentChanged, replaceAgent } from "./world-access";
import type { WorldState } from "./world-state";

const SURROUNDING_OFFSETS: readonly Position[] = [-1, 0, 1].flatMap((offsetY) =>
  [-1, 0, 1].map((offsetX) => ({ x: offsetX, y: offsetY })),
);

export function computePath(
  state: WorldState,
  from: Position,
  destination: WalkDestination,
): Position[] | null {
  const grid = buildWalkingGrid(state);
  if (destination.kind === "place") {
    return findPathToPlace(state.map, grid, from, destination.placeName);
  }
  if (destination.kind === "entity") {
    const entity = findEntityIfPresent(state, destination.entityId);
    const position = entity ? resolveEntityPosition(state, entity) : null;
    return position ? findPathToTile(grid, from, position.pos) : null;
  }
  const other = findAgent(state, destination.agentId);
  const goals = SURROUNDING_OFFSETS.map((offset) => ({
    x: other.pos.x + offset.x,
    y: other.pos.y + offset.y,
  }));
  return findPathToAny(grid, from, goals);
}

function describeEntityDestination(state: WorldState, entityId: string): string | null {
  const entity = findEntityIfPresent(state, entityId);
  return entity ? describeEntityName(state, entity) : null;
}

export function describeDestination(state: WorldState, destination: WalkDestination): string {
  if (destination.kind === "place") return describePlace(destination.placeName);
  if (destination.kind === "agent") return findAgent(state, destination.agentId).name;
  return `the ${describeEntityDestination(state, destination.entityId) ?? "spot"}`;
}

export function destinationName(state: WorldState, destination: WalkDestination): string {
  if (destination.kind === "place") return destination.placeName;
  if (destination.kind === "agent") return findAgent(state, destination.agentId).name;
  return describeEntityDestination(state, destination.entityId) ?? "";
}

/**
 * Starts a walk. Returns false (after filing the failure) when there is no way there. An empty
 * path means the agent is already there, which the caller handles.
 */
export function startWalk(
  context: TickContext,
  agentId: string,
  destination: WalkDestination,
  pendingVerb: InteractRequest | null,
): boolean {
  const { state, result } = context;
  const agent = findAgent(state, agentId);
  const path = computePath(state, agent.pos, destination);
  const where = describeDestination(state, destination);
  if (path === null) {
    failAction(state, result, agentId, `walk to ${where}`, "I couldn't find a way there");
    return false;
  }
  const name = destinationName(state, destination);
  const isChase = destination.kind === "agent" && pendingVerb !== null;
  const walking: Agent = {
    ...agent,
    currentAction: { kind: WALK_ACTION, target: name, endsAtTick: null },
  };
  replaceAgent(state, walking);
  getAgentRuntime(state, agentId).walk = {
    destination,
    remainingSteps: path,
    pendingVerb,
    ...(isChase ? { giveUpAtTick: state.tick + path.length + config.combat.chaseTicks } : {}),
  };
  markAgentChanged(result, agentId);
  const towards = destination.kind === "agent" ? `towards ${name}` : `to ${where}`;
  broadcastEvent(
    state,
    createEvent(state, walking, {
      kind: "walk_started",
      description: `started walking ${towards}`,
      targetId: destination.kind === "agent" ? destination.agentId : null,
      targetName: name,
    }),
    result,
  );
  return true;
}

/**
 * Points a walk to a verb at a new destination (the item reached, now the target). The walk was
 * announced already, so this says nothing. False, after filing the failure, when there is no way.
 */
export function retargetWalk(
  context: TickContext,
  agentId: string,
  destination: WalkDestination,
): boolean {
  const { state, result } = context;
  const walk = getAgentRuntime(state, agentId).walk;
  if (!walk) return false;
  const agent = findAgent(state, agentId);
  const path = computePath(state, agent.pos, destination);
  if (path === null) {
    const where = describeDestination(state, destination);
    failAction(state, result, agentId, `walk to ${where}`, "I couldn't find a way there");
    return false;
  }
  walk.destination = destination;
  walk.remainingSteps = path;
  if (destination.kind === "agent") {
    walk.giveUpAtTick = state.tick + path.length + config.combat.chaseTicks;
  } else {
    delete walk.giveUpAtTick;
  }
  const target = destinationName(state, destination);
  replaceAgent(state, { ...agent, currentAction: { kind: WALK_ACTION, target, endsAtTick: null } });
  markAgentChanged(result, agentId);
  return true;
}
