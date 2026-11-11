import { config } from "../config";
import { computeChebyshevDistance } from "../economy/give";
import { describeEntityName, listTileEntitiesAt } from "../items/entity-store";
import { fileFirstVisit } from "../memory/filing";
import { canSee } from "../perception/sight";
import { findPlaceAt } from "../world/map-loader";
import { getAgentRuntime } from "./agent-runtime";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import { failAction } from "./failure";
import type { TickContext } from "./tick-context";
import { clearTileInPassing } from "./walk-passing";
import { computePath, describeDestination, destinationName } from "./walk-start";
import { pursuePendingVerb } from "./verb-pursuit";
import {
  buildPerceptionWorld,
  findAgent,
  markAgentChanged,
  rememberBriefly,
  replaceAgent,
} from "./world-access";
import type { Position } from "@village/shared";

function noteFirstVisit(context: TickContext, agentId: string, place: string): void {
  const { state } = context;
  const runtime = getAgentRuntime(state, agentId);
  const isMapPlace = state.map.places.some((area) => area.name === place);
  if (!isMapPlace || runtime.visitedPlaces.includes(place)) return;
  runtime.visitedPlaces.push(place);
  const objectNames = listTileEntitiesAt(state, place).map((entity) =>
    describeEntityName(state, entity),
  );
  const memory = fileFirstVisit(agentId, place, objectNames, state.tick, state.memoryIds);
  state.memoryStore.add(memory);
  rememberBriefly(state, agentId, memory.text);
}

/** Takes one step; false when something in the way couldn't be dealt with and the walk failed. */
function stepOnce(context: TickContext, agentId: string, nextStep: Position): boolean {
  const { state, result } = context;
  const refusal = clearTileInPassing(context, agentId, nextStep);
  if (refusal !== null) {
    const walk = getAgentRuntime(state, agentId).walk;
    const where = walk ? describeDestination(state, walk.destination) : "there";
    failAction(state, result, agentId, `walk to ${where}`, refusal);
    return false;
  }
  const agent = findAgent(state, agentId);
  const place = findPlaceAt(state.map, nextStep);
  replaceAgent(state, { ...agent, pos: { ...nextStep }, place });
  result.moves.push({ agentId, pos: { ...nextStep }, place });
  if (place !== agent.place) {
    markAgentChanged(result, agentId);
    noteFirstVisit(context, agentId, place);
  }
  return true;
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

/**
 * One tile per tick along the stored path, doing what is needed in passing; ends on arrival. A
 * walk towards a verb ends as soon as the verb can start.
 */
export function advanceWalk(context: TickContext, agentId: string): void {
  if (pursuePendingVerb(context, agentId)) return;
  refreshAgentPath(context, agentId);
  const walk = getAgentRuntime(context.state, agentId).walk;
  if (!walk) return;
  const nextStep = walk.remainingSteps.shift();
  if (nextStep && !stepOnce(context, agentId, nextStep)) return;
  if (pursuePendingVerb(context, agentId)) return;
  if (walk.remainingSteps.length === 0 && walk.pendingVerb === null) arrive(context, agentId);
}
