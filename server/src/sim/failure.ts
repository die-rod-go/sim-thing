import { config } from "../config";
import { getAgentRuntime } from "./agent-runtime";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import { buildFailureMoment, recordMoments } from "./moments";
import { noteFailedAct } from "../memory/reflection-progress";
import { findAgent, getAgentMemory, markAgentChanged, replaceAgent } from "./world-access";
import type { TickResult, WorldState } from "./world-state";

/** "The oven is empty" reads as "the oven is empty" mid-sentence; names and "I" stay as they are. */
function continueSentence(reason: string): string {
  return reason.startsWith("The ") ? `the ${reason.slice("The ".length)}` : reason;
}

/**
 * "I was already right next to them" as onlookers learn it: "they were already right next to
 * them". The actor is already named in the sentence, so "they" needs no name repeated.
 */
export function describeReasonAsSeen(reason: string): string {
  return reason
    .replace(/\bI'm\b/g, "they're")
    .replace(/\bI am\b/g, "they are")
    .replace(/\bI was\b/g, "they were")
    .replace(/\bI\b/g, "they")
    .replace(/\bmyself\b/g, "themselves")
    .replace(/\bmy\b/g, "their")
    .replace(/\bme\b/g, "them");
}

/**
 * An act that couldn't be carried out fails in the world: the agent stops and its queued acts are
 * dropped, an `action_failed` event is broadcast (so "I tried to ... but ..." enters the agent's
 * stream and onlookers see the attempt and why it failed), and the text is shown as the last
 * failure in the next prompt. With no current action, the agent gets a decision on the next
 * decision phase.
 */
export function failAction(
  state: WorldState,
  result: TickResult,
  agentId: string,
  attempt: string,
  reason: string,
): void {
  const agent = { ...findAgent(state, agentId), currentAction: null };
  replaceAgent(state, agent);
  const runtime = getAgentRuntime(state, agentId);
  runtime.walk = null;
  runtime.verbRun = null;
  runtime.follow = null;
  runtime.queuedActs = [];
  state.agentMemories[agentId] = noteFailedAct(getAgentMemory(state, agentId));
  const actorDescription = `tried to ${attempt} but ${continueSentence(reason)}`;
  runtime.lastFailure = `I ${actorDescription}`;
  const description = config.combat.failedAttemptDescription
    .split("{attempt}")
    .join(attempt)
    .split("{reason}")
    .join(describeReasonAsSeen(continueSentence(reason)));
  const event = createEvent(state, agent, {
    kind: "action_failed",
    description,
    actorDescription,
  });
  broadcastEvent(state, event, result);
  recordMoments(state, result, [buildFailureMoment(event)]);
  markAgentChanged(result, agentId);
}
