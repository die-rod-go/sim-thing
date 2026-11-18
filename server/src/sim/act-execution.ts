import { config } from "../config";
import { computeChebyshevDistance } from "../economy/give";
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

function executeAct(context: TickContext, agentId: string, act: PlannedAct): void {
  switch (act.kind) {
    case "walk_to":
      return executeWalk(context, agentId, act.target);
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
 * so it doesn't walk off and withdraw what it offered.
 */
export function startAct(
  context: TickContext,
  agentId: string,
  act: PlannedAct,
  speech: PlannedSpeech | null,
): void {
  const eventsBefore = context.result.events.length;
  executeAct(context, agentId, act);
  const hasFailed = context.result.events
    .slice(eventsBefore)
    .some((event) => event.kind === "action_failed" && event.actorId === agentId);
  if (hasFailed) return;
  if (speech !== null) speak(context, agentId, speech);
  const runtime = getAgentRuntime(context.state, agentId);
  if (act.kind !== "give" || runtime.queuedActs.length === 0) return;
  startWait(context, agentId, config.economy.offerLapseMinutes);
  runtime.isAwaitingAnswer = true;
}
