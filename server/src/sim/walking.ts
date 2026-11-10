import type { Agent, Position } from "@village/shared";
import { config } from "../config";
import { computeChebyshevDistance } from "../economy/give";
import { setDoorOpen } from "../economy/object-state";
import { describePlace, fileFirstVisit } from "../memory/filing";
import { canSee } from "../perception/sight";
import { findPlaceAt } from "../world/map-loader";
import { findPathToAny, findPathToObject, findPathToPlace } from "../world/pathfinding";
import { WALK_ACTION } from "./action-phrases";
import { getAgentRuntime, type PendingInteract, type WalkDestination } from "./agent-runtime";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import { failAction } from "./failure";
import { describeDoorOpened, startInteractionNow } from "./interaction-runner";
import type { TickContext } from "./tick-context";
import {
  buildPerceptionWorld,
  findAgent,
  findObjectById,
  markAgentChanged,
  markObjectChanged,
  rememberBriefly,
  replaceAgent,
  replaceObject,
} from "./world-access";
import type { WorldState } from "./world-state";

const SURROUNDING_OFFSETS: readonly Position[] = [-1, 0, 1].flatMap((offsetY) =>
  [-1, 0, 1].map((offsetX) => ({ x: offsetX, y: offsetY })),
);

function computePath(
  state: WorldState,
  from: Position,
  destination: WalkDestination,
): Position[] | null {
  if (destination.kind === "place") return findPathToPlace(state.map, from, destination.placeName);
  if (destination.kind === "object") {
    const object = findObjectById(state, destination.objectId);
    return object ? findPathToObject(state.map, from, object) : null;
  }
  const other = findAgent(state, destination.agentId);
  const goals = SURROUNDING_OFFSETS.map((offset) => ({
    x: other.pos.x + offset.x,
    y: other.pos.y + offset.y,
  }));
  return findPathToAny(state.map.grid, from, goals);
}

function describeDestination(state: WorldState, destination: WalkDestination): string {
  if (destination.kind === "place") return describePlace(destination.placeName);
  if (destination.kind === "agent") return findAgent(state, destination.agentId).name;
  return `the ${findObjectById(state, destination.objectId)?.name ?? "spot"}`;
}

function destinationName(state: WorldState, destination: WalkDestination): string {
  if (destination.kind === "place") return destination.placeName;
  if (destination.kind === "agent") return findAgent(state, destination.agentId).name;
  return findObjectById(state, destination.objectId)?.name ?? "";
}

/**
 * Starts a walk. Returns false (after filing the failure) when there is no way there. An empty
 * path means the agent is already there, which the caller handles.
 */
export function startWalk(
  context: TickContext,
  agentId: string,
  destination: WalkDestination,
  pendingInteract: PendingInteract | null,
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
  const walking: Agent = {
    ...agent,
    currentAction: { kind: WALK_ACTION, target: name, endsAtTick: null },
  };
  replaceAgent(state, walking);
  getAgentRuntime(state, agentId).walk = { destination, remainingSteps: path, pendingInteract };
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

function openDoorOnTile(context: TickContext, agent: Agent, tile: Position): void {
  const { state, result } = context;
  const door = state.objects.find(
    (object) =>
      object.kind === "door" &&
      object.state.isOpen === false &&
      object.pos.x === tile.x &&
      object.pos.y === tile.y,
  );
  if (!door) return;
  const opened = setDoorOpen(door, true);
  if (!opened.isSuccess) return;
  replaceObject(state, opened.object);
  markObjectChanged(result, door.id);
  result.interactionStarts.push({ agentId: agent.id, objectId: door.id, interaction: "open" });
  const event = createEvent(state, agent, {
    kind: "action_finished",
    description: describeDoorOpened(door),
    targetId: door.id,
    targetName: door.name,
    loudness: config.interactions.open?.loudness ?? null,
  });
  broadcastEvent(state, event, result);
}

function noteFirstVisit(context: TickContext, agentId: string, place: string): void {
  const { state } = context;
  const runtime = getAgentRuntime(state, agentId);
  const isMapPlace = state.map.places.some((area) => area.name === place);
  if (!isMapPlace || runtime.visitedPlaces.includes(place)) return;
  runtime.visitedPlaces.push(place);
  const objectNames = state.objects
    .filter((object) => object.place === place && object.kind !== "door")
    .map((object) => object.name);
  const memory = fileFirstVisit(agentId, place, objectNames, state.tick, state.memoryIds);
  state.memoryStore.add(memory);
  rememberBriefly(state, agentId, memory.text);
}

function stepOnce(context: TickContext, agentId: string, nextStep: Position): void {
  const { state, result } = context;
  openDoorOnTile(context, findAgent(state, agentId), nextStep);
  const agent = findAgent(state, agentId);
  const place = findPlaceAt(state.map, nextStep);
  replaceAgent(state, { ...agent, pos: { ...nextStep }, place });
  result.moves.push({ agentId, pos: { ...nextStep }, place });
  if (place !== agent.place) {
    markAgentChanged(result, agentId);
    noteFirstVisit(context, agentId, place);
  }
}

function arrive(context: TickContext, agentId: string): void {
  const { state, result } = context;
  const runtime = getAgentRuntime(state, agentId);
  const walk = runtime.walk;
  if (!walk) return;
  runtime.walk = null;
  const agent = { ...findAgent(state, agentId), currentAction: null };
  replaceAgent(state, agent);
  markAgentChanged(result, agentId);
  const { destination } = walk;
  if (destination.kind === "object" && walk.pendingInteract) {
    const object = findObjectById(state, destination.objectId);
    if (object) startInteractionNow(context, agentId, object, walk.pendingInteract);
    return;
  }
  const name = destinationName(state, destination);
  let description = `arrived at ${describeDestination(state, destination)}`;
  if (destination.kind === "agent") {
    const other = findAgent(state, destination.agentId);
    const isClose = computeChebyshevDistance(agent.pos, other.pos) <= config.economy.giveReachTiles;
    description = isClose ? `walked up to ${name}` : `walked to where ${name} had been`;
  }
  const event = createEvent(state, agent, {
    kind: "arrived",
    description,
    targetId: destination.kind === "agent" ? destination.agentId : null,
    targetName: name,
  });
  broadcastEvent(state, event, result);
}

function refreshAgentPath(context: TickContext, agentId: string): void {
  const { state } = context;
  const walk = getAgentRuntime(state, agentId).walk;
  if (!walk || walk.destination.kind !== "agent") return;
  const walker = findAgent(state, agentId);
  const other = findAgent(state, walk.destination.agentId);
  const world = buildPerceptionWorld(state);
  if (!canSee(world, walker.pos, other.pos, config.perception.sightRangeTiles)) return;
  walk.remainingSteps = computePath(state, walker.pos, walk.destination) ?? walk.remainingSteps;
}

/** One tile per tick along the stored path, opening closed doors on the way; ends on arrival. */
export function advanceWalk(context: TickContext, agentId: string): void {
  refreshAgentPath(context, agentId);
  const walk = getAgentRuntime(context.state, agentId).walk;
  if (!walk) return;
  const nextStep = walk.remainingSteps.shift();
  if (nextStep) stepOnce(context, agentId, nextStep);
  if (walk.remainingSteps.length === 0) arrive(context, agentId);
}
