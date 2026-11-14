import { config } from "../config";
import { computeChebyshevDistance } from "../economy/give";
import { canSee } from "../perception/sight";
import { findPlaceAt } from "../world/map-loader";
import { getAgentRuntime, type Walk } from "./agent-runtime";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import { failAction } from "./failure";
import type { TickContext } from "./tick-context";
import { clearTileInPassing } from "./walk-passing";
import { computePath, describeDestination, destinationName } from "./walk-start";
import { pursuePendingVerb } from "./verb-pursuit";
import {
  buildPerceptionWorld,
  describeAgentAsSeen,
  findAgent,
  findAgentBlockingTile,
  markAgentChanged,
  replaceAgent,
} from "./world-access";
import type { Agent, Position } from "@village/shared";

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
  if (place !== agent.place) markAgentChanged(result, agentId);
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
  walk.remainingSteps =
    computePath(state, agentId, walker.pos, walk.destination) ?? walk.remainingSteps;
}

function hasSteppedThisTick(context: TickContext, agentId: string): boolean {
  return context.result.moves.some((move) => move.agentId === agentId);
}

/**
 * Two walkers each about to step onto the other's tile trade places in one tick, so neither
 * blocks the other in a doorway. Moves the oncoming walker; true when the swap happened.
 */
function swapWithOncomingWalker(context: TickContext, agentId: string, blocker: Agent): boolean {
  const { state } = context;
  const blockerWalk = getAgentRuntime(state, blocker.id).walk;
  const blockerNextStep = blockerWalk?.remainingSteps[0];
  const position = findAgent(state, agentId).pos;
  const isComingAtUs =
    blockerNextStep !== undefined &&
    blockerNextStep.x === position.x &&
    blockerNextStep.y === position.y;
  if (!blockerWalk || !isComingAtUs || hasSteppedThisTick(context, blocker.id)) return false;
  blockerWalk.remainingSteps.shift();
  delete blockerWalk.blockedTicks;
  return stepOnce(context, blocker.id, blockerNextStep);
}

/**
 * With no way around, a walker trades places with an agent standing still on its next step, so
 * nobody standing in a narrow spot shuts others in or out. Moves the one standing; true when the
 * swap happened. One already moved this tick, or walking somewhere itself, is waited for instead.
 */
function swapWithStandingAgent(context: TickContext, agentId: string, blocker: Agent): boolean {
  const { state } = context;
  const isStandingStill = getAgentRuntime(state, blocker.id).walk === null;
  if (!isStandingStill || hasSteppedThisTick(context, blocker.id)) return false;
  return stepOnce(context, blocker.id, findAgent(state, agentId).pos);
}

/**
 * The next step: swapping places with a walker coming the other way, rerouted around another
 * agent standing on it, or swapping places with that agent when there is no way around. Null when
 * the step has to wait this tick; after waiting too long the walk fails.
 */
function takeNextStep(context: TickContext, agentId: string, walk: Walk): Position | null {
  const { state, result } = context;
  const plannedStep = walk.remainingSteps[0];
  if (!plannedStep) return null;
  const blocker = findAgentBlockingTile(state, agentId, plannedStep);
  if (!blocker || swapWithOncomingWalker(context, agentId, blocker)) {
    delete walk.blockedTicks;
    return walk.remainingSteps.shift() ?? null;
  }
  const from = findAgent(state, agentId).pos;
  const detour = computePath(state, agentId, from, walk.destination);
  if (detour !== null) {
    delete walk.blockedTicks;
    walk.remainingSteps = detour;
    return walk.remainingSteps.shift() ?? null;
  }
  if (swapWithStandingAgent(context, agentId, blocker)) {
    delete walk.blockedTicks;
    return walk.remainingSteps.shift() ?? null;
  }
  walk.blockedTicks = (walk.blockedTicks ?? 0) + 1;
  if (walk.blockedTicks >= config.walking.blockedGiveUpTicks) {
    const where = describeDestination(state, walk.destination);
    const reason = config.walking.blockedReason.split("{agent}").join(describeAgentAsSeen(blocker));
    failAction(state, result, agentId, `walk to ${where}`, reason);
  }
  return null;
}

/**
 * One tile per tick along the stored path, doing what is needed in passing and never sharing a
 * tile with another living agent; ends on arrival. A walk towards a verb ends as soon as the verb
 * can start. A walker already moved this tick by a swap doesn't step again.
 */
export function advanceWalk(context: TickContext, agentId: string): void {
  if (pursuePendingVerb(context, agentId)) return;
  const wasSwapped = hasSteppedThisTick(context, agentId);
  if (!wasSwapped) refreshAgentPath(context, agentId);
  const walk = getAgentRuntime(context.state, agentId).walk;
  if (!walk) return;
  if (!wasSwapped) {
    const nextStep = takeNextStep(context, agentId, walk);
    if (getAgentRuntime(context.state, agentId).walk === null) return;
    if (nextStep && !stepOnce(context, agentId, nextStep)) return;
    if (!nextStep && walk.remainingSteps.length > 0) return;
  }
  if (pursuePendingVerb(context, agentId)) return;
  if (walk.remainingSteps.length === 0 && walk.pendingVerb === null) arrive(context, agentId);
}
