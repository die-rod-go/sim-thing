import type { Position } from "@village/shared";
import { config } from "../config";
import { resolveName } from "../decision/resolve-name";
import { computeChebyshevDistance } from "../economy/give";
import { isDead } from "../status/health";
import { describeLocation } from "../world/place-names";
import { WAIT_ACTION } from "./action-phrases";
import { getAgentRuntime, type PlannedAct, type PlannedSpeech } from "./agent-runtime";
import { broadcastEvent } from "./event-broadcast";
import { createSpeechEvent } from "./event-factory";
import { failAction } from "./failure";
import { startFollow } from "./following";
import { makeOffer } from "./offers";
import type { TickContext } from "./tick-context";
import { startOrApproachVerb } from "./verb-approach";
import { startWalk } from "./walk-start";
import { findWalkDestination } from "./walk-target";
import { describeAgentAsSeen, findAgent, markAgentChanged, replaceAgent } from "./world-access";

const { minutesPerTick } = config.clock;

export function startWait(context: TickContext, agentId: string, minutes: number): void {
  const clamped = Math.min(Math.max(minutes, minutesPerTick), config.decision.maxWaitMinutes);
  const agent = findAgent(context.state, agentId);
  const endsAtTick = context.state.tick + Math.max(1, Math.ceil(clamped / minutesPerTick));
  replaceAgent(context.state, { ...agent, currentAction: { kind: WAIT_ACTION, endsAtTick } });
  markAgentChanged(context.result, agentId);
}

/** Words go along with any action, so the agent can talk while it walks, works or waits. */
export function speak(context: TickContext, agentId: string, speech: PlannedSpeech): void {
  const { state } = context;
  const event = createSpeechEvent(state, findAgent(state, agentId), speech.line, speech.origin);
  broadcastEvent(state, event, context.result);
}

function executeWalk(context: TickContext, agentId: string, targetName: string): void {
  const { state, result } = context;
  const agent = findAgent(state, agentId);
  const destination = findWalkDestination(state, agent, targetName);
  const fail = (attempt: string, reason: string) =>
    failAction(state, result, agentId, attempt, reason);
  if (destination === null) {
    fail(`walk to ${targetName}`, config.places.unknownWalkTargetReason);
    return;
  }
  if (destination.kind === "place" && agent.place === destination.placeName) {
    fail(`walk to the ${destination.placeName}`, "I was already there");
    return;
  }
  const isAtSpot =
    destination.kind === "tile" &&
    describeLocation(state.map, agent.place, agent.pos) === destination.name;
  if (isAtSpot) {
    fail(`walk to ${destination.name}`, "I was already there");
    return;
  }
  if (destination.kind === "agent") {
    const other = findAgent(state, destination.agentId);
    if (computeChebyshevDistance(agent.pos, other.pos) <= config.economy.giveReachTiles) {
      fail(`walk over to ${describeAgentAsSeen(other)}`, "I was already right next to them");
      return;
    }
  }
  startWalk(context, agentId, destination, null);
}

/** A walk to a tile the player picked on the map; `spotName` is how that spot reads. */
function executeWalkToTile(
  context: TickContext,
  agentId: string,
  spotName: string,
  pos: Position,
): void {
  const { state, result } = context;
  const agent = findAgent(state, agentId);
  if (agent.pos.x === pos.x && agent.pos.y === pos.y) {
    failAction(state, result, agentId, `walk to ${spotName}`, "I was already there");
    return;
  }
  startWalk(context, agentId, { kind: "tile", pos: { ...pos }, name: spotName }, null);
}

/**
 * A give to someone in sight but out of reach walks up to them first; the give then waits at the
 * front of the queue, its words with it, and is tried where the walk ends even if the recipient
 * has moved on. Returns whether the act was taken over by the approach.
 */
function approachForGive(
  context: TickContext,
  agentId: string,
  act: Extract<PlannedAct, { kind: "give" }>,
  speech: PlannedSpeech | null,
): boolean {
  if (act.hasApproached === true) return false;
  const { state } = context;
  const runtime = getAgentRuntime(state, agentId);
  const inSight = runtime.visibleAgentIds
    .map((otherId) => findAgent(state, otherId))
    .filter((other) => !isDead(other))
    .map((other) => ({ id: other.id, name: describeAgentAsSeen(other) }));
  const recipientId = resolveName(act.target, inSight);
  if (recipientId === null) return false;
  const giver = findAgent(state, agentId);
  const recipient = findAgent(state, recipientId);
  if (computeChebyshevDistance(giver.pos, recipient.pos) <= config.economy.giveReachTiles) {
    return false;
  }
  // A walk that can't start fails the act, which clears the queue, the give included.
  runtime.queuedActs.unshift({ act: { ...act, hasApproached: true }, speech });
  startWalk(context, agentId, { kind: "agent", agentId: recipientId }, null);
  return true;
}

function executeAct(context: TickContext, agentId: string, act: PlannedAct): void {
  switch (act.kind) {
    case "walk_to":
      return act.pos === undefined
        ? executeWalk(context, agentId, act.target)
        : executeWalkToTile(context, agentId, act.target, act.pos);
    case "interact":
      return startOrApproachVerb(context, agentId, act.request);
    case "give":
      return makeOffer(context, agentId, act);
    case "wait":
      return startWait(context, agentId, act.minutes);
    case "follow":
      return startFollow(context, agentId, act);
  }
}

/**
 * Starts one act and says its words as it starts; the words of an act that fails at once are never
 * said. After an offer, with acts still queued, the agent waits for the answer before going on,
 * so it doesn't walk off and withdraw what it offered. A played agent always waits for it, so the
 * clock runs on until the answer comes instead of stopping for its player at once.
 */
export function startAct(
  context: TickContext,
  agentId: string,
  act: PlannedAct,
  speech: PlannedSpeech | null,
): void {
  if (act.kind === "give" && approachForGive(context, agentId, act, speech)) return;
  const eventsBefore = context.result.events.length;
  executeAct(context, agentId, act);
  const hasFailed = context.result.events
    .slice(eventsBefore)
    .some((event) => event.kind === "action_failed" && event.actorId === agentId);
  if (hasFailed) return;
  if (speech !== null) speak(context, agentId, speech);
  const runtime = getAgentRuntime(context.state, agentId);
  const isAnswerAwaited =
    runtime.queuedActs.length > 0 || findAgent(context.state, agentId).isPlayed;
  if (act.kind !== "give" || !isAnswerAwaited) return;
  startWait(context, agentId, config.economy.offerLapseMinutes);
  runtime.isAwaitingAnswer = true;
}
