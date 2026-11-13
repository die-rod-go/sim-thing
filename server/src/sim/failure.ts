import { config } from "../config";
import { getAgentRuntime } from "./agent-runtime";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import { buildFailureMoment, recordMoments } from "./moments";
import { findAgent, markAgentChanged, rememberBriefly, replaceAgent } from "./world-access";
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
 * An act that couldn't be carried out fails in the world: the agent stops, an `action_failed`
 * event is broadcast (so the agent files "I tried to ... but ..." in `did` and onlookers see the
 * attempt and why it failed),
 * the text goes into working memory and is shown as the last failure in the next prompt. With no
 * current action, the agent gets a decision on the next decision phase.
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
  // A repeated failure is skipped as a duplicate memory but should still be on the agent's mind.
  const workingMemory = findAgent(state, agentId).workingMemory;
  const isOnMind = workingMemory.some((entry) => entry.endsWith(runtime.lastFailure ?? ""));
  if (!isOnMind) rememberBriefly(state, agentId, runtime.lastFailure);
  markAgentChanged(result, agentId);
}
