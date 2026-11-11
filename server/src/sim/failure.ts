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
 * An act that couldn't be carried out fails in the world: the agent stops, an `action_failed`
 * event is broadcast (so the agent files "I tried to ... but ..." in `did` and onlookers see it),
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
  runtime.interaction = null;
  const description = `tried to ${attempt} but ${continueSentence(reason)}`;
  runtime.lastFailure = `I ${description}`;
  const event = createEvent(state, agent, { kind: "action_failed", description });
  broadcastEvent(state, event, result);
  recordMoments(state, result, [buildFailureMoment(event)]);
  // A repeated failure is skipped as a duplicate memory but should still be on the agent's mind.
  const workingMemory = findAgent(state, agentId).workingMemory;
  const isOnMind = workingMemory.some((entry) => entry.endsWith(runtime.lastFailure ?? ""));
  if (!isOnMind) rememberBriefly(state, agentId, runtime.lastFailure);
  markAgentChanged(result, agentId);
}
